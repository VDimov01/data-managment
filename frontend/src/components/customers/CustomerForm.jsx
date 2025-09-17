import { useEffect, useState } from "react";

export default function CustomerForm({ initial = null, onClose, onSave }) {
  const isEdit = Boolean(initial);

  const [customer_type, setCustomerType] = useState(initial?.customer_type || "Individual");

  // Individual
  const [first_name, setFirst] = useState(initial?.first_name || "");
  const [middle_name, setMiddle] = useState(initial?.middle_name || "");
  const [last_name, setLast] = useState(initial?.last_name || "");

  // Company + representative
  const [company_name, setCompany] = useState(initial?.company_name || "");
  const [rep_first_name, setRepFirst] = useState(initial?.rep_first_name || "");
  const [rep_middle_name, setRepMiddle] = useState(initial?.rep_middle_name || "");
  const [rep_last_name, setRepLast] = useState(initial?.rep_last_name || "");

  // Contact & address
  const [email, setEmail] = useState(initial?.email || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [secondary_phone, setPhone2] = useState(initial?.secondary_phone || "");
  const [country, setCountry] = useState(initial?.country || "BG");
  const [city, setCity] = useState(initial?.city || "");
  const [address_line, setAddress] = useState(initial?.address_line || "");
  const [postal_code, setPostal] = useState(initial?.postal_code || "");

  // IDs & misc
  const [tax_id, setTax] = useState(initial?.tax_id || "");
  const [vat_number, setVat] = useState(initial?.vat_number || "");
  const [national_id, setNatId] = useState(initial?.national_id || "");
  const [is_active, setActive] = useState(initial?.is_active ? true : true);
  const [notes, setNotes] = useState(initial?.notes || "");

  // Keep type-specific minimal validation hints
  const [err, setErr] = useState("");

  useEffect(() => {
    setErr("");
  }, [customer_type, first_name, last_name, company_name]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Minimal front-side validation mirroring backend
    if (customer_type === "Individual" && !first_name && !last_name) {
      setErr("For Individual, at least first or last name is required.");
      return;
    }
    if (customer_type === "Company" && !company_name) {
      setErr("For Company, company name is required.");
      return;
    }

    const payload = {
      customer_type,
      // individual
      first_name: emptyNull(first_name),
      middle_name: emptyNull(middle_name),
      last_name: emptyNull(last_name),
      // company
      company_name: emptyNull(company_name),
      rep_first_name: emptyNull(rep_first_name),
      rep_middle_name: emptyNull(rep_middle_name),
      rep_last_name: emptyNull(rep_last_name),
      // contacts
      email: emptyNull(email),
      phone: emptyNull(phone),
      secondary_phone: emptyNull(secondary_phone),
      // address
      country: emptyNull(country),
      city: emptyNull(city),
      address_line: emptyNull(address_line),
      postal_code: emptyNull(postal_code),
      // ids
      tax_id: emptyNull(tax_id),
      vat_number: emptyNull(vat_number),
      national_id: emptyNull(national_id),
      // misc
      notes: emptyNull(notes),
      is_active: is_active ? 1 : 0
    };

    try {
      await onSave(payload, initial || null);
    } catch (e) {
      setErr(e.message || "Save failed");
    }
  };

  return (
    <div className="cust-modal-overlay" onMouseDown={(e) => { if (e.target.classList.contains("cust-modal-overlay")) onClose?.(); }}>
      <div className="cust-modal" role="dialog" aria-modal="true">
        <div className="cust-modal-header">
          <h3>{isEdit ? "Edit Customer" : "Add Customer"}</h3>
          <button className="cust-icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form className="cust-form" onSubmit={handleSubmit}>
          <div className="cust-row">
            <label>Type</label>
            <select value={customer_type} onChange={(e) => setCustomerType(e.target.value)}>
              <option value="Individual">Individual</option>
              <option value="Company">Company</option>
            </select>
          </div>

          {customer_type === "Individual" ? (
            <>
              <div className="cust-grid">
                <div className="cust-field">
                  <label>First name</label>
                  <input value={first_name} onChange={(e) => setFirst(e.target.value)} />
                </div>
                <div className="cust-field">
                  <label>Middle name</label>
                  <input value={middle_name} onChange={(e) => setMiddle(e.target.value)} />
                </div>
                <div className="cust-field">
                  <label>Last name</label>
                  <input value={last_name} onChange={(e) => setLast(e.target.value)} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="cust-field">
                <label>Company name *</label>
                <input value={company_name} onChange={(e) => setCompany(e.target.value)} required />
              </div>
              <div className="cust-grid">
                <div className="cust-field">
                  <label>Representative — First</label>
                  <input value={rep_first_name} onChange={(e) => setRepFirst(e.target.value)} />
                </div>
                <div className="cust-field">
                  <label>Representative — Middle</label>
                  <input value={rep_middle_name} onChange={(e) => setRepMiddle(e.target.value)} />
                </div>
                <div className="cust-field">
                  <label>Representative — Last</label>
                  <input value={rep_last_name} onChange={(e) => setRepLast(e.target.value)} />
                </div>
              </div>
            </>
          )}

          <div className="cust-grid">
            <div className="cust-field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="cust-field">
              <label>Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="cust-field">
              <label>Secondary phone</label>
              <input value={secondary_phone} onChange={(e) => setPhone2(e.target.value)} />
            </div>
          </div>

          <div className="cust-grid">
            <div className="cust-field">
              <label>Country</label>
              <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="BG" />
            </div>
            <div className="cust-field">
              <label>City</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="cust-field">
              <label>Postal code</label>
              <input value={postal_code} onChange={(e) => setPostal(e.target.value)} />
            </div>
          </div>

          <div className="cust-field">
            <label>Address</label>
            <input value={address_line} onChange={(e) => setAddress(e.target.value)} />
          </div>

          <div className="cust-grid">
            <div className="cust-field">
              <label>Tax ID (EIK/UIC)</label>
              <input value={tax_id} onChange={(e) => setTax(e.target.value)} />
            </div>
            <div className="cust-field">
              <label>VAT Number</label>
              <input value={vat_number} onChange={(e) => setVat(e.target.value)} />
            </div>
            <div className="cust-field">
              <label>National ID</label>
              <input value={national_id} onChange={(e) => setNatId(e.target.value)} />
            </div>
          </div>

          <div className="cust-row">
            <label className="cust-check">
              <input type="checkbox" checked={!!is_active} onChange={(e) => setActive(e.target.checked)} />
              Active
            </label>
          </div>

          <div className="cust-field">
            <label>Notes</label>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {err && <div className="cust-err">{err}</div>}

          <div className="cust-actions">
            <button type="button" className="cust-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="cust-btn primary">{isEdit ? "Save changes" : "Create customer"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function emptyNull(s) {
  return (s == null || String(s).trim() === "") ? null : s;
}
