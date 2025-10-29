// frontend/src/components/CarImageUploader.jsx
import { useEffect, useMemo, useState } from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragOverlay, useDroppable
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, rectSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  listEditionImages, uploadEditionImages, patchEditionImage, deleteEditionImage
} from "../../services/api";

const PARTS = ["main","exterior","interior","unsorted"];

// --- normalize a server row to a consistent client shape
function mapImage(row) {
  const id = row.image_id ?? row.id;                    // <- ensure id is set
  const url = row.image_url || row.url || row.public_url || row.gcs_url || "";
  const part = row.is_primary ? "main" : (row.part || "unsorted");
  const sort_order = Number.isFinite(+row.sort_order) ? +row.sort_order : 0;
  const is_primary = row.is_primary ? 1 : 0;
  return { id, image_url: url, part, sort_order, is_primary };
}

export default function EditionImageUploader({
  editionId, makeName, modelName, modelYear
}) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPart, setUploadPart] = useState("unsorted");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Load list and normalize
  const refresh = async () => {
    if (!editionId) return;
    setBusy(true);
    try {
      const data = await listEditionImages(editionId, makeName, modelName, modelYear);
      const list = Array.isArray(data?.images) ? data.images : Array.isArray(data) ? data : (data?.items || []);
      const mapped = list.map(mapImage).filter(x => Number.isFinite(x.id)); // drop bad rows

      // primary first, then exterior, interior, unsorted; then sort_order then id
      const rank = (p) => (p === "main" ? 0 : p === "exterior" ? 1 : p === "interior" ? 2 : 3);
      mapped.sort((a,b) =>
        rank(a.part) - rank(b.part) ||
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        a.id - b.id
      );

      setRows(mapped);
    } catch (e) {
      alert(`Load images failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(()=>{ refresh(); /* eslint-disable-next-line */ }, [editionId]);

  const grouped = useMemo(() => {
    const g = { main:[], exterior:[], interior:[], unsorted:[] };
    for (const r of rows) (g[r.part] || g.unsorted).push(r);
    return g;
  }, [rows]);

  const idsByPart = {
    main: grouped.main.map(x=>x.id),
    exterior: grouped.exterior.map(x=>x.id),
    interior: grouped.interior.map(x=>x.id),
    unsorted: grouped.unsorted.map(x=>x.id),
  };

  // --- API actions
  const patchMeta = async (id, patch) => {
    // Only send primitive diffs; coerce booleans → 0/1
    const body = { ...patch };
    if ('is_primary' in body) body.is_primary = body.is_primary ? 1 : 0;
    await patchEditionImage(id, body);
  };

  const remove = async (img) => {
    if (!confirm("Delete image?")) return;
    const prev = rows;
    try {
      await deleteEditionImage(img.id);
      setRows(prev.filter(x => x.id !== img.id));
      // Optional: refresh() to re-pull canonical state
    } catch (e) {
      console.error(e);
      alert(e.message);
      setRows(prev);
    }
  };

  // Upload
  const onUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      await uploadEditionImages(editionId, makeName, modelName, modelYear, files, uploadPart);
      await refresh();
      e.target.value = "";
    } catch (e) {
      console.error(e);
      alert(`Upload failed: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  // Persist only diffs; IMPORTANT: never send part:"main" to server
  async function persistReorder(prev, next) {
    const before = new Map(prev.map(x => [x.id, x]));
    const ops = [];

    for (const n of next) {
      const b = before.get(n.id);
      if (!b) continue;

      // Build minimal patch
      const patch = {};
      const toPart = n.part;

      if (toPart === 'main') {
        // UI bucket only -> set primary, don’t send part/sort_order
        if ((b.is_primary|0) !== 1) patch.is_primary = 1;
        if (Object.keys(patch).length) ops.push(patchMeta(n.id, patch));
        continue;
      }

      // not main: update part/sort if changed; ensure not marked primary
      if ((b.part || 'unsorted') !== toPart) patch.part = toPart;
      if ((b.sort_order ?? 0) !== (n.sort_order ?? 0)) patch.sort_order = n.sort_order ?? 0;
      if ((b.is_primary|0) !== 0) patch.is_primary = 0;

      if (Object.keys(patch).length) ops.push(patchMeta(n.id, patch));
    }

    if (ops.length) await Promise.all(ops);
    await refresh();
  }

  const onDragEnd = async ({ active, over }) => {
    if (!over) return;

    const prev = rows;
    const fromPart = Object.keys(idsByPart).find(p => idsByPart[p].includes(active.id));
    if (!fromPart) return;

    const overId = String(over.id);
    let toPart, insertAt;
    if (overId.startsWith("container:")) {
      toPart = over.data?.current?.part ?? overId.split(":")[1];
      insertAt = idsByPart[toPart].length;
    } else {
      toPart = Object.keys(idsByPart).find(p => idsByPart[p].includes(over.id)) || fromPart;
      insertAt = idsByPart[toPart].indexOf(over.id);
      if (insertAt < 0) insertAt = idsByPart[toPart].length;
    }

    // Work on cloned copy
    const working = rows.map(x => ({ ...x }));
    const idx = working.findIndex(x => x.id === active.id);
    if (idx < 0) return;
    const moving = { ...working[idx] };

    // update UI part only
    if (moving.part !== toPart) moving.part = toPart;

    // If dropped into main, ensure single-slot
    if (toPart === "main") {
      for (let i = 0; i < working.length; i++) {
        if (working[i].id !== moving.id && working[i].part === "main") {
          working[i] = { ...working[i], part: "unsorted" };
        }
      }
    }

    // rebuild buckets excluding original moving row
    const pick = (p) => working.filter(x => x.part === p && x.id !== moving.id);
    let mainArr = pick("main");
    let extArr  = pick("exterior");
    let intArr  = pick("interior");
    let unsArr  = pick("unsorted");

    const insert = (arr) => {
      const copy = arr.slice();
      copy.splice(Math.min(insertAt, copy.length), 0, moving);
      return copy;
    };
    if (toPart === "main") {
      mainArr = [moving]; // single-slot
    } else if (toPart === "exterior") {
      extArr = insert(extArr);
    } else if (toPart === "interior") {
      intArr = insert(intArr);
    } else {
      unsArr = insert(unsArr);
    }

    // renumber sort_order for non-main buckets; main has no sort meaning server-side
    const renum = (arr) => arr.map((x,i)=>({ ...x, sort_order: i+1 }));
    const final = [
      ...(mainArr.length ? [{ ...mainArr[0], part: "main", is_primary: 1, sort_order: 1 }] : []),
      ...renum(extArr.map(x => ({ ...x, part: "exterior", is_primary: 0 }))),
      ...renum(intArr.map(x => ({ ...x, part: "interior", is_primary: 0 }))),
      ...renum(unsArr.map(x => ({ ...x, part: "unsorted", is_primary: 0 }))),
    ];

    setRows(final); // optimistic
    try {
      await persistReorder(prev, final);
    } catch (e) {
      console.error(e);
      alert("Reorder failed");
      await refresh();
    }
  };

  return (
    <div>
      <h3>Edition images</h3>

      <div style={{ display:"flex", gap:12, alignItems:"center", margin:"8px 0 12px" }}>
        <label>Upload to:</label>
        <select value={uploadPart} onChange={e=>setUploadPart(e.target.value)}>
          <option value="unsorted">Unsorted</option>
          {/* you can enable these later if you want to upload to buckets directly */}
          {/* <option value="main">Main (first file becomes primary)</option>
          <option value="exterior">Exterior</option>
          <option value="interior">Interior</option> */}
        </select>
        <input className="input" type="file" accept="image/*" multiple onChange={onUpload} disabled={uploading}/>
        <button className="btn" onClick={refresh} disabled={busy||uploading}>{busy ? "Refreshing…" : "Refresh"}</button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <DroppableSection part="main" title="Main (1)" hint="Drop here to set primary" items={idsByPart.main}>
          {grouped.main.map(img => <Card key={img.id} img={img} onDelete={() => remove(img)} />)}
        </DroppableSection>

        <DroppableSection part="exterior" title="Exterior" items={idsByPart.exterior}>
          {grouped.exterior.map(img => <Card key={img.id} img={img} onDelete={() => remove(img)} />)}
        </DroppableSection>

        <DroppableSection part="interior" title="Interior" items={idsByPart.interior}>
          {grouped.interior.map(img => <Card key={img.id} img={img} onDelete={() => remove(img)} />)}
        </DroppableSection>

        <DroppableSection part="unsorted" title="Unsorted" items={idsByPart.unsorted}>
          {grouped.unsorted.map(img => <Card key={img.id} img={img} onDelete={() => remove(img)} />)}
        </DroppableSection>

        <DragOverlay />
      </DndContext>
    </div>
  );
}

function DroppableSection({ part, title, hint, items, children }) {
  const { isOver, setNodeRef } = useDroppable({ id: `container:${part}`, data: { part } });
  return (
    <div style={{ border:"1px solid #eee", borderRadius:8, margin:"12px 0" }}>
      <div style={{ padding:"8px 12px", background: "var(--bg)", display:"flex", gap:8, color: "var(--text" }}>
        <strong>{title}</strong>
        {hint && <span style={{ fontSize:12, color:"#777" }}>— {hint}</span>}
      </div>
      <div
        ref={setNodeRef}
        style={{
          padding:12, minHeight: 160,
          background: isOver ? "#f0f7ff" : "transparent",
          outline: isOver ? "2px dashed #4a90e2" : "2px dashed transparent",
          transition: "background .12s ease"
        }}
      >
        <SortableContext items={items} strategy={rectSortingStrategy}>
          <Grid>{children}</Grid>
        </SortableContext>
      </div>
    </div>
  );
}

function Grid({ children }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))", gap:12 }}>
      {children}
    </div>
  );
}

function Card({ img, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: img.id });
  const style = {
    border:"1px solid var(--control-border)",
    borderRadius:8,
    padding:8,
    background: "var(--surface)",
    position:"relative",
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    cursor:"grab",
    userSelect:"none"
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <img src={img.image_url} alt="" style={{ width:"100%", height:120, objectFit:"cover", borderRadius:6 }} />
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8 }}>
        <span style={{ fontSize:12, color:"var(--text-muted)" }}>#{img.sort_order ?? "-"}</span>
        <button onClick={onDelete} style={{ fontSize:12, padding:"4px 8px", border:"1px solid #c00", color:"#c00", borderRadius:6 }}>
          Delete
        </button>
      </div>
      {Number(img.is_primary) === 1 && (
        <div style={{
          position:"absolute", top:6, left:6,
          background:"rgba(46,125,50,.9)", color:"#fff", fontSize:11,
          padding:"2px 6px", borderRadius:6
        }}>Primary</div>
      )}
    </div>
  );
}
