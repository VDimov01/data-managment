// frontend/src/components/CarImageUploader.jsx
import { useEffect, useMemo, useState } from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragOverlay, useDroppable
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, rectSortingStrategy, arrayMove
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  listEditionImages, uploadEditionImages, patchEditionImage, deleteEditionImage
} from "../../services/api";

const PARTS = ["main","exterior","interior","unsorted"];

export default function EditionImageUploader({
  apiBase = "https://data-managment-production.up.railway.app:5000",
  editionId, makeName, modelName, modelYear
}) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPart, setUploadPart] = useState("unsorted");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const safe = (s) => encodeURIComponent(String(s ?? "").trim().replace(/-/g, " ").replace(/\s+/g, " "));
  const listUrl = `${apiBase}/api/car-images/${editionId}-${safe(makeName)}-${safe(modelName)}-${safe(modelYear)}`;
  const uploadUrl = (part) => `${apiBase}/api/car-images/${editionId}-${safe(makeName)}-${safe(modelName)}-${safe(modelYear)}-${safe(part)}`;

  const refresh = async () => {
    if (!editionId) return;
    setBusy(true);
    try {
      const data = await listEditionImages(apiBase, editionId, makeName, modelName, modelYear);
      let imgs = Array.isArray(data?.images) ? data.images : [];
      // Normalize: primary first, then exterior, interior, unsorted; sort by sort_order then id
      const pr = imgs.find(x => Number(x.is_primary) === 1) || null;
      const rest = imgs.filter(x => Number(x.is_primary) !== 1);
      const rank = (p) => (p === "main" ? 0 : p === "exterior" ? 1 : p === "interior" ? 2 : 3);
      rest.sort((a,b)=> rank(a.part||"unsorted")-rank(b.part||"unsorted")
                    || (a.sort_order??0)-(b.sort_order??0) || a.id-b.id);
      imgs = pr ? [{...pr, part: "main", sort_order: 1}, ...rest] : rest;
      setRows(imgs);
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(()=>{ refresh(); /* eslint-disable-next-line */ }, [editionId]);

  const grouped = useMemo(() => {
    const g = { main:[], exterior:[], interior:[], unsorted:[] };
    for (const r of rows) (g[(r.part||"unsorted")] || g.unsorted).push(r);
    return g;
  }, [rows]);

  const idsByPart = {
    main: grouped.main.map(x=>x.id),
    exterior: grouped.exterior.map(x=>x.id),
    interior: grouped.interior.map(x=>x.id),
    unsorted: grouped.unsorted.map(x=>x.id),
  };

  // --- API actions ---
  const patchMeta = async (id, patch) => {
    // helper throws on failure; returns JSON like { ok: true }
    await patchEditionImage(apiBase, id, patch);
  };

  const deleteOne = async (id) => {
    await deleteEditionImage(apiBase, id); // use your helper
  };

  // --- Upload -> goes to chosen part (default: unsorted) ---
  const onUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("images", f);
        const data = await uploadEditionImages(apiBase, editionId, makeName, modelName, modelYear, files, uploadPart);
        if (!data?.success) throw new Error(data?.error || "Upload failed");
        await refresh();
        e.target.value = "";
    } catch (e) {
      alert(e.message);
    } finally {
      setUploading(false);
    }
  };

  // --- DnD logic (multi-container) ---
  async function persistReorder(prev, next) {
    const before = new Map(prev.map(x => [x.id, { part: x.part || "unsorted", so: x.sort_order ?? 0 }]));
    const ops = [];
    for (const n of next) {
      const b = before.get(n.id) || {};
      const np = n.part || "unsorted";
      const ns = n.sort_order ?? 0;
      if (b.part !== np || b.so !== ns) {
        const patch = { part: np, sort_order: ns };
        if (np === "main") patch.is_primary = 1;     // single primary
        ops.push(patchMeta(n.id, patch));
      }
    }
      if (ops.length) await Promise.all(ops);
      // CRUCIAL: pull server truth so next diffs are against persisted state
      await refresh();
    }


const findPartByItemId = (id) =>
  Object.keys(idsByPart).find(p => idsByPart[p].includes(id));

