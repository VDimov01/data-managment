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
  const res = await fetch("http://localhost:5000/api/shops");
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