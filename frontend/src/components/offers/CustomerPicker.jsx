// frontend/src/components/offers/CustomerPicker.jsx
import React, { useEffect, useState } from "react";
import { api } from "../../services/api";

function displayCustomer(c) {
  if (!c) return "—";
  if (c.display_name) return c.display_name;
  if (c.customer_type === "Company") return c.company_name || "Company";
  const parts = [c.first_name, c.middle_name, c.last_name].filter(Boolean);
  return parts.join(" ") || "Individual";
}

export default function CustomerPicker({ value, onChange }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => { setPage(1); }, [q]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const p = new URLSearchParams({ page: String(page), limit: String(limit) });
      const qq = q.trim(); if (qq) p.set("q", qq);
      const data = await api(`/customers?${p.toString()}`);
      const rows = data.customers || data.items || data.rows || [];
      setList(rows);
      const t = Number(data.total || rows.length || 0);
      setTotal(t);
      setTotalPages(Math.max(1, Number(data.totalPages || Math.ceil(t / limit))));
    } catch (e) {
      setErr(e.message || "Грешка при търсене");
      setList([]); setTotal(0); setTotalPages(1);
    } finally { setLoading(false); }
  }

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [q, page, limit]);

  return (
    <div className="ctr-split">
      <div className="ctr-split-left">
        <label className="label">Клиент</label>
        <div className="btn-row picker-bar">
          <input className="input" placeholder="Търси клиенти…"
                 value={q} onChange={(e) => setQ(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && load()} />
          <select className="select" value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>
            <option value={5}>5 / страница</option>
            <option value={10}>10 / страница</option>
            <option value={20}>20 / страница</option>
          </select>
          <button className="btn" onClick={load} disabled={loading}>{loading ? "…" : "Търси"}</button>
        </div>

        <div className="list mt-2">
          {err && <div className="text-danger">{err}</div>}
          {list.map((c) => {
            const isActive = value?.customer_id === c.customer_id;
            return (
              <button key={c.customer_id} type="button" className={"list-item" + (isActive ? " is-active" : "")} onClick={() => onChange(c)}>
                <div className="line-1">{displayCustomer(c)}</div>
                <div className="line-2">{c.email || c.phone || c.public_uuid || ""}</div>
              </button>
            );
          })}
          {!loading && list.length === 0 && !err && <div className="text-muted">Няма намерени клиенти.</div>}
        </div>

        <div className="pagination mt-2">
          <button className="page-btn" type="button" disabled={page <= 1 || loading} onClick={() => setPage(p => Math.max(1, p - 1))}>← Предишна</button>
          <span className="results">Стр. {page} от {totalPages} • Общо: {total}</span>
          <button className="page-btn" type="button" disabled={page >= totalPages || loading} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Следваща →</button>
        </div>
      </div>

      <div className="ctr-split-right">
        <label className="label">Избран</label>
        <div className="card"><div className="card-body">
          {value ? (
            <>
              <div><strong>{displayCustomer(value)}</strong></div>
              <div className="text-muted">{value.customer_type === "Company" ? "Фирма" : "Индивидуално лице"}</div>
            </>
          ) : <div className="text-muted">Избери клиент.</div>}
        </div></div>
      </div>
    </div>
  );
}
