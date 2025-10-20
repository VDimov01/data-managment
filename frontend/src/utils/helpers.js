// frontend/src/components/offers/helpers.js
export function offerKey(o) { return o?.offer_uuid || o?.uuid || null; }
export function niceDate(d) { if (!d) return "—"; return String(d).replace("T", " ").slice(0, 19); }
export function parseNumber(v, def = 0) {
  if (v == null || v === "") return def;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : def;
}
export function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
export function netFromGross(g, rate) {
  const r = Number(rate || 0) / 100;
  return r > -1 ? round2(Number(g || 0) / (1 + r)) : Number(g || 0);
}
export function grossFromNet(n, rate) {
  const r = Number(rate || 0) / 100;
  return round2(Number(n || 0) * (1 + r));
}

export function buildUrl(base, path, params = {}) {
  const root = (base || "").replace(/\/+$/, "");
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k,v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") qs.append(k, v);
  });
  return `${root}${path}${qs.toString() ? `?${qs}` : ""}`;
}