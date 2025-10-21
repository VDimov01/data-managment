import React, { useMemo, useState } from "react";
import { api } from "../../services/api";
import CustomerPicker from "./CustomerPicker";
import VehiclePicker from "./VehiclePicker";
import LinesTable from "./LinesTable";
import { netFromGross, offerKey, round2, grossFromNet } from "../../utils/helpers";
import { MoneyInput, PercentInput } from "./Inputs";

function readMeta(it) {
  const m = it?.metadata_json ?? it?.metadata;
  if (!m) return {};
  if (typeof m === "string") {
    try { return JSON.parse(m); } catch { return {}; }
  }
  return m;
}

export default function OfferEditor({ initialOffer, initialItems, onExit }) {
  const [offer, setOffer] = useState(initialOffer || null);
  const [items, setItems] = useState(initialItems || []);
  const [customer, setCustomer] = useState(null);

  // header fields
  const [currency, setCurrency] = useState(offer?.currency || "BGN");
  const [vatRate, setVatRate] = useState(String(offer?.vat_rate ?? "20"));
  const [validUntil, setValidUntil] = useState(offer?.valid_until ? String(offer.valid_until).slice(0, 10) : "");
  const [notesPublic, setNotesPublic] = useState(offer?.notes_public || "");
  const [notesInternal, setNotesInternal] = useState(offer?.notes_internal || "");

  // LIVE derived discount from lines
  const discountAgg = useMemo(() => {
    let grossSum = 0; // sum of per-unit gross discount * qty
    let netSum = 0;   // same but net per-unit at each line's VAT

    for (const it of items) {
      const qty = Number(it.quantity || 1);
      const rate = Number(it.vat_rate ?? offer?.vat_rate ?? 20);
      const meta = readMeta(it);

      const baseNet = Number(meta.ui_original_unit_price ?? it.unit_price ?? 0);
      const baseGross = round2(grossFromNet(baseNet, rate));

      const dPerUnitGross = Number(meta.ui_discount_value || 0);
      const dPerUnitGrossClamped = Math.max(0, Math.min(baseGross, dPerUnitGross));

      grossSum += dPerUnitGrossClamped * qty;

      // convert the discount amount to net to understand effect on totals
      const dPerUnitNet = netFromGross(dPerUnitGrossClamped, rate);
      netSum += dPerUnitNet * qty;
    }

    return {
      gross: round2(grossSum),
      net: round2(netSum),
    };
  }, [items, offer?.vat_rate]);

  const totals = useMemo(() => {
    const o = offer || {};
    return {
      subtotal: Number(o.subtotal_amount || 0).toFixed(2),
      // Show derived discount (net) next to totals (your DB header discount stays 0)
      discount_gross: discountAgg.gross.toFixed(2),
      vat: Number(o.vat_amount || 0).toFixed(2),
      total: Number(o.total_amount || 0).toFixed(2),
      currency: o.currency || "BGN",
    };
  }, [offer, discountAgg.net]);

  async function saveHeader() {
    const uuid = offerKey(offer);
    await api(`/offers/${uuid}`, {
      method: "PUT",
      body: {
        customer_id: customer?.customer_id ?? offer.customer_id ?? null,
        currency,
        vat_rate: vatRate === "" ? null : Number(vatRate),
        valid_until: validUntil || null,
        notes_public: notesPublic || null,
        notes_internal: notesInternal || null,
        // keep header discount at 0 — line discounts are already baked into unit prices
        discount_amount: 0
      }
    });

    // Force totals recompute if lines exist (touch first line)
    if (items.length > 0) {
      const first = items[0];
      await api(`/offers/${uuid}/items/${first.line_no}`, { method: "PUT", body: { unit_price: first.unit_price } });
    }
    const data = await api(`/offers/${uuid}`);
    setOffer(data.offer || offer);
    setItems(data.items || []);
    alert("Записано.");
  }

  async function addVehicle(v) {
    const uuid = offerKey(offer);
    const desc = `${v.make_name || v.make || ""} ${v.model_name || v.model || ""} ${v.year || v.model_year || ""} — ${v.edition_name || v.edition || "Edition"}`.trim();
    const gross = v.asking_price != null ? Number(v.asking_price) : 0;
    const rate = Number(vatRate || offer?.vat_rate || 20);
    const net = netFromGross(gross, rate);

    const meta = {
      vehicle_id: v.vehicle_id,
      source: "picker",
      ui_original_unit_price: Number(net.toFixed(2)), // base NET (pre-discount)
      ui_discount_type: "amount",
      ui_discount_value: 0,                           // start with no discount
      ui_effective_unit_price: Number(net.toFixed(2)),
      ui_tax_rate: rate,
      make: v.make_name || v.make || null,
      model: v.model_name || v.model || null,
      year: v.year || v.model_year || null,
      edition: v.edition_name || v.edition || null,
      vin: v.vin || null
    };

    const data = await api(`/offers/${uuid}/items`, {
      method: "POST",
      body: {
        item_type: "vehicle",
        vehicle_id: v.vehicle_id,
        quantity: 1,
        unit_price: net,                 // NET
        description: desc,
        metadata_json: meta
      }
    });
    setOffer(data.offer || offer);
    setItems(data.items || []);
  }

  async function onUpdateLine(lineNo, patch) {
    const uuid = offerKey(offer);
    const data = await api(`/offers/${uuid}/items/${lineNo}`, { method: "PUT", body: patch });
    setOffer(data.offer || offer);
    setItems(data.items || []);
  }
  async function onDeleteLine(lineNo) {
    const uuid = offerKey(offer);
    if (!confirm("Изтриване на реда?")) return;
    const data = await api(`/offers/${uuid}/items/${lineNo}`, { method: "DELETE" });
    setOffer(data.offer || offer);
    setItems(data.items || []);
  }

  async function renderDraft() {
    const uuid = offerKey(offer);
    const out = await api(`/offers/${uuid}/render-draft`, { method: "POST" });
    const vno = out?.version_no;
    if (vno) {
      const sig = await api(`/offers/${uuid}/pdfs/${vno}/signed-url`);
      if (sig?.signedUrl && confirm("Отвори PDF чернова?")) window.open(sig.signedUrl, "_blank", "noopener,noreferrer");
    }
    const data = await api(`/offers/${uuid}`);
    setOffer(data.offer || offer);
    setItems(data.items || []);
  }

  async function issue() {
    const uuid = offerKey(offer);
    await api(`/offers/${uuid}/issue`, { method: "POST", body: {} });
    const d = await api(`/offers/${uuid}`);
    setOffer(d.offer || offer);
    setItems(d.items || []);
    const vno = d?.latest_pdf?.version_no;
    if (vno) {
      const sig = await api(`/offers/${uuid}/pdfs/${vno}/signed-url`);
      if (sig?.signedUrl && confirm("Отвори издаден PDF?")) window.open(sig.signedUrl, "_blank", "noopener,noreferrer");
    }
  }

  async function revise() {
    const uuid = offerKey(offer);
    await api(`/offers/${uuid}/revise`, { method: "POST" });
    const d = await api(`/offers/${uuid}`);
    setOffer(d.offer || offer);
    setItems(d.items || []);
    alert("Офертата е отключена за редакция (revised).");
  }

  return (
    <>
      <h2 className="h2">Оферта {offer?.offer_number || "(чернова)"} — <span className="text-muted mono">{offer?.offer_uuid}</span></h2>
      <div className="text-muted" style={{ marginBottom: 8 }}>
        Статус: <strong>{(offer?.status || "").toUpperCase()}</strong> • Създадена: {offer?.created_at?.replace("T", " ").slice(0, 19) || "—"}
      </div>

      <div className="card">
        <div className="card-body">
          <CustomerPicker value={customer || { customer_id: offer?.customer_id, display_name: offer?.customer_name }} onChange={setCustomer} />

          <div className="ctr-grid ctr-grid-3" style={{ marginTop: 12 }}>
            <div className="field">
              <label className="label">Валута</label>
              <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="BGN">BGN</option><option value="EUR">EUR</option><option value="USD">USD</option>
              </select>
            </div>
            <div className="field">
              <label className="label">% ДДС</label>
              <PercentInput value={vatRate} onChange={setVatRate} placeholder="20" />
            </div>
            <div className="field">
              <label className="label">Валидна до</label>
              <input type="date" className="input" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
          </div>

          <div className="ctr-grid">
            <div className="field field-col-1">
              <label className="label">Публични бележки (виждат се в офертата)</label>
              <textarea className="input" rows={2} value={notesPublic} onChange={(e) => setNotesPublic(e.target.value)} />
            </div>
            <div className="field field-col-1">
              <label className="label">Вътрешни бележки</label>
              <textarea className="input" rows={2} value={notesInternal} onChange={(e) => setNotesInternal(e.target.value)} />
            </div>
          </div>

          {/* Derived discount from lines (display-only) */}
          <div className="ctr-grid" style={{ marginTop: 8 }}>
            <div className="field" style={{ maxWidth: 320 }}>
              <label className="label">Отстъпка (общо, с ДДС)</label>
              <MoneyInput value={discountAgg.gross.toFixed(2)} disabled />
              <div className="text-muted mt-1">без ДДС: {discountAgg.net.toFixed(2)} {offer?.currency || "BGN"}</div>
            </div>
          </div>

          <div className="btn-row actions-end" style={{marginTop:12}}>
            <button className="btn" onClick={onExit}>Назад</button>
            <button className="btn btn-primary" onClick={saveHeader}>Запази заглавието</button>
          </div>
        </div>
      </div>

      {(offer?.status === "draft" || offer?.status === "revised") && (
        <>
          <div className="mt-2">
            <VehiclePicker onPick={addVehicle} />
          </div>

          <LinesTable
            offer={offer}
            items={items}
            onUpdateLine={onUpdateLine}
            onDeleteLine={onDeleteLine}
          />
        </>
      )}

      <div className="panel-footer">
        <div className="tot-box"><div className="tot-label">Междинна сума (без ДДС)</div><div className="tot-amt">{totals.currency} {totals.subtotal}</div></div>
        <div className="tot-box"><div className="tot-label">Отстъпка</div><div className="tot-amt">{totals.currency} {totals.discount_gross}</div></div>
        <div className="tot-box"><div className="tot-label">ДДС</div><div className="tot-amt">{totals.currency} {totals.vat}</div></div>
        <div className="tot-box"><div className="tot-label"><strong>Общо (с ДДС)</strong></div><div className="tot-amt"><strong>{totals.currency} {totals.total}</strong></div></div>

        <div className="btn-row">
          {(offer?.status === "draft" || offer?.status === "revised") && (
            <>
              <button className="btn" onClick={renderDraft}>Генерирай чернова (PDF)</button>
              <button className="btn btn-primary" onClick={issue}>Издай оферта</button>
            </>
          )}
          {offer?.status === "issued" && (
            <button className="btn" onClick={revise}>Отключи за редакция (revised)</button>
          )}
        </div>
      </div>
    </>
  );
}
