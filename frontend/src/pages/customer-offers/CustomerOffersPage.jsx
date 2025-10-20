import React, { useEffect, useState } from "react";

// If you already have a helper for dates, import it; otherwise keep this local fallback
function fmtDate(v) {
  if (!v) return "—";
  // Accepts "YYYY-MM-DD" or ISO; shows "YYYY-MM-DD"
  const s = String(v);
  return s.slice(0, 10);
}

function buildUrl(base, path, params = {}) {
  const root = (base || "").replace(/\/+$/, "");
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k,v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") qs.append(k, v);
  });
  return `${root}${path}${qs.toString() ? `?${qs}` : ""}`;
}

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
  const k = String(s || "").toLowerCase();
  return BG_STATUS[k] || s || "—";
}

// You used these patterns in Contracts: preview on desktop, download on mobile



/**
 * Props:
 *   publicCustomerUuid: string (customer.public_uuid)
 */
export default function CustomerOffersPage({apiBase, publicCustomerUuid }) {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setErr] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const url = buildUrl(apiBase, `/api/public/customers/${publicCustomerUuid}/offers`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rows = Array.isArray(data) ? data : (data.items || []);
      setOffers(rows);
    } catch (e) {
      setErr(e.message || "Грешка при зареждане");
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (publicCustomerUuid) load(); }, [publicCustomerUuid]);

  async function openLatestPdfInNewTab(offerUuid) {
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

async function downloadLatestPdf(offerUuid, filename = "Оферта.pdf") {
  const buildedUrl = buildUrl(apiBase,`/api/public/customers/offers/${offerUuid}/pdf/latest`)
  const res = await fetch(buildedUrl);
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
  const { signedUrl } = await res.json();
  if (!signedUrl) return alert("Няма наличен PDF за тази оферта.");

  // download blob (mobile-friendly)
  const pdfRes = await fetch(signedUrl);
  const blob = await pdfRes.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
              </div>
              <div className="cont-page-sub">
                Създадена: {fmtDate(o.created_at)}
                {o.valid_until ? <> • Валидна до: {fmtDate(o.valid_until)}</> : null}
              </div>
            </div>

            <div className="cont-page-body">
              {/* You can add an items preview here if you expose it in the public list.
                 For now, keep it consistent with Contracts' “total” area. */}
              <div className="cont-page-actions">
                <div className="cont-page-total">
                  Обща сума: <strong>{(o.total_amount ?? 0).toFixed(2)} {o.currency || "BGN"}</strong>
                </div>

                {/* Desktop: open in new tab */}
                <button
                  className="cont-page-btn primary cont-page-desktopOnly"
                  disabled={!o.has_pdf}
                  title={o.has_pdf ? "Преглед на PDF" : "Няма наличен PDF"}
                  onClick={() => openLatestPdfInNewTab(o.offer_uuid)}
                >
                  Преглед на PDF
                </button>

                {/* Mobile: download (blob fallback) */}
                <button
                  className="cont-page-btn primary cont-page-mobileOnly"
                  disabled={!o.has_pdf}
                  title={o.has_pdf ? "Изтегли PDF" : "Няма наличен PDF"}
                  onClick={() => downloadLatestPdf(o.offer_uuid, `Оферта_${o.offer_number || o.offer_uuid}.pdf`)}
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
