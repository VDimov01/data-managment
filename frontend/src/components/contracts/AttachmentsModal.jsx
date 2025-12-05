import React, { useEffect, useState } from "react";
import Modal from "../Modal.jsx";
import HandoverTab from "./HandoverTab.jsx";
import ContractPaymentsTab from "./ContractPaymentsTab.jsx";
import ContractInvoicesTab from "./ContractInvoicesTab.jsx"; // <-- НОВО

import { niceBytes } from "./ContractsSection.jsx"; // keep your helper
import { formatDateDMYLocal } from "../../utils/dates.js";
import { api } from "../../services/api"; // <-- use shared API helper

export default function AttachmentsModal({ apiBase, contract, onClose }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]); // edition specs per vehicle
  const [generating, setGenerating] = useState(false);
  const [perBusy, setPerBusy] = useState({}); // edition_id -> bool
  const [tab, setTab] = useState("specs"); // 'specs' | 'handover' | 'payments' | 'invoices'

  const load = async () => {
    setLoading(true);
    try {
      // GET /api/contracts/:id/specs-pdfs
      const data = await api(`/contracts/${contract.contract_id}/specs-pdfs`);
      const list = data.attachments || data.vehicles || [];
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
      await api(`/contracts/${contract.contract_id}/specs-pdfs`, {
        method: "POST",
        body: { return_signed: false },
      });
      await load();
    } catch (e) {
      alert(`Генерирането се провали: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const openSpec = async (edition_id) => {
    try {
      setPerBusy(prev => ({ ...prev, [edition_id]: true }));
      const data = await api(`/contracts/${contract.contract_id}/specs-pdfs`, {
        method: "POST",
        body: { edition_id, return_signed: true, force: false },
      });

      const signedUrl = Array.isArray(data?.attachments)
        ? (data.attachments.find(x => x.edition_id === edition_id)?.signedUrl)
        : (data?.signedUrl || data?.pdf?.signedUrl || null);

      if (signedUrl) {
        window.open(signedUrl, "_blank", "noopener,noreferrer");
      } else {
        await load();
        alert("Няма подписан URL от сървъра.");
      }
    } catch (e) {
      alert(`Отварянето се провали: ${e.message}`);
    } finally {
      setPerBusy(prev => ({ ...prev, [edition_id]: false }));
    }
  };

  const regenerateOne = async (edition_id) => {
    if (!confirm("Регенериране на спецификациите за тази модификация?")) return;
    try {
      setPerBusy(prev => ({ ...prev, [edition_id]: true }));
      await api(`/contracts/${contract.contract_id}/specs-pdfs`, {
        method: "POST",
        body: { edition_id, return_signed: false, force: true },
      });
      await load();
    } catch (e) {
      alert(`Регенерирането се провали: ${e.message}`);
    } finally {
      setPerBusy(prev => ({ ...prev, [edition_id]: false }));
    }
  };

  return (
    <Modal
      open
      title={`Приложения към договора — ${contract.contract_number} / ${contract.customer_display_name || contract.customer_id}`}
      onClose={onClose}
    >
      <div>
        {/* Tabs */}
        <div className="tabs-bar">
          <button
            className={`tab ${tab === 'specs' ? 'btn-active' : ''}`}
            onClick={() => setTab('specs')}
          >
            Спецификации
          </button>
          <button
            className={`tab ${tab === 'handover' ? 'btn-active' : ''}`}
            onClick={() => setTab('handover')}
          >
            ППП (Приемо-предавателни протоколи)
          </button>
          <button
            type="button"
            className={`tab ${tab === 'payments' ? 'btn-active' : ''}`}
            onClick={() => setTab("payments")}
          >
            Плащания
          </button>
          <button
            type="button"
            className={`tab ${tab === "invoices" ? "btn-active" : ""}`}
            onClick={() => setTab("invoices")}
          >
            Фактури
          </button>
        </div>

        {tab === 'specs' && (
          <section>
            {/* Toolbar */}
            <div className="toolbar-row" style={{ justifyContent: 'flex-start' }}>
              <button
                className="btn btn-primary"
                onClick={generateAll}
                disabled={generating || loading}
              >
                {generating ? "Генерира…" : "Генерирай за всички"}
              </button>
            </div>

            {/* States */}
            {loading && <div className="text-muted">Зареждане…</div>}
            {!loading && rows.length === 0 && (
              <div className="text-muted">Няма записи.</div>
            )}

            {/* List */}
            {!loading && rows.length > 0 && (
              <div className="list" style={{ marginTop: 8 }}>
                {rows.map(v => {
                  const title = `${v.make || v.make_name || ''} ${v.model || v.model_name || ''} ${
                    (v.model_year || v.year) ? `(${v.model_year || v.year})` : ""
                  } — ${v.edition || v.edition_name || ''}`.trim();

                  const hasPdf = !!(v.version && (v.byte_size || v.size || v.sha256));
                  const busy = !!perBusy[v.edition_id];

                  return (
                    <div
                      key={`${v.edition_id}-${v.vehicle_id || ''}`}
                      className="list-item"
                      style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}
                    >
                      <div>
                        <div className="line-1" style={{ fontWeight: 600 }}>{title}</div>
                        <div className="line-2" style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                          <span className="badge">VIN: {v.vin || "—"}</span>
                          {hasPdf ? (
                            <>
                              <span className="badge">Версия {v.version}</span>
                              <span className="badge">{niceBytes(v.byte_size || v.size || 0)}</span>
                              <span className="badge">{formatDateDMYLocal(v.created_at) || ""}</span>
                            </>
                          ) : (
                            <span className="badge text-muted">Няма PDF</span>
                          )}
                        </div>
                      </div>

                      <div className="btn-row">
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
                        {/* пер-едишън регенерация – ако ти потрябва някога */}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {tab === 'handover' && (
          <section>
            <HandoverTab apiBase={apiBase} contract={contract} />
          </section>
        )}

        {tab === "payments" && (
          <ContractPaymentsTab contract={contract} />
        )}

        {tab === "invoices" && (
          <ContractInvoicesTab contract={contract} />
        )}
      </div>
    </Modal>
  );
}
