import { useEffect, useState } from "react";

/* =================== Attach to Customers panel =================== */

export default function AttachCustomersPanel({ apiBase, brochureId }) {
  const [list, setList] = useState([]); // current attachments
  const [loading, setLoading] = useState(false);

  const [searchQ, setSearchQ] = useState("");
  const [custResults, setCustResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase}/api/brochures/${brochureId}/attachments`);
      const data = await r.json();
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [brochureId]);

  // search customers (uses your /api/customers list/search)
  useEffect(() => {
    const t = setTimeout(async () => {
      const qq = searchQ.trim();
      if (!qq) { setCustResults([]); return; }
      setSearchLoading(true);
      try {
        const url = new URL(`${apiBase}/api/customers`);
        url.searchParams.set("q", qq);
        url.searchParams.set("page", "1");
        url.searchParams.set("limit", "10");
        const r = await fetch(url);
        const data = await r.json();
        setCustResults(data.customers || []);
      } catch (e) {
        console.error(e);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [apiBase, searchQ]);

  const attach = async (customer_id) => {
    try {
      const r = await fetch(`${apiBase}/api/brochures/${brochureId}/attachments`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ customer_id, is_visible: 1 })
      });
      if (!r.ok) {
        const d = await r.json().catch(()=>null);
        return alert(d?.error || "Attach failed");
      }
      await load();
      setSearchQ(""); setCustResults([]);
    } catch (e) {
      console.error(e); alert("Attach failed");
    }
  };

  const detach = async (customer_id) => {
    if (!window.confirm("Detach this brochure from the customer?")) return;
    try {
      const r = await fetch(`${apiBase}/api/brochures/${brochureId}/attachments/${customer_id}`, { method: "DELETE" });
      if (r.status !== 204) {
        const d = await r.json().catch(()=>null);
        return alert(d?.error || "Detach failed");
      }
      setList(prev => prev.filter(x => x.customer_id !== customer_id));
    } catch (e) {
      console.error(e); alert("Detach failed");
    }
  };

  function displayCustomerName(c) {
  if (c.customer_type === "company" || c.company_name) {
    return c.company_name || "(company)";
  }
  const parts = [c.first_name, c.middle_name, c.last_name].filter(Boolean);
  return parts.join(" ") || "(customer)";
}

  return (
    <div className="br-attach">
      <div className="br-attach-grid">
        <div className="br-attach-col">
          <h4>Attached customers</h4>
          {loading ? <p className="br-muted">Loading…</p> : (
            <ul className="br-attach-list">
              {list.map(x => (
                <li key={x.customer_id} className="br-attach-item">
                  <div>
                    <div className="br-strong">{displayCustomerName(x)}</div>
                    <div className="br-muted">{x.email || "—"}</div>
                  </div>
                  <button className="br-danger" onClick={() => detach(x.customer_id)}>Detach</button>
                </li>
              ))}
              {list.length === 0 && <li className="br-muted">No attachments.</li>}
            </ul>
          )}
        </div>

        <div className="br-attach-col">
          <h4>Search customers to attach</h4>
          <input
            value={searchQ}
            onChange={(e)=>setSearchQ(e.target.value)}
            placeholder="Name / email / company…"
          />
          {searchLoading && <p className="br-muted">Searching…</p>}
          {!searchLoading && searchQ && (
            <ul className="br-attach-list">
              {custResults.map(c => (
                <li key={c.customer_id} className="br-attach-item">
                  <div>
                    <div className="br-strong">{displayCustomerName(c)}</div>
                    <div className="br-muted">{c.email || "—"}</div>
                  </div>
                  <button onClick={() => attach(c.customer_id)}>Attach</button>
                </li>
              ))}
              {custResults.length === 0 && <li className="br-muted">No matches.</li>}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}