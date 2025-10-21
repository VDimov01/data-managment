import { useEffect, useState } from "react";
import { getCustomer } from "../../services/customerApi";
import {api, qs} from '../../services/api.js';

const DEFAULTS = {
  customer_type: "Individual",

  // Individual
  first_name: "",
  middle_name: "",
  last_name: "",

  // Company + representative
  company_name: "",
  rep_first_name: "",
  rep_middle_name: "",
  rep_last_name: "",

  // Contact & address
  email: "",
  phone: "",
  secondary_phone: "",
  country: "България",
  city: "",
  address_line: "",
  postal_code: "",

  // IDs & misc
  tax_id: "",
  vat_number: "",
  national_id: "",
  is_active: true,
  notes: ""
};

export default function CustomerForm({ editCustomer = null, onClose, onSave }) {
  const isEdit = Boolean(editCustomer?.customer_id);

  const [initial, setInitial] = useState(null);
  const [form, setForm] = useState(DEFAULTS);
  const [err, setErr] = useState("");

  // Fetch full record if editing
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isEdit) {
        setInitial(null);
        setForm(DEFAULTS);
        return;
      }
      try {
        const data = await getCustomer(editCustomer.customer_id);
        if (cancelled) return;
        setInitial(data || null);

        // hydrate form from server row; coerce booleans
        setForm({
          ...DEFAULTS,
          ...(data || {}),
          customer_type: data?.customer_type === "Company" ? "Company" : "Individual",
          is_active: !!(data?.is_active ?? true),
          // if backend decrypts national_id, this will be plain text;
          // if you still see 'v1:...' here, your decrypt isn’t wired.
          national_id: data?.national_id ?? ""
        });
      } catch (e) {
        if (!cancelled) {
          setInitial(null);
          setForm(DEFAULTS);
        }
      }
    })();
    return () => { cancelled = true; };
    // re-run if you pick another row to edit
  }, [isEdit, editCustomer?.customer_id]);

  // generic change handlers
  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const onText = (k) => (e) => setField(k, e.target.value);
  const onCheck = (k) => (e) => setField(k, !!e.target.checked);

  // reset errors when the key fields change
  useEffect(() => { setErr(""); }, [form.customer_type, form.first_name, form.last_name, form.company_name]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    // same validation you had, but against `form`
    if (form.customer_type === "Individual" && !form.first_name && !form.last_name) {
      setErr("За индивидуален клиент, поне едно от имената е задължително. (собствено име, фамилия)");
      return;
    }
    if (form.customer_type === "Company" && !form.company_name) {
      setErr("За фирмен клиент, името на фирмата е задължително.");
      return;
    }

    const payload = {
      customer_type: form.customer_type,
      // individual
      first_name: emptyNull(form.first_name),
      middle_name: emptyNull(form.middle_name),
      last_name: emptyNull(form.last_name),
      // company
      company_name: emptyNull(form.company_name),
      rep_first_name: emptyNull(form.rep_first_name),
      rep_middle_name: emptyNull(form.rep_middle_name),
      rep_last_name: emptyNull(form.rep_last_name),
      // contacts
      email: emptyNull(form.email),
      phone: emptyNull(form.phone),
      secondary_phone: emptyNull(form.secondary_phone),
      // address
      country: emptyNull(form.country),
      city: emptyNull(form.city),
      address_line: emptyNull(form.address_line),
      postal_code: emptyNull(form.postal_code),
      // ids
      tax_id: emptyNull(form.tax_id),
      vat_number: emptyNull(form.vat_number),
      national_id: emptyNull(form.national_id),
      // misc
      notes: emptyNull(form.notes),
      is_active: form.is_active ? 1 : 0
    };

    try {
      await onSave(payload, initial || null);
    } catch (e) {
      setErr(e.message || "Save failed");
    }
  };

  return (
  <form className="cust-form" onSubmit={handleSubmit}>
    {/* Type */}
    <div className="cust-row">
      <label>Тип</label>
      <select
        className="select"
        value={form.customer_type}
        onChange={(e) =>
          setField("customer_type", e.target.value === "Company" ? "Company" : "Individual")
        }
      >
        <option value="Individual">Индивидуален клиент</option>
        <option value="Company">Фирмен клиент</option>
      </select>
    </div>

    {/* Individual vs Company */}
    {form.customer_type === "Individual" ? (
      <div className="cust-grid">
        <div className="cust-field">
          <label>Собствено име</label>
          <input className="input" value={form.first_name} onChange={onText("first_name")} />
        </div>
        <div className="cust-field">
          <label>Бащино име</label>
          <input className="input" value={form.middle_name} onChange={onText("middle_name")} />
        </div>
        <div className="cust-field">
          <label>Фамилия</label>
          <input className="input" value={form.last_name} onChange={onText("last_name")} />
        </div>
      </div>
    ) : (
      <>
        <div className="cust-field">
          <label>Име на фирмата *</label>
          <input className="input" value={form.company_name} onChange={onText("company_name")} required />
        </div>
        <div className="cust-grid">
          <div className="cust-field">
            <label>Представител — Собствено име</label>
            <input className="input" value={form.rep_first_name} onChange={onText("rep_first_name")} />
          </div>
          <div className="cust-field">
            <label>Представител — Бащино име</label>
            <input className="input" value={form.rep_middle_name} onChange={onText("rep_middle_name")} />
          </div>
          <div className="cust-field">
            <label>Представител — Фамилия</label>
            <input className="input" value={form.rep_last_name} onChange={onText("rep_last_name")} />
          </div>
        </div>
      </>
    )}

    {/* Contacts */}
    <div className="cust-grid">
      <div className="cust-field">
        <label>Email</label>
        <input className="input" type="email" value={form.email} onChange={onText("email")} />
      </div>
      <div className="cust-field">
        <label>Телефон</label>
        <input className="input" value={form.phone} onChange={onText("phone")} />
      </div>
      <div className="cust-field">
        <label>Допълнителен телефон</label>
        <input className="input" value={form.secondary_phone} onChange={onText("secondary_phone")} />
      </div>
    </div>

    {/* Address */}
    <div className="cust-grid">
      <div className="cust-field">
        <label>Държава</label>
        <input className="input" value={form.country} onChange={onText("country")} placeholder="България" />
      </div>
      <div className="cust-field">
        <label>Град</label>
        <input className="input" value={form.city} onChange={onText("city")} />
      </div>
      <div className="cust-field">
        <label>Пощенски код</label>
        <input className="input" value={form.postal_code} onChange={onText("postal_code")} />
      </div>
    </div>

    <div className="cust-field">
      <label>Адрес</label>
      <input className="input" value={form.address_line} onChange={onText("address_line")} />
    </div>

    {/* IDs */}
    <div className="cust-grid">
     {form.customer_type === "Individual" ? (
        <div className="cust-field">
          <label>ЕГН</label>
          <input className="input" value={form.national_id} onChange={onText("national_id")} />
        </div>
     )
      :
      <div className="cust-field">
        <label>Данъчен номер (ЕИК/ЕИК по Булстат)</label>
        <input className="input" value={form.tax_id} onChange={onText("tax_id")} />
      </div>
    } 

      <div className="cust-field">
        <label>ДДС номер</label>
        <input className="input" value={form.vat_number} onChange={onText("vat_number")} />
      </div>
    </div>

    {/* Active */}
    <div className="cust-row">
      <label className="cust-check">
        <input type="checkbox" checked={!!form.is_active} onChange={onCheck("is_active")} /> Активен
      </label>
    </div>

    {/* Notes */}
    <div className="cust-field">
      <label>Бележки</label>
      <textarea className="input" rows={3} value={form.notes} onChange={onText("notes")} />
    </div>

    {err && <div className="text-danger">{err}</div>}

    <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
      <button type="button" className="btn" onClick={onClose}>Отказ</button>
      <button type="submit" className="btn btn-primary">
        {isEdit ? "Запази промените" : "Създай клиент"}
      </button>
    </div>
  </form>
);

}

function emptyNull(s) {
  return (s == null || String(s).trim() === "") ? null : s;
}
