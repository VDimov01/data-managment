// HandoverTab.jsx
import React from "react";
import { formatDateDMYDateOnly } from "../../utils/dates";

function buildUrl(apiBase, path, params = {}) {
  const base = (apiBase || '').replace(/\/+$/, '');
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== '') qs.append(k, v);
  });
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return `${base}${path}${query}`;
}
async function apiCall(apiBase, path, { method='GET', body } = {}) {
  const r = await fetch(buildUrl(apiBase, `/api${path}`), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include'
  });
  const data = await r.json().catch(()=> ({}));
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}

// …top of file (helpers already present)

function fmtDateDisplay(isoish) {
  if (!isoish) return '—';
  try {
    // Show local-friendly date/time; tolerate "YYYY-MM-DDTHH:mm" or "…Z"
    const d = new Date(isoish);
    if (!isNaN(d)) return d.toLocaleString();
    // Fallback (if server returns "YYYY-MM-DD HH:MM:SS")
    return isoish.replace('T', ' ');
  } catch { return String(isoish); }
}

const statusBG = {
  draft: "Чернова",
  issued: "Издаден",
  signed: "Подписан",
  void: "Анулиран",
  cancelled: "Отменен"
}


export default function HandoverTab({ apiBase, contract }) {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  const load = async () => {
    if (!contract?.contract_id) return;
    setLoading(true);
    try {
      const data = await apiCall(apiBase, `/handover/by-contract/${contract.contract_id}`);
      setRows(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      alert(`Handover list failed: ${e.message}`);
    } finally { setLoading(false); }
  };

  React.useEffect(()=>{ load(); }, [contract?.contract_id]);

  const openPdf = async (id) => {
    try {
      const data = await apiCall(apiBase, `/handover/${id}/pdf/latest`);
      console.log('openPdf', {data});
      if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (e) { alert(`Open PDF failed: ${e.message}`); }
  }

  const createDrafts = async () => {
    if (!contract?.contract_id) return;
    if (!confirm('Създаване на чернови за всички линии по договора?')) return;
    setCreating(true);
    try {
      await apiCall(apiBase, `/handover/bulk-from-contract/${contract.contract_id}`, { method: 'POST' });
      await load();
    } catch (e) {
      alert(`Create drafts failed: ${e.message}`);
    } finally { setCreating(false); }
  };

  const doIssue = async (id) => {
    try {
      const data = await apiCall(apiBase, `/handover/${id}/issue`, { method: 'POST' });
      if (data?.pdf?.signedUrl) window.open(data.pdf.signedUrl, '_blank', 'noopener,noreferrer');
      await load();
    } catch (e) { alert(`Generate PDF failed: ${e.message}`); }
  };
  const doRegen = async (id) => {
    try {
      const data = await apiCall(apiBase, `/handover/${id}/pdf`, { method: 'POST' });
      if (data?.pdf?.signedUrl) window.open(data.pdf.signedUrl, '_blank', 'noopener,noreferrer');
      await load();
    } catch (e) { alert(`Regenerate PDF failed: ${e.message}`); }
  };
  const doSigned = async (id) => {
    try {
      await apiCall(apiBase, `/handover/${id}/mark-signed`, { method: 'POST' });
      await load();
    } catch (e) { alert(`Mark signed failed: ${e.message}`); }
  };
  const doVoid = async (id) => {
    if (!confirm('Анулиране на този протокол?')) return;
    try {
      await apiCall(apiBase, `/handover/${id}/void`, { method: 'POST' });
      await load();
    } catch (e) { alert(`Void failed: ${e.message}`); }
  };

  // Controlled edits: update local UI immediately; send PATCH on blur
  const patchRowLocal = (id, patch) => {
    setRows(prev => prev.map(r => r.handover_record_id === id ? { ...r, ...patch } : r));
  };
  const doUpdate = async (id, patch) => {
    // Hard guard: ignore updates if row is not draft
    const hr = rows.find(r => r.handover_record_id === id);
    if (!hr || hr.status !== 'draft') return;

    try {
      await apiCall(apiBase, `/handover/${id}`, { method: 'PATCH', body: patch });
      await load();
    } catch (e) { alert(`Update failed: ${e.message}`); }
  };


  return (
    <div>
      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:10 }}>
        <button className="btn" onClick={load} disabled={loading}>{loading ? '…' : 'Презареди'}</button>
        <button className="btn primary" onClick={createDrafts} disabled={creating || loading}>
          {creating ? 'Създаване…' : 'Създай чернови (всички автомобили)'}
        </button>
      </div>

      {rows.length === 0 && <div className="muted">Няма създадени приемо-предавателни протоколи.</div>}

      {rows.map(row => {
  const isDraft = row.status === 'draft';
  return (
    <div key={row.handover_record_id} className="card" style={{ marginBottom:10 }}>
      <div className="card-body">
        <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
          <div>
            <div style={{ fontWeight:600 }}>
              {row.make_name} {row.model_name} {row.year ? `(${row.year})` : ''} — {row.edition_name}
            </div>
            <div className="muted">VIN: {row.vin || '—'}</div>
          </div>
          <div>
            <span className="muted">Статус: </span>
            <span style={{ fontWeight:700, textTransform:'uppercase' }}>{statusBG[row.status]}</span>
          </div>
        </div>

        {/* Fields: editable only in DRAFT */}
        {isDraft ? (
          <>
            <div className="row">
              <div className="col">
                <label className="lbl">Дата на предаване</label>
                <input
                  type="date"
                  className="inp"
                  value={row.handover_date ? row.handover_date.replace('Z','') : ''}
                  onChange={e => patchRowLocal(row.handover_record_id, { handover_date: e.target.value })}
                  onBlur={e => doUpdate(row.handover_record_id, { handover_date: e.target.value || null })}
                />
              </div>
              <div className="col">
                <label className="lbl">Местоположение</label>
                <input
                  type="text"
                  className="inp"
                  defaultValue={row.location || ''}
                  onChange={e => patchRowLocal(row.handover_record_id, { location: e.target.value })}
                  onBlur={e => doUpdate(row.handover_record_id, { location: e.target.value || null })}
                />
              </div>
              <div className="col">
                <label className="lbl">Пробег (км)</label>
                <input
                  type="number"
                  className="inp"
                  min={0}
                  defaultValue={row.odometer_km ?? ''}
                  onChange={e => {
                    const v = e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value || 0, 10));
                    patchRowLocal(row.handover_record_id, { odometer_km: v === '' ? null : v });
                  }}
                  onBlur={e => {
                    const v = e.target.value === '' ? null : Math.max(0, parseInt(e.target.value || 0, 10));
                    doUpdate(row.handover_record_id, { odometer_km: v });
                  }}
                />
              </div>
            </div>

            <div className="row">
              <div className="col-12">
                <label className="lbl">Бележки</label>
                <input
                  type="text"
                  className="inp"
                  defaultValue={row.notes || ''}
                  onChange={e => patchRowLocal(row.handover_record_id, { notes: e.target.value })}
                  onBlur={e => doUpdate(row.handover_record_id, { notes: e.target.value || null })}
                />
              </div>
            </div>
          </>
        ) : (
          // Read-only view for non-draft
          <>
            <div className="row">
              <div className="col">
                <label className="lbl">Дата на предаване</label>
                <div style={{ padding:8, border:'1px solid #e5e7eb', borderRadius:8 }}>
                  {fmtDateDisplay(row.handover_date)}
                </div>
              </div>
              <div className="col">
                <label className="lbl">Местоположение</label>
                <div style={{ padding:8, border:'1px solid #e5e7eb', borderRadius:8 }}>
                  {row.location || '—'}
                </div>
              </div>
              <div className="col">
                <label className="lbl">Пробег (км)</label>
                <div style={{ padding:8, border:'1px solid #e5e7eb', borderRadius:8 }}>
                  {row.odometer_km ?? '—'}
                </div>
              </div>
            </div>

            <div className="row">
              <div className="col-12">
                <label className="lbl">Бележки</label>
                <div style={{ padding:8, border:'1px solid #e5e7eb', borderRadius:8, minHeight:38 }}>
                  {row.notes || '—'}
                </div>
              </div>
            </div>
          </>
        )}

        <div className="actions" style={{ justifyContent:'flex-start' }}>
          {isDraft ? (
            <button className="btn success" onClick={() => doIssue(row.handover_record_id)}>Генерирай PDF</button>
          ) : (
            <>
            <button className="btn" onClick={() => openPdf(row.handover_record_id)}>Отвори</button>
            <button className="btn" onClick={() => doRegen(row.handover_record_id)}>Регенерирай</button>
            </>
          )}
          {row.status !== 'signed' && (
            <button className="btn" onClick={() => doSigned(row.handover_record_id)}>Маркирай като подписан</button>
          )}
          {row.status !== 'void' && (
            <button className="btn danger" onClick={() => doVoid(row.handover_record_id)}>Анулирай</button>
          )}
        </div>
      </div>
    </div>
  );
})}

    </div>
  );
}
