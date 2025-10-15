import { useEffect, useMemo, useState } from "react";
import Modal from "../Modal";
import {
  listVehicleImages,
  uploadVehicleImages,
  deleteVehicleImage,
  setPrimaryVehicleImage,
  updateVehicleImageMeta
} from "../../services/api";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor, useSensors
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export default function VehicleImagesModal({
  apiBase = "http://localhost:5000",
  vehicle,
  open,
  onClose
}) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reordering, setReordering] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const vehicleId = vehicle?.vehicle_id || vehicle?.id;

  const title = useMemo(() => {
    if (!vehicle) return "Vehicle Images";
    const name = `${vehicle.maker || vehicle.make || ""} ${vehicle.model || ""} ${vehicle.edition || vehicle.edition_name || ""}`.trim();
    return `Images — ${name} (${vehicle.vin || ""})`;
  }, [vehicle]);

  const refresh = async () => {
    if (!vehicleId) return;
    setBusy(true);
    try {
      const data = await listVehicleImages(apiBase, vehicleId);
      // make sure list is ordered deterministically by sort_order then id
      data.sort(
        (a, b) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          a.vehicle_image_id - b.vehicle_image_id
      );
      setRows(Array.isArray(data) ? data : []);
      console.log("Loaded images:", data);
    } catch (e) {
      alert(`Failed to load images: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (open && vehicleId) refresh();
  }, [open, vehicleId]);

  const onUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      await uploadVehicleImages(apiBase, vehicleId, files);
      await refresh();
      e.target.value = ""; // reset
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (imageId) => {
    if (!window.confirm("Delete this image?")) return;
    try {
      await deleteVehicleImage(apiBase, vehicleId, imageId);
      setRows((prev) => prev
        .filter((r) => r.vehicle_image_id !== imageId)
        .map((r, i) => ({ ...r, sort_order: i + 1 })));
      // persist reindex for remaining items (optional: bulk; here we keep your PATCH-per-item behavior)
      persistOrderForChanged();
    } catch (e) {
      alert(`Delete failed: ${e.message}`);
    }
  };

  const onPrimary = async (imageId) => {
    try {
      await setPrimaryVehicleImage(apiBase, vehicleId, imageId);
      setRows((prev) =>
        prev.map((r) => ({
          ...r,
          is_primary: r.vehicle_image_id === imageId ? 1 : 0
        }))
      );
    } catch (e) {
      alert(`Failed to set primary: ${e.message}`);
    }
  };

  const onMetaChange = async (imageId, patch) => {
    try {
      await updateVehicleImageMeta(apiBase, vehicleId, imageId, patch);
      setRows((prev) =>
        prev.map((r) =>
          r.vehicle_image_id === imageId ? { ...r, ...patch } : r
        )
      );
    } catch (e) {
      alert(`Update failed: ${e.message}`);
    }
  };

  // --- Drag & Drop wiring ---

  const ids = rows.map((r) => r.vehicle_image_id);

  const onDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((x) => x.vehicle_image_id === active.id);
    const newIndex = rows.findIndex((x) => x.vehicle_image_id === over.id);

    // optimistic reorder & renumber
    const moved = arrayMove(rows, oldIndex, newIndex).map((r, i) => ({
      ...r,
      sort_order: i + 1
    }));
    setRows(moved);

    // persist only items whose sort_order actually changed
    await persistOrderForChanged(rows, moved);
  };

  // Persist order only for changed rows (uses your per-item PATCH)
  async function persistOrderForChanged(prevList = null, nextList = null) {
    const before = prevList ?? rows;
    const after = nextList ?? rows;
    const diffs = [];
    for (let i = 0; i < after.length; i++) {
      const a = after[i];
      const b = before[i];
      if (!b || a.vehicle_image_id !== b.vehicle_image_id || (a.sort_order ?? 0) !== (b.sort_order ?? 0)) {
        diffs.push({ id: a.vehicle_image_id, sort_order: a.sort_order ?? i + 1 });
      }
    }
    if (!diffs.length) return;

    setReordering(true);
    try {
      await Promise.all(
        diffs.map(({ id, sort_order }) =>
          updateVehicleImageMeta(apiBase, vehicleId, id, { sort_order })
        )
      );
    } catch (e) {
      console.error("Persist order failed", e);
      // fallback: refresh to get server truth
      await refresh();
      alert(`Reorder failed: ${e.message}`);
    } finally {
      setReordering(false);
    }
  }

  const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: 12
  };
  const card = {
    border: "1px solid #ddd",
    borderRadius: 8,
    padding: 8,
    background: "#fff",
    position: "relative"
  };
  const imgStyle = {
    width: "100%",
    height: 120,
    objectFit: "cover",
    borderRadius: 6,
    background: "#f7f7f7",
    border: "1px solid #eee",
    display: "block"
  };
  const smallBtn = {
    padding: "4px 8px",
    borderRadius: 6,
    border: "1px solid #ccc",
    background: "#fafafa",
    cursor: "pointer"
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <input className="input" type="file" accept="image/*" multiple onChange={onUpload} disabled={uploading} />
        <button className="btn btn-strong" onClick={refresh} disabled={busy || uploading}>
          {busy ? "Refreshing…" : "Refresh"}
        </button>
        {reordering && <span style={{ fontSize: 12, opacity: 0.7 }}>Saving order…</span>}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>
          {uploading ? "Uploading…" : "PNG/JPG up to ~15MB each"}
        </span>
      </div>

      {rows.length === 0 && !busy && (
        <div style={{ padding: 16, opacity: 0.7 }}>No images yet. Upload some.</div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <div style={grid}>
            {rows.map((r) => (
              <SortableCard
                key={r.vehicle_image_id}
                r={r}
                apiBase={apiBase}
                vehicleId={vehicleId}
                imgStyle={imgStyle}
                card={card}
                smallBtn={smallBtn}
                onPrimary={onPrimary}
                onDelete={onDelete}
                onMetaChange={onMetaChange}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </Modal>
  );
}

function SortableCard({
  r, imgStyle, card, smallBtn, onPrimary, onDelete, onMetaChange
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: r.vehicle_image_id });

  const style = {
    ...card,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    cursor: "grab",
    userSelect: "none"
  };

  const imgUrl = r.stream_url; // backend proxy URL (private bucket)

  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className="card">
      <img src={imgUrl} alt="" style={imgStyle} draggable={false} />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          onClick={() => onPrimary(r.vehicle_image_id)}
          style={{
            ...smallBtn,
            background: r.is_primary ? "#e6f4ea" : "#fafafa",
            borderColor: r.is_primary ? "#4caf50" : "#ccc"
          }}
          title="Set as primary"
        >
          {r.is_primary ? "Primary" : "Make primary"}
        </button>
        <button
          onClick={() => onDelete(r.vehicle_image_id)}
          style={{ ...smallBtn, color: "#b30000", borderColor: "#b30000" }}
        >
          Delete
        </button>
      </div>

      <div style={{ marginTop: 8 }}>
        <label style={{ display: "block", fontSize: 12, color: "#555" }}>Caption</label>
        <input
          className="input"
          defaultValue={r.caption || ""}
          onBlur={(e) => {
            const v = e.target.value;
            if (v !== (r.caption || "")) onMetaChange(r.vehicle_image_id, { caption: v });
          }}
          style={{ width: "100%", padding: 6, border: "1px solid #ddd", borderRadius: 6 }}
        />
      </div>

      <div style={{ marginTop: 8 }}>
        <label style={{ display: "block", fontSize: 12, color: "#555" }}>Sort order</label>
        <input
          className="input"
          type="number"
          min={1}
          defaultValue={r.sort_order ?? 0}
          onBlur={(e) => {
            const num = Number(e.target.value) || 0;
            if (num !== (r.sort_order ?? 0)) onMetaChange(r.vehicle_image_id, { sort_order: num });
          }}
          style={{ width: "100%", padding: 6, border: "1px solid #ddd", borderRadius: 6 }}
        />
      </div>
    </div>
  );
}
