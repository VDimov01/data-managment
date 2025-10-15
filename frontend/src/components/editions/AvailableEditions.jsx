// AvailableEditions.jsx
import { useEffect, useMemo, useState } from "react";
import {api} from "../../services/api";

export default function AvailableEditions({
  refreshKey = 0,
  apiBase = "https://data-managment-production.up.railway.app", // default to deployed backend
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

  const [specBusy, setSpecBusy] = useState(new Set()); // edition_ids in-flight

const getSigned = (d) =>
  d?.signedUrl ||
  d?.pdf?.signedUrl ||
  d?.attachments?.signedUrl ||
  d?.row?.signedUrl ||
  null;

const ensureSpecs = async (row, { regenerate = true } = {}) => {
  const id = row.edition_id;
  setSpecBusy(prev => new Set(prev).add(id));
  try {
    const data = await api(`/editions/${id}/specs-pdf`, {
      method: 'POST',
      body: { regenerate },
    });

    const url = getSigned(data);
    if (url) {
      if (confirm('Отвори ли последния Spec Pack сега?')) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        alert('Spec Pack генериран успешно.');
      }
    } else {
      alert('Spec Pack генериран, но не бе върнат подписан URL.');
    }
  } catch (e) {
    alert(e.message || 'Spec pack failed');
  } finally {
    setSpecBusy(prev => { const n = new Set(prev); n.delete(id); return n; });
  }
};

const openLatestSpecs = async (row) => {
  const id = row.edition_id;
  setSpecBusy(prev => new Set(prev).add(id));
  try {
    const data = await api(`/editions/${id}/specs-pdf/latest`);
    const url = getSigned(data);
    if (!url) return alert('Няма подписан линк. Генерирайте Spec Pack първо.');
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (e) {
    if (e.status === 404) {
      alert('Няма Spec Pack за това издание. Генерирайте първо.');
    } else {
      alert(e.message || 'Failed to fetch latest spec pack');
    }
  } finally {
    setSpecBusy(prev => { const n = new Set(prev); n.delete(id); return n; });
  }
};



  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const data = await api(`/editions`);
      setItems(data || []);
    } catch (e) { console.error(e); setErr(e.message || "Failed to load"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [refreshKey, apiBase]);

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
    if (!window.confirm(`Изтриване на издание:\n\n${title}\n\nТова не може да бъде отменено.`)) return;

    setDeletingIds(prev => new Set(prev).add(row.edition_id));
    try {
      await api(`/editions/${row.edition_id}`, { method: 'DELETE' });
      // remove local
      setItems(prev => prev.filter(e => e.edition_id !== row.edition_id));
      if (isSelected(row.edition_id)) onToggleSelect(row);
    } catch (e) {
      console.error(e); alert('Грешка в мрежата при изтриване.', e.message);
    } finally {
      setDeletingIds(prev => { const n = new Set(prev); n.delete(row.edition_id); return n; });
    }
  };

  return (
  <div className="card editions-panel">
    {/* Toolbar */}
    <div className="toolbar">
      <input
        className="input input-search"
        placeholder="Търси по производител, модел, година, издание…"
        value={q}
        onChange={(e) => { setQ(e.target.value); setPage(1); }}
      />

      <select
        className="select"
        title="Редове на страница"
        value={pageSize}
        onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
      >
        {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} / страница</option>)}
      </select>

      <button className="btn btn-ghost" type="button" onClick={() => { setQ(""); setPage(1); }}>
        Изчисти
      </button>
    </div>

    {!hideDefaultActions && (
      <div className="bar bar-muted">
        <div className="bar-info">
          Избрани за сравнение: <b>{selectedIds.size}</b>
        </div>
        <button
          className="btn"
          type="button"
          onClick={onClearSelected}
          disabled={selectedIds.size === 0}
        >
          Изчисти избраните
        </button>
      </div>
    )}

    {loading && <p className="text-muted">Зареждане на модификации…</p>}
    {err && <p className="text-danger">Грешка: {err}</p>}

    {!loading && !err && (
      <>
        <div className="table-wrap">
          <table className="table table-striped table-hover table-tight">
            <thead>
              <tr>
                <th>#</th>
                <th>Производител</th>
                <th>Модел</th>
                <th>Година</th>
                <th>Издание</th>
                <th>Действия</th>
              </tr>
            </thead>

            <tbody>
              {pageItems.map((row) => {
                const selected = isSelected(row.edition_id);
                const deleting = deletingIds.has(row.edition_id);
                return (
                  <tr key={row.edition_id} className={selected && !hideDefaultActions ? "is-selected" : undefined}>
                    <td>{row.edition_id}</td>
                    <td>{row.make}</td>
                    <td>{row.model}</td>
                    <td>{row.year}</td>
                    <td>{row.edition_name}</td>
                    <td>
                      <div className="btn-row">
                        {!hideDefaultActions && (
                          <>
                            <button className="btn" type="button" onClick={() => onEdit?.(row)} disabled={deleting}>
                              Редактиране
                            </button>

                            <button
                              className={"btn" + (selected ? " btn-active" : "")}
                              type="button"
                              onClick={() => onToggleSelect(row)}
                              aria-pressed={selected}
                              disabled={deleting}
                            >
                              {selected ? "Премахни от сравнение" : "Избери за сравнение"}
                            </button>

                            <button
                              className="btn"
                              onClick={() => openLatestSpecs(row)}
                              disabled={specBusy.has(row.edition_id)}
                            >
                              {specBusy.has(row.edition_id) ? "Отваряне…" : "Отвори PDF"}
                            </button>

                            <button
                              className="btn btn-strong"
                              onClick={() => ensureSpecs(row, { regenerate: true })}
                              disabled={specBusy.has(row.edition_id)}
                            >
                              {specBusy.has(row.edition_id) ? "Генериране…" : "Регенерирай PDF"}
                            </button>

                            <button
                              className="btn btn-danger"
                              type="button"
                              onClick={() => handleDelete(row)}
                              disabled={deleting}
                            >
                              {deleting ? "Изтриване" : "Изтрий"}
                            </button>
                          </>
                        )}

                        {showAddVehicle && (
                          <button
                            className="btn btn-strong"
                            type="button"
                            onClick={() => onAddVehicle?.(row)}
                            disabled={deleting}
                          >
                            Добави автомобил
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-muted center">
                    Няма намерени издания.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="panel-footer">
          <div className="results text-muted">
            Показване на {filtered.length === 0 ? 0 : start + 1}–{Math.min(start + pageSize, filtered.length)} от {filtered.length}
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
    <div className="pagination">
      <button className="page-btn" type="button" onClick={onPrev} disabled={page <= 1}>
        Предишна
      </button>

      {pages.map((p, idx) =>
        p === "…" ? (
          <span key={`e-${idx}`} className="ellipsis">…</span>
        ) : (
          <button
            key={p}
            type="button"
            className={"page-btn" + (p === page ? " is-active" : "")}
            onClick={() => onJump(p)}
          >
            {p}
          </button>
        )
      )}

      <button className="page-btn" type="button" onClick={onNext} disabled={page >= totalPages}>
        Следваща
      </button>
    </div>
  );
}

