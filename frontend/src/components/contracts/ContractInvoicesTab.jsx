// frontend/src/components/contracts/ContractInvoicesTab.jsx
import React, { useEffect, useState } from "react";
import { api } from "../../services/api";
import { formatDateDMYLocal } from "../../utils/dates";
import { statusToBG } from "../../utils/i18n";

export default function ContractInvoicesTab({ contract }) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api(`/contracts/${contract.contract_id}/invoices`);
      const list = Array.isArray(data.items)
        ? data.items
        : Array.isArray(data)
        ? data
        : [];
      setItems(list);
    } catch (e) {
      alert(`Грешка при зареждане на фактурите: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract.contract_id]);

  // Издаване на фактура/проформа по целия договор (mode = FULL)
  const createInvoice = async (kind) => {
    const isProforma = kind === "PROFORMA";
    const label = isProforma ? "проформа фактура" : "фактура";

    if (!window.confirm(`Да издадем ${label} по целия договор?`)) return;

    setLoading(true);
    try {
      await api(`/contracts/${contract.contract_id}/invoices`, {
        method: "POST",
        body: {
          type: kind,   // 'INVOICE' | 'PROFORMA'
          mode: "FULL", // фактура за целия договор
        },
      });
      await load();
    } catch (e) {
      alert(
        `Грешка при издаване на ${isProforma ? "проформа фактура" : "фактура"}: ${
          e.message
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  // Отваряне на последния PDF за дадена фактура по UUID
  const openInvoicePdf = async (inv) => {
    if (!inv.uuid) {
      alert("Липсва UUID за тази фактура (inv.uuid).");
      return;
    }

    setLoading(true);
    try {
      const data = await api(`/contracts/invoices/${inv.uuid}/pdf/latest`);
      const url =
        data.signedUrl ||
        data.signed_url ||
        data.url ||
        (data.pdf && data.pdf.signedUrl) ||
        null;

      if (!url) {
        alert("Няма наличен PDF за тази фактура.");
        return;
      }

      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      alert(`Грешка при отваряне на фактурата: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Регенериране на PDF за съществуваща фактура
  const regenerateInvoicePdf = async (inv) => {
    if (!inv.uuid) {
      alert("Липсва UUID за тази фактура (inv.uuid).");
      return;
    }

    if (!window.confirm("Да регенерираме PDF за тази фактура?")) return;

    setLoading(true);
    try {
      const data = await api(`/contracts/invoices/${inv.uuid}/pdf`, {
        method: "POST"
      });

      // ако искаш директно да отвориш новия PDF:
      const url =
        data?.pdf?.signedUrl ||
        data?.pdf?.signed_url ||
        data?.signedUrl ||
        data?.signed_url ||
        null;

      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }

      // и да презаредим списъка (ако пазиш инфо за version)
      await load();
    } catch (e) {
      alert(`Грешка при регенериране на PDF: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="contract-invoices-tab">
      {/* Toolbar */}
      <div
        className="toolbar-row"
        style={{ justifyContent: "flex-start", marginBottom: 8, gap: 8 }}
      >
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => createInvoice("INVOICE")}
          disabled={loading}
        >
          {loading ? "Моля, изчакай…" : "Издай фактура по договор"}
        </button>

        <button
          type="button"
          className="btn"
          onClick={() => createInvoice("PROFORMA")}
          disabled={loading}
        >
          {loading ? "Моля, изчакай…" : "Издай проформа по договор"}
        </button>
      </div>

      {loading && <div className="text-muted">Зареждане…</div>}
      {!loading && items.length === 0 && (
        <div className="text-muted">Няма издадени фактури по този договор.</div>
      )}

      {!loading && items.length > 0 && (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 140 }}>Дата</th>
                <th style={{ width: 180 }}>№ фактура</th>
                <th style={{ width: 140 }}>Тип</th>
                <th style={{ width: 180 }}>Сума</th>
                <th style={{ width: 140 }}>Статус</th>
                <th style={{ width: 200 }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {items.map((inv) => {
                const amount =
                  inv.total_amount ?? inv.total ?? inv.amount ?? 0;
                const currency =
                  inv.currency_code || contract.currency_code || "BGN";
                const type = inv.invoice_type || inv.type || "INVOICE";
                const status = statusToBG(inv.status || "issued");

                return (
                  <tr
                    key={
                      inv.contract_invoice_id ||
                      inv.invoice_id ||
                      `${inv.invoice_number}-${inv.issue_date || inv.created_at}`
                    }
                  >
                    <td>
                      {formatDateDMYLocal(inv.issue_date || inv.created_at)}
                    </td>
                    <td className="mono">
                      {inv.invoice_number || inv.number || "—"}
                    </td>
                    <td>{type === "PROFORMA" ? "Проформа" : "Фактура"}</td>
                    <td>
                      {Number(amount || 0).toLocaleString("bg-BG", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      {currency}
                    </td>
                    <td>{status}</td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          justifyContent: "flex-start",
                        }}
                      >
                        <button
                          type="button"
                          className="btn"
                          onClick={() => openInvoicePdf(inv)}
                          disabled={loading}
                        >
                          Отвори
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => regenerateInvoicePdf(inv)}
                          disabled={loading}
                        >
                          Регенерирай
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
