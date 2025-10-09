import { useEffect, useState } from "react";
import Modal from "../Modal";
import CompareForm from "./CompareForm";
import AttachCustomersPanelCompare from "./AttachCustomersPanelCompare";
import { api, qs } from "../../services/api";

export default function CompareSheetsSection({ apiBase = "http://localhost:5000" }) {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  // Modals
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState(null); // compare row or null

  const [openPreview, setOpenPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const [openAttach, setOpenAttach] = useState(false);
  const [attachFor, setAttachFor] = useState(null); // compare row

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const data = await api(`/compares${qs({ q: term || undefined, page, limit })}`);
      setRows(data.compares || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error(e);
      setErr(e.message || "Неуспешно зареждане на сравнения");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [term, page, limit]); // apiBase no longer needed

  const onCreate = () => { setEditing(null); setOpenForm(true); };
  const onEdit = (row) => { setEditing(row); setOpenForm(true); };

  const onDelete = async (row) => {
    if (!window.confirm(`Изтриване на сравнение: "${row.title}"?`)) return;
    try {
      await api(`/compares/${row.compare_id}`, { method: "DELETE" }); // 204 is fine
      setRows(prev => prev.filter(x => x.compare_id !== row.compare_id));
      setTotal(t => Math.max(0, t - 1));
    } catch (e) {
      console.error(e);
      alert(e.message || "Неуспешно изтриване");
    }
  };

  const onPreview = async (row) => {
    try {
      const data = await api(`/compares/${row.compare_id}/resolve`);
      setPreviewData({ title: row.title, ...data });
      setOpenPreview(true);
    } catch (e) {
      console.error(e);
      alert(e.message || "Неуспешно предварително преглеждане");
    }
  };

  const onOpenAttach = (row) => {
    setAttachFor(row);
    setOpenAttach(true);
  };

  return (
    <div className="cmp-container">
      <div className="cmp-toolbar">
        <input
          placeholder="Търси по заглавие..."
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
        <div className="cmp-toolbar-right">
          <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
            {[10,20,50,100].map(n => <option key={n} value={n}>{n}/страница</option>)}
          </select>
          <button className="cmp-primary" onClick={onCreate}>+ Ново сравнение</button>
        </div>
      </div>

      {loading && <p className="cmp-muted">Зареждане...</p>}
      {err && <p className="cmp-error">Грешка: {err}</p>}

      {!loading && !err && (
        <>
          <div className="cmp-table-wrap">
            <table className="cmp-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Заглавие</th>
                  <th>Само разлики</th>
                  <th>Език</th>
                  <th>Snapshot</th>
                  <th>Създаден</th>
                  <th style={{width:220}}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="cmp-muted">Няма сравнения.</td>
                  </tr>
                )}
                {rows.map(r => (
                  <tr key={r.compare_id}>
                    <td>{r.compare_id}</td>
                    <td>{r.title}</td>
                    <td>{r.only_differences ? "Yes" : "No"}</td>
                    <td>{r.language?.toUpperCase()}</td>
                    <td>{r.is_snapshot ? "Snapshot" : "Live"}</td>
                    <td>{r.created_at?.slice(0,19).replace('T',' ') || ""}</td>
                    <td>
                      <div className="cmp-actions">
                        <button className="btn" onClick={() => onPreview(r)}>Преглед</button>
                        <button className="btn" onClick={() => onOpenAttach(r)}>Закачи към клиенти</button>
                        <button className="btn" onClick={() => onEdit(r)}>Редактиране</button>
                        <button className="cmp-danger" onClick={() => onDelete(r)}>Изтриване</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage(p => Math.max(1, p-1))}
            onNext={() => setPage(p => Math.min(totalPages, p+1))}
            onJump={(n) => setPage(n)}
          />
        </>
      )}

      {/* Create/Edit */}
      <Modal
        open={openForm}
        title={editing ? `Редактирай сравнение #${editing.compare_id}` : "Създай сравнение между издания"}
        onClose={() => setOpenForm(false)}
        maxWidth={980}
      >
        <CompareForm
          apiBase={apiBase}
          initial={editing}
          onSaved={() => { setOpenForm(false); load(); }}
        />
      </Modal>

      {/* Preview */}
      <Modal
        open={openPreview}
        title={previewData?.title || "Preview"}
        onClose={() => { setOpenPreview(false); setPreviewData(null); }}
        maxWidth={1100}
      >
        {previewData ? <ComparePreview data={previewData} /> : <p>Зареждане…</p>}
      </Modal>

      {/* Attach to customers */}
      <Modal
        open={openAttach}
        title={attachFor ? `Закачи към клиенти — ${attachFor.title}` : "Закачи"}
        onClose={() => { setOpenAttach(false); setAttachFor(null); }}
        maxWidth={900}
      >
        {attachFor && (
          <AttachCustomersPanelCompare
            apiBase={apiBase}
            compareId={attachFor.compare_id}
          />
        )}
      </Modal>
    </div>
  );
}

function ComparePreview({ data }) {
  const { editions = [], rows = [] } = data;

  return (
    <div className="cmp-preview">
      <div className="cmp-preview-scroll">
        <table className="cmp-table">
          <thead>
            <tr>
              <th>Attribute</th>
              {editions.map(ed => (
                <th key={ed.edition_id}>
                  {ed.make_name} {ed.model_name} {ed.year} — {ed.edition_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.attribute_id || r.code}>
                <td>
                  <div className="cmp-attr">
                    <div className="cmp-attr-name">{r.name_bg || r.name}</div>
                    <div className="cmp-attr-meta">{r.name}{r.unit ? ` (${r.unit})` : ""}</div>
                  </div>
                </td>
                {editions.map(ed => {
                  const v = r.values?.[ed.edition_id] ?? null;
                  return (
                    <td key={ed.edition_id}>
                      {formatVal(v, r.data_type, r.unit)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={1 + editions.length} className="cmp-muted">Няма налични данни</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatVal(v, dt, unit) {
  if (v == null) return "—";
  if (dt === "boolean") return v ? '✅' : '❌';
  if (dt === "int" || dt === "decimal") return unit ? `${v} ${unit}` : String(v);
  return String(v);
}

function Pagination({ page, totalPages, onPrev, onNext, onJump }) {
  const pages = [];
  const maxBtns = 7;
  if (totalPages <= maxBtns) {
    for (let i=1;i<=totalPages;i++) pages.push(i);
  } else {
    const left = Math.max(2, page-1);
    const right = Math.min(totalPages-1, page+1);
    pages.push(1);
    if (left > 2) pages.push("…");
    for (let i=left;i<=right;i++) pages.push(i);
    if (right < totalPages-1) pages.push("…");
    pages.push(totalPages);
  }

  return (
    <div className="cmp-pages">
      <button onClick={onPrev} disabled={page<=1}>Предишна</button>
      {pages.map((p, i) => p === "…" ? (
        <span key={`e-${i}`} className="cmp-ellipsis">…</span>
      ) : (
        <button
          key={p}
          onClick={() => onJump(p)}
          className={p===page ? "on" : ""}
        >
          {p}
        </button>
      ))}
      <button onClick={onNext} disabled={page>=totalPages}>Следваща</button>
    </div>
  );
}
