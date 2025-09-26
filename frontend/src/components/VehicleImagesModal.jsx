import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import {
  listVehicleImages,
  uploadVehicleImages,
  deleteVehicleImage,
  setPrimaryVehicleImage,
  updateVehicleImageMeta
} from "../services/api";

export default function VehicleImagesModal({ apiBase = "http://localhost:5000", vehicle, open, onClose }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
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
      setRows(Array.isArray(data) ? data : []);
      console.log("Loaded images:", data);
    } catch (e) {
      alert(`Failed to load images: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { if (open && vehicleId) refresh(); }, [open, vehicleId]);

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
      setRows(prev => prev.filter(r => r.vehicle_image_id !== imageId));
    } catch (e) {
      alert(`Delete failed: ${e.message}`);
    }
  };

  const onPrimary = async (imageId) => {
    try {
      await setPrimaryVehicleImage(apiBase, vehicleId, imageId);
      setRows(prev => prev.map(r => ({ ...r, is_primary: r.vehicle_image_id === imageId ? 1 : 0 })));
    } catch (e) {
      alert(`Failed to set primary: ${e.message}`);
    }
  };

  const onMetaChange = async (imageId, patch) => {
    try {
      await updateVehicleImageMeta(apiBase, vehicleId, imageId, patch);
      setRows(prev => prev.map(r => r.vehicle_image_id === imageId ? { ...r, ...patch } : r));
    } catch (e) {
      alert(`Update failed: ${e.message}`);
    }
  };

  const grid = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 12
  };
  const card = {
    border: '1px solid #ddd',
    borderRadius: 8,
    padding: 8,
    background: '#fff'
  };
  const imgStyle = {
    width: '100%',
    height: 120,
    objectFit: 'cover',
    borderRadius: 6,
    background: '#f7f7f7',
    border: '1px solid #eee'
  };
  const smallBtn = {
    padding: '4px 8px',
    borderRadius: 6,
    border: '1px solid #ccc',
    background: '#fafafa',
    cursor: 'pointer'
  };

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth={900}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <input type="file" accept="image/*" multiple onChange={onUpload} disabled={uploading} />
        <span style={{ fontSize: 12, color: '#666' }}>
          {uploading ? "Uploading…" : "PNG/JPG up to ~15MB each"}
        </span>
        <button onClick={refresh} disabled={busy} style={smallBtn}>{busy ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      {rows.length === 0 && !busy && (
        <div style={{ padding: 12, color: '#666' }}>No images yet. Upload some.</div>
      )}

      <div style={grid}>
        {rows.map(r => {
          const imgUrl = r.stream_url || `${apiBase}/api/vehicleImages/${vehicleId}/images/${r.vehicle_image_id}`;
          return (
            <div key={r.vehicle_image_id} style={card}>
              <img src={imgUrl} alt="" style={imgStyle} />
              <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => onPrimary(r.vehicle_image_id)}
                  style={{ ...smallBtn, background: r.is_primary ? '#e6f4ea' : '#fafafa', borderColor: r.is_primary ? '#4caf50' : '#ccc' }}
                  title="Set as primary"
                >
                  {r.is_primary ? 'Primary' : 'Make primary'}
                </button>
                <button
                  onClick={() => onDelete(r.vehicle_image_id)}
                  style={{ ...smallBtn, color: '#b30000', borderColor: '#b30000' }}
                >
                  Delete
                </button>
              </div>
              <div style={{ marginTop: 6 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#666' }}>Caption</label>
                <input
                  type="text"
                  defaultValue={r.caption || ""}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v !== (r.caption || "")) onMetaChange(r.vehicle_image_id, { caption: v });
                  }}
                  style={{ width: '100%', padding: 6, border: '1px solid #ddd', borderRadius: 6 }}
                />
              </div>
              <div style={{ marginTop: 6 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#666' }}>Sort order</label>
                <input
                  type="number"
                  defaultValue={r.sort_order ?? 0}
                  onBlur={(e) => {
                    const num = Number(e.target.value) || 0;
                    if (num !== (r.sort_order ?? 0)) onMetaChange(r.vehicle_image_id, { sort_order: num });
                  }}
                  style={{ width: '100%', padding: 6, border: '1px solid #ddd', borderRadius: 6 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
