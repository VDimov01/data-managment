/** ---------- Browse tab ---------- */
import React, { useEffect, useState } from "react";
import AttachmentsModal from "./AttachmentsModal.jsx";
import { api, qs } from "../services/api"; // <-- use the shared API helper

const statusBG = {
  draft: "Чернова",
  issued: "Издаден",
  signed: "Подписан",
  withdrawn: "Оттеглен",
  cancelled: "Отменен",
};

export default function ContractsList({ apiBase, onOpenLatest, onRegenerate, onIssue }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [attachmentsFor, setAttachmentsFor] = useState(null); // {contract_id,...}

  const load = async () => {
    setLoading(true);
    try {
      const data = await api(`/contracts${qs({ page, limit, q: q.trim() || undefined })}`);
      // Tolerate various payload shapes
      setRows(data.items || data.contracts || data.rows || []);
      setTotal(data.total || 0);
    } catch (e) {
      alert(`Неуспешно зареждане на договори: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  async function cancelAndRelease(row, { force = false } = {}) {
    if (!confirm(`Отмяна на договор ${row.contract_number} и освобождаване на превозни средства?`)) return;
    try {
      const data = await api(`/contracts/${row.contract_id}/cancel`, { method: "POST", body: { force } });
      alert(`Отменен. Освободени ${data.released_count} превозни средства.`);
      await load();
    } catch (e) {
      if (/signed/i.test(e.message) && confirm("Договорът е подписан. Да принудим ли отмяната?")) {
        return cancelAndRelease(row, { force: true });
      }
      alert(`Отмяна неуспешна: ${e.message}`);
    }
  }

  async function handleMarkSigned(contractId) {
    if (!contractId) return;
    if (!confirm("Маркиране на договора като подписан и продажба на автомобилите?")) return;
    try {
      const data = await api(`/contracts/${contractId}/sign`, { method: "POST" });
      if (data?.warnings?.length) alert(data.warnings.join("\n"));
      await load();
    } catch (e) {
      alert(e.message);
    }
  }

  useEffect(() => { load(); }, [q, page]); // reload on q/page change

  const pages = Math.max(1, Math.ceil((total || 0) / limit));

  return (
    <div className="card">
      <div className="card-body">
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div className="col">
            <label className="lbl">Търси</label>
            <input
              className="inp"
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

        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>UUID</th>
                <th>Статус</th>
                <th>Вид</th>
                <th>Клиент</th>
                <th>Общо</th>
                <th>Артикули</th>
                <th>Създаден</th>
                <th style={{ width: 340 }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={9} className="muted">Няма договори.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.contract_id}>
                  <td>{r.contract_number || r.contract_id}</td>
                  <td className="muted mono">{r.uuid}</td>
                  <td>{(statusBG[r.status] || r.status).toUpperCase()}</td>
                  <td>{r.type === "ADVANCE" ? "Авансов" : "Редовен"}</td>
                  <td>{r.customer_display_name || r.customer_name || r.customer || "—"}</td>
                  <td>{(r.currency_code || r.currency || "BGN")} {r.total ?? r.subtotal ?? "0.00"}</td>
                  <td>{r.items_count ?? r.item_count ?? "—"}</td>
                  <td className="muted">{(r.created_at || "").replace("T", " ").slice(0, 19)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="btn" onClick={() => onOpenLatest(r.uuid)}>Отвори</button>
                      <button className="btn" onClick={() => setAttachmentsFor(r)}>Приложения към договора</button>

                      {String(r.status).toLowerCase() === "issued" && (
                        <button className="btn" onClick={() => handleMarkSigned(r.contract_id)}>
                          Маркирай като подписан
                        </button>
                      )}

                      {String(r.status).toLowerCase() !== "issued" &&
                        String(r.status).toLowerCase() !== "withdrawn" &&
                        String(r.status).toLowerCase() !== "cancelled" &&
                        String(r.status).toLowerCase() !== "signed" && (
                          <>
                            <button className="btn" onClick={() => onRegenerate(r.contract_id)}>Регенерирай</button>
                            <button
                              className="btn success"
                              onClick={async () => {
                                await onIssue(r.contract_id);
                                await load();
                              }}
                            >
                              Издаване
                            </button>
                          </>
                        )}

                      {String(r.status).toLowerCase() !== "withdrawn" &&
                        String(r.status).toLowerCase() !== "draft" && (
                          <button
                            className="btn danger"
                            onClick={() => cancelAndRelease(r)}
                            disabled={r.status === "withdrawn" || r.status === "draft"}
                            title={r.status === "withdrawn" ? "Вече отменен" : "Отмени и освободи превозните средства"}
                          >
                            Откажи и освободи
                          </button>
                        )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="pager">
            <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Предишна
            </button>
            <span>Страница {page} / {pages}</span>
            <button className="btn" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>
              Следваща
            </button>
          </div>
        )}

        {attachmentsFor && (
          <AttachmentsModal
            apiBase={apiBase}
            contract={attachmentsFor}
            onClose={() => setAttachmentsFor(null)}
          />
        )}
      </div>
    </div>
  );
}