const onDragEnd = async ({ active, over }) => {
  if (!over) return;

  // take an immutable snapshot BEFORE we touch anything
  const prev = rows;

  // where did we start?
  const fromPart = Object.keys(idsByPart).find(p => idsByPart[p].includes(active.id));
  if (!fromPart) return;

  // where are we going?
  const overId = String(over.id);
  let toPart, insertAt;
  if (overId.startsWith("container:")) {
    toPart = over.data?.current?.part ?? overId.split(":")[1];
    insertAt = idsByPart[toPart].length; // append
  } else {
    toPart = Object.keys(idsByPart).find(p => idsByPart[p].includes(over.id)) || fromPart;
    insertAt = idsByPart[toPart].indexOf(over.id);
    if (insertAt < 0) insertAt = idsByPart[toPart].length;
  }

  // ---- Build a NEW working copy without mutating prev/rows ----
  // shallow clone array; DO NOT reuse prev objects
  const working = rows.map(x => ({ ...x }));

  // clone the moving item
  const idx = working.findIndex(x => x.id === active.id);
  if (idx < 0) return;
  const moving = { ...working[idx] }; // cloned

  // if part changes, update only the CLONE
  if ((moving.part || "unsorted") !== toPart) {
    moving.part = toPart;
  }

  // If dropped into main, demote any existing main in the working set
  if (toPart === "main") {
    for (let i = 0; i < working.length; i++) {
      if (working[i].id !== moving.id && (working[i].part || "unsorted") === "main") {
        working[i] = { ...working[i], part: "unsorted" }; // clone on write
      }
    }
  }

  // Rebuild per-part lists EXCLUDING the old instance of the moving item
  const pick = (p) => working.filter(x => (x.part || "unsorted") === p && x.id !== moving.id);
  let mainArr = pick("main");
  let extArr  = pick("exterior");
  let intArr  = pick("interior");
  let unsArr  = pick("unsorted");

  // Insert the cloned moving item in target bucket
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

  // Renumber sort_order immutably; set main=primary
  const renum = (arr, start=1) => arr.map((x,i)=>({ ...x, sort_order: start + i }));
  const final = [
    ...renum(mainArr.length ? [{ ...mainArr[0], part: "main", is_primary: 1, sort_order: 1 }] : []),
    ...renum(extArr.map(x => ({ ...x, part: "exterior", is_primary: 0 }))),
    ...renum(intArr.map(x => ({ ...x, part: "interior", is_primary: 0 }))),
    ...renum(unsArr.map(x => ({ ...x, part: "unsorted", is_primary: 0 }))),
  ];

  // Optimistic UI
  setRows(final);

  // Persist diffs (only changed items), then refresh server truth
  try {
    await persistReorder(prev, final);
  } catch (e) {
    console.error(e);
    await refresh(); // rollback to server truth if anything failed
    alert("Reorder failed");
  }
};



  const remove = async (img) => {
    if (!confirm("Delete image?")) return;
    const prev = rows;
    try {
      await deleteOne(img.id);
      const next = rows.filter(x=>x.id!==img.id);
      setRows(next);
      // no need to re-patch order; optional: you could reindex part orders here & PATCH
    } catch (e) {
      alert(e.message);
      setRows(prev);
    }
  };

  return (
    <div>
      <h3>Edition images</h3>

      <div style={{ display:"flex", gap:12, alignItems:"center", margin:"8px 0 12px" }}>
        <label>Upload to:</label>
        <select value={uploadPart} onChange={e=>setUploadPart(e.target.value)}>
          <option value="unsorted">Unsorted</option>
          {/* <option value="main">Main (first file becomes primary)</option>
          <option value="exterior">Exterior</option>
          <option value="interior">Interior</option> */}
        </select>
        <input type="file" accept="image/*" multiple onChange={onUpload} disabled={uploading}/>
        <button onClick={refresh} disabled={busy||uploading}>{busy ? "Refreshing…" : "Refresh"}</button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        {/* MAIN (single) */}
        <DroppableSection part="main" title="Main (1)" hint="Drop here to set primary" items={idsByPart.main}>
          {grouped.main.map(img => <Card key={img.id} img={img} onDelete={() => remove(img)} />)}
        </DroppableSection>

        {/* EXTERIOR */}
        <DroppableSection part="exterior" title="Exterior" items={idsByPart.exterior}>
          {grouped.exterior.map(img => <Card key={img.id} img={img} onDelete={() => remove(img)} />)}
        </DroppableSection>

        {/* INTERIOR */}
        <DroppableSection part="interior" title="Interior" items={idsByPart.interior}>
          {grouped.interior.map(img => <Card key={img.id} img={img} onDelete={() => remove(img)} />)}
        </DroppableSection>

        {/* UNSORTED */}
        <DroppableSection part="unsorted" title="Unsorted" items={idsByPart.unsorted}>
          {grouped.unsorted.map(img => <Card key={img.id} img={img} onDelete={() => remove(img)} />)}
        </DroppableSection>

        <DragOverlay />
      </DndContext>
    </div>
  );
}

function DroppableSection({ part, title, hint, items, children }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `container:${part}`,
    data: { part }
  });

  return (
    <div style={{ border:"1px solid #eee", borderRadius:8, margin:"12px 0" }}>
      <div style={{ padding:"8px 12px", background:"#fafafa", display:"flex", gap:8 }}>
        <strong>{title}</strong>
        {hint && <span style={{ fontSize:12, color:"#777" }}>— {hint}</span>}
      </div>

      {/* The droppable area: works even when the list is empty */}
      <div
        ref={setNodeRef}
        style={{
          padding:12,
          minHeight: 160,                    // <- ensures visible drop zone when empty
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
    <div style={{
      display:"grid",
      gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))",
      gap:12
    }}>
      {children}
    </div>
  );
}

function Card({ img, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: img.id });
  const style = {
    border:"1px solid #ddd",
    borderRadius:8,
    padding:8,
    background:"#fff",
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
        <span style={{ fontSize:12, color:"#666" }}>#{img.sort_order ?? "-"}</span>
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
