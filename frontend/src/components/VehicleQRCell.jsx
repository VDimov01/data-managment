import { useState } from 'react';
import { generateVehicleQr } from '../services/api';
import PrintSelectedLabelsButton from './PrintSelectedLabelsButton';

export default function VehicleQRCell({ row, apiBase, onRowUpdate }) {
  const [busy, setBusy] = useState(false);
  console.log('VehicleQRCell', { row });

  const href = `${apiBase}/api/labels/vehicles.pdf?ids=${row.vehicle_id}`;

  const handleGen = async () => {
    setBusy(true);
    try {
      const out = await generateVehicleQr(apiBase, row.vehicle_id);
      onRowUpdate?.({ ...row, qr_object_key: out.qr_object_key });
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
        {busy ? 'Working…' : row.qr_object_key ? 'Регенерирай QR' : 'Генерирай QR' }
      </button>
      {row.qr_object_key && (
        <>
          <a href={row.qr_object_key} download={`veh-${row.vehicle_id}-qr.png`}>Изтегли</a>
          <a href={href} target="_blank" rel="noopener noreferrer">
            <button>Принтирай QR</button>
          </a>
        </>
      )}
    </div>
  );
}
