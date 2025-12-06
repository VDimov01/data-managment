import { useState, useEffect, useMemo } from "react";
import { fetchVehicles, fetchShops } from "../../services/api";
import AvailableEditions from "../editions/AvailableEditions";
import Modal from "../Modal";
import VehicleImagesModal from "./VehicleImagesModal";
import VehicleDocumentsModal from "./VehicleDocumentsModal";
import VehicleCreateForm from "./VehicleCreateForm";
import VehicleQRCell from './VehicleQRCell';
import PrintLabelsButton from "./PrintLabelsButton";
import { formatDateDMYDateOnly } from "../../utils/dates.js";
import { api, API_BASE } from "../../services/api";

const STATUSES = ['InTransit', 'Available', 'Reserved', 'Sold', 'Service', 'Demo'];

const status_to_bg = {
  InTransit: "В процес на доставка",
  Available: "Наличен",
  Reserved: "Резервиран",
  Sold: "Продаден",
  Service: "Сервиз",
  Demo: "Демо"
}

export default function StorageSection() {
  const apiBase = API_BASE;

  const [open, setOpen] = useState(false);
  const [editionForVehicle, setEditionForVehicle] = useState(null);
  const [openEdit, setOpenEdit] = useState(false);
  const [vehicleForEdit, setVehicleForEdit] = useState(null);

  const [vehicleEntries, setVehicleEntries] = useState([]);
  const [shops, setShops] = useState([]);
  const [deletingIds, setDeletingIds] = useState(new Set()); // NEW
  const [shopName, setShopName] = useState(""); // id -> name map

  const [openImages, setOpenImages] = useState(false);
  const [vehicleForImages, setVehicleForImages] = useState(null);

  const [openDocs, setOpenDocs] = useState(false);
  const [vehicleForDocs, setVehicleForDocs] = useState(null);


  // --- Filters ---
  const [qModel, setQModel] = useState("");
  const [qColor, setQColor] = useState("");
  const [qCity, setQCity] = useState("");
  const [shopId, setShopId] = useState("");
  const [status, setStatus] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");

  // --- Pagination ---
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchVehiclesEntries = async () => {
    try {
      const vehicleData = await fetchVehicles();
      setVehicleEntries(vehicleData || []);
      console.log("Fetched vehicles:", vehicleData);
    } catch (err) {
      console.error("Error fetching vehicles:", err);
    }
  };

  const fetchAndSetShops = async () => {
    try {
      const shopsData = await fetchShops();
      setShops(shopsData || []);
    } catch (err) {
      console.error("Error fetching shops:", err);
    }
  }
  useEffect(() => { fetchVehiclesEntries(); fetchAndSetShops(); }, []);

  const updateRow = (id, patch) => {
    setVehicleEntries(prev => prev.map(r => (r.vehicle_id === id ? { ...r, ...patch } : r)));
  };

  // Debounce search
  const [qModelDeb, setQModelDeb] = useState("");
  const [qColorDeb, setQColorDeb] = useState("");
  const [qCityDeb, setQCityDeb] = useState("");
  useEffect(() => { const t = setTimeout(() => setQModelDeb(qModel.trim().toLowerCase()), 250); return () => clearTimeout(t); }, [qModel]);
  useEffect(() => { const t = setTimeout(() => setQColorDeb(qColor.trim().toLowerCase()), 250); return () => clearTimeout(t); }, [qColor]);
  useEffect(() => { const t = setTimeout(() => setQCityDeb(qCity.trim().toLowerCase()), 250); return () => clearTimeout(t); }, [qCity]);
  useEffect(() => { setPage(1); }, [qModelDeb, qColorDeb, qCityDeb, status, shopId, priceMin, priceMax, pageSize]);

  // Filter
  const filtered = useMemo(() => {
    const min = priceMin === "" ? null : Number(priceMin);
    const max = priceMax === "" ? null : Number(priceMax);
    return (vehicleEntries || []).filter((e) => {
      const make = (e.maker || e.make || "").toLowerCase();
      const model = (e.model || "").toLowerCase();
      const edition = (e.edition || e.edition_name || "").toLowerCase();
      const city = (e.shop_city || e.city || "").toLowerCase();
      const shop = (e.shop_id || "").toString();
      const ext = (e.exterior_color || "").toLowerCase();
      const intl = (e.interior_color || "").toLowerCase();
      const price = e.asking_price == null ? null : Number(e.asking_price);
      const st = (e.status || "");

      if (qModelDeb) {
        if (!`${make} ${model} ${edition}`.includes(qModelDeb)) return false;
      }
      if (qColorDeb) {
        if (!ext.includes(qColorDeb) && !intl.includes(qColorDeb)) return false;
      }
      if (qCityDeb) {
        if (!city.includes(qCityDeb)) return false;
      }
      if (shopId) {
        if (shop !== shopId) return false;
        setShopName(shops.filter(s => s.shop_id.toString() === shopId)[0]?.name || "");
      }
      if (status && st !== status) return false;
      if (min != null && Number.isFinite(min)) {
        if (!(price != null && Number.isFinite(price) && price >= min)) return false;
      }
      if (max != null && Number.isFinite(max)) {
        if (!(price != null && Number.isFinite(price) && price <= max)) return false;
      }
      return true;
    });
  }, [vehicleEntries, qModelDeb, qColorDeb, qCityDeb, shopId, status, priceMin, priceMax]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const start = (page - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);
  const fmtPrice = (v) => (v == null ? "Няма" : `${Number(v).toFixed(2)} лв.`);

  // NEW: delete handler
  const handleDeleteVehicle = async (row) => {
    const vid = row.vehicle_id || row.id;
    if (!vid) return;
    const title = `${row.maker || row.make} ${row.model} ${row.edition || row.edition_name || ""} (${row.vin})`;
    if (!window.confirm(`Изтриване на автомобил:\n\n${title}\n\nТова действие е необратимо.`)) return;

    setDeletingIds(prev => new Set(prev).add(vid));
    try {
      const res = await api(`/vehicles/${vid}`, { method: 'DELETE' });
      if (res.status === 204) {
        // Remove from local state (no refetch needed)
        setVehicleEntries(prev => prev.filter(v => (v.vehicle_id || v.id) !== vid));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || 'Неуспешно изтриване.');
      }
    } catch (e) {
      console.error(e);
      alert('Мрежова грешка при изтриване.');
    } finally {
      setDeletingIds(prev => { const n = new Set(prev); n.delete(vid); return n; });
    }
  };

  return (
    <div className="storage-section">
      <h2 className="section-title">Менежиране на наличност</h2>

      <div className="card">
        <h3 className="section-subtitle">Автомобили</h3>

        <AvailableEditions
          apiBase={apiBase}
          showAddVehicle={true}
          hideDefaultActions={true}
          onAddVehicle={(edition) => { setEditionForVehicle(edition); setOpen(true); }}
        />

        {/* Create modal */}
        <Modal
          open={open}
          title="Създаване на автомобил"
          onClose={() => { setOpen(false); setEditionForVehicle(null); }}
        >
          {editionForVehicle && (
            <VehicleCreateForm
              apiBase={apiBase}
              edition={editionForVehicle}
              onCreated={() => { fetchVehiclesEntries(); setOpen(false); setEditionForVehicle(null); }}
              onClose={() => { setOpen(false); setEditionForVehicle(null); }}
            />
          )}
        </Modal>

        {/* Edit modal */}
        <Modal
          open={openEdit}
          title="Редактиране на автомобил"
          onClose={() => { setOpenEdit(false); setVehicleForEdit(null); }}
        >
          {vehicleForEdit && (
            <VehicleCreateForm
              apiBase={apiBase}
              vehicle={vehicleForEdit}
              mode="edit"
              onUpdated={() => fetchVehiclesEntries()}
              onClose={() => { setOpenEdit(false); setVehicleForEdit(null); }}
            />
          )}
        </Modal>
      </div>

      {/* Filters */}
      <h2 className="section-title">Текуща наличност</h2>
      <div className="card">
        <div className="toolbar filters-grid" style={{ marginBottom: 25 }}>
          <input
            className="input"
            placeholder="Марка / модел / версия…"
            value={qModel}
            onChange={(e) => setQModel(e.target.value)}
          />
          <div className="btn-row">
            <input
              className="input"
              placeholder="Цвят (ext/int)…"
              value={qColor}
              onChange={(e) => setQColor(e.target.value)}
            />
            <select
              className="select"
              value={shopId}
              onChange={(e) => setShopId(e.target.value)}
            >
              <option value="">Магазин (всички)</option>
              {shops.map(s => <option key={s.shop_id} value={s.shop_id}>{s.name}</option>)}
            </select>
            <select
              className="select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Статус (всички)</option>
              {STATUSES.map(s => <option key={s} value={s}>{status_to_bg[s]}</option>)}
            </select>
            <input
              className="input"
              type="number"
              placeholder="Мин. цена"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
            />
            <input
              className="input"
              type="number"
              placeholder="Макс. цена"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
            />
            <select
              className="select"
              title="Редове на страница"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}/стр.</option>)}
            </select>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                setQModel(""); setQColor(""); setQCity?.("");
                setStatus(""); setPriceMin(""); setPriceMax("");
                setPage(1);
              }}
            >
              Изчисти
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="table-wrap">
          <table className="table table-striped table-hover table-tight">
            <thead>
              <tr>
                <th>Автомобил</th>
                <th>VIN</th>
                <th>Цвят</th>
                <th>Цена</th>
                <th>Магазин</th>
                <th>Град</th>
                <th>Статус</th>
                <th>Информация за статус</th>
                <th>Действие</th>
                <th>QR Код</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={10} className="center text-muted">
                    Няма автомобили по зададените филтри.
                  </td>
                </tr>
              )}

              {pageItems.map((entry) => {
                const vid = entry.vehicle_id || entry.id;
                const isDel = deletingIds.has(vid);
                return (
                  <tr key={vid}>
                    <td className="fw-600">
                      {(entry.maker || entry.make)} {entry.model} {entry.model_year || entry.year} {entry.edition || entry.edition_name || ""}
                    </td>
                    <td className="fw-600">{entry.vin}</td>
                    <td>
                      {(entry.exterior_color || "")}
                      {entry.interior_color ? ` + ${entry.interior_color}` : ""}
                    </td>
                    <td>{fmtPrice(entry.asking_price)}</td>
                    <td>{entry.shop_name}</td>
                    <td>{entry.shop_city || entry.city}</td>
                    <td className="fw-600">{status_to_bg[entry.status]}</td>
                    <td>
                      <div className="stack-xs">
                        {entry.status === "InTransit" && entry.expected_arrival_earliest && (
                          <span>Най-рано: {formatDateDMYDateOnly(entry.expected_arrival_earliest)}</span>
                        )}
                        {entry.status === "InTransit" && entry.expected_arrival_latest && (
                          <span style={{ display: "block" }}>Най-късно: {formatDateDMYDateOnly(entry.expected_arrival_latest)}</span>
                        )}
                        {entry.status === "Reserved" && entry.reserved_at && (
                          <span>Резервирано на: {formatDateDMYDateOnly(entry.reserved_at)}</span>
                        )}
                        {entry.status === "Reserved" && entry.reserved_until && (
                          <span>Резервирано до: {formatDateDMYDateOnly(entry.reserved_until)}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="btn-row">
                        <button
                          className="btn"
                          type="button"
                          onClick={() => { setVehicleForEdit(entry); setOpenEdit(true); }}
                          disabled={isDel}
                        >
                          Редактирай
                        </button>

                        <button
                          className="btn btn-danger"
                          type="button"
                          onClick={() => handleDeleteVehicle(entry)}
                          disabled={isDel}
                        >
                          {isDel ? "Изтриване…" : "Изтрий"}
                        </button>

                        <button
                          className="btn"
                          onClick={() => { setVehicleForImages(entry); setOpenImages(true); }}
                        >
                          Снимки
                        </button>
                        <button
                          className="btn"
                          title="Документи"
                          onClick={() => { setVehicleForDocs(entry); setOpenDocs(true); }}
                        >
                          📄
                        </button>

                      </div>
                    </td>
                    <td>
                      <VehicleQRCell
                        row={entry}
                        apiBase={apiBase}
                        onRowUpdate={(newRow) => updateRow(entry.vehicle_id, { qr_object_key: newRow.qr_object_key })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <PrintLabelsButton
          apiBase={apiBase}
          shopId={shopId}
          shopName={shopId ? shopName : ""}
          status="Available"
        />

        {/* Pager */}
        <div className="panel-footer">
          <div className="results text-muted">
            Показани {filtered.length === 0 ? 0 : start + 1}–{Math.min(start + pageSize, filtered.length)} от {filtered.length}
          </div>
          <Pager
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage(p => Math.max(1, p - 1))}
            onNext={() => setPage(p => Math.min(totalPages, p + 1))}
            onJump={(n) => setPage(n)}
          />
        </div>
      </div>

      {vehicleForImages && (
        <VehicleImagesModal
          apiBase={apiBase}
          vehicle={vehicleForImages}
          open={openImages}
          onClose={() => { setOpenImages(false); setVehicleForImages(null); }}
        />
      )}

      {vehicleForDocs && (
        <VehicleDocumentsModal
          vehicle={vehicleForDocs}
          open={openDocs}
          onClose={() => { setOpenDocs(false); setVehicleForDocs(null); }}
        />
      )}
    </div>
  );

}

function Pager({ page, totalPages, onPrev, onNext, onJump }) {
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
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <button className="btn" type="button" onClick={onPrev} disabled={page <= 1}>Предишна</button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} style={{ padding: '2px 6px', color: '#777' }}>…</span>
        ) : (
          <button
            key={p}
            className="btn"
            type="button"
            onClick={() => onJump(p)}
          >
            {p}
          </button>
        )
      )}
      <button className="btn" type="button" onClick={onNext} disabled={page >= totalPages}>Следваща</button>
    </div>
  );
}
