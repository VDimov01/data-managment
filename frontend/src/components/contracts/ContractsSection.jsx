// frontend/src/components/ContractsSection.jsx
import React, { useEffect, useMemo, useState } from "react";
import ContractsList from "./ContractsList.jsx";
import { API_BASE } from "../../services/api.js";
import {api, qs} from '../../services/api.js';

const statusBG = {
  "DRAFT": "Чернова"
}

const contrType = {
  "REGULAR": "Нормален",
  "ADVANCE": "Авансов"
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
      vat_number: c.vat_number || null,
    },
    company: {
      legal_name: c.company_name || c.name || null,
      tax_id: c.tax_id || null,
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

export default function ContractsSection() {
  const apiBase = API_BASE;

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

    const buyer_snapshot = buildBuyerSnapshot(customer);
    if (!buyer_snapshot) return alert("Неуспешно генериране на информация за купувача.");

    setCreating(true);
    try {
      const payload = {
        customer_id: customer.customer_id,
        type, // 'REGULAR' | 'ADVANCE | 'REGULAR EXTENDED'
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

  async function handleSaveItems({ advanceAmount } = {}) {
  if (!contract?.contract_id) return;
  if (items.length === 0) return alert("Добавете поне едно превозно средство.");
  if (type === "ADVANCE" && !advanceAmount) {
      if (!confirm("Създаване на Авансов договор с 0лв авансово плащане?")) return;
    }

  setSavingItems(true);
  try {
    const payloadItems = items.map(it => {
      const obj = {
        vehicle_id: it.vehicle_id,
        quantity: 1, // always 1 now
      };
      if (it.unit_price !== "" && it.unit_price != null) obj.unit_price = String(it.unit_price);
      if (it.discount_type === "amount" || it.discount_type === "percent") {
        obj.discount_type = it.discount_type;
        if (it.discount_value !== "" && it.discount_value != null) obj.discount_value = String(it.discount_value);
      }
      if (it.tax_rate !== "" && it.tax_rate != null) obj.tax_rate = String(it.tax_rate);
      return obj;
    });

    const body = { items: payloadItems };

    if (contract?.type === "ADVANCE") {
      body.advance_amount = (advanceAmount === "" || advanceAmount == null)
        ? null
        : String(advanceAmount);
    }

    await api(`/contracts/${contract.contract_id}/items`, {
      method: "PUT",
      body
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

// state you already have:
const [creatingHandover, setCreatingHandover] = useState(false);
const [issuingAllHandover, setIssuingAllHandover] = useState(false);

// Create drafts for all contract items
async function handleCreateHandoverDrafts() {
  if (!contract?.contract_id) return;
  setCreatingHandover(true);
  try {
    await api(`/handover/bulk-from-contract/${contract.contract_id}`, { method: "POST" });
    alert("Създадени са чернови за всички линии.");
  } catch (e) {
    alert(`Грешка: ${e.message}`);
  } finally {
    setCreatingHandover(false);
  }
}

// Issue PDFs for all handovers that are still in draft
async function handleIssueAllHandover() {
  if (!contract?.contract_id) return;
  setIssuingAllHandover(true);
  try {
    const { items = [] } = await api(`/handover/by-contract/${contract.contract_id}`);
    const drafts = items.filter((hr) => hr.status === "draft");

    const results = [];
    for (const hr of drafts) {
      try {
        const data = await api(`/handover/${hr.handover_record_id}/issue`, { method: "POST" });
        results.push({ id: hr.handover_record_id, ok: true, url: data?.pdf?.signedUrl || null });
      } catch (err) {
        results.push({ id: hr.handover_record_id, ok: false, error: err.message });
      }
    }

    // Open the first generated PDF to avoid popup spam; the rest can be opened from the tab
    const firstUrl = results.find((r) => r.ok && r.url)?.url;
    if (firstUrl) window.open(firstUrl, "_blank", "noopener,noreferrer");

    const failed = results.filter((r) => !r.ok);
    if (failed.length) {
      alert(
        `Готово с предупреждения: ${results.length - failed.length} успешни, ${failed.length} неуспешни.\n` +
        failed.slice(0, 5).map((f) => `#${f.id}: ${f.error}`).join("\n")
      );
    } else {
      alert("Готово.");
    }
  } catch (e) {
    alert(`Грешка: ${e.message}`);
  } finally {
    setIssuingAllHandover(false);
  }
}




      return (
      <div className="contracts-wrap">
        {/* Tabs */}
        <div className="toolbar tabs-bar">
          <div className="btn-row">
            <button
              type="button"
              className={"btn btn-ghost" + (tab === "browse" ? " btn-active" : "")}
              onClick={() => setTab("browse")}
            >
              Всички договори
            </button>
            <button
              type="button"
              className={"btn btn-ghost" + (tab === "create" ? " btn-active" : "")}
              onClick={() => setTab("create")}
            >
              Създай нов договор
            </button>
          </div>
        </div>

        {tab === "create" && (
          <>
            <h2 className="h2">Договори</h2>
            <div className="text-muted" style={{ marginBottom: 8 }}>
              Стъпка {step} от 3 — <em>{["Създай чернова", "Добави автомобили и цени", "Преглед и Издаване"][step - 1]}</em>
            </div>

            {/* STEP 1 */}
            {step === 1 && (
              <div className="card">
                <div className="card-body">
                  <CustomerPicker apiBase={apiBase} value={customer} onChange={setCustomer} />

                  <div className="ctr-grid ctr-grid-3">
                    <div className="field">
                      <label className="label">Вид договор</label>
                      <div className="btn-row seg">
                        <button
                          type="button"
                          className={"btn btn-ghost" + (type === "REGULAR" ? " btn-active" : "")}
                          onClick={() => setType("REGULAR")}
                        >
                          Стандартен
                        </button>
                        <button
                          type="button"
                          className={"btn btn-ghost" + (type === "REGULAR EXTENDED" ? " btn-active" : "")}
                          onClick={() => setType("REGULAR EXTENDED")}
                        >
                          Стандартен (разширен)
                        </button>
                        <button
                          type="button"
                          className={"btn btn-ghost" + (type === "ADVANCE" ? " btn-active" : "")}
                          onClick={() => setType("ADVANCE")}
                        >
                          Авансов
                        </button>
                      </div>
                    </div>

                    <div className="field">
                      <label className="label">Валута</label>
                      <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                        <option value="BGN">BGN</option>
                        <option value="EUR">EUR</option>
                        <option value="USD">USD</option>
                      </select>
                    </div>

                    <div className="field">
                      <label className="label">Валиден до:</label>
                      <input type="date" className="input" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
                    </div>
                  </div>

                  <div className="ctr-grid">
                    <div className="field field-col-1">
                      <label className="label">Бележки</label>
                      <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
                    </div>
                  </div>

                  <div className="btn-row actions-end">
                    <button className="btn" type="button" onClick={resetAll}>Нулиране</button>
                    <button className="btn btn-primary" type="button" onClick={handleCreateDraft} disabled={creating}>
                      {creating ? "Създаване..." : "Създай чернова"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2 */}
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

            {/* STEP 3 */}
            {step === 3 && contract && (
              <div className="card">
                <div className="card-body">
                  <HeaderSummary contract={contract} customer={customer} />

                  <p className="text-muted">
                    Можете да <strong>генерирате чернова на PDF</strong> (запазва статус = „чернова“) или да 
                    <strong> издадете</strong>, което създава нова PDF версия и резервира автомобилите.
                  </p>


                  <div className="ctr-grid">
                    <div className="field">
                      <label className="label">Спецификации (PDF)</label>
                      <div className="btn-row">
                        <button className="btn" type="button" onClick={handleGenerateSpecs} disabled={genLoading}>
                          {genLoading ? "Генериране..." : "Генерирай спецификации на автомобила PDF"}
                        </button>
                      </div>

                      {specs.length === 0 ? (
                        <div className="text-muted mt-2">Няма генерирани спецификации.</div>
                      ) : (
                        <div className="list mt-2">
                          {specs.map((a) => (
                            <div key={a.edition_specs_pdf_id} className="list-item">
                              <div className="line-1"><strong>{a.filename}</strong> — v{a.version}</div>
                              <div className="line-2">SHA256: {a.sha256?.slice(0, 12)}… • {Math.round((a.byte_size || 0) / 1024)} KB</div>
                              <div className="btn-row mt-1">
                                <a className="btn" href={a.signedUrl} target="_blank" rel="noreferrer">Отвори</a>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="btn-row mt-2">
                        <button className="btn" type="button" onClick={handleCreateHandoverDrafts} disabled={creatingHandover}>
                          {creatingHandover ? "Създаване…" : "Чернови протоколи (всички)"}
                        </button>
                        <button className="btn" type="button" onClick={handleIssueAllHandover} disabled={issuingAllHandover}>
                          {issuingAllHandover ? "Генериране…" : "Генерирай всички протоколи"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="panel-footer actions-justify">
                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={handleCancel}
                      disabled={cancelling || contract.status === "withdrawn" || contract.status === "draft"}
                    >
                      {cancelling ? "Отказване..." : "Отказ и освобождаване на автомобилите"}
                    </button>

                    <div className="btn-row">
                      <button className="btn" type="button" onClick={() => setStep(2)}>Back</button>
                      <button className="btn" type="button" onClick={handleRenderDraftPdf} disabled={renderingDraft}>
                        {renderingDraft ? "Генериране..." : "Генерирай чернова(PDF)"}
                      </button>
                      <button className="btn btn-primary" type="button" onClick={handleIssue} disabled={issuing}>
                        {issuing ? "Издаване..." : "Издай и генерирай PDF"}
                      </button>
                    </div>
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
                const data = await api(`/contracts/${uuid}/pdf/latest`);
                const url = data?.signedUrl || data?.pdf?.signedUrl;
                if (url) window.open(url, "_blank", "noopener,noreferrer");
                else alert("Няма наличен PDF за този договор.");
              } catch (e) { alert(`Неуспешно отваряне: ${e.message}`); }
            }}
            onRegenerate={async (id) => {
              try {
                const data = await api(`/contracts/${id}/pdf`, { method: "POST" });
                const url = data?.pdf?.signedUrl || data?.signedUrl;
                if (url && confirm("Отвори регенерирания PDF?")) window.open(url, "_blank", "noopener,noreferrer");
              } catch (e) { alert(`Неуспешно регенериране: ${e.message}`); }
            }}
            onIssue={async (id) => {
              try {
                const data = await api(`/contracts/${id}/issue`, { method: "POST", body: { override_reserved: false } });
                const url = data?.pdf?.signedUrl || data?.signedUrl;
                if (url && confirm("Отвори PDF сега?")) window.open(url, "_blank", "noopener,noreferrer");
              } catch (e) { alert(`IНеуспешно издаване: ${e.message}`); }
            }}
          />
        )}
      </div>
    );

}

/** ---------- Subcomponents ---------- */

function HeaderSummary({ contract, customer }) {
  const status = (contract?.status || "draft").toUpperCase();
  return (
    <div className="sum" style={{marginBottom:12}}>
      <div><strong>Договор:</strong> #{contract.contract_id} — {contract.uuid}</div>
      <div><strong>Статус:</strong> {statusBG[status]} ({contrType[contract.type]})</div>
      <div><strong>Клиент:</strong> {displayCustomer(customer)}</div>
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

function CustomerPicker({ apiBase, value, onChange }) {
  const [que, setQue] = useState("");
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => { setPage(1); }, [que]);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      setErr("");
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      const qq = que.trim(); if (qq) params.set("q", qq);
      const data = await api(`/customers?${params.toString()}`);
      setList(data.customers || []);
      setTotal(Number(data.total || 0));
      setTotalPages(Number(data.totalPages || Math.max(1, Math.ceil((data.total || 0)/limit))));
    } catch (e) {
      setErr(e.message || "Customer search failed");
      setList([]); setTotal(0); setTotalPages(1);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const t = setTimeout(loadCustomers, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, que]);

  const canPrev = page > 1 && !loading;
  const canNext = page < totalPages && !loading;

  return (
    <div className="ctr-split">
      {/* Left: search & results */}
      <div className="ctr-split-left">
        <label className="label">Клиенти</label>

        {/* Search row */}
        <div className="btn-row picker-bar">
          <input
            className="input"
            placeholder="Търси клиенти…"
            value={que}
            onChange={(e) => setQue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadCustomers()}
          />
          <select
            className="select"
            value={limit}
            onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
            title="Page size"
          >
            <option value={5}>5 / страница</option>
            <option value={10}>10 / страница</option>
            <option value={20}>20 / страница</option>
          </select>
          <button className="btn" type="button" onClick={loadCustomers} disabled={loading}>
            {loading ? "…" : "Търси"}
          </button>
        </div>

        {/* Results */}
        <div className="list mt-2">
          {err && <div className="text-danger">{err}</div>}

          {list.map((c) => {
            const isActive = value?.customer_id === c.customer_id;
            return (
              <button
                key={c.customer_id}
                type="button"
                className={"list-item" + (isActive ? " is-active" : "")}
                onClick={() => onChange(c)}
              >
                <div className="line-1">{displayCustomer(c)}</div>
                <div className="line-2">{c.email || c.phone || c.public_uuid || c.vat_number || ""}</div>
              </button>
            );
          })}

          {!loading && list.length === 0 && !err && (
            <div className="text-muted">Няма намерени клиенти.</div>
          )}
        </div>

        {/* Pager */}
        <div className="pagination mt-2">
          <button className="page-btn" type="button" disabled={!canPrev} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            ← Предишна
          </button>
          <span className="results">Стр. {page} от {totalPages} • Общо: {total}</span>
          <button className="page-btn" type="button" disabled={!canNext} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Следваща →
          </button>
        </div>
      </div>

      {/* Right: selected */}
      <div className="ctr-split-right">
        <label className="label">Избрани</label>
        <div className="card">
          <div className="card-body">
            {value ? (
              <>
                <div><strong>{displayCustomer(value)}</strong></div>
                <div className="text-muted">{value.customer_type === "Company" ? "Фирма" : "Индивидуално лице"}</div>
              </>
            ) : (
              <div className="text-muted">Избери клиент.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


/** ─────────────────────────────────────────────────────────────────────────────
 * ItemsStep
 *  - Per-line: unit price, discount (amount/percent), tax rate
 *  - Contract type ADVANCE: set advance amount here
 *  - Quantity removed (always 1)
 *  - Client total preview (purely UI)
 * ──────────────────────────────────────────────────────────────────────────── */
export function ItemsStep({
  apiBase,
  contract,
  customer,
  items,
  setItems,
  currency,
  onBack,
  onSave,
  saving,
}) {
  const type = contract?.type || "REGULAR";
  const [advanceAmount, setAdvanceAmount] = useState(
    contract?.advance_amount != null ? String(contract.advance_amount) : ""
  );

  const totalClient = useMemo(() => {
    return items.reduce((acc, it) => {
      const p = parseNumber(it.unit_price);
      const dr = it.discount_type === "percent" ? parseNumber(it.discount_value) : null;
      const da = it.discount_type === "amount"  ? parseNumber(it.discount_value) : null;
      const tr = parseNumber(it.tax_rate);
      const { total } = computePreviewLineTotals(1, p, it.discount_type, (dr ?? da), tr);
      return acc + total;
    }, 0).toFixed(2);
  }, [items]);

  return (
    <div className="card">
      <div className="card-body">
        <HeaderSummary contract={contract} customer={customer} />

        <VehiclePicker
          apiBase={apiBase}
          onPick={(v) => {
            if (items.some((x) => x.vehicle_id === v.vehicle_id)) return;
            setItems((prev) => [
              ...prev,
              {
                vehicle_id: v.vehicle_id,
                unit_price: v.asking_price ?? "",
                discount_type: "",
                discount_value: "",
                tax_rate: "",
                display: v,
              },
            ]);
          }}
        />

        <ItemsTable
          currency={currency}
          items={items}
          onChange={(idx, upd) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...upd } : it)))}
          onRemove={(idx) => setItems((prev) => prev.filter((_, i) => i !== idx))}
        />

        {type === "ADVANCE" && (
          <div className="ctr-grid mt-2">
            <div className="field" style={{ maxWidth: 320 }}>
              <label className="label">Авансова сума</label>
              <MoneyInput className="input" value={advanceAmount} onChange={setAdvanceAmount} placeholder="0.00" />
              <div className="text-muted mt-1">Тази стойност ще бъде записана към договора като аванс.</div>
            </div>
          </div>
        )}

        <div className="panel-footer">
          <div className="tot-box">
            <div className="tot-label">Client total (display only)</div>
            <div className="tot-amt">{currency} {totalClient}</div>
            <div className="tot-note">* Официалната сума се изчислява от сървъра при запис / издаване.</div>
          </div>

          <div className="btn-row">
            <button className="btn" type="button" onClick={onBack}>Back</button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={async () => {
                await onSave({ advanceAmount: type === "ADVANCE" ? advanceAmount : null });
              }}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save items"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


/** ─────────────────────────────────────────────────────────────────────────────
 * VehiclePicker (frontend-only pagination)
 *  - Fetches once per search, paginates locally (page/pageSize)
 * ──────────────────────────────────────────────────────────────────────────── */
function VehiclePicker({ apiBase, onPick }) {
  const [q, setQ] = useState("");
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(false);

  // local pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const paged = all.slice(start, start + pageSize);

  const doSearch = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ available: "1" });
      const qq = q.trim();
      if (qq) params.set("q", qq);

      const res = await api(`/vehicles?${params.toString()}`);
      const rows = Array.isArray(res) ? res : (res.vehicles || res.items || res.rows || []);
      const filteredRows = rows.filter((v) => v.status === "Available");
      setAll(filteredRows);
      setPage(1);
    } catch (e) {
      alert(`Vehicle search failed: ${e.message}`);
      setAll([]);
      setPage(1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="row">
      <div className="col-12">
        <label className="lbl">Добави автомобил</label>

        {/* Search row */}
        <div className="picker-bar">
          <input
            className="input"
            placeholder="Търси автомобили (VIN, модел, издание)…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
          />
          <select
            className="select"
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            title="брой на страница"
          >
            <option value={5}>5 / стр.</option>
            <option value={10}>10 / стр.</option>
            <option value={20}>20 / стр.</option>
          </select>
          <button className="btn" onClick={doSearch} disabled={loading}>
            {loading ? "…" : "Търси"}
          </button>
        </div>

        {/* Results */}
        {paged.length > 0 && (
          <div className="list" style={{ marginTop: 8 }}>
            {paged.map((v) => (
              <button key={v.vehicle_id} className="list-item" onClick={() => onPick(v)}>
                <div className="line-1">
                  {(v.make_name || v.make) || ""} {(v.model_name || v.model) || ""}{" "}
                  {v.year ? `(${v.year})` : (v.model_year ? `(${v.model_year})` : "")} —{" "}
                  {(v.edition_name || v.edition || "Edition")}
                </div>
                <div className="line-2">
                  VIN: {v.vin || "—"} • Цвят: {(v.exterior_color || v.exterior_color_name || "—")} /{" "}
                  {(v.interior_color || v.interior_color_name || "—")} • Град: {v.shop_city || "—"} • Км:{" "}
                  {(v.mileage_km ?? v.mileage ?? "—")} km • Цена:{" "}
                  {v.asking_price != null ? String(v.asking_price) : "—"}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Pager */}
        {all.length > 0 && (
          <div className="pagination" style={{ marginTop: 8 }}>
            <button
              className="page-btn"
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Предишна
            </button>
            <span className="results">Стр. {page} от {totalPages} • Общо: {total}</span>
            <button
              className="page-btn"
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Следваща →
            </button>
          </div>
        )}

        {!loading && all.length === 0 && (
          <div className="text-muted" style={{ marginTop: 8 }}>Няма намерени автомобили.</div>
        )}
      </div>
    </div>
  );
}


/** ─────────────────────────────────────────────────────────────────────────────
 * ItemsTable
 *  - No quantity column (always 1)
 *  - Discount controls (type + value)
 *  - Tax rate (optional)
 *  - Line total preview (client-side)
 * ──────────────────────────────────────────────────────────────────────────── */
function ItemsTable({ currency, items, onChange, onRemove }) {
  if (items.length === 0) {
    return <div className="text-muted" style={{ marginTop: 8 }}>No vehicles added yet.</div>;
  }

  return (
    <div className="table-wrap">
      <table className="table table-tight">
        <thead>
          <tr>
            <th style={{ minWidth: 260 }}>Автомобил</th>
            <th style={{ width: 160 }}>Цена</th>
            <th style={{ width: 220 }}>Отстъпка</th>
            <th style={{ width: 140 }}>ДДС/Данък %</th>
            <th style={{ width: 160, textAlign: "right" }}>Общо (1 бр.)</th>
            <th style={{ width: 60 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => {
            const d = it.display || {};
            const unit = parseNumber(it.unit_price);
            const dr = it.discount_type === "percent" ? parseNumber(it.discount_value) : null;
            const da = it.discount_type === "amount"  ? parseNumber(it.discount_value) : null;
            const tr = parseNumber(it.tax_rate);
            const { total } = computePreviewLineTotals(1, unit, it.discount_type, (dr ?? da), tr);

            return (
              <tr key={`${it.vehicle_id}-${idx}`}>
                <td>
                  <div className="v-title">
                    {(d.make_name || d.make) || ""} {(d.model_name || d.model) || ""}{" "}
                    {d.year ? `(${d.year})` : (d.model_year ? `(${d.model_year})` : "")} —{" "}
                    {(d.edition_name || d.edition || "Edition")}
                  </div>
                  <div className="text-muted">
                    VIN: {d.vin || "—"} • Цвят: {(d.exterior_color || d.exterior_color_name || "—")} /{" "}
                    {(d.interior_color || d.interior_color_name || "—")} • Град: {d.shop_city || "—"} • Км:{" "}
                    {(d.mileage_km ?? d.mileage ?? "—")} km
                  </div>
                </td>

                <td>
                  <MoneyInput
                    className="input"
                    value={it.unit_price ?? ""}
                    onChange={(val) => onChange(idx, { unit_price: val })}
                    placeholder="0.00"
                  />
                </td>

                <td>
                  <div style={{ display: "flex", gap: 8 }}>
                    <select
                      className="select"
                      value={it.discount_type || ""}
                      onChange={(e) => onChange(idx, { discount_type: e.target.value, discount_value: "" })}
                    >
                      <option value="">Без</option>
                      <option value="amount">Сума</option>
                      <option value="percent">%</option>
                    </select>

                    {it.discount_type === "percent" ? (
                      <PercentInput
                        className="input"
                        value={it.discount_value ?? ""}
                        onChange={(v) => onChange(idx, { discount_value: v })}
                        placeholder="0"
                      />
                    ) : (
                      <MoneyInput
                        className="input"
                        value={it.discount_value ?? ""}
                        onChange={(v) => onChange(idx, { discount_value: v })}
                        placeholder="0.00"
                      />
                    )}
                  </div>
                </td>

                <td>
                  <PercentInput
                    className="input"
                    value={it.tax_rate ?? ""}
                    onChange={(v) => onChange(idx, { tax_rate: v })}
                    placeholder="20"
                  />
                </td>

                <td style={{ textAlign: "right" }}>
                  <strong>{currency} {total.toFixed(2)}</strong>
                </td>

                <td>
                  <button className="btn btn-danger" type="button" onClick={() => onRemove(idx)}>✕</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


/** ─────────────────────────────────────────────────────────────────────────────
 * Inputs & helpers
 * ──────────────────────────────────────────────────────────────────────────── */
function MoneyInput({ value, onChange, placeholder }) {
  return (
    <input
      className="input"
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

function PercentInput({ value, onChange, placeholder }) {
  return (
    <input
      className="input"
      inputMode="decimal"
      placeholder={placeholder || "0"}
      value={value}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "");
        const num = raw === "" ? "" : String(Math.min(1000, Math.max(0, Number(raw))));
        onChange(num);
      }}
    />
  );
}

function parseNumber(v) {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function computePreviewLineTotals(qty, unit, discountType, discountValue, taxRate) {
  const q = Math.max(1, qty || 1);
  const u = Math.max(0, unit || 0);
  const sub = q * u;

  let disc = 0;
  if (discountType === "amount") {
    disc = Math.min(sub, Math.max(0, discountValue || 0));
  } else if (discountType === "percent") {
    const p = Math.max(0, discountValue || 0) / 100;
    disc = Math.min(sub, sub * p);
  }

  const base = Math.max(0, sub - disc);

  let tax = 0;
  if (taxRate != null && taxRate !== "" && Number.isFinite(Number(taxRate))) {
    tax = base * (Number(taxRate) / 100);
  }

  const total = base + tax;
  return { subtotal: sub, discount: disc, tax, total };
}