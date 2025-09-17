import { useEffect, useMemo, useState } from "react";
import Modal from "../Modal";
import BrochureForm from "./BrochureForm";
import AttachCustomersPanel from "./AttachCustomersPanel";


export default function BrochuresSection({ apiBase = "http://localhost:5000" }) {
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
  const [editing, setEditing] = useState(null); // brochure row or null

  const [openPreview, setOpenPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const [openAttach, setOpenAttach] = useState(false);
  const [attachFor, setAttachFor] = useState(null); // brochure row

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const url = new URL(`${apiBase}/api/brochures`);
      if (term) url.searchParams.set("q", term);
      url.searchParams.set("page", page);
      url.searchParams.set("limit", limit);
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setRows(data.brochures || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error(e);
      setErr(e.message || "Failed to load brochures");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [term, page, limit, apiBase]);

  const onCreate = () => { setEditing(null); setOpenForm(true); };
  const onEdit = (row) => { setEditing(row); setOpenForm(true); console.log(row); };

  const onDelete = async (row) => {
    if (!window.confirm(`Delete brochure "${row.title}"?`)) return;
    try {
      const r = await fetch(`${apiBase}/api/brochures/${row.brochure_id}`, { method: "DELETE" });
      if (r.status === 204) {
        // remove locally
        setRows(prev => prev.filter(x => x.brochure_id !== row.brochure_id));
        setTotal(t => Math.max(0, t - 1));
      } else {
        const j = await r.json().catch(()=>null);
        alert(j?.error || "Delete failed");
      }
    } catch (e) {
      console.error(e);
      alert("Delete failed");
    }
  };

  const onPreview = async (row) => {
    try {
      const r = await fetch(`${apiBase}/api/brochures/${row.brochure_id}/resolve`);
      const data = await r.json();
      if (!r.ok) {
        console.error(data);
        return alert(data.error || "Resolve failed");
      }
      setPreviewData({ title: row.title, ...data });
      setOpenPreview(true);
    } catch (e) {
      console.error(e); alert("Preview failed");
    }
  };

  const onOpenAttach = (row) => {
    setAttachFor(row);
    setOpenAttach(true);
  };

  // 👇 NEW: lock/unlock toggle handler
  const onToggleSnapshot = async (row) => {
    const action = row.is_snapshot ? "unlock" : "lock";
    const confirmMsg = row.is_snapshot
      ? "Unlock this brochure? It will become dynamic and reflect future changes."
      : "Lock this brochure? It will snapshot current data and stop auto-updating.";
    if (!window.confirm(confirmMsg)) return;

    try {
      const r = await fetch(`${apiBase}/api/brochures/${row.brochure_id}/${action}`, { method: "POST" });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error || `Failed to ${action}`);

      // optimistic UI update
      setRows(prev =>
        prev.map(x =>
          x.brochure_id === row.brochure_id
            ? { ...x, is_snapshot: action === "lock" ? 1 : 0 }
            : x
        )
      );

      // (optional) re-fetch to refresh timestamps/derived fields
      // await load();
    } catch (e) {
      console.error(e);
      alert(e.message || `Failed to ${action}`);
    }
  };

  return (
    <div className="br-container">
      <div className="br-toolbar">
        <input
          placeholder="Search title/description…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
        <div className="br-toolbar-right">
          <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
            {[10,20,50,100].map(n => <option key={n} value={n}>{n}/page</option>)}
          </select>
          <button className="br-primary" onClick={onCreate}>+ New Brochure</button>
        </div>
      </div>

      {loading && <p className="br-muted">Loading…</p>}
      {err && <p className="br-error">Error: {err}</p>}

      {!loading && !err && (
        <>
          <div className="br-table-wrap">
            <table className="br-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Title</th>
                  <th>Make / Model</th>
                  <th>Mode</th>
                  <th>Diffs</th>
                  <th>Lang</th>
                  <th>Snapshot</th>
                  <th>Created</th>
                  <th style={{width:220}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="br-muted">No brochures.</td>
                  </tr>
                )}
                {rows.map(r => (
                  <tr key={r.brochure_id}>
                    <td>{r.brochure_id}</td>
                    <td>{r.title}</td>
                    <td>{r.make_name} / {r.model_name}</td>
                    <td>{r.selection_mode}</td>
                    <td>{r.only_differences ? "Yes" : "No"}</td>
                    <td>{r.language?.toUpperCase()}</td>
                    <td>{r.is_snapshot ? "Snapshot" : "Live"}</td>
                    <td>{r.created_at?.slice(0,19).replace('T',' ') || ""}</td>
                    <td>
                      <div className="br-actions">
                        <button onClick={() => onPreview(r)}>Preview</button>
                        <button onClick={() => onOpenAttach(r)}>Attach</button>
                        <button onClick={() => onEdit(r)}>Edit</button>
                        <button
                          onClick={() => onToggleSnapshot(r)}
                          title={r.is_snapshot ? "Unlock (make dynamic again)" : "Lock (freeze as snapshot)"}
                        >
                          {r.is_snapshot ? "Unlock" : "Lock"}
                        </button>
                        <button className="br-danger" onClick={() => onDelete(r)}>Delete</button>
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
        title={editing ? `Edit Brochure #${editing.brochure_id}` : "Create Brochure"}
        onClose={() => setOpenForm(false)}
        maxWidth={980}
      >
        <BrochureForm
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
        {previewData ? <ComparePreview data={previewData} /> : <p>Loading…</p>}
      </Modal>

      {/* Attach to customers */}
      <Modal
        open={openAttach}
        title={attachFor ? `Attach to customers — ${attachFor.title}` : "Attach"}
        onClose={() => { setOpenAttach(false); setAttachFor(null); }}
        maxWidth={900}
      >
        {attachFor && (
          <AttachCustomersPanel
            apiBase={apiBase}
            brochureId={attachFor.brochure_id}
          />
        )}
      </Modal>
    </div>
  );
}


/* ======================= Preview (compare) ======================= */

function ComparePreview({ data }) {
  const { editions = [], rows = [] } = data;

  return (
    <div className="br-preview">
      <div className="br-preview-scroll">
        <table className="br-table">
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
                  <div className="br-attr">
                    <div className="br-attr-name">{r.name_bg}</div>
                    <div className="br-attr-meta">{r.name}{r.unit ? ` (${r.unit})` : ""}</div>
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
                <td colSpan={1 + editions.length} className="br-muted">No data</td>
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
  if (dt === "boolean") return v ? "Yes" : "No";
  if (dt === "int" || dt === "decimal") return unit ? `${v} ${unit}` : String(v);
  return String(v);
}

/* ========================= Pagination ========================= */

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
    <div className="br-pages">
      <button onClick={onPrev} disabled={page<=1}>Prev</button>
      {pages.map((p, i) => p === "…" ? (
        <span key={`e-${i}`} className="br-ellipsis">…</span>
      ) : (
        <button
          key={p}
          onClick={() => onJump(p)}
          className={p===page ? "on" : ""}
        >
          {p}
        </button>
      ))}
      <button onClick={onNext} disabled={page>=totalPages}>Next</button>
    </div>
  );
}
