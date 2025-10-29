// frontend/src/components/offers/OffersBrowse.jsx
import React, { useEffect, useState } from "react";
import { api } from "../../services/api.js";            // <-- explicit .js
import { niceDate } from "../../utils/helpers";
import { statusToBG } from "../../utils/i18n.js";
import Modal from "../Modal.jsx";

export default function OffersBrowse({ onManage }) {
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("");
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modal state for contract creation
  const [contractModal, setContractModal] = useState({
    open: false,
    row: null,
    type: "REGULAR",
    advance: "",
    markConverted: true,
    loading: false,
    error: null,
  });

  const page = Math.floor(offset / limit) + 1;

  async function load() {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (term.trim()) p.set("term", term.trim());
      if (status) p.set("status", status);
      const data = await api(`/offers?${p.toString()}`);
      setRows(Array.isArray(data) ? data : (data.items || []));
    } catch (e) {
      alert(`Зареждане на оферти неуспешно: ${e.message}`);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [term, status, offset]);

  async function openLatestPdf(row) {
    try {
      const uuid = row.offer_uuid;
      const detail = await api(`/offers/${uuid}`);
      const vno = detail?.latest_pdf?.version_no;
      if (!vno) return alert("Няма генериран PDF за тази оферта.");
      const sig = await api(`/offers/${uuid}/pdfs/${vno}/signed-url`);
      if (sig?.signedUrl) window.open(sig.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      alert(e.message);
    }
  }

  // Issue directly from the list
  async function issueRow(row) {
    try {
      const uuid = row.offer_uuid;
      const out = await api(`/offers/${uuid}/issue`, { method: "POST" });
      if (out?.version_no) {
        const sig = await api(`/offers/${uuid}/pdfs/${out.version_no}/signed-url`);
        if (sig?.signedUrl && confirm("Офертата е издадена. Отвори PDF сега?")) {
          window.open(sig.signedUrl, "_blank", "noopener,noreferrer");
        }
      }
      await load(); // refresh the table
    } catch (e) {
      alert(`Издаването неуспешно: ${e.message}`);
    }
  }

  const canIssue = (row) => {
    const s = String(row.status || "").toLowerCase();
    return s === "draft" || s === "revised" || s === "withdrawn";
  };

  // Withdraw from list
  async function withdrawRow(row) {
    if (!confirm("Сигурни ли сте, че искате да оттеглите тази оферта?")) return;
    try {
      const uuid = row.offer_uuid;
      await api(`/offers/${uuid}/withdraw`, { method: "POST" });
      await load();
    } catch (e) {
      alert(`Оттеглянето неуспешно: ${e.message}`);
    }
  }

  // decide if withdraw should be shown
  const canWithdraw = (row) => {
    const s = String(row.status || "").toLowerCase();
    return s === "issued" || s === "signed"; // 'signed' tolerated if ever added
  };

  // ---- Contract creation (modal flow) ----
  const moneyToStr = (val) => {
    if (val == null || val === "") return null;
    const n = Number(String(val).replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return null;
    return n.toFixed(2);
  };

  function createContract(row) {
    setContractModal({
      open: true,
      row,
      type: "REGULAR",
      advance: "",
      markConverted: false,
      loading: false,
      error: null,
    });
  }

  async function submitContractFromOffer() {
    setContractModal((m) => ({ ...m, loading: true, error: null }));
    try {
      const { row, type, advance, markConverted } = contractModal;

      const body = {
        offer_id: row.offer_id,               // also sending uuid for convenience
        offer_uuid: row.offer_uuid,
        type,
        mark_converted: !!markConverted,
      };

      if (type === "ADVANCE") {
        const a = moneyToStr(advance);
        if (a == null) throw new Error("Невалидна авансова сума");
        if (row.total_amount && Number(a) > Number(row.total_amount)) {
          throw new Error("Авансът не може да е по-голям от общата сума по офертата");
        }
        body.advance_amount = a;
      }

      const res = await api(`/contracts/from-offer`, {
        method: "POST",
        body,
      });

      const c = res.contract;
      // Close and navigate
      setContractModal((m) => ({ ...m, open: false, loading: false }));
      alert("Създаването на договор е успешно. Номер на договора: " + (c.contract_number || "—"));
    } catch (e) {
      setContractModal((m) => ({ ...m, loading: false, error: e.message || String(e) }));
    }
  }
  // ---------------------------------------

  const canCreateContract = (row) => {
    const s = String(row.status || "").toLowerCase();
    return s === "issued"; // 'signed' tolerated if ever added
  };

  return (
    <div className="card">
      <div className="card-body">
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div className="col">
            <label className="label">Търси</label>
            <input
              className="input"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Номер, клиент…"
            />
          </div>
          <div className="col" style={{ maxWidth: 220 }}>
            <label className="label">Статус</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Всички</option>
              <option value="draft">Чернова</option>
              <option value="issued">Издадена</option>
              <option value="revised">За редакция</option>
              <option value="accepted">Приета</option>
              <option value="rejected">Отхвърлена</option>
              <option value="expired">Изтекла</option>
              <option value="withdrawn">Оттеглена</option>
              <option value="converted">Конвертирана</option>
            </select>
          </div>
          <div className="col" style={{ maxWidth: 140 }}>
            <button className="btn" onClick={load} disabled={loading}>
              {loading ? "…" : "Презареди"}
            </button>
          </div>
        </div>

        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Номер</th>
                <th>UUID</th>
                <th>Статус</th>
                <th>Клиент</th>
                <th>Сума</th>
                <th>Създадена</th>
                <th style={{ width: 320 }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7} className="text-muted center">Няма оферти.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.offer_uuid}>
                  <td>{r.offer_number || "—"}</td>
                  <td><code className="text-muted mono">{r.offer_uuid}</code></td>
                  <td>{(statusToBG(r.status) || "").toUpperCase()}</td>
                  <td>{r.customer_name || "—"}</td>
                  <td>{(r.currency || "BGN")} {Number(r.total_amount || 0).toFixed(2)}</td>
                  <td className="text-muted">{niceDate(r.created_at)}</td>
                  <td>
                    <div className="btn-row">
                      {r.status.toLowerCase() !== "converted" && (
                        <button className="btn" onClick={() => onManage(r.offer_uuid)}>
                          Редактирай
                        </button>
                      )}
                      <button className="btn" onClick={() => openLatestPdf(r)}>Отвори PDF</button>
                      {canIssue(r) && (
                        <button className="btn btn-primary" onClick={() => issueRow(r)}>
                          Издаване
                        </button>
                      )}
                      {canWithdraw(r) && (
                        <button className="btn btn-danger" onClick={() => withdrawRow(r)}>
                          Оттегли
                        </button>
                      )}
                      {canCreateContract(r) && (
                        <button className="btn btn-primary" onClick={() => createContract(r)}>
                          Създай договор (от офертата)
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel-footer">
          <button
            className="page-btn"
            onClick={() => setOffset((o) => Math.max(0, o - limit))}
            disabled={offset <= 0}
          >
            Предишна
          </button>
          <span className="results">Страница {page}</span>
          <button
            className="page-btn"
            onClick={() => setOffset((o) => o + limit)}
            disabled={rows.length < limit}
          >
            Следваща
          </button>
        </div>
      </div>

      {/* Contract creation modal */}
      <Modal
        open={contractModal.open}
        title="Създай договор от оферта"
        onClose={() => setContractModal((m) => ({ ...m, open: false }))}
      >
        <form
          onSubmit={(e) => { e.preventDefault(); if (!contractModal.loading) submitContractFromOffer(); }}
          style={{ display: "grid", gap: 12 }}
        >
          <div>
            <label className="label">Тип договор</label>
            <select
              className="select"
              value={contractModal.type}
              onChange={(e) => setContractModal((m) => ({ ...m, type: e.target.value }))}
            >
              <option value="REGULAR">Регулярен</option>
              <option value="ADVANCE">Авансов</option>
            </select>
          </div>

          {contractModal.type === "ADVANCE" && (
            <div>
              <label className="label">Авансова сума (с ДДС)</label>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={contractModal.advance}
                onChange={(e) => setContractModal((m) => ({ ...m, advance: e.target.value }))}
                required
              />
              {contractModal?.row?.total_amount ? (
                <small className="text-muted">
                  Макс: {Number(contractModal.row.total_amount).toFixed(2)} {contractModal.row.currency || "BGN"}
                </small>
              ) : null}
            </div>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={contractModal.markConverted}
              onChange={(e) => setContractModal((m) => ({ ...m, markConverted: e.target.checked }))}
            />
            Маркирай офертата като „Конвертирана“
          </label>

          {contractModal.error && (
            <div style={{ color: "crimson" }}>{contractModal.error}</div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" className="btn" onClick={() => setContractModal((m) => ({ ...m, open: false }))}>
              Отказ
            </button>
            <button type="submit" className="btn btn-primary" disabled={contractModal.loading}>
              {contractModal.loading ? "Създаване..." : "Създай договор"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
