import { useState, useEffect, use } from "react";
import { useNavigate } from "react-router-dom";
import { fetchClients, fetchCompanies } from "../services/api";
import { useData } from "../hooks/useData";

export default function ClientsSection() {
  // const { clients, setClients, companies, setCompanies } = useData();
  const [formType, setFormType] = useState("client"); // 'client' or 'company'
  const [formData, setFormData] = useState({});
  const [editing, setEditing] = useState(null); // { type: 'client' | 'company', id: number }
  const [clients, setClients] = useState([]);
  const [companies, setCompanies] = useState([]);

  const navigate = useNavigate();

  useEffect(() => {
    const loadData = async () => {
      const fetchedClients = await fetchClients();
      const fetchedCompanies = await fetchCompanies();
      setClients(fetchedClients);
      setCompanies(fetchedCompanies);
    };

    loadData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const isEdit = !!editing;
    const url = isEdit
      ? `http://localhost:5000/api/${formType === "client" ? "clients" : "companies"}/${editing.uuid}`
      : `http://localhost:5000/api/${formType === "client" ? "clients" : "companies"}`;

    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    const data = await res.json();

    

    if (res.ok) {
      alert(`${formType} ${isEdit ? "updated" : "added"} successfully!`);
      setFormData({});
      setEditing(null);
      if(!isEdit) {
        const created = data.client; // for new entries
        if(formType === "client"){
          setClients((prev) => [created, ...prev]);
          console.log(clients);
        }else if(formType === "company"){
          setCompanies((prev) => [created, ...prev]);
        }
    } else if (isEdit) {
        const updated = data.client;
        console.log(data);
      if(formType === "client"){
        setClients((prev) => prev.map((c) => (c.uuid === updated.uuid ? updated : c)));
        console.log(clients);
      }else if(formType === "company"){
        setCompanies((prev) => prev.map((c) => (c.uuid === updated.uuid ? updated : c)));
      }
    } else {
      alert("Error saving entry.");
      console.error("Error:", await res.text());
    }
  };
}

  const handleDelete = async (type, uuid, name, lastname = "") => {
  if (!window.confirm(`Are you sure you want to delete ${name} ${lastname}?`)) return;
  console.log(uuid);

  try {
    const res = await fetch(`http://localhost:5000/api/${type}/${uuid}`, { method: "DELETE" });

    if (res.ok) {
  const data = await res.json();
  alert(data.message || `${name} ${lastname} deleted successfully`);

  if (type === "clients") {
    setClients((prev) => prev.filter((c) => c.uuid !== uuid));
  } else {
    setCompanies((prev) => prev.filter((c) => c.uuid !== uuid));
  }
} else {
  const errorData = await res.json().catch(() => null);
  const errorMsg = errorData?.error || res.statusText || "Unknown error";
  alert(`Error deleting entry: ${errorMsg}`);
}

  } catch (err) {
    console.error("Delete request failed:", err);
    alert("An unexpected error occurred while deleting. Please try again.");
  }
};


  const handleEdit = (type, entry) => {
    setFormType(type);
    setFormData({ ...entry });
    setEditing({ type, uuid: entry.uuid });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setFormData({});
    setEditing(null);
  };

  return (
    <div className="clients-section">
      <h2>Клиенти & Фирми</h2>

      {/* Toggle Form Type */}
      <div className="toggle-buttons">
        <button
          className={formType === "client" ? "active" : ""}
          onClick={() => { setFormType("client"); setFormData({}); setEditing(null); }}
        >
          Добави Индивидуален Клиент
        </button>
        <button
          className={formType === "company" ? "active" : ""}
          onClick={() => { setFormType("company"); setFormData({}); setEditing(null); }}
        >
          Добави Фирма
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="client-form">
        {formType === "client" ? (
          <>
            <input
              placeholder="Собствено име"
              value={formData.first_name || ""}
              onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
              required
            />
            <input
              placeholder="Бащино име"
              value={formData.middle_name || ""}
              onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
              required
            />
            <input
              placeholder="Фамилия"
              value={formData.last_name || ""}
              onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
              required
            />
            <input
              type="email"
              placeholder="Email"
              value={formData.email || ""}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
            <input
              placeholder="Телефонен номер"
              value={formData.phone_number || ""}
              onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
            />
            <input
              placeholder="ЕГН"
              value={formData.ucn || ""}
              onChange={(e) => setFormData({ ...formData, ucn: e.target.value })}
              required={!editing}
            />
          </>
        ) : (
          <>
            <input
              placeholder="Име на компанията"
              value={formData.name || ""}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <input
              placeholder="Email"
              value={formData.email || ""}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
            <input
              placeholder="Телефонен номер"
              value={formData.phone_number || ""}
              onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
            />
            <input
              placeholder="ДДС / ЕИК"
              value={formData.vat_number || ""}
              onChange={(e) => setFormData({ ...formData, vat_number: e.target.value })}
              required
            />
            <input
              placeholder="Адрес"
              value={formData.address || ""}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
            <input
              placeholder="Град"
              value={formData.city || ""}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            />
            <input
              placeholder="Представител - Собствено име"
              value={formData.rep_first_name || ""}
              onChange={(e) => setFormData({ ...formData, rep_first_name: e.target.value })}
              required
            />
            <input
              placeholder="Представител - Бащино име"
              value={formData.rep_middle_name || ""}
              onChange={(e) => setFormData({ ...formData, rep_middle_name: e.target.value })}
            />
            <input
              placeholder="Представител - Фамилия"
              value={formData.rep_last_name || ""}
              onChange={(e) => setFormData({ ...formData, rep_last_name: e.target.value })}
              required
            />
          </>
        )}

        <div className="form-actions">
          <button type="submit">
            {editing ? "Редактирай" : "Добави"} {formType === "client" ? "Клиент" : "Фирма"}
          </button>
          {editing && (
            <button type="button" className="cancel-btn" onClick={cancelEdit}>
              Отказ
            </button>
          )}
        </div>
      </form>

      <h3>Клиенти</h3>
      <table className="clients-table">
        <thead>
          <tr>
            <th>Име</th>
            <th>Email</th>
            <th>Телефонен номер</th>
            <th>ЕГН</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.uuid}>
              <td>{c.first_name} {c.last_name}</td>
              <td>{c.email}</td>
              <td>{c.phone_number || "-"}</td>
              <td>{c.ucn}</td>
              <td>
                <button onClick={() => handleEdit("client", c)}>Редактиране</button>
                <button className="delete-btn" onClick={() => handleDelete("clients", c.uuid, c.first_name, c.last_name)}>Изтриване</button>
                <button onClick={() => navigate(`/customers/client/${c.uuid}`)}>Детайли</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Фирми</h3>
      <table className="clients-table">
        <thead>
          <tr>
            <th>Фирма</th>
            <th>Email</th>
            <th>Телефонен номер</th>
            <th>ДДС / ЕИК</th>
            <th>Представител</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.email || "-"}</td>
              <td>{c.phone_number || "-"}</td>
              <td>{c.vat_number}</td>
              <td>{c.rep_first_name} {c.rep_middle_name || ""} {c.rep_last_name}</td>
              <td>
                <button onClick={() => handleEdit("company", c)}>Редактиране</button>
                <button className="delete-btn" onClick={() => handleDelete("companies", c.uuid, c.name)}>Изтриване</button>
                <button onClick={() => navigate(`/customers/company/${c.uuid}`)}>Детайли</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
