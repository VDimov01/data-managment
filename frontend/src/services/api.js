export const fetchVehicles = async () => {
  return api("/vehicles");
};

export const fetchEditions = async () => {
  const res = await api("/editions");
  if (!res.ok) throw new Error("Failed to fetch editions");
  return res.json();
}

export const fetchColors = async () => {
  return api("/colors");
};

export const fetchShopsNew = async () => {
  const res = await fetch("http://localhost:5000/api/shops/new", { credentials: 'include' });
  if (!res.ok) throw new Error("Failed to fetch new shops");
  return res.json();
};

export const fetchShops = async () => {
  return api("/shops/new");
}

export async function searchContracts(query = "", page = 1, limit = 10) {
  const params = new URLSearchParams({
    query: query || "",
    page: String(page),
    limit: String(limit),
  });

  return await api(`/contracts/search?${params.toString()}`);
}

export const fetchImages = async (carId, carMaker, carModel) => {
    return api(`/car-images/${carId}^${carMaker}^${carModel}`);
  };

export async function generateVehicleQr(apiBase, vehicleId) {
  return api(`/qr/vehicles/${vehicleId}`, { method: 'POST' });
}

// --- Vehicle images (private) ---
export async function listVehicleImages(apiBase, vehicleId) {
  return api(`/vehicleImages/${vehicleId}/images`);
}

export async function uploadVehicleImages(apiBase, vehicleId, files) {
  const fd = new FormData();
  for (const f of files) fd.append('images', f);
  return api(`/vehicleImages/${vehicleId}/images`, {
    method: 'POST',
    body: fd
  });
}

export async function setPrimaryVehicleImage(apiBase, vehicleId, imageId) {
  return api(`/vehicleImages/${vehicleId}/images/${imageId}/primary`, { method: 'POST' });
}

export async function updateVehicleImageMeta(apiBase, vehicleId, imageId, { caption, sort_order }) {
  return api(`/vehicleImages/${vehicleId}/images/${imageId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caption, sort_order })
  });
}

export async function deleteVehicleImage(apiBase, vehicleId, imageId) {
  return api(`/vehicleImages/${vehicleId}/images/${imageId}`, { method: 'DELETE' });
}

// Public vehicle by UUID
export async function getPublicVehicle(apiBase, uuid) {
  const r = await api(`/public/vehicles/${uuid}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Public vehicle images (private bucket, proxied by backend)
export async function getPublicVehicleImages(apiBase, uuid) {
  const r = await api(`public/vehicles/${uuid}/images`);
  if (!r.ok) throw new Error(await r.text());
  return r.json(); // [{ vehicle_image_id, stream_url }]
}

// Edition attributes (your existing resolver)
export async function getEditionAttributes(apiBase, editionId, lang = 'bg') {
  const r = await api(`/editions/${editionId}/specs?lang=${lang}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json(); // shape depends on your resolver
}

export async function listEditionImages(apiBase, editionId, maker, model, year) {
  const safe = (s) => encodeURIComponent(String(s ?? "").trim().replace(/-/g, " ").replace(/\s+/g, " "));
  const r = await api(`/car-images/${editionId}-${safe(maker)}-${safe(model)}-${safe(year)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function uploadEditionImages(apiBase, editionId, maker, model, year, files, part='unsorted') {
  const safe = (s) => encodeURIComponent(String(s ?? "").trim().replace(/-/g, " ").replace(/\s+/g, " "));
  const fd = new FormData();
  for (const f of files) fd.append("images", f);
  const r = await api(`/car-images/${editionId}-${safe(maker)}-${safe(model)}-${safe(year)}-${part}`, {
    method: "POST", body: fd
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function patchEditionImage(apiBase, id, patch) {
  const r = await api(`/car-images/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Patch failed');
  return data; // { ok: true }
}


export async function deleteEditionImage(apiBase, imageId) {
  const r = await api(`/car-images/${imageId}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export function buildUrl(base, path, params = {}) {
  const b = (base || '').replace(/\/+$/, '');
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== '') qs.append(k, v);
  });
  return `${b}${path}${qs.toString() ? `?${qs.toString()}` : ''}`;
}

const fallbackApiBase = (() => {
  // Dev default if env not set
  if (import.meta.env.DEV) return 'http://localhost:5000';
  // In prod, assume same-origin unless overridden
  return window.location.origin;
})();

export const API_BASE =
  (import.meta.env.VITE_API_BASE && import.meta.env.VITE_API_BASE.trim()) ||
  fallbackApiBase;

export async function api(path, { method = 'GET', body, headers } = {}) {
  const r = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers: body
      ? { 'Content-Type': 'application/json', ...(headers || {}) }
      : headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include', // <-- send the auth cookie
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data?.error || `HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return data;
}

