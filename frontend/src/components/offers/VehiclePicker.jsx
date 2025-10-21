// frontend/src/components/offers/VehiclePicker.jsx
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";

function norm(s) {
  return (s ?? "").toString().toLowerCase().trim();
}

export default function VehiclePicker({ onPick }) {
  // inventory (fetched once, refreshable)
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(false);

  // single search box + debounce
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");

  // local pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  async function loadAll() {
    setLoading(true);
    try {
      const res = await api(`/vehicles?available=1`);
      const rows = Array.isArray(res) ? res : (res.vehicles || res.items || res.rows || []);
      const filteredRows = rows.filter((r) => r.status === 'Available');
      setAll(filteredRows);
      setPage(1);
    } catch (e) {
      alert(`Търсене на автомобили неуспешно: ${e.message}`);
      setAll([]);
      setPage(1);
    } finally {
      setLoading(false);
    }
  }

  // fetch once on mount
  useEffect(() => { loadAll(); }, []);

  // debounce the query a bit to keep UI snappy on large lists
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 180);
    return () => clearTimeout(t);
  }, [q]);

  // filter by tokens across common fields (make/model/edition/year/VIN/city/colors)
  const filtered = useMemo(() => {
    const needle = norm(qDebounced);
    if (!needle) return all;

    const tokens = needle.split(/\s+/).filter(Boolean);
    if (!tokens.length) return all;

    return all.filter((v) => {
      const make  = norm(v.make_name || v.make);
      const model = norm(v.model_name || v.model);
      const edn   = norm(v.edition_name || v.edition);
      const year  = norm(v.year ?? v.model_year);
      const vin   = norm(v.vin);
      const city  = norm(v.shop_city);
      const ext   = norm(v.exterior_color || v.exterior_color_name);
      const intc  = norm(v.interior_color || v.interior_color_name);

      const hay = `${make} ${model} ${edn} ${year} ${vin} ${city} ${ext} ${intc}`;
      return tokens.every(tk => hay.includes(tk));
    });
  }, [all, qDebounced]);

  // reset to page 1 when query changes
  useEffect(() => { setPage(1); }, [qDebounced]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const start = (page - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  return (
    <div>
      <label className="label">Добави автомобил към оферта</label>

      <div className="btn-row picker-bar" style={{ flexWrap: "wrap", gap: 8 }}>
        <input
          className="input"
          placeholder="Търси по марка, модел, издание, VIN, град или цвят…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 320, flex: "1 1 320px" }}
        />

        <select
          className="select"
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
          title="брой на страница"
        >
          <option value={5}>5 / стр.</option>
          <option value={10}>10 / стр.</option>
          <option value={20}>20 / стр.</option>
        </select>

        <button className="btn" onClick={loadAll} disabled={loading}>
          {loading ? "…" : "Презареди"}
        </button>
      </div>

      {paged.length > 0 && (
        <div className="list mt-2">
          {paged.map((v) => (
            <button key={v.vehicle_id} className="list-item" onClick={() => onPick(v)}>
              <div className="line-1">
                {(v.make_name || v.make) || ""} {(v.model_name || v.model) || ""}{" "}
                {v.year ? `(${v.year})` : (v.model_year ? `(${v.model_year})` : "")}
                {" — "}{(v.edition_name || v.edition || "Edition")}
              </div>
              <div className="line-2">
                VIN: {v.vin || "—"} • Цвят: {(v.exterior_color || v.exterior_color_name || "—")} / {(v.interior_color || v.interior_color_name || "—")}
                {" • "}Град: {v.shop_city || "—"} • Км: {(v.mileage_km ?? v.mileage ?? "—")} km
                {" • "}Цена (с ДДС): {v.asking_price != null ? String(v.asking_price) : "—"}
              </div>
            </button>
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="pagination mt-2">
          <button
            className="page-btn"
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            ← Предишна
          </button>
          <span className="results">Стр. {page} от {totalPages} • Общо: {filtered.length}</span>
          <button
            className="page-btn"
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          >
            Следваща
          </button>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-muted mt-2">Няма намерени автомобили.</div>
      )}
    </div>
  );
}
