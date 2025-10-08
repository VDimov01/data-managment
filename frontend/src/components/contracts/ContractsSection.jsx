// frontend/src/components/ContractsSection.jsx
import React, { useEffect, useMemo, useState } from "react";
import ContractsList from "./ContractsList.jsx";

/** Tiny API wrapper using apiBase from props */
export function makeApi(apiBase) {
  return async function api(path, { method = "GET", body } = {}) {
    const url = buildUrl(apiBase, `/api${path}`);
    const r = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include'
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
    return data;
  };
}

/** Safe URL builder that works with absolute or relative apiBase */
export function buildUrl(apiBase, path, params = {}) {
  const base = (apiBase && apiBase.trim()) ? apiBase.trim().replace(/\/+$/, "") : "";
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") qs.append(k, v);
  });
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return `${base}${path}${query}`;
}

export function niceBytes(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return "—";
  const units = ["B","KB","MB","GB"];
  let i = 0, v = x;
  while (v >= 1024 && i < units.length-1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}


// convert YYYY-MM-DD -> 'YYYY-MM-DDT23:59:59'
function toValidUntil(expiresAt) {
  if (!expiresAt) return null;
  return `${expiresAt}T23:59:59`;
}

// build the required buyer snapshot JSON from the chosen customer
function buildBuyerSnapshot(c) {
  if (!c) return null;
  const isCompany = String(c.type || "").toLowerCase() === "company";
  const display =
    c.display_name ||
    (isCompany ? (c.name || c.company_name) : [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ")) ||
    `#${c.customer_id}`;

  return {
    captured_at_utc: new Date().toISOString(),
    customer_id: c.customer_id,
    type: c.type || (isCompany ? "company" : "individual"),
    display_name: display,
    person: {
      first_name: c.first_name || null,
      middle_name: c.middle_name || null,
      last_name: c.last_name || null,
      egn: c.national_id || null,
      tax_id: c.tax_id || null,
    },
    company: {
      legal_name: c.company_name || c.name || null,
      vat_number: c.vat_number || null,
      rep_first_name: c.rep_first_name || null,
      rep_middle_name: c.rep_middle_name || null,
      rep_last_name: c.rep_last_name || null,
    },
    contact: {
      email: c.email || c.email_address || null,
      phone: c.phone_number || c.phone || null,
      secondary_phone: c.secondary_phone || null,
      address: c.address_line || null,
      city: c.city || null,
      country: c.country || null,
      postal_code: c.postal_code || null,
    },
    misc: {
      public_uuid: c.public_uuid || null,
      notes: c.notes || null,
    }
  };
}

export default function ContractsSection({ apiBase = "http://localhost:5000" }) {
  const api = makeApi(apiBase);

  const [tab, setTab] = useState("browse"); // 'create' | 'browse'

  const [specs, setSpecs] = useState([]);     // attachments list
  const [genLoading, setGenLoading] = useState(false);

  // wizard state
  const [step, setStep] = useState(1);
  const [creating, setCreating] = useState(false);
  const [savingItems, setSavingItems] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [renderingDraft, setRenderingDraft] = useState(false);

  // Contract (server copy)
  const [contract, setContract] = useState(null);

  // Form state (draft creation)
  const [customer, setCustomer] = useState(null);
  const [type, setType] = useState("REGULAR"); // 'ADVANCE' | 'REGULAR'
  const [advanceAmount, setAdvanceAmount] = useState(""); // string
  const [currency, setCurrency] = useState("BGN");
  const [expiresAt, setExpiresAt] = useState(""); // YYYY-MM-DD
  const [contractNumber, setContractNumber] = useState("");
  const [note, setNote] = useState("");

  // Items state (client-side, later pushed via PUT /items)
  const [items, setItems] = useState([]);

  const [cancelling, setCancelling] = useState(false);

  async function loadSpecs() {
    if (!contract?.contract_id) return;
    try {
      const data = await api(`/contracts/${contract.contract_id}/specs-pdfs`, { method: 'GET' });
      setSpecs(data.attachments || []);
    } catch (e) {
      // silent
    }
  }

  useEffect(() => {
  if (step === 3 && contract?.contract_id) loadSpecs();
}, [step, contract?.contract_id]);

  async function handleGenerateSpecs() {
    if (!contract?.contract_id) return;
    setGenLoading(true);
    try {
      const data = await api(`/contracts/${contract.contract_id}/specs-pdfs`, {
        method: 'POST',
        body: { lang: 'bg' }
      });
      setSpecs(data.attachments || []);
    } catch (e) {
      alert(`Неуспешно генериране на спецификации: ${e.message}`);
    } finally {
      setGenLoading(false);
    }
  }


  const totalClient = useMemo(() => {
    let sum = 0;
    for (const it of items) {
      const qty = Number.isFinite(Number(it.quantity)) ? Number(it.quantity) : 0;
      const price = it.unit_price != null && it.unit_price !== "" ? Number(it.unit_price) : 0;
      sum += qty * price;
    }
    return sum.toFixed(2);
  }, [items]);

  function resetAll() {
    setStep(1);
    setCreating(false);
    setSavingItems(false);
    setIssuing(false);
    setRenderingDraft(false);
    setContract(null);
    setCustomer(null);
    setType("REGULAR");
    setAdvanceAmount("");
    setCurrency("BGN");
    setExpiresAt("");
    setNote("");
    setItems([]);
  }

  async function handleCreateDraft() {
    if (!customer?.customer_id) return alert("Изберете клиент.");
    if (type === "ADVANCE" && !advanceAmount) {
      if (!confirm("Създаване на Авансов договор с 0лв авансово плащане?")) return;
    }

    const buyer_snapshot = buildBuyerSnapshot(customer);
    if (!buyer_snapshot) return alert("Неуспешно генериране на информация за купувача.");

    setCreating(true);
    try {
      const payload = {
        customer_id: customer.customer_id,
        type, // 'REGULAR' | 'ADVANCE'
        currency_code: currency,
        valid_until: toValidUntil(expiresAt),
        note: note || null,
        contract_number: contractNumber || null,
        advance_amount: advanceAmount ? String(advanceAmount) : null,
        // backend stores this as JSON
        buyer_snapshot,
        buyer_snapshot_json: buyer_snapshot, // tolerate either key
      };
      const data = await api(`/contracts`, { method: "POST", body: payload });
      setContract(data);
      setStep(2);
      setTab("create");
    } catch (e) {
      alert(`Неуспешно създаване: ${e.message}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveItems() {
    if (!contract?.contract_id) return;
    if (items.length === 0) return alert("Добавете поне едно превозно средство.");

    setSavingItems(true);
    try {
      const payloadItems = items.map(it => {
        const obj = {
          vehicle_id: it.vehicle_id,
          quantity: Math.max(1, parseInt(it.quantity || 1, 10)),
        };
        if (it.unit_price !== "" && it.unit_price != null) obj.unit_price = String(it.unit_price);
        return obj;
      });
      await api(`/contracts/${contract.contract_id}/items`, {
        method: "PUT",
        body: { items: payloadItems },
      });
      alert("Артикулите са запазени.");
      setStep(3);
    } catch (e) {
      alert(`Неуспешно запазване на артикулите: ${e.message}`);
    } finally {
      setSavingItems(false);
    }
  }

  async function handleRenderDraftPdf() {
    if (!contract?.contract_id) return;
    setRenderingDraft(true);
    try {
      const data = await api(`/contracts/${contract.contract_id}/pdf`, {
        method: "POST",
        body: {},
      });
      if (data?.pdf?.signedUrl && confirm("Open draft PDF now?")) {
        window.open(data.pdf.signedUrl, "_blank", "noopener,noreferrer");
      }
      // reflect that contract has a latest pdf
      setContract(prev => prev ? { ...prev, latest_pdf_id: data.latest_pdf_id || prev.latest_pdf_id } : prev);
    } catch (e) {
      alert(`Неуспешно генериране на чернова PDF: ${e.message}`);
    } finally {
      setRenderingDraft(false);
    }
  }

  async function handleIssue() {
    if (!contract?.contract_id) return;
    setIssuing(true);
    try {
      const data = await api(`/contracts/${contract.contract_id}/issue`, {
        method: "POST",
        body: { override_reserved: false },
      });
      if (data?.pdf?.signedUrl && confirm("Open PDF now?")) {
        window.open(data.pdf.signedUrl, "_blank", "noopener,noreferrer");
      }
      setContract(prev => ({ ...prev, status: "issued", issued_at: new Date().toISOString() }));
    } catch (e) {
      alert(`Издаване неуспешно: ${e.message}`);
    } finally {
      setIssuing(false);
    }
  }


async function handleCancel() {
  if (!contract?.contract_id) return;
  if (!confirm('Отмени договора и освободи превозните средства?')) return;

  setCancelling(true);
  try {
    const data = await api(`/contracts/${contract.contract_id}/cancel`, {
      method: 'POST',
      body: { force: false }, // set true if you decide to allow cancelling signed contracts
    });
    alert(`Отменен. Освободени ${data.released_count} превозни средства.`);
    setContract(prev => ({ ...prev, status: 'withdrawn' }));
  } catch (e) {
    alert(`Отмяна неуспешна: ${e.message}`);
  } finally {
    setCancelling(false);
  }
}

// Add these handlers inside ContractsSection
const [creatingHandover, setCreatingHandover] = useState(false);
const [issuingAllHandover, setIssuingAllHandover] = useState(false);

async function handleCreateHandoverDrafts() {
  if (!contract?.contract_id) return;
  setCreatingHandover(true);
  try {
    await fetch(buildUrl(apiBase, `/api/handover/bulk-from-contract/${contract.contract_id}`), {
      method: 'POST', credentials: 'include'
    }).then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); });
    alert('Създадени са чернови за всички линии.');
  } catch (e) {
    alert(`Грешка: ${e.message}`);
  } finally { setCreatingHandover(false); }
}

async function handleIssueAllHandover() {
  if (!contract?.contract_id) return;
  setIssuingAllHandover(true);
  try {
    const data = await fetch(buildUrl(apiBase, `/api/handover/by-contract/${contract.contract_id}`), { credentials: 'include' })
      .then(r => r.json());
    const list = Array.isArray(data.items) ? data.items : [];
    for (const hr of list) {
      if (hr.status === 'draft') {
        const d = await fetch(buildUrl(apiBase, `/api/handover/${hr.handover_record_id}/issue`), { method:'POST', credentials: 'include' })
          .then(r=>r.json());
        if (d?.pdf?.signedUrl) window.open(d.pdf.signedUrl, '_blank', 'noopener,noreferrer');
      }
    }
    alert('Готово.');
  } catch (e) {
    alert(`Грешка: ${e.message}`);
  } finally { setIssuingAllHandover(false); }
}




  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>
      <div className="tabs">
        <button className={`tab ${tab === 'browse' ? 'active' : ''}`} onClick={() => setTab('browse')}>Browse</button>
        <button className={`tab ${tab === 'create' ? 'active' : ''}`} onClick={() => setTab('create')}>New contract</button>
      </div>

      {tab === "create" && (
        <>
          <h2 style={{ marginBottom: 8 }}>Contracts</h2>
          <div style={{ color: "#6b7280", marginBottom: 16 }}>
            Step {step} of 3 &mdash; <em>{["Create draft", "Add vehicles & prices", "Render or Issue"][step - 1]}</em>
          </div>

          {step === 1 && (
            <div className="card">
              <div className="card-body">
                <CustomerPicker apiBase={apiBase} value={customer} onChange={setCustomer} />

                <div className="row">
                  <div className="col">
                    <label className="lbl">Type</label>
                    <div className="seg">
                      <label className="seg-item">
                        <input type="radio" checked={type === "REGULAR"} onChange={() => setType("REGULAR")} />
                        <span>Regular</span>
                      </label>
                      <label className="seg-item">
                        <input type="radio" checked={type === "ADVANCE"} onChange={() => setType("ADVANCE")} />
                        <span>Advance</span>
                      </label>
                    </div>
                  </div>

                  <div className="col">
                    <label className="lbl">Currency</label>
                    <select value={currency} onChange={e => setCurrency(e.target.value)} className="inp">
                      <option value="BGN">BGN</option>
                      <option value="EUR">EUR</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>

                  <div className="col">
                    <label className="lbl">Valid until</label>
                    <input type="date" className="inp" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
                  </div>
                </div>

                {type === "ADVANCE" && (
                  <div className="row">
                    <div className="col">
                      <label className="lbl">Advance amount</label>
                      <MoneyInput value={advanceAmount} onChange={setAdvanceAmount} placeholder="0.00" />
                    </div>
                  </div>
                )}

                <div className="row">
                  <div className="col">
                    <label className="lbl">Contract number</label>
                    <input type="text" className="inp" value={contractNumber} onChange={e => setContractNumber(e.target.value)} />
                  </div>
                </div>

                <div className="row">
                  <div className="col-12">
                    <label className="lbl">Internal note</label>
                    <textarea className="inp" value={note} onChange={e => setNote(e.target.value)} />
                  </div>
                </div>

                <div className="actions">
                  <button className="btn secondary" onClick={resetAll}>Reset</button>
                  <button className="btn primary" onClick={handleCreateDraft} disabled={creating}>
                    {creating ? "Creating..." : "Create draft"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && contract && (
            <ItemsStep
              apiBase={apiBase}
              contract={contract}
              customer={customer}
              items={items}
              setItems={setItems}
              totalClient={totalClient}
              currency={currency}
              onBack={() => setStep(1)}
              onSave={handleSaveItems}
              saving={savingItems}
            />
          )}

          {step === 3 && contract && (
  <div className="card">
    <div className="card-body">
      <HeaderSummary contract={contract} customer={customer} />

      <p className="muted">
        You can <strong>Render a draft PDF</strong> (keeps status = draft), or <strong>Issue</strong> which
        generates a new PDF version and reserves the vehicles.
      </p>

      {/* --- Spec PDFs (internal, per-edition) --- */}
      <div className="row">
        <div className="col">
          <label className="lbl">Spec PDF (internal)</label>
          <div className="actions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn" onClick={handleGenerateSpecs} disabled={genLoading}>
              {genLoading ? 'Generating…' : 'Generate spec pack (BG)'}
            </button>
          </div>

          {specs.length === 0 ? (
            <div className="muted" style={{ marginTop: 8 }}>No spec attachments yet.</div>
          ) : (
            <div className="list" style={{ marginTop: 8 }}>
              {specs.map(a => (
                <div key={a.edition_specs_pdf_id} className="list-item">
                  <div className="line-1">
                    <strong>{a.filename}</strong> — v{a.version}
                  </div>
                  <div className="line-2">
                    SHA256: {a.sha256?.slice(0, 12)}… • {Math.round((a.byte_size || 0) / 1024)} KB
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <a className="btn" href={a.signedUrl} target="_blank" rel="noreferrer">Open (signed)</a>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button className="btn" onClick={handleCreateHandoverDrafts} disabled={creatingHandover}>
            {creatingHandover ? 'Създаване…' : 'Чернови протоколи (всички)'}
          </button>
          <button className="btn" onClick={handleIssueAllHandover} disabled={issuingAllHandover}>
            {issuingAllHandover ? 'Генериране…' : 'Генерирай всички протоколи'}
          </button>
        </div>
      </div>

      {/* --- Actions --- */}
      <div className="actions">
        <div>
          {/* Danger zone: cancel & release */}
          <button
            className="btn danger"
            onClick={handleCancel}
            disabled={cancelling || contract.status === 'withdrawn' || contract.status === 'draft'}
          >
            {cancelling ? 'Cancelling…' : 'Cancel & release vehicles'}
          </button>
        </div>

        <button className="btn secondary" onClick={() => setStep(2)}>Back</button>

        <button className="btn" onClick={handleRenderDraftPdf} disabled={renderingDraft}>
          {renderingDraft ? 'Rendering…' : 'Render draft PDF'}
        </button>

        <button className="btn success" onClick={handleIssue} disabled={issuing}>
          {issuing ? 'Issuing...' : 'Issue & generate PDF'}
        </button>
      </div>
    </div>
  </div>
)}

        </>
      )}

      {tab === "browse" && (
        <ContractsList
          apiBase={apiBase}
          onOpenLatest={async (uuid) => {
            try {
              const url = buildUrl(apiBase, `/api/contracts/${uuid}/pdf/latest`);
              const r = await fetch(url, { method: "GET", credentials: 'include' });
              const data = await r.json();
              if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
              if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
            } catch (e) {
              alert(`Open latest failed: ${e.message}`);
            }
          }}
          onRegenerate={async (id) => {
            try {
              const url = buildUrl(apiBase, `/api/contracts/${id}/pdf`);
              const r = await fetch(url, { method: "POST", credentials: 'include' });
              const data = await r.json();
              if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
              if (data?.pdf?.signedUrl && confirm("Open regenerated PDF?")) {
                window.open(data.pdf.signedUrl, "_blank", "noopener,noreferrer");
              }
            } catch (e) {
              alert(`Regenerate failed: ${e.message}`);
            }
          }}
          onIssue={async (id) => {
            try {
              const url = buildUrl(apiBase, `/api/contracts/${id}/issue`);
              const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ override_reserved: false }), credentials: 'include' });
              const data = await r.json();
              if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
              if (data?.pdf?.signedUrl && confirm("Open PDF now?")) {
                window.open(data.pdf.signedUrl, "_blank", "noopener,noreferrer");
              }
              // setContract(prev => ({ ...prev, status: "issued", issued_at: new Date().toISOString() }));
            } catch (e) {
              alert(`Issue failed: ${e.message}`);
            }
          }}
        />
      )}

      <style>{css}</style>
    </div>
  );
}

/** ---------- Subcomponents ---------- */

function HeaderSummary({ contract, customer }) {
  const status = (contract?.status || "draft").toUpperCase();
  return (
    <div className="sum">
      <div><strong>Contract:</strong> #{contract.contract_id} — {contract.uuid}</div>
      <div><strong>Status:</strong> {status} ({contract.type})</div>
      <div><strong>Customer:</strong> {displayCustomer(customer)}</div>
    </div>
  );
}

function displayCustomer(c) {
  if (!c) return "—";
  if (c.display_name) return c.display_name;
  if (c.type === "company") return c.name || c.company_name || "Company";
  const parts = [c.first_name, c.middle_name, c.last_name].filter(Boolean);
  return parts.join(" ") || "Individual";
}

/** === Customer search wired safely (no new URL) === */
function CustomerPicker({ apiBase, value, onChange }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const url = buildUrl(apiBase, '/api/customers', { page: 1, limit: 50, q: q.trim() || undefined });
      const r = await fetch(url, { credentials: 'include' });
      const data = await r.json();
      setList(data.customers || data.items || data.rows || []);
    } catch (e) {
      alert(`Customer search failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCustomers(); /* auto-search on q */ }, [q]);

  return (
    <div className="row">
      <div className="col-8">
        <label className="lbl">Customer</label>
        <div className="picker">
          <input
            className="inp"
            placeholder="Search customers…"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === "Enter" && loadCustomers()}
          />
          <button className="btn" onClick={loadCustomers} disabled={loading}>
            {loading ? "…" : "Search"}
          </button>
        </div>

        <div className="list">
          {list.map(c => (
            <button
              key={c.customer_id}
              className={`list-item ${value?.customer_id === c.customer_id ? "active" : ""}`}
              onClick={() => onChange(c)}
            >
              <div className="line-1">{displayCustomer(c)}</div>
              <div className="line-2">
                {c.email || c.phone_number || c.public_uuid || c.vat_number || ""}
              </div>
            </button>
          ))}
          {list.length === 0 && <div className="muted">No customers.</div>}
        </div>
      </div>

      <div className="col">
        <label className="lbl">Selected</label>
        <div className="box">
          {value ? (
            <>
              <div><strong>{displayCustomer(value)}</strong></div>
              <div className="muted">{value.type}</div>
            </>
          ) : (
            <div className="muted">Pick a customer.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemsStep({ apiBase, contract, customer, items, setItems, totalClient, currency, onBack, onSave, saving }) {
  return (
    <div className="card">
      <div className="card-body">
        <HeaderSummary contract={contract} customer={customer} />
        <VehiclePicker apiBase={apiBase} onPick={v => {
          if (items.some(x => x.vehicle_id === v.vehicle_id)) return;
          setItems(prev => [...prev, {
            vehicle_id: v.vehicle_id,
            quantity: 1,
            unit_price: v.asking_price ?? "",
            display: v,
          }]);
        }} />

        <ItemsTable
          items={items}
          onChange={(idx, upd) => setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...upd } : it)))}
          onRemove={idx => setItems(prev => prev.filter((_, i) => i !== idx))}
        />

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <div className="col" style={{ maxWidth: 260 }}>
            <div className="tot-box">
              <div className="tot-label">Client total (display only):</div>
              <div className="tot-amt">{currency} {totalClient}</div>
              <div className="tot-note">* Authoritative total is set by the server when issuing</div>
            </div>
          </div>
        </div>

        <div className="actions">
          <button className="btn secondary" onClick={onBack}>Back</button>
          <button className="btn primary" onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : "Save items"}
          </button>
        </div>
      </div>
    </div>
  );
}

function VehiclePicker({ apiBase, onPick }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);

  const doSearch = async () => {
    setLoading(true);
    try {
      const url = buildUrl(apiBase, '/api/vehicles', { available: 1, q: q.trim() || undefined });
      const r = await fetch(url, { credentials: 'include' });
      const res = await r.json();
      // tolerate various payloads
      const rows = Array.isArray(res) ? res : (res.vehicles || res.items || res.rows || []);
      setList(rows);
    } catch (e) {
      alert(`Vehicle search failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="row">
      <div className="col-12">
        <label className="lbl">Add vehicles</label>
        <div className="picker">
          <input
            className="inp"
            placeholder="Search vehicles (VIN, model, edition)…"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === "Enter" && doSearch()}
          />
          <button className="btn" onClick={doSearch} disabled={loading}>
            {loading ? "…" : "Search"}
          </button>
        </div>

        {list.length > 0 && (
          <div className="list">
            {list.map(v => (
              <button key={v.vehicle_id} className="list-item" onClick={() => onPick(v)}>
                <div className="line-1">
                  {/* Tolerate your different field names across endpoints */}
                  {(v.make_name || v.make) || ""} {(v.model_name || v.model) || ""} {v.year ? `(${v.year})` : (v.model_year ? `(${v.model_year})` : "")} — {(v.edition_name || v.edition || "Edition")}
                </div>
                <div className="line-2">
                  VIN: {v.vin || "—"} • Color: {(v.exterior_color || v.exterior_color_name || "—")} / {(v.interior_color || v.interior_color_name || "—")}
                  • City: {v.shop_city || "—"} • Mileage: {(v.mileage_km ?? v.mileage ?? "—")} km
                  {"  "}• Asking: {v.asking_price != null ? String(v.asking_price) : "—"}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ItemsTable({ items, onChange, onRemove }) {
  if (items.length === 0) return <div className="muted" style={{ marginTop: 8 }}>No vehicles added yet.</div>;
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th style={{minWidth: 260}}>Vehicle</th>
            <th style={{width: 100}}>Qty</th>
            <th style={{width: 160}}>Unit price</th>
            <th style={{width: 140}}>Subtotal</th>
            <th style={{width: 60}}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => {
            const d = it.display || {};
            const qty = Math.max(1, parseInt(it.quantity || 1, 10));
            const price = it.unit_price != null && it.unit_price !== "" ? Number(it.unit_price) : 0;
            const sub = (qty * price).toFixed(2);
            return (
              <tr key={`${it.vehicle_id}-${idx}`}>
                <td>
                  <div className="v-title">
                    {(d.make_name || d.make) || ""} {(d.model_name || d.model) || ""} {d.year ? `(${d.year})` : (d.model_year ? `(${d.model_year})` : "")} — {(d.edition_name || d.edition || "Edition")}
                  </div>
                  <div className="muted">
                    VIN: {d.vin || "—"} • Color: {(d.exterior_color || d.exterior_color_name || "—")} / {(d.interior_color || d.interior_color_name || "—")}
                    • City: {d.shop_city || "—"} • Mileage: {(d.mileage_km ?? d.mileage ?? "—")} km
                  </div>
                </td>
                <td>
                  <input
                    type="number"
                    className="inp"
                    min={1}
                    value={it.quantity}
                    onChange={e => onChange(idx, { quantity: e.target.value })}
                  />
                </td>
                <td>
                  <MoneyInput
                    value={it.unit_price ?? ""}
                    onChange={val => onChange(idx, { unit_price: val })}
                    placeholder="(use asking price)"
                  />
                </td>
                <td><strong>{sub}</strong></td>
                <td><button className="btn danger" onClick={() => onRemove(idx)}>✕</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MoneyInput({ value, onChange, placeholder }) {
  return (
    <input
      className="inp"
      inputMode="decimal"
      placeholder={placeholder || "0.00"}
      value={value}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "");
        const parts = raw.split(".");
        const fixed = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : raw;
        onChange(fixed);
      }}
    />
  );
}



/** Tiny CSS */
const css = `
.tabs { display:flex; gap:8px; margin-bottom:12px; }
.tab { padding:8px 12px; border:1px solid #d1d5db; border-radius:8px; background:#fff; cursor:pointer; }
.tab.active { background:#1556b0; color:#fff; border-color:#1556b0; }
.card { border:1px solid #e5e7eb; border-radius:12px; margin:14px 0; }
.card-body { padding:16px; }
.row { display:flex; gap:12px; margin:10px 0; flex-wrap: wrap; }
.col { flex:1 1 0; min-width: 220px; }
.col-8 { flex: 1 1 600px; }
.col-12 { flex: 1 1 100%; min-width: 100%; }
.lbl { display:block; font-size:12px; color:#6b7280; margin-bottom:6px; }
.inp { width:100%; padding:8px 10px; border:1px solid #d1d5db; border-radius:8px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.picker { display:flex; gap:8px; }
.list { margin-top:8px; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden; }
.list-item { display:block; width:100%; text-align:left; padding:10px 12px; border-bottom:1px solid #eee; background:#fff; cursor:pointer; }
.list-item:hover { background:#fafafa; }
.list-item.active { background:#eef2ff; }
.line-1 { font-weight:600; }
.line-2 { font-size:12px; color:#6b7280; }
.box { border:1px solid #e5e7eb; border-radius:8px; padding:12px; min-height: 58px; }
.sum { display:flex; gap:24px; flex-wrap:wrap; margin-bottom:12px; padding:10px 12px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; }
.seg { display:flex; gap:8px; align-items:center; }
.seg-item { display:flex; gap:6px; align-items:center; padding:6px 10px; border:1px solid #e5e7eb; border-radius:8px; background:#fff; cursor:pointer; }
.seg-item input { margin:0; }
.actions { display:flex; gap:8px; justify-content:flex-end; margin-top:12px; }
.btn { padding:8px 12px; border-radius:8px; background:#f3f4f6; border:1px solid #d1d5db; cursor:pointer; }
.btn:hover { background:#eceff3; }
.btn.primary { background:#1556b0; border-color:#1556b0; color:#fff; }
.btn.primary:hover { background:#10458c; }
.btn.success { background:#0b7d48; border-color:#0b7d48; color:#fff; }
.btn.success:hover { background:#09633a; }
.btn.secondary { background:#fff; }
.btn.danger { background:#fee2e2; border-color:#fecaca; color:#991b1b; }
.btn.danger:hover { background:#fecaca; }
.table-wrap { margin-top: 10px; overflow:auto; }
.tbl { width:100%; border-collapse: collapse; }
.tbl th, .tbl td { border-bottom:1px solid #e5e7eb; padding:8px 10px; text-align:left; }
.v-title { font-weight:600; }
.tot-box { border:1px solid #e5e7eb; border-radius:8px; padding:10px 12px; }
.tot-label { color:#6b7280; font-size:12px; }
.tot-amt { font-size:18px; font-weight:700; margin:4px 0; }
.tot-note { color:#6b7280; font-size:12px; }
.muted { color:#6b7280; }
.pager { display:flex; gap:12px; align-items:center; justify-content:flex-end; margin-top:10px; }
`;
