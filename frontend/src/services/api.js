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


export const fetchShops = async () => {
  return api("/shops/new");
}

export async function searchContracts(query = "", page = 1, limit = 10) {
  const params = new URLSearchParams({
    query: query || "",
    page: String(page),
    limit: String(limit),
  });

  return api(`/contracts/search?${params.toString()}`);
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
      body: {
        // send only what you need; coerce sort_order to int
        ...(caption !== undefined ? { caption } : {}),
        ...(sort_order !== undefined ? { sort_order: Number(sort_order) } : {}),
      },
    });
  }

export async function deleteVehicleImage(apiBase, vehicleId, imageId) {
  return api(`/vehicleImages/${vehicleId}/images/${imageId}`, { method: 'DELETE' });
}

// Public vehicle by UUID
export async function getPublicVehicle(apiBase, uuid) {
  return api(`/public/vehicles/${uuid}`);
}

// Public vehicle images (private bucket, proxied by backend)
export async function getPublicVehicleImages(apiBase, uuid) {
  return api(`public/vehicles/${uuid}/images`);
}

// Edition attributes (your existing resolver)
export async function getEditionAttributes(apiBase, editionId, lang = 'bg') {
  return api(`/editions/${editionId}/specs?lang=${lang}`);
}

// --- Edition images (admin/private) ---
// Normalizes maker/model/year into the slug you're using for the car-images route
const safeSlug = (s) =>
  encodeURIComponent(String(s ?? "").trim().replace(/-/g, " ").replace(/\s+/g, " "));

export async function listEditionImages(editionId, maker, model, year) {
  // returns JSON (likely { images: [...] } or an array; handle both on caller)
  return api(`/car-images/${editionId}-${safeSlug(maker)}-${safeSlug(model)}-${safeSlug(year)}`);
}

export async function uploadEditionImages(editionId, maker, model, year, files, part = "unsorted") {
  const fd = new FormData();
  for (const f of files) fd.append("images", f);
  // returns JSON directly
  return api(
    `/car-images/${editionId}-${safeSlug(maker)}-${safeSlug(model)}-${safeSlug(year)}-${part}`,
    { method: "POST", body: fd }
  );
}

export async function patchEditionImage(imageId, patch) {
  // returns { ok: true } or the updated image
  return api(`/car-images/${imageId}`, { method: "PATCH", body: patch });
}

export async function deleteEditionImage(imageId) {
  // returns { ok: true }
  return api(`/car-images/${imageId}`, { method: "DELETE" });
}

export function buildUrl(base, path, params = {}) {
  const b = (base || '').replace(/\/+$/, '');
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== '') qs.append(k, v);
  });
  return `${b}${path}${qs.toString() ? `?${qs.toString()}` : ''}`;
}

// frontend/src/services/api.js
export function qs(params = {}) {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    const s = String(v).trim();
    if (s !== '') u.append(k, s);
  });
  const q = u.toString();
  return q ? `?${q}` : '';
}


// services/api.js
const fallbackApiBase = (() => {
  if (import.meta.env.DEV) return 'http://localhost:5000';
  return window.location.origin;
})();

export const API_BASE =
  (import.meta.env.VITE_API_BASE && import.meta.env.VITE_API_BASE.trim()) ||
  fallbackApiBase;

/**
 * api(path, {
 *   method?: 'GET'|'POST'|...,
 *   body?: object|FormData|Blob|ArrayBuffer|URLSearchParams,
 *   headers?: Record<string,string>,
 *   responseType?: 'auto'|'json'|'text'|'blob'|'arrayBuffer',
 *   raw?: boolean  // if true, returns the native Response (no parsing)
 * })
 */
export async function api(path, opts = {}) {
  const {
    method = 'GET',
    body,
    headers,
    responseType = 'auto',
    raw = false,
  } = opts;

  const init = { method, credentials: 'include', headers: { ...(headers || {}) } };

  if (body !== undefined && body !== null) {
    if (
      body instanceof FormData ||
      body instanceof Blob ||
      body instanceof ArrayBuffer ||
      body instanceof URLSearchParams
    ) {
      // Let the browser set Content-Type (especially for FormData)
      init.body = body;
    } else {
      init.body = JSON.stringify(body);
      if (!init.headers['Content-Type']) init.headers['Content-Type'] = 'application/json';
    }
  }

  const res = await fetch(`${API_BASE}/api${path}`, init);

  if (!res.ok) {
    // Try to extract a useful error message
    const ct = res.headers.get('content-type') || '';
    let message = `HTTP ${res.status}`;
    try {
      if (ct.includes('application/json')) {
        const errJson = await res.json();
        if (errJson?.error) message = errJson.error;
      } else {
        const txt = await res.text();
        if (txt) message = txt;
      }
    } catch {}
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  if (raw) return res;

  // No content or HEAD: return null
  if (res.status === 204 || method === 'HEAD') return null;

  const ct = res.headers.get('content-type') || '';

  if (responseType === 'json') return res.json();
  if (responseType === 'text') return res.text();
  if (responseType === 'blob') return res.blob();
  if (responseType === 'arrayBuffer') return res.arrayBuffer();

  // auto
  if (ct.includes('application/json')) return res.json();
  if (ct.startsWith('text/')) return res.text();
  return res.blob(); // default for binary (pdf/png/jpg/…)
}

// Optional helpers
export const apiJSON  = (p, o) => api(p, { ...o, responseType: 'json' });
export const apiBlob  = (p, o) => api(p, { ...o, responseType: 'blob' });
export const apiText  = (p, o) => api(p, { ...o, responseType: 'text' });

// Read filename from Content-Disposition if you need it
export function filenameFromResponse(res, fallback = 'download') {
  const cd = res.headers.get('content-disposition') || '';
  const m = /filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i.exec(cd);
  return decodeURIComponent(m?.[1] || m?.[2] || fallback);
}


