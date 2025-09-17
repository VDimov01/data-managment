// AvailableEditions.jsx
import { useEffect, useMemo, useState } from "react";

export default function AvailableEditions({
  apiBase = "http://localhost:5000",
  initialPageSize = 10,
  onEdit,
  selectedIds = new Set(),
  onToggleSelect = () => {},
  onClearSelected = () => {},
  onAddVehicle = () => {},       // 👈 new
  showAddVehicle = false,        // 👈 new
  hideDefaultActions = false,    // 👈 new
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const [deletingIds, setDeletingIds] = useState(new Set());

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`${apiBase}/api/editions`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setItems(data || []);
    } catch (e) { console.error(e); setErr(e.message || "Failed to load"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [apiBase]);

  const filtered = useMemo(() => {
    if (!term) return items;
    return items.filter((it) => {
      const s = `${it.make ?? ""} ${it.model ?? ""} ${it.year ?? ""} ${it.edition_name ?? ""}`.toLowerCase();
      return s.includes(term);
    });
  }, [items, term]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => { if (page > totalPages) setPage(1); }, [totalPages, page]);

  const start = (page - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  const th = { borderBottom: "1px solid #ddd", textAlign: "left", padding: "8px" };
  const td = { borderBottom: "1px solid #f3f3f3", padding: "8px", verticalAlign: "top" };

  const isSelected = (id) => selectedIds.has(id);

  const handleDelete = async (row) => {
    const title = `${row.make} ${row.model} ${row.year} — ${row.edition_name}`;
    if (!window.confirm(`Delete edition:\n\n${title}\n\nThis cannot be undone.`)) return;

    setDeletingIds(prev => new Set(prev).add(row.edition_id));
    try {
      const res = await fetch(`${apiBase}/api/editions/${row.edition_id}`, { method: 'DELETE' });
      let data = null;
      try { data = await res.json(); } catch {}
      if (!res.ok) {
        alert((data && data.error) || 'Failed to delete edition');
        return;
      }
      // remove local
      setItems(prev => prev.filter(e => e.edition_id !== row.edition_id));
      if (isSelected(row.edition_id)) onToggleSelect(row);
    } catch (e) {
      console.error(e); alert('Network error while deleting.');
    } finally {
      setDeletingIds(prev => { const n = new Set(prev); n.delete(row.edition_id); return n; });
    }
  };

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <input
          placeholder="Search make / model / year / edition…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
        <select
          title="Rows per page"
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
        >
          {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
        </select>
        <button type="button" onClick={() => { setQ(""); setPage(1); }}>Clear</button>
      </div>

      {!hideDefaultActions && (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div style={{ fontSize:12, color:'#666' }}>
            Selected for compare: <b>{selectedIds.size}</b>
          </div>
          <button type="button" onClick={onClearSelected} disabled={selectedIds.size === 0}>Clear selected</button>
        </div>
      )}

      {loading && <p>Loading editions…</p>}
      {err && <p style={{ color: "crimson" }}>Error: {err}</p>}

      {!loading && !err && (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={th}>#</th>
                  <th style={th}>Make</th>
                  <th style={th}>Model</th>
                  <th style={th}>Year</th>
                  <th style={th}>Edition</th>
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((row) => {
                  const selected = isSelected(row.edition_id);
                  const deleting = deletingIds.has(row.edition_id);
                  return (
                    <tr key={row.edition_id} style={{ background: selected && !hideDefaultActions ? '#f5fbff' : undefined }}>
                      <td style={td}>{row.edition_id}</td>
                      <td style={td}>{row.make}</td>
                      <td style={td}>{row.model}</td>
                      <td style={td}>{row.year}</td>
                      <td style={td}>{row.edition_name}</td>
                      <td style={td}>
                        <div style={{ display:'flex', gap:8 }}>
                          {!hideDefaultActions && (
                            <>
                              <button type="button" onClick={() => onEdit?.(row)} disabled={deleting}>Edit</button>
                              <button
                                type="button"
                                onClick={() => onToggleSelect(row)}
                                aria-pressed={selected}
                                disabled={deleting}
                              >
                                {selected ? 'Unselect' : 'Select'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(row)}
                                disabled={deleting}
                                style={{ color: '#b30000' }}
                              >
                                {deleting ? 'Deleting…' : 'Delete'}
                              </button>
                            </>
                          )}

                          {showAddVehicle && (
                            <button
                              type="button"
                              onClick={() => onAddVehicle?.(row)}
                              disabled={deleting}
                              style={{ fontWeight: 600 }}
                            >
                              Add vehicle
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {pageItems.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ ...td, color: "#777" }}>
                      No editions match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <div style={{ fontSize: 12, color: "#666" }}>
              Showing {filtered.length === 0 ? 0 : start + 1}–{Math.min(start + pageSize, filtered.length)} of {filtered.length}
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              onPrev={() => setPage(p => Math.max(1, p - 1))}
              onNext={() => setPage(p => Math.min(totalPages, p + 1))}
              onJump={(n) => setPage(n)}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Pagination({ page, totalPages, onPrev, onNext, onJump }) {
  const pages = [];
  const maxBtns = 7;
  if (totalPages <= maxBtns) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    const left = Math.max(2, page - 1);
    const right = Math.min(totalPages - 1, page + 1);
    pages.push(1);
    if (left > 2) pages.push("…");
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages - 1) pages.push("…");
    pages.push(totalPages);
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <button type="button" onClick={onPrev} disabled={page <= 1}>Prev</button>
      {pages.map((p, idx) =>
        p === "…" ? (
          <span key={`e-${idx}`} style={{ padding: "4px 6px", color: "#777" }}>…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onJump(p)}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid #ddd",
              background: p === page ? "#eef6ff" : "#fff",
              fontWeight: p === page ? 700 : 400
            }}
          >
            {p}
          </button>
        )
      )}
      <button type="button" onClick={onNext} disabled={page >= totalPages}>Next</button>
    </div>
  );
}
