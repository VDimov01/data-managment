import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

function buildUrl(base, path, params = {}) {
  const root = (base || "").replace(/\/+$/, "");
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k,v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") qs.append(k, v);
  });
  return `${root}${path}${qs.toString() ? `?${qs}` : ""}`;
}

export default function CustomerContractsPage({ apiBase = "http://localhost:5000" }) {
  const { uuid } = useParams();
  const [loading, setLoading] = useState(false);
  const [contracts, setContracts] = useState([]);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const url = buildUrl(apiBase, `/api/public/customers/${uuid}/contracts`);
      const r = await fetch(url);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setContracts(j.items || []);
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [uuid]);

  async function openLatestPdf(contractUuid) {
    try {
      const url = buildUrl(apiBase, `/api/public/customers/contracts/${contractUuid}/pdf/latest`);
      const r = await fetch(url);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      if (j.signedUrl) window.open(j.signedUrl, "_blank", "noopener,noreferrer");
      else alert("PDF не е наличен.");
    } catch (e) {
      alert(`Проблем при отваряне на PDF: ${e.message}`);
    }
  }

  // Mobile-friendly: force a file download (blob fallback if CORS blocks 'download')
  async function downloadLatestPdf(contractUuid, filename = "contract.pdf") {
    try {
      const url = buildUrl(apiBase, `/api/public/customers/contracts/${contractUuid}/pdf/latest`);
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
        <h3>Договори</h3>
        <button className="cont-page-btn" onClick={load} disabled={loading}>
          {loading ? "…" : "Обнови"}
        </button>
      </div>

      {error && <div className="cont-page-error">Грешка: {error}</div>}
      {!loading && contracts.length === 0 && !error && (
        <div className="cont-page-muted">Нямате договори за показване.</div>
      )}

      <div className="cont-page-list">
        {contracts.map(c => (
          <div key={c.contract_id} className="cont-page-card">
            <div className="cont-page-card-h">
              <div className="cont-page-title">
                <strong>№ {c.contract_number}</strong>
                <span className={`cont-page-badge cont-page-${String(c.status).toLowerCase()}`}>
                  {labelStatus(c.status)}
                </span>
                <span className="cont-page-dot">•</span>
                <span className="cont-page-type">{labelType(c.type)}</span>
              </div>
              <div className="cont-page-sub">
                Издаден: {fmtDate(c.created_at)} {c.valid_until ? `• Валиден до: ${fmtDate(c.valid_until)}` : ""}
              </div>
            </div>

            <div className="cont-page-body">
              <div className="cont-page-vehicles">
                {c.vehicles && c.vehicles.length > 0 ? (
                  c.vehicles.map(v => (
                    <div key={v.vehicle_id} className="cont-page-veh">
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
                  Обща сума: <strong>{(c.total ?? "0.00")} {c.currency_code || "BGN"}</strong>
                </div>

                {/* Desktop: open in new tab */}
                <button
                  className="cont-page-btn primary cont-page-desktopOnly"
                  onClick={() => openLatestPdf(c.uuid)}
                >
                  Преглед на PDF
                </button>

                {/* Mobile: download (blob fallback) */}
                <button
                  className="cont-page-btn primary cont-page-mobileOnly"
                  onClick={() => downloadLatestPdf(c.uuid, `Договор_${c.contract_number || c.uuid}.pdf`)}
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

function labelStatus(s) {
  const t = String(s || "").toLowerCase();
  if (t === "issued") return "Издаден";
  if (t === "viewed") return "Прегледан";
  if (t === "signed") return "Подписан";
  return s || "";
}
function labelType(t) {
  return String(t || "").toUpperCase() === "ADVANCE" ? "Авансов" : "Стандартен";
}
function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return String(d);
  return dt.toLocaleDateString("bg-BG");
}
function vehTitle(v) {
  const make  = v.make || v.make_name;
  const model = v.model || v.model_name;
  const year  = v.model_year || v.year;
  const ed    = v.edition || v.edition_name;
  return [make, model, year ? `(${year})` : null, "—", ed || "Издание"].filter(Boolean).join(" ");
}
