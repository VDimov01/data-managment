import { useState } from 'react';
import { generateVehicleQr } from '../services/api';

export default function VehicleQRCell({ row, apiBase, onRowUpdate }) {
  const [busy, setBusy] = useState(false);

  const handleGen = async () => {
    setBusy(true);
    try {
      const out = await generateVehicleQr(apiBase, row.vehicle_id);
      onRowUpdate?.({ ...row, qr_png_path: out.qr_png_path });
    } catch (e) {
      alert(`QR generation failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      {row.qr_object_key
        ? <img src={`${apiBase}/api/qr/vehicles/${row.vehicle_id}/qr.png`} alt="QR" width={64} height={64} style={{ border:'1px solid #ddd' }} />
        : <span style={{ color:'#999' }}>no QR</span>}
      <button onClick={handleGen} disabled={busy}>
        {busy ? 'Working…' : row.qr_png_path ? 'Regenerate' : 'Generate'}
      </button>
      {row.qr_png_path && (
        <a href={row.qr_png_path} download={`veh-${row.vehicle_id}-qr.png`}>Download</a>
      )}
    </div>
  );
}
