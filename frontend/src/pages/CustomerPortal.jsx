// CustomerPortal.jsx
import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import CustomerBrochuresPage from "./customer-brochures/CustomerBrochuresPage";
import CustomerComparesPage from "./customer-compares/CustomerComparesPage";
import CustomerContractsPage from "./customer-contracts/CustomerContractsPage";
import CustomerOffersPage from "./customer-offers/CustomerOffersPage";

export default function CustomerPortal({ apiBase = "http://localhost:5000" }) {
  const { uuid } = useParams();
  const [tab, setTab] = useState("brochures");
  const [cust, setCust] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadCustomer() {
    setLoading(true);
    setErr("");
    try {
      // Build a PUBLIC URL (no api() helper, no auth cookies)
      const base = (apiBase || "").replace(/\/+$/, "");
      const url =
        base
          ? `${base}/api/public/customer/${encodeURIComponent(uuid)}`
          : `/api/public/customer/${encodeURIComponent(uuid)}`;

      const res = await fetch(url, { method: "GET" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();                 // { display_name: "..." }
      setCust(data);                                 // store object directly
    } catch (e) {
      setCust(null);
      setErr(e.message || "Неуспешно зареждане на клиент!");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadCustomer(); }, [uuid]);

  return (
    <div className="cp-shell">
      <aside className="cp-nav">
        <div className="cont-page-toolbar">
          <h3 style={{marginBottom:12}}>{cust?.display_name ? `${cust.display_name}` : "Вашият профил"}</h3>
        </div>

      {err && <div className="cont-page-error">Грешка: {err}</div>}
        <nav>
          <button
            className={`cp-link ${tab === 'brochures' ? 'on' : ''}`}
            onClick={() => setTab('brochures')}
          >
            Брошури
          </button>
          <button
            className={`cp-link ${tab === 'compares' ? 'on' : ''}`}
            onClick={() => setTab('compares')}
          >
            Сравнения
          </button>
          <button className={`cp-link ${tab === 'contracts' ? 'on' : ''}`} onClick={() => setTab('contracts')}>
            Договори
          </button>
          <button className={`cp-link ${tab === 'offers' ? 'on' : ''}`} onClick={() => setTab('offers')}>
            Оферти
          </button>
          
        </nav>
      </aside>

      <main className="cp-main">
        {tab === 'brochures' && (
          <CustomerBrochuresPage apiBase={apiBase} key={`b-${uuid}`} />
        )}
        {tab === 'compares' && (
          <CustomerComparesPage apiBase={apiBase} key={`c-${uuid}`} />
        )}
        {tab === 'contracts' && (
          <CustomerContractsPage apiBase={apiBase} key={`d-${uuid}`} />
        )}
        {tab === 'offers' && (
          <CustomerOffersPage apiBase={apiBase} publicCustomerUuid={uuid} key={`o-${uuid}`} />
        )

        }
      </main>
    </div>
  );
}
