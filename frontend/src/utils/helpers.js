// frontend/src/components/offers/helpers.js
export function offerKey(o) { return o?.offer_uuid || o?.uuid || null; }
export function niceDate(d) { if (!d) return "—"; return String(d).replace("T", " ").slice(0, 19); }

export function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

export function toCents(n) {
  return Math.round((Number(n) || 0) * 100);
}
export function fromCents(c) {
  return (c || 0) / 100;
}

export function grossFromNet(net, rate) {
  const r = Number(rate || 0) / 100;
  const netC = toCents(net);
  return fromCents(Math.round(netC * (1 + r)));
}

export function netFromGross(gross, rate) {
  const r = Number(rate || 0) / 100;
  if (r <= 0) return Number(gross) || 0;
  const grossC = toCents(gross);
  return fromCents(Math.round(grossC / (1 + r)));
}

// parseNumber unchanged if you already have it
export function parseNumber(v) {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}


export function buildUrl(base, path, params = {}) {
  const root = (base || "").replace(/\/+$/, "");
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k,v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") qs.append(k, v);
  });
  return `${root}${path}${qs.toString() ? `?${qs}` : ""}`;
}