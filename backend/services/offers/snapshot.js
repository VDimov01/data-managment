const { decryptNationalId } = require('../cryptoCust.js');


function formatDateDMYDateOnly(value, { fallback = '—' } = {}) {
  if (!value) return fallback;
  // Accept 'YYYY-MM-DD', Date, or ISO string; always reduce to the date part.
  let ymd;
  if (typeof value === 'string') {
    // grab first 10 chars if ISO, or whole string if it's already YYYY-MM-DD
    const s = value.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
    ymd = s;
  } else if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // convert to YYYY-MM-DD in UTC (so we don’t shift days by TZ)
    ymd = value.toISOString().slice(0, 10);
  } else {
    return fallback;
  }
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`; // dd/mm/yyyy
}

// cent-accurate helpers
const toCents = (n) => Math.round((Number(n) || 0) * 100);
const fromCents = (c) => (c || 0) / 100;

/** Split a NET amount by rate% into { net, vat, gross } (all decimals with cent rounding) */
function splitNet(net, ratePct) {
  const netC = toCents(net);
  const vatC = Math.round(netC * (Number(ratePct || 0) / 100));
  const grossC = netC + vatC;
  return { net: fromCents(netC), vat: fromCents(vatC), gross: fromCents(grossC), netC, vatC, grossC };
}

async function buildOfferSnapshot(conn, offer_id) {
  const [[offer]] = await conn.query('SELECT * FROM offer WHERE offer_id=?', [offer_id]);
  const [items] = await conn.query(
    'SELECT line_no, item_type, description, quantity, unit_price, vat_rate, line_total, metadata_json FROM offer_item WHERE offer_id=? ORDER BY line_no',
    [offer_id]
  );

  // Customer snapshot
  let customer = null;
  if (offer.customer_id) {
    const [[c]] = await conn.query('SELECT * FROM customer WHERE customer_id=?', [offer.customer_id]);
    if (c) {
      customer = {
        type: c.customer_type,
        display_name: c.display_name,
        representative: [c.rep_first_name, c.rep_middle_name, c.rep_last_name].filter(Boolean).join(' ') || null,
        email: c.email, phone: c.phone,
        country: c.country, city: c.city, address_line: c.address_line, postal_code: c.postal_code,
        tax_id: c.tax_id, vat_number: c.vat_number,
        national_id_last4: c.national_id_last4 || null
      };
      try {
        const decrypted = c.national_id_enc ? decryptNationalId(c.national_id_enc) : null;
        if (decrypted) customer.national_id = decrypted;
      } catch (_) { /* ignore */ }
    }
  }

  // Totals (NET model): line_total is NET; header discount is NET.
  const vatRate = Number(offer.vat_rate) || 0;

  const subtotalNetC = items.reduce((sum, i) => sum + toCents(Number(i.line_total)), 0);
  const discountNetC = toCents(offer.discount_amount || 0);

  const netAfterDiscC = Math.max(0, subtotalNetC - discountNetC);
  const vatC = Math.round(netAfterDiscC * (vatRate / 100));
  const grossAfterDiscC = netAfterDiscC + vatC;

  const subtotal = fromCents(subtotalNetC); // NET before discount
  const discount = fromCents(discountNetC); // header NET discount
  const vat = fromCents(vatC);              // VAT on (NET after discount)
  const total = fromCents(grossAfterDiscC); // GROSS after discount

  // Per-line enrich (NET → VAT → GROSS)
  const enrichedItems = items.map(i => {
    const qty = Number(i.quantity) || 1;
    const rate = i.vat_rate != null ? Number(i.vat_rate) : vatRate;

    const unitNet = Number(i.unit_price) || 0; // NET
    const lineNet = Number(i.line_total != null ? i.line_total : unitNet * qty); // NET

    const unitSplit = splitNet(unitNet, rate);
    const lineSplit = splitNet(lineNet, rate);

    return {
      line_no: i.line_no,
      item_type: i.item_type,
      description: i.description,
      quantity: qty,

      // unit prices
      unit_price: unitSplit.net,           // NET (original column)
      unit_price_net: unitSplit.net,
      unit_price_gross: unitSplit.gross,

      // line totals
      line_total: lineSplit.net,           // NET (original column)
      line_total_net: lineSplit.net,
      line_vat: lineSplit.vat,
      line_total_gross: lineSplit.gross,

      vat_rate: rate,
      metadata: i.metadata_json
    };
  });

  // Dealer block
  const dealer = { 
    name: process.env.DEALER_NAME || 'Некст Авто ЕООД',
    tax_id: '208224080',
    address: 'ул. Темида 1, вх. Б, ап.16',
    city: 'Стара Загора',
    country: 'България',
    email: 'sales@solaris.expert',
    phone: '0996600900',
    representative: 'Пламен Иванов Генчев'
   };

  return {
    offer: {
      offer_uuid: offer.offer_uuid,
      offer_number: offer.offer_number,
      currency: offer.currency,
      vat_rate: vatRate,
      valid_until: formatDateDMYDateOnly(offer.valid_until),
      notes_public: offer.notes_public
    },
    customer,
    items: enrichedItems,
    totals: { subtotal, discount, vat, total },
    dealer,
    ts_iso: new Date().toISOString()
  };
}

module.exports = { buildOfferSnapshot };
