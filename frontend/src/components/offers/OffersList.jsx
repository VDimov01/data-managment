// frontend/src/components/OffersList.jsx
import React, { useEffect, useState } from "react";
import { api, qs } from "../../services/api";

const statusBG = {
  draft: "Чернова",
  issued: "Издадена",
  withdrawn: "Оттеглена",
  cancelled: "Отменена",
  accepted: "Приета",
  rejected: "Отхвърлена",
};

export default function OffersList({ onOpenLatest, onRegenerate, onIssue }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api(`/offers${qs({ page, limit, q: q.trim() || undefined })}`);
      setRows(data.items || data.offers || data.rows || []);
      setTotal(data.total || 0);
    } catch (e) {
      alert(`Неуспешно зареждане на оферти: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [q, page]);

  const pages = Math.max(1, Math.ceil((total || 0) / limit));

  async function handleWithdraw(row) {
    if (!confirm(`Оттегляне на оферта ${row.offer_number || row.offer_id}?`)) return;
    try {
      await api(`/offers/${row.offer_id}/cancel`, { method: "POST", body: { force: false } });
      await load();
    } catch (e) {
      alert(`Грешка: ${e.message}`);
    }
  }

  return (
    <div className="card">
      <div className="card-body">
        {/* Top bar */}
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div className="col">
            <label className="lbl">Търси</label>
            <input
              className="input"
              placeholder="Номер, клиент, UUID…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="col" style={{ maxWidth: 220 }}>
            <button className="btn" onClick={load} disabled={loading}>
              {loading ? "…" : "Презареди"}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>UUID</th>
                <th>Статус</th>
                <th>Клиент</th>
                <th>Валута</th>
                <th>Общо</th>
                <th>Артикули</th>
                <th>Създадена</th>
                <th style={{ width: 340 }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-muted center">Няма оферти.</td>
                </tr>
              )}

              {rows.map((r) => (
                <tr key={r.offer_id}>
                  <td>{r.offer_number || r.offer_id}</td>
                  <td><code className="text-muted mono">{r.uuid}</code></td>
                  <td>{(statusBG[(r.status || "").toLowerCase()] || r.status || "—").toUpperCase()}</td>
                  <td>{r.customer_display_name || r.customer_name || "—"}</td>
                  <td>{r.currency_code || r.currency || "BGN"}</td>
                  <td>{r.total ?? r.subtotal ?? "0.00"}</td>
                  <td>{r.items_count ?? r.item_count ?? "—"}</td>
                  <td className="text-muted">{(r.created_at || "").replace("T", " ").slice(0, 19)}</td>
                  <td>
                    <div className="btn-row">
                      <button className="btn" onClick={() => onOpenLatest(r.uuid)}>Отвори</button>

                      {String(r.status).toLowerCase() !== "issued" &&
                       String(r.status).toLowerCase() !== "withdrawn" &&
                       String(r.status).toLowerCase() !== "cancelled" && (
                        <>
                          <button className="btn" onClick={() => onRegenerate(r.offer_id)}>
                            Регенерирай
                          </button>
                          <button
                            className="btn btn-primary"
                            onClick={async () => {
                              await onIssue(r.offer_id);
                              await load();
                            }}
                          >
                            Издаване
                          </button>
                        </>
                      )}

                      {String(r.status).toLowerCase() !== "withdrawn" && (
                        <button
                          className="btn btn-danger"
                          onClick={() => handleWithdraw(r)}
                          disabled={r.status === "withdrawn" || r.status === "cancelled"}
                          title={r.status === "withdrawn" ? "Вече оттеглена" : "Оттегли офертата"}
                        >
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

        {/* Pager */}
        {pages > 1 && (
          <div className="panel-footer">
            <button
              className="page-btn"
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Предишна
            </button>

            <span className="results">Страница {page} / {pages}</span>

            <button
              className="page-btn"
              type="button"
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
            >
              Следваща
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
