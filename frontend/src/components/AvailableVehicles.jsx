import { useState, useMemo, useEffect } from "react";
import { fetchVehicles, fetchColors, fetchEditions, fetchShopsNew } from "../services/api";
import Modal from "./Modal";
import EditionAttributeModal from "./editions/EditionsForm";
import EditionCompare from "./editions/EditionCompare";

export default function AvailableVehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [colors, setColors] = useState([]);
  const [editions, setEditions] = useState([]);
  const [shopsNew, setShopsNew] = useState([]);
  const [open, setOpen] = useState(false);
  const numericIds = new Set(['edition_id','exterior_color_id','interior_color_id','shop_id']);
  const moneyFields = new Set(['asking_price']);

  const [formData, setFormData] = useState({
    vin: '',
    stock_number: '',
    edition_id: '',
    exterior_color_id: '',
    interior_color_id: '',
    shop_id: '',
    status: 'Available',
    asking_price: ''
  });

  const handleChange = (e) => {
  const { name, value } = e.target;
  let v = value;

  if (numericIds.has(name)) {
    v = value === '' ? '' : Number(value);
  } else if (moneyFields.has(name)) {
    v = value === '' ? '' : Number(value);
  }
  setFormData(prev => ({ ...prev, [name]: v }));
};

  const handleSubmit = async e => {
    e.preventDefault();
    const res = await fetch('/vehicles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    if (res.ok) {
      const data = await res.json();
      alert('Vehicle created!');
      setVehicles([...vehicles, { ...formData, vehicle_id: data.vehicle_id }]);
      setFormData({
        vin: '',
        stock_number: '',
        edition_id: '',
        exterior_color_id: '',
        interior_color_id: '',
        shop_id: '',
        status: 'Available',
        asking_price: ''
      });
    }
  };

  const handleDelete = async id => {
    const res = await fetch(`/vehicles/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setVehicles(vehicles.filter(v => v.vehicle_id !== id));
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchVehicles();
        console.log("Fetched vehicles:", data);
        setVehicles(data);

        const colorsData = await fetchColors();
        setColors(colorsData);

        const editionsData = await fetchEditions();
        setEditions(editionsData);

        const shopsNewData = await fetchShopsNew();
        setShopsNew(shopsNewData);

      } catch (err) {
        console.error("Failed to fetch vehicles:", err);
      }
    })();
  }, []);
    console.log("Vehicles state:", vehicles);

    const extColors = useMemo(
  () => colors.filter(c => (c.type || '').toLowerCase() === 'exterior'),
  [colors]
);
const intColors = useMemo(
  () => colors.filter(c => (c.type || '').toLowerCase() === 'interior'),
  [colors]
);

  return (
    <div>
      <h2>Available Vehicles</h2>

      <h2 className="text-xl font-bold mb-2">Vehicles</h2>
      <ul>
        {vehicles.map(v => (
          <li key={v.vehicle_id} className="flex justify-between items-center border-b py-2">
            <span>{v.make} {v.model} ({v.vin}) – {v.status} {v.edition} {v.model_year}</span>
            <button onClick={() => handleDelete(v.vehicle_id)} className="bg-red-500 text-white px-3 py-1 rounded">
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}