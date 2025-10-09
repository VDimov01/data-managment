// Small helpers for your unified /api/customers backend
import { api } from "./api";
const LOCAL_API_BASE ="http://localhost:5000";
const API_BASE = import.meta.env.VITE_API_BASE || "https://data-managment-production.up.railway.app";

export async function listCustomers({ q = "", page = 1, limit = 20 } = {}) {
  const url = new URL(`${API_BASE}/api/customers`);
  if (q) url.searchParams.set("q", q);
  url.searchParams.set("page", page);
  url.searchParams.set("limit", limit);

  const res = await fetch(url.toString(), { method: "GET" , credentials: 'include'});
  if (!res.ok) throw new Error(`Failed to fetch customers: ${res.status}`);
  return res.json(); // { page, limit, total, totalPages, customers: [...] }
}

export async function getCustomer(customer_id) {
  const res = await fetch(`${API_BASE}/api/customers/${customer_id}`, { method: "GET", credentials: 'include' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch customer: ${res.status}`);
  return res.json(); // { customer_id, ... }
}

export async function createCustomer(payload) {
  const res = await fetch(`${API_BASE}/api/customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: 'include'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Create failed");
  return data; // { customer_id, public_uuid }
}

export async function updateCustomer(customer_id, payload) {
  const res = await fetch(`${API_BASE}/api/customers/${customer_id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: 'include'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Update failed");
  return data; // { message: 'Updated' }
}

export async function deleteCustomer(customer_id) {
  const res = await fetch(`${API_BASE}/api/customers/${customer_id}`, { method: "DELETE", credentials: 'include' });
  if (res.status === 204) return true;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Delete failed");
  return true;
}
