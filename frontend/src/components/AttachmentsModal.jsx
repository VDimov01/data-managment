import React, { useEffect, useState } from "react";
import Modal from "./Modal";
import { niceBytes, buildUrl } from "./ContractsSection.jsx"; // keep your helpers
import { formatDateDMYLocal } from "../utils/dates.js";
import HandoverTab from "./HandoverTab.jsx";

export default function AttachmentsModal({ apiBase, contract, onClose }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]); // edition specs per vehicle
  const [generating, setGenerating] = useState(false);
  const [perBusy, setPerBusy] = useState({}); // edition_id -> bool
  const [tab, setTab] = useState("specs"); // 'specs' | 'handover'

  const load = async () => {
    setLoading(true);
    try {
      // GET /api/contracts/:id/specs-pdfs
      const url = buildUrl(apiBase, `/api/contracts/${contract.contract_id}/specs-pdfs`);
      const r = await fetch(url);
      const data = await r.json();
      const list = data.attachments || data.vehicles || []; // tolerate both shapes
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      alert(`Зареждането се провали: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [contract.contract_id]);

  const generateAll = async () => {
    if (!confirm("Да генерираме спецификациите за всички автомобили по договора?")) return;
    setGenerating(true);
    try {
      // POST /api/contracts/:id/specs-pdfs
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
      const r = await fetch(buildUrl(apiBase, `/api/contracts/${contract.contract_id}/specs-pdfs`), {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ edition_id, return_signed: true, force: false })
      });
      const data = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);

      // Find signed URL for this edition
      const signedUrl = Array.isArray(data?.attachments)
        ? (data.attachments.find(x => x.edition_id === edition_id)?.signedUrl)
        : null;
      if (signedUrl) {
        window.open(signedUrl, "_blank", "noopener,noreferrer");
      } else {
        await load();
        alert("Няма подписан URL от сървъра.");
      }
    } catch (e) {
      alert(`Отварянето се провали: ${e.message}`);
    } finally {
      setPerBusy(prev => ({...prev, [edition_id]: false}));
    }
  };

  const regenerateOne = async (edition_id) => {
    if (!confirm("Регенериране на спецификациите за тази модификация?")) return;
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
    <Modal
      open
      title={`Приложения към договора — ${contract.contract_number} / ${contract.customer_display_name || contract.customer_id}`}
      onClose={onClose}
    >
      <div className="am-root">
        {/* Tabs */}
        <div className="am-tabs">
          <button
            className={`am-tab ${tab === 'specs' ? 'is-active' : ''}`}
            onClick={() => setTab('specs')}
          >
            Спецификации
          </button>
          <button
            className={`am-tab ${tab === 'handover' ? 'is-active' : ''}`}
            onClick={() => setTab('handover')}
          >
            ППП (Приемо-предавателни протоколи)
          </button>
        </div>

        {tab === 'specs' && (
          <section className="am-section">
            <div className="am-toolbar">
              <button
                className="btn primary"
                onClick={generateAll}
                disabled={generating || loading}
              >
                {generating ? "Генерира…" : "Генерирай за всички"}
              </button>
            </div>

            {loading && <div className="am-empty">Зареждане…</div>}
            {!loading && rows.length === 0 && (
              <div className="am-empty">Няма записи.</div>
            )}

            {!loading && rows.length > 0 && (
              <div className="am-list">
                {rows.map(v => {
                  const title = `${v.make || v.make_name || ''} ${v.model || v.model_name || ''} ${
                    (v.model_year || v.year) ? `(${v.model_year || v.year})` : ""
                  } — ${v.edition || v.edition_name || ''}`.trim();

                  const hasPdf = !!(v.version && (v.byte_size || v.size || v.sha256));
                  const busy = !!perBusy[v.edition_id];

                  return (
                    <div key={`${v.edition_id}-${v.vehicle_id || ''}`} className="am-item">
                      <div className="am-item__main">
                        <div className="am-title">{title}</div>
                        <div className="am-meta">
                          <span className="am-chip">VIN: {v.vin || "—"}</span>
                          <span className="am-dot">•</span>
                          {hasPdf ? (
                            <>
                              <span className="am-chip">
                                Версия {v.version}
                              </span>
                              <span className="am-dot">•</span>
                              <span className="am-chip">
                                {niceBytes(v.byte_size || v.size || 0)}
                              </span>
                              <span className="am-dot">•</span>
                              <span className="am-chip">
                                {formatDateDMYLocal(v.created_at) || ""}
                              </span>
                            </>
                          ) : (
                            <span className="am-chip muted">Няма PDF</span>
                          )}
                        </div>
                      </div>

                      <div className="am-actions">
                        {hasPdf && (
                          <button
                            className="btn"
                            onClick={() => openSpec(v.edition_id)}
                            disabled={busy}
                            title="Отвори PDF"
                          >
                            {busy ? "…" : "Отвори"}
                          </button>
                        )}
                        <button
                          className="btn"
                          onClick={() => regenerateOne(v.edition_id)}
                          disabled={busy}
                          title={hasPdf ? "Регенерирай" : "Генерирай"}
                        >
                          {busy ? "…" : (hasPdf ? "Регенерирай" : "Генерирай")}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {tab === 'handover' && (
          <section className="am-section">
            <HandoverTab apiBase={apiBase} contract={contract} />
          </section>
        )}
      </div>
    </Modal>
  );
}
