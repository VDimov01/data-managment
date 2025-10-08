import { useEffect, useState } from "react";

export default function AttachCustomersPanelCompare({ apiBase, compareId }) {
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState([]);
  const [attached, setAttached] = useState([]); // customer_id list already attached

  const loadCustomers = async () => {
    try {
      const url = new URL(`${apiBase}/api/customers`);
      url.searchParams.set("page", 1);
      url.searchParams.set("limit", 50);
      if (q.trim()) url.searchParams.set("q", q.trim());
      const r = await fetch(url, { credentials: 'include' });
      const data = await r.json();
      setCustomers(data.customers || data.items || []); // adapt to your payload
    } catch (e) {
      console.error(e);
    }
  };

  const loadAttached = async () => {
    try {
      // light endpoint: list customers with this compare attached (optional—if you don’t have it, skip)
      // Fallback: keep attached local after attach/detach clicks.
    } catch {}
  };

  useEffect(() => { loadCustomers(); /* loadAttached(); */ }, [q]);

  const attach = async (customer_id) => {
    try {
      const r = await fetch(`${apiBase}/api/compares/${compareId}/attach`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ customer_id, is_visible: 1 }),
        credentials: 'include'
      });
      if (!r.ok) {
        const j = await r.json().catch(()=>null);
        return alert(j?.error || "Неуспешно закачане");
      }
      setAttached(prev => Array.from(new Set([...prev, customer_id])));
    } catch (e) {
      console.error(e); alert("Неуспешно закачане");
    }
  };

  const detach = async (customer_id) => {
    try {
      const r = await fetch(`${apiBase}/api/compares/${compareId}/attach/${customer_id}`, { method: "DELETE", credentials: 'include' });
      if (r.status !== 204) {
        const j = await r.json().catch(()=>null);
        return alert(j?.error || "Неуспешно премахване");
      }
      setAttached(prev => prev.filter(id => id !== customer_id));
    } catch (e) {
      console.error(e); alert("Неуспешно премахване");
    }
  };

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:10 }}>
        <input placeholder="Търсене на клиенти…" value={q} onChange={e=>setQ(e.target.value)} />
        <button onClick={loadCustomers}>Търси</button>
      </div>
      <div className="cmp-list">
        {customers.length === 0 && <div className="cmp-muted">Няма намерени клиенти.</div>}
        {customers.map(c => (
          <div key={c.customer_id} className="cmp-row">
            <div className="cmp-row-main">
              <div className="cmp-row-title">
                {/* {c.type === 'company'
                  ? (c.company_name || c.name)
                  : `${c.first_name} ${c.middle_name ? c.middle_name + " " : ""}${c.last_name}`
                } */}
                {c.display_name || c.name || c.company_name || `#${c.customer_id}`}
              </div>
              <div className="cmp-row-sub">{c.email || c.phone_number || c.public_uuid}</div>
            </div>
            <div className="cmp-row-actions">
              {attached.includes(c.customer_id) ? (
                <button className="cmp-danger" onClick={() => detach(c.customer_id)}>Премахни</button>
              ) : (
                <button onClick={() => attach(c.customer_id)}>Добави</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
