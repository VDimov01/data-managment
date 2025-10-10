import { useEffect, useState } from "react";
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
  const {uuid} = useParams();
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
      console.log("Contracts:", j);
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
      else alert("PDF not available yet.");
    } catch (e) {
      alert(`PDF error: ${e.message}`);
    }
  }

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', margin:'8px 0 12px'}}>
        <h3 style={{margin:0}}>Договори</h3>
        <button className="btn" onClick={load} disabled={loading}>{loading ? "…" : "Обнови"}</button>
      </div>

      {error && <div className="cp-error">Грешка: {error}</div>}
      {(!loading && contracts.length === 0 && !error) && (
        <div className="cp-muted">Нямате договори за показване.</div>
      )}

      <div className="cp-list">
        {contracts.map(c => (
          <div key={c.contract_id} className="cp-card">
            <div className="cp-card-h">
              <div className="cp-title">
                <strong>№ {c.contract_number}</strong>
                <span className={`cp-badge cp-${c.status}`}>{labelStatus(c.status)}</span>
                <span className="cp-dot">•</span>
                <span className="cp-type">{labelType(c.type)}</span>
              </div>
              <div className="cp-sub">
                Издаден: {fmtDate(c.created_at)} {c.valid_until ? `• Валиден до: ${fmtDate(c.valid_until)}` : ""}
              </div>
            </div>

            <div className="cp-body">
              <div className="cp-vehicles">
                {c.vehicles && c.vehicles.length > 0 ? (
                  c.vehicles.map(v => (
                    <div key={v.vehicle_id} className="cp-veh">
                      <div className="cp-veh-line1">
                        {vehTitle(v)}
                      </div>
                      <div className="cp-veh-line2">
                        VIN: {v.vin || "—"} • Цвят: {v.exterior_color || "—"} / {v.interior_color || "—"}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="cp-muted">Няма добавени автомобили.</div>
                )}
              </div>

              <div className="cp-actions">
                <div className="cp-total">
                  Обща сума: <strong>{(c.total ?? "0.00")} {c.currency_code || "BGN"}</strong>
                </div>
                <button className="btn primary" onClick={() => openLatestPdf(c.uuid)}>
                  Преглед на PDF
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <style>{css}</style>
    </div>
  );
}

function labelStatus(s) {
  // show only issued-ish in this list, but still label nicely
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
  // tolerate make_name vs make, model_name vs model, year vs model_year, edition_name vs edition
  const make  = v.make || v.make_name;
  const model = v.model || v.model_name;
  const year  = v.model_year || v.year;
  const ed    = v.edition || v.edition_name;
  return [make, model, year ? `(${year})` : null, "—", ed || "Издание"].filter(Boolean).join(" ");
}

const css = `
.cp-error { color:#b91c1c; background:#fee2e2; border:1px solid #fecaca; padding:8px 10px; border-radius:8px; margin:8px 0; }
.cp-muted { color:#6b7280; }
.cp-list { display:flex; flex-direction:column; gap:12px; }
.cp-card { border:1px solid #e5e7eb; border-radius:12px; background:#fff; }
.cp-card-h { padding:12px 14px; border-bottom:1px solid #eee; }
.cp-title { display:flex; align-items:center; gap:8px; font-size:15px; }
.cp-sub { color:#6b7280; font-size:12px; margin-top:2px; }
.cp-body { padding:12px 14px; display:flex; flex-direction:column; gap:10px; }
.cp-vehicles { display:flex; flex-direction:column; gap:8px; }
.cp-veh-line1 { font-weight:600; }
.cp-veh-line2 { color:#6b7280; font-size:12px; }
.cp-actions { display:flex; align-items:center; justify-content:space-between; margin-top:6px; }
.cp-badge { padding:2px 6px; border-radius:999px; font-size:11px; border:1px solid #e5e7eb; }
.cp-issued { background:#e6f2ff; color:#1556b0; border-color:#bfdcff; }
.cp-viewed { background:#fef9c3; color:#854d0e; border-color:#fde68a; }
.cp-signed { background:#dcfce7; color:#166534; border-color:#bbf7d0; }
.cp-type { color:#334155; font-size:12px; }
.cp-dot { color:#9ca3af; }
.btn { padding:8px 12px; border-radius:8px; background:#f3f4f6; border:1px solid #d1d5db; cursor:pointer; }
.btn.primary { background:#1556b0; border-color:#1556b0; color:#fff; }
.btn.primary:hover { background:#10458c; }
`;
