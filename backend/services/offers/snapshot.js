// services/snapshot.js
async function buildOfferSnapshot(conn, offer_id) {
  const [[offer]] = await conn.query('SELECT * FROM offer WHERE offer_id=?', [offer_id]);
  const [items] = await conn.query(
    'SELECT line_no, item_type, description, quantity, unit_price, vat_rate, line_total, metadata_json FROM offer_item WHERE offer_id=? ORDER BY line_no',
    [offer_id]
  );

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
        national_id_last4: c.national_id_last4 // optional to show; safe-ish
      };
    }
  }

  // compute totals from items
  const subtotal = items.reduce((s, i) => s + Number(i.line_total), 0);
  const discount = Number(offer.discount_amount || 0);
  const vat = ((subtotal - discount) * Number(offer.vat_rate)) / 100;
  const total = subtotal - discount + vat;

  // dealer: replace with your settings lookup if you have one
  const dealer = { name: process.env.DEALER_NAME || 'Your Dealership' };

  return {
    offer: {
      offer_uuid: offer.offer_uuid,
      offer_number: offer.offer_number,
      currency: offer.currency,
      vat_rate: Number(offer.vat_rate),
      valid_until: offer.valid_until,
      notes_public: offer.notes_public
    },
    customer,
    items: items.map(i => ({
      line_no: i.line_no,
      item_type: i.item_type,
      description: i.description,
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      line_total: Number(i.line_total),
      metadata: i.metadata_json // already a snapshot
    })),
    totals: { subtotal, discount, vat, total },
    dealer,
    ts_iso: new Date().toISOString()
  };
}

module.exports = {
    buildOfferSnapshot
}