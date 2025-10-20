import React, { useEffect, useState } from "react";
import { buildUrl } from "../../services/api";

// If you already have a helper for dates, import it; otherwise keep this local fallback
const BG_STATUS = {
  draft: "Чернова",
  issued: "Издадена",
  revised: "За редакция",
  accepted: "Приета",
  rejected: "Отхвърлена",
  expired: "Изтекла",
  withdrawn: "Оттеглена",
  converted: "Конвертирана",
};

function labelStatus(s) {
  return BG_STATUS[String(s || "").toLowerCase()] || s || "—";
}
function fmtDate(s) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s).slice(0, 16).replace("T", " ");
  return d.toLocaleDateString() + " " + d.toLocaleTimeString().slice(0,5);
}
function vehTitle(v) {
  const y = v.year ? ` (${v.year})` : "";
  return `${v.make_name || ""} ${v.model_name || ""}${y} — ${v.edition_name || "Edition"}`.trim();
}

// You used these patterns in Contracts: preview on desktop, download on mobile



/**
 * Props:
 *   publicCustomerUuid: string (customer.public_uuid)
 */
export default function CustomerOffersPage({apiBase, publicCustomerUuid }) {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;
  const [total, setTotal] = useState(0);

  async function load() {
    setLoading(true); setError("");
    try {
      const url = buildUrl(apiBase, `/api/public/customers/${publicCustomerUuid}/offers`);
      const r = await fetch(url);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setOffers(j.items || []);
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [publicCustomerUuid, page]);

  async function openLatestPdf(offerUuid) {
  const url = buildUrl(apiBase,`/api/public/customers/offers/${offerUuid}/pdf/latest`)
  const res = await fetch(url);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } else {
        const t = await res.text();
        if (t) msg = t;
      }
    } catch {}
    alert(msg);
    return;
  }
  const json = await res.json();
  if (json?.signedUrl) {
    window.open(json.signedUrl, "_blank", "noopener,noreferrer");
  } else {
    alert("Няма наличен PDF за тази оферта.");
  }
}

// Mobile-friendly: force a file download (blob fallback if CORS blocks 'download')
  async function downloadLatestPdf(offerUuid, filename = "Оферта.pdf") {
    try {
      const url = buildUrl(apiBase, `/api/public/customers/offers/${offerUuid}/pdf/latest`);
      const r = await fetch(url);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      if (!j.signedUrl) throw new Error("PDF не е наличен.");

      try {
        const pdfResp = await fetch(j.signedUrl, { mode: "cors" });
        if (!pdfResp.ok) throw new Error(`HTTP ${pdfResp.status}`);
        const blob = await pdfResp.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
      } catch {
        // Fallback: navigate to the signed URL (mobile browsers will usually offer to open in a viewer)
        window.location.href = j.signedUrl;
      }
    } catch (e) {
      alert(`Проблем при изтегляне на PDF: ${e.message}`);
    }
  }

   return (
    <div className="cont-page">
      <div className="cont-page-toolbar">
        <h3>Оферти</h3>
        <button className="cont-page-btn" onClick={load} disabled={loading}>
          {loading ? "…" : "Обнови"}
        </button>
      </div>

      {error && <div className="cont-page-error">Грешка: {error}</div>}
      {!loading && offers.length === 0 && !error && (
        <div className="cont-page-muted">Нямате оферти за показване.</div>
      )}

      <div className="cont-page-list">
        {offers.map(o => (
          <div key={o.offer_uuid} className="cont-page-card">
            <div className="cont-page-card-h">
              <div className="cont-page-title">
                <strong>№ {o.offer_number || "—"}</strong>
                <span className={`cont-page-badge cont-page-${String(o.status).toLowerCase()}`}>
                  {labelStatus(o.status)}
                </span>
                <span className="cont-page-dot">•</span>
                <span className="cont-page-type">Оферта</span>
              </div>
              <div className="cont-page-sub">
                Създадена: {fmtDate(o.created_at)}
                {o.valid_until ? ` • Валидна до: ${fmtDate(o.valid_until)}` : ""}
              </div>
            </div>

            <div className="cont-page-body">
              <div className="cont-page-vehicles">
                {o.vehicles && o.vehicles.length > 0 ? (
                  o.vehicles.map(v => (
                    <div key={`${o.offer_uuid}-${v.vehicle_id}-${v.vin || ""}`} className="cont-page-veh">
                      <div className="cont-page-veh-line1">{vehTitle(v)}</div>
                      <div className="cont-page-veh-line2">
                        VIN: {v.vin || "—"} • Цвят: {v.exterior_color || "—"} / {v.interior_color || "—"}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="cont-page-muted">Няма добавени автомобили.</div>
                )}
              </div>

              <div className="cont-page-actions">
                <div className="cont-page-total">
                  Обща сума: <strong>{Number(o.total_amount || 0).toFixed(2)} {o.currency || "BGN"}</strong>
                </div>

                <button
                  className="cont-page-btn primary cont-page-desktopOnly"
                  onClick={() => openLatestPdf(o.offer_public_uuid || o.public_uuid)}
                  disabled={!o.has_pdf}
                  title={o.has_pdf ? "Преглед на PDF" : "Няма наличен PDF"}
                >
                  Преглед на PDF
                </button>

                <button
                  className="cont-page-btn primary cont-page-mobileOnly"
                  onClick={() => downloadLatestPdf(o.offer_public_uuid || o.public_uuid)}
                  disabled={!o.has_pdf}
                  title={o.has_pdf ? "Преглед на PDF" : "Няма наличен PDF"}
                >
                  Изтегли PDF
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
