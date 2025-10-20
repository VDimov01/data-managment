// CustomerPortal.jsx
import { useParams } from "react-router-dom";
import { useState } from "react";
import CustomerBrochuresPage from "./customer-brochures/CustomerBrochuresPage";
import CustomerComparesPage from "./customer-compares/CustomerComparesPage";
import CustomerContractsPage from "./customer-contracts/CustomerContractsPage";
import CustomerOffersPage from "./customer-offers/CustomerOffersPage";

export default function CustomerPortal({ apiBase = "http://localhost:5000" }) {
  const { uuid } = useParams(); // keep route: /customer/:uuid
  const [tab, setTab] = useState("brochures"); // 'brochures' | 'compares' | 'contracts' | 'offers'

  return (
    <div className="cp-shell">
      <aside className="cp-nav">
        <div className="cp-brand">Вашият профил</div>
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
