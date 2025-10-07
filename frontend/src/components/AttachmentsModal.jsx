import React, { useEffect, useState } from "react";
import { niceBytes, buildUrl, makeApi } from "./ContractsSection.jsx";
import { formatDateDMYLocal } from "../utils/dates.js";
import HandoverTab from "./HandoverTab.jsx";

export default function AttachmentsModal({ apiBase, contract, onClose }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]); // vehicles + specs info
  const [generating, setGenerating] = useState(false);
  const [perBusy, setPerBusy] = useState({}); // edition_id -> bool

  const load = async () => {
    setLoading(true);
    try {
      // Assumes you have GET /api/contracts/:id/specs-pdfs
      const url = buildUrl(apiBase, `/api/contracts/${contract.contract_id}/specs-pdfs`);
      const r = await fetch(url);
      const data = await r.json();
      const list = data.attachments || data.vehicles || [];
      setRows(list);
    } catch (e) {
      alert(`Зареждането се провали: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [contract.contract_id]);

  const generateAll = async () => {
    if (!confirm("Да генерираме спецификациите за всички автомобили по договора?")) return;
    setGenerating(true);
    try {
      // POST /api/contracts/:id/specs-pdfs (no body) → ensures/generates all; ideally returns per-vehicle signed urls
      const r = await fetch(buildUrl(apiBase, `/api/contracts/${contract.contract_id}/specs-pdfs`), {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ return_signed: false })
      });
      const data = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      await load();
    } catch (e) {
      alert(`Генерирането се провали: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const openSpec = async (edition_id) => {
    try {
      setPerBusy(prev => ({...prev, [edition_id]: true}));
      // Easiest: reuse POST endpoint to return a signed url for that edition
      const r = await fetch(buildUrl(apiBase, `/api/contracts/${contract.contract_id}/specs-pdfs`), {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ edition_id, return_signed: true, force: false })
      });
      const data = await r.json().catch(()=>({}));
      console.log("Spec open response:", data);
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);

      // try to locate URL
      const signedUrl =
        (Array.isArray(data?.attachments) ? (data.attachments.find(x => x.edition_id === edition_id)?.signedUrl) : null);

      if (signedUrl) {
        window.open(signedUrl, "_blank", "noopener,noreferrer");
      } else {
        // fallback: reload list and hope GET includes a signed url or at least shows presence
        await load();
        alert("Няма подписан URL от сървъра (вж. бекенд отговора).");
      }
    } catch (e) {
      alert(`Отварянето се провали: ${e.message}`);
    } finally {
      setPerBusy(prev => ({...prev, [edition_id]: false}));
    }
  };

  const regenerateOne = async (edition_id) => {
    if (!confirm("Регенериране на спесификациите за тази модификация?")) return;
    try {
      setPerBusy(prev => ({...prev, [edition_id]: true}));
      const r = await fetch(buildUrl(apiBase, `/api/contracts/${contract.contract_id}/specs-pdfs`), {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ edition_id, return_signed: false, force: true })
      });
      const data = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      await load();
    } catch (e) {
      alert(`Регенерирането се провали: ${e.message}`);
    } finally {
      setPerBusy(prev => ({...prev, [edition_id]: false}));
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <div><strong>Приложения към договора</strong> — {contract.contract_number} / {contract.customer_display_name || contract.customer_id}</div>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="row" style={{justifyContent:'space-between', alignItems:'center'}}>
            <div className="col"><h4 style={{margin:'6px 0'}}>Спецификации (Edition Spec Packs)</h4></div>
            <div className="col" style={{maxWidth:220, textAlign:'right'}}>
              <button className="btn primary" onClick={generateAll} disabled={generating || loading}>
                {generating ? "Генерира…" : "Генерирай за всички"}
              </button>
            </div>
          </div>

          <div className="list">
            {loading && <div className="muted" style={{padding:8}}>Зареждане…</div>}
            {!loading && rows.length === 0 && <div className="muted" style={{padding:8}}>Няма записи.</div>}
            {rows.map(v => {
              const hasPdf = !!(v.signedUrl && v.version);
              return (
                <div key={`${v.vehicle_id || v.edition_id}`} className="list-item" style={{display:'grid', gridTemplateColumns:'1fr auto', gap:10}}>
                  <div>
                    <div className="line-1">
                      {v.make || v.make_name} {v.model || v.model_name} {v.model_year || v.year ? `(${v.model_year || v.year})` : ""} — {v.edition || v.edition_name}
                    </div>
                    <div className="line-2">
                      VIN: {v.vin || "—"} · {hasPdf ? `Версия ${v.version} · ${niceBytes(v.byte_size)} · ${formatDateDMYLocal(v.created_at) || ""}` : "Няма PDF"}
                    </div>
                  </div>
                  <div style={{display:'flex', gap:8}}>
                    {hasPdf && (
                      <button className="btn" onClick={() => openSpec(v.edition_id)} disabled={!!perBusy[v.edition_id]}>
                        {perBusy[v.edition_id] ? "…" : "Отвори"}
                      </button>
                    )}
                    <button className="btn" onClick={() => regenerateOne(v.edition_id)} disabled={!!perBusy[v.edition_id]}>
                      {perBusy[v.edition_id] ? "…" : (hasPdf ? "Регенерирай" : "Генерирай")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{marginTop:16}}>
            <HandoverTab apiBase={apiBase} contract={contract} />
          </div>
        </div>
      </div>

      <style>{`
        .modal-backdrop {
          position: fixed; inset:0; background: rgba(0,0,0,0.3);
          display:flex; align-items:center; justify-content:center; z-index: 1000;
        }
        .modal {
          background:#fff; border-radius:12px; width:min(980px, 96vw);
          max-height: 90vh; overflow:auto; border:1px solid #e5e7eb;
        }
        .modal-header {
          display:flex; justify-content:space-between; align-items:center;
          padding:12px 14px; border-bottom:1px solid #e5e7eb;
          position: sticky; top:0; background:#fff; z-index:1;
        }
        .modal-body { padding:12px 14px; }
      `}</style>
    </div>
  );
}
