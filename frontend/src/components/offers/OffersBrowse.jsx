// frontend/src/components/offers/OffersBrowse.jsx
import React, { useEffect, useState } from "react";
import { api } from "../../services/api.js";            // <-- explicit .js
import { niceDate } from "../../utils/helpers";
import { statusToBG } from "../../utils/i18n.js";

export default function OffersBrowse({ onManage }) {
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("");
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

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

  // NEW: Issue directly from the list
  async function issueRow(row) {
    try {
      const uuid = row.offer_uuid;
      const out = await api(`/offers/${uuid}/issue`, { method: "POST" });
      // out = { offer_number, version_no, gcs_path }
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
    return s === "draft" || s === "revised";
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
                      <button className="btn" onClick={() => onManage(r.offer_uuid)}>Отвори</button>
                      <button className="btn" onClick={() => openLatestPdf(r)}>PDF</button>
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
    </div>
  );
}
