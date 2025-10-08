export async function createOffer(data) {
  const res = await fetch("http://localhost:5000/api/offers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  return res.json();
}

export const sendOfferEmail = async (offerId, clientEmail) => {
  const res = await fetch("http://localhost:5000/api/offers/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offerId, client_email: clientEmail }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to send email");
  return data;
};

export const fetchCars = async () => {
  const res = await fetch("http://localhost:5000/api/cars");
  if (!res.ok) throw new Error("Failed to fetch cars");
  return res.json();
};

export const fetchVehicles = async () => {
  const res = await fetch("http://localhost:5000/api/vehicles");
  if (!res.ok) throw new Error("Failed to fetch vehicles");
  return res.json();
};

export const fetchEditions = async () => {
  const res = await fetch("http://localhost:5000/api/editions");
  if (!res.ok) throw new Error("Failed to fetch editions");
  return res.json();
}

export const fetchColors = async () => {
  const res = await fetch("http://localhost:5000/api/colors");
  if (!res.ok) throw new Error("Failed to fetch colors");
  return res.json();
};

export const fetchShopsNew = async () => {
  const res = await fetch("http://localhost:5000/api/shops/new");
  if (!res.ok) throw new Error("Failed to fetch new shops");
  return res.json();
};

export const fetchClients = async () => {
  const res = await fetch("http://localhost:5000/api/clients");
  if (!res.ok) throw new Error("Failed to fetch clients");
  return res.json();
}

export const fetchCompanies = async () => {
  const res = await fetch("http://localhost:5000/api/companies");
  if (!res.ok) throw new Error("Failed to fetch companies");
  return res.json();
}

export const fetchStorage = async () => {
  const res = await fetch("http://localhost:5000/api/storage");
  if (!res.ok) throw new Error("Failed to fetch storage");
  return res.json();
}

export const fetchShops = async () => {
  const res = await fetch("http://localhost:5000/api/shops/new");
  if (!res.ok) throw new Error("Failed to fetch shops");
  return res.json();
}

export async function searchContracts(query = "", page = 1, limit = 10) {
  const params = new URLSearchParams({
    query: query || "",
    page: String(page),
    limit: String(limit),
  });
  const res = await fetch(`http://localhost:5000/api/contracts/search?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to search contracts");
  return res.json();
}

export const fetchImages = async (carId, carMaker, carModel) => {
    const res = await fetch(`http://localhost:5000/api/car-images/${carId}^${carMaker}^${carModel}`);
    if(!res.ok) throw new Error("Failed to fetch images");
    return res.json();
  };

export async function generateVehicleQr(apiBase, vehicleId) {
  const r = await fetch(`${apiBase}/api/qr/vehicles/${vehicleId}`, { method: 'POST' });
  if (!r.ok) throw new Error(await r.text());
  return r.json(); // { qr_png_path, destination, ... }
}

// --- Vehicle images (private) ---
export async function listVehicleImages(apiBase, vehicleId) {
  const r = await fetch(`${apiBase}/api/vehicleImages/${vehicleId}/images`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function uploadVehicleImages(apiBase, vehicleId, files) {
  const fd = new FormData();
  for (const f of files) fd.append('images', f);
  const r = await fetch(`${apiBase}/api/vehicleImages/${vehicleId}/images`, {
    method: 'POST',
    body: fd,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json(); // { created: [...] }
}

export async function setPrimaryVehicleImage(apiBase, vehicleId, imageId) {
  const r = await fetch(`${apiBase}/api/vehicleImages/${vehicleId}/images/${imageId}/primary`, { method: 'POST' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateVehicleImageMeta(apiBase, vehicleId, imageId, { caption, sort_order }) {
  const r = await fetch(`${apiBase}/api/vehicleImages/${vehicleId}/images/${imageId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caption, sort_order })
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteVehicleImage(apiBase, vehicleId, imageId) {
  const r = await fetch(`${apiBase}/api/vehicleImages/${vehicleId}/images/${imageId}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Public vehicle by UUID
export async function getPublicVehicle(apiBase, uuid) {
  const r = await fetch(`${apiBase}/api/public/vehicles/${uuid}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Public vehicle images (private bucket, proxied by backend)
export async function getPublicVehicleImages(apiBase, uuid) {
  const r = await fetch(`${apiBase}/api/public/vehicles/${uuid}/images`);
  if (!r.ok) throw new Error(await r.text());
  return r.json(); // [{ vehicle_image_id, stream_url }]
}

// Edition attributes (your existing resolver)
export async function getEditionAttributes(apiBase, editionId, lang = 'bg') {
  const r = await fetch(`${apiBase}/api/editions/${editionId}/specs?lang=${lang}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json(); // shape depends on your resolver
}

export async function listEditionImages(apiBase, editionId, maker, model, year) {
  const safe = (s) => encodeURIComponent(String(s ?? "").trim().replace(/-/g, " ").replace(/\s+/g, " "));
  const r = await fetch(`${apiBase}/api/car-images/${editionId}-${safe(maker)}-${safe(model)}-${safe(year)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function uploadEditionImages(apiBase, editionId, maker, model, year, files, part='unsorted') {
  const safe = (s) => encodeURIComponent(String(s ?? "").trim().replace(/-/g, " ").replace(/\s+/g, " "));
  const fd = new FormData();
  for (const f of files) fd.append("images", f);
  const r = await fetch(`${apiBase}/api/car-images/${editionId}-${safe(maker)}-${safe(model)}-${safe(year)}-${part}`, {
    method: "POST", body: fd
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function patchEditionImage(apiBase, id, patch) {
  const r = await fetch(`${apiBase}/api/car-images/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Patch failed');
  return data; // { ok: true }
}


export async function deleteEditionImage(apiBase, imageId) {
  const r = await fetch(`${apiBase}/api/car-images/${imageId}`, { method: "DELETE" });
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

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

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

