// frontend/src/components/offers/VehiclePicker.jsx
import React, { useState } from "react";
import { api } from "../../services/api";

export default function VehiclePicker({ onPick }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const paged = rows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ available: "1" });
      const qq = q.trim(); if (qq) params.set("q", qq);
      const res = await api(`/vehicles?${params.toString()}`);
      const list = Array.isArray(res) ? res : (res.vehicles || res.items || res.rows || []);
      setRows(list); setPage(1);
    } catch (e) {
      alert(`Търсене на автомобили неуспешно: ${e.message}`);
      setRows([]); setPage(1);
    } finally { setLoading(false); }
  }

  return (
    <div>
      <label className="label">Добави автомобил към оферта</label>
      <div className="btn-row picker-bar">
        <input className="input" placeholder="Търси автомобили (VIN, модел, издание)…"
               value={q} onChange={(e) => setQ(e.target.value)}
               onKeyDown={(e) => e.key === "Enter" && load()} />
        <select className="select" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
          <option value={5}>5 / стр.</option><option value={10}>10 / стр.</option><option value={20}>20 / стр.</option>
        </select>
        <button className="btn" onClick={load} disabled={loading}>{loading ? "…" : "Търси"}</button>
      </div>

      {paged.length > 0 && (
        <div className="list mt-2">
          {paged.map((v) => (
            <button key={v.vehicle_id} className="list-item" onClick={() => onPick(v)}>
              <div className="line-1">
                {(v.make_name || v.make) || ""} {(v.model_name || v.model) || ""}{" "}
                {v.year ? `(${v.year})` : (v.model_year ? `(${v.model_year})` : "")} — {(v.edition_name || v.edition || "Edition")}
              </div>
              <div className="line-2">
                VIN: {v.vin || "—"} • Цвят: {(v.exterior_color || v.exterior_color_name || "—")} / {(v.interior_color || v.interior_color_name || "—")} • Град: {v.shop_city || "—"} • Км: {(v.mileage_km ?? v.mileage ?? "—")} km • Цена (с ДДС): {v.asking_price != null ? String(v.asking_price) : "—"}
              </div>
            </button>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="pagination mt-2">
          <button className="page-btn" type="button" disabled={page <= 1 || loading} onClick={() => setPage(p => Math.max(1, p - 1))}>← Предишна</button>
          <span className="results">Стр. {page} от {totalPages} • Общо: {rows.length}</span>
          <button className="page-btn" type="button" disabled={page >= totalPages || loading} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Следваща</button>
        </div>
      )}

      {!loading && rows.length === 0 && <div className="text-muted mt-2">Няма намерени автомобили.</div>}
    </div>
  );
}
