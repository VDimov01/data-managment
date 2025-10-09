import { useEffect, useState } from "react";
import { api, qs } from "../../services/api"; // ← use your unified helper

export default function AttachCustomersPanelCompare({ compareId }) {
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState([]);
  const [attached, setAttached] = useState([]); // customer_id list already attached

  // Load customers (debounced by the parent if needed; here we trigger on q)
  const loadCustomers = async () => {
    try {
      const data = await api(
        `/customers${qs({ page: 1, limit: 50, q: q.trim() || undefined })}`
      );
      const rows =
        data?.customers ?? data?.items ?? (Array.isArray(data) ? data : []);
      setCustomers(rows || []);
    } catch (e) {
      console.error(e);
    }
  };

  // Optional: if you have an endpoint to list attached customers for a compare, call it here.
  const loadAttached = async () => {
    // Example (uncomment if such an endpoint exists):
    // try {
    //   const data = await api(`/compares/${compareId}/attached`);
    //   setAttached((data?.items || []).map(x => x.customer_id));
    // } catch {}
  };

  useEffect(() => {
    loadCustomers();
    // loadAttached();
  }, [q, compareId]);

  const attach = async (customer_id) => {
    try {
      await api(`/compares/${compareId}/attach`, {
        method: "POST",
        body: { customer_id, is_visible: 1 },
      });
      setAttached((prev) => Array.from(new Set([...prev, customer_id])));
    } catch (e) {
      console.error(e);
      alert(e.message || "Неуспешно закачане");
    }
  };

  const detach = async (customer_id) => {
    try {
      await api(`/compares/${compareId}/attach/${customer_id}`, {
        method: "DELETE",
      });
      setAttached((prev) => prev.filter((id) => id !== customer_id));
    } catch (e) {
      console.error(e);
      alert(e.message || "Неуспешно премахване");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input
          placeholder="Търсене на клиенти…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button onClick={loadCustomers}>Търси</button>
      </div>
      <div className="cmp-list">
        {customers.length === 0 && (
          <div className="cmp-muted">Няма намерени клиенти.</div>
        )}
        {customers.map((c) => {
          const name =
            c.display_name ||
            c.name ||
            c.company_name ||
            `${c.first_name ?? ""} ${c.middle_name ? c.middle_name + " " : ""}${
              c.last_name ?? ""
            }`.trim() ||
            `#${c.customer_id}`;
        return (
            <div key={c.customer_id} className="cmp-row">
              <div className="cmp-row-main">
                <div className="cmp-row-title">{name}</div>
                <div className="cmp-row-sub">
                  {c.email || c.phone_number || c.public_uuid}
                </div>
              </div>
              <div className="cmp-row-actions">
                {attached.includes(c.customer_id) ? (
                  <button
                    className="cmp-danger"
                    onClick={() => detach(c.customer_id)}
                  >
                    Премахни
                  </button>
                ) : (
                  <button onClick={() => attach(c.customer_id)}>Добави</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
