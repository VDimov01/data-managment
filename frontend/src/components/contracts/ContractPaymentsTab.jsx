import React, { useEffect, useState } from "react";
import { api } from "../../services/api";
import { formatDateDMYLocal } from "../../utils/dates";

export default function ContractPaymentsTab({ contract }) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);

  const [form, setForm] = useState({
    amount: "",
    paid_at: "",
    method: "bank_transfer",
    reference: "",
    note: ""
  });

  const [invoiceBusyId, setInvoiceBusyId] = useState(null); // <-- НОВО

  const load = async () => {
    setLoading(true);
    try {
      const data = await api(`/contracts/${contract.contract_id}/payments`);
      setItems(Array.isArray(data.payments) ? data.payments : []);
      setSummary({
        contract_total: data.contract_total,
        paid_total: data.paid_total,
        remaining: data.outstanding_total,
        currency_code: data.currency_code
      });
    } catch (e) {
      alert(`Грешка при зареждане на плащанията: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract.contract_id]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount) {
      alert("Въведи сума.");
      return;
    }
    setLoading(true);
    try {
      await api(`/contracts/${contract.contract_id}/payments`, {
        method: "POST",
        body: {
          amount: form.amount,
          paid_at: form.paid_at || undefined,
          method: form.method || undefined,
          reference: form.reference || undefined,
          note: form.note || undefined
        }
      });
      // reset form
      setForm({
        amount: "",
        paid_at: "",
        method: "bank_transfer",
        reference: "",
        note: ""
      });
      await load();
    } catch (e) {
      alert(`Грешка при запис на плащане: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ===== генериране на фактура от конкретно плащане =====
  const createInvoiceFromPayment = async (p) => {
    if (!p?.contract_payment_id) {
      alert("Липсва ID на плащане (contract_payment_id).");
      return;
    }

    const ok = window.confirm(
      `Да издадем фактура за това плащане (${Number(p.amount || 0).toLocaleString("bg-BG", { minimumFractionDigits: 2 })} ${p.currency_code})?`
    );
    if (!ok) return;

    setInvoiceBusyId(p.contract_payment_id);
    try {
      const data = await api(`/contracts/${contract.contract_id}/invoices`, {
        method: "POST",
        body: {
          contract_payment_id: p.contract_payment_id,
          mode: "PAYMENT",
          type: "INVOICE"
          // ако бекендът иска още нещо – напр. invoice_type: 'INVOICE'
        }
      });

      const inv =
        data.invoice ||
        data.created ||
        data ||
        {};

      const num = inv.invoice_number || inv.number || "—";
      alert(`Създадена е фактура № ${num}.`);

      // ако искаш да рефрешнеш таба Фактури – AttachmentsModal така или иначе ще го прави
    } catch (e) {
      alert(`Грешка при създаване на фактура: ${e.message}`);
    } finally {
      setInvoiceBusyId(null);
    }
  };

  return (
    <div className="contract-payments-tab">
      {/* ===== Summary ===== */}
      {summary && (
        <div className="pay-grid">
          <div className="pay-card">
            <div className="pay-label">Обща стойност на договора</div>
            <div className="pay-amt">
              {Number(summary.contract_total || 0).toLocaleString("bg-BG", { minimumFractionDigits: 2 })} {summary.currency_code}
            </div>
          </div>
          <div className="pay-card">
            <div className="pay-label">Платено до момента</div>
            <div className="pay-amt">
              {Number(summary.paid_total || 0).toLocaleString("bg-BG", { minimumFractionDigits: 2 })} {summary.currency_code}
            </div>
          </div>
          <div className="pay-card">
            <div className="pay-label">Остава за плащане</div>
            <div className="pay-amt">
              {Number(summary.remaining || 0).toLocaleString("bg-BG", { minimumFractionDigits: 2 })} {summary.currency_code}
            </div>
          </div>
        </div>
      )}

      {/* ===== Form ===== */}
      <form className="payments-form" onSubmit={onSubmit}>
        <div className="pay-form-grid">
          <div className="form-field">
            <label className="lbl" htmlFor="pay-amount">Сума *</label>
            <input
              id="pay-amount"
              className="input"
              type="number"
              step="0.01"
              name="amount"
              value={form.amount}
              onChange={onChange}
              required
            />
          </div>

          <div className="form-field">
            <label className="lbl" htmlFor="pay-date">Дата на плащане</label>
            <input
              id="pay-date"
              className="input"
              type="date"
              name="paid_at"
              value={form.paid_at}
              onChange={onChange}
            />
          </div>

          <div className="form-field">
            <label className="lbl" htmlFor="pay-method">Метод</label>
            <select
              id="pay-method"
              className="input"
              name="method"
              value={form.method}
              onChange={onChange}
            >
              <option value="bank_transfer">Банков превод</option>
              <option value="cash">В брой</option>
              <option value="card">Карта</option>
              <option value="other">Друг</option>
            </select>
          </div>

          <div className="form-field">
            <label className="lbl" htmlFor="pay-ref">Reference / № документ</label>
            <input
              id="pay-ref"
              className="input"
              type="text"
              name="reference"
              value={form.reference}
              onChange={onChange}
              placeholder=""
            />
          </div>

          <div className="form-field form-field--wide">
            <label className="lbl" htmlFor="pay-note">Бележка</label>
            <input
              id="pay-note"
              className="input"
              type="text"
              name="note"
              value={form.note}
              onChange={onChange}
              placeholder=""
            />
          </div>
        </div>

        <div className="actions actions--end">
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Записва…" : "Запиши плащане"}
          </button>
        </div>
      </form>

      {/* ===== List ===== */}
      {loading && <div className="text-muted">Зареждане…</div>}
      {!loading && items.length === 0 && (
        <div className="text-muted">Няма въведени плащания по този договор.</div>
      )}

      {!loading && items.length > 0 && (
        <div className="table-wrap">
          <table className="tbl payments-table">
            <thead>
              <tr>
                <th style={{width:140}}>Дата</th>
                <th style={{width:180}}>Сума</th>
                <th style={{width:160}}>Метод</th>
                <th style={{minWidth:180}}>Reference</th>
                <th>Бележка</th>
                <th style={{width:160}}>Фактура</th> {/* НОВО */}
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.contract_payment_id}>
                  <td>{formatDateDMYLocal(p.paid_at || p.created_at)}</td>
                  <td>
                    {Number(p.amount || 0).toLocaleString("bg-BG", { minimumFractionDigits: 2 })} {p.currency_code}
                  </td>
                  <td>
                    {p.method === "bank_transfer" ? "Банков превод"
                      : p.method === "cash" ? "В брой"
                      : p.method === "card" ? "Карта"
                      : "Друг"}
                  </td>
                  <td className="mono">{p.reference || "—"}</td>
                  <td>{p.note || "—"}</td>
                  <td>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => createInvoiceFromPayment(p)}
                      disabled={invoiceBusyId === p.contract_payment_id}
                    >
                      {invoiceBusyId === p.contract_payment_id ? "Създава…" : "Издай фактура"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
