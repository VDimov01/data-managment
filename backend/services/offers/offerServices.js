const { getPool, withTransaction } = require('../../db');
const { allocateOfferNumber } = require('./offerNumber');
const { buildOfferSnapshot } = require('./snapshot');
const { renderOfferPdfBuffer } = require('../../pdfTemplates/offerPDF');
const { uploadOfferPdfBuffer, getSignedOfferPdfUrl } = require('./offerStorage');
const { v4: uuidv4 } = require('uuid');

/** Helper: YYYY-MM-DD from 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm:ss' */
function toDateOnly(v) {
  if (!v) return null;
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

// cent-accurate helpers
function toCents(n) { return Math.round((Number(n) || 0) * 100); }
function fromCents(c) { return (c || 0) / 100; }

/**
 * Create draft offer.
 * Required non-null per DDL: offer_year, offer_seq, offer_number, currency, vat_rate,
 * and the 4 amount columns (we seed them with 0.00).
 */
async function createDraft({
  customer_id = null,
  currency_code = 'BGN',
  vat_rate = 20.00,
  valid_until = null,
  notes_public = null,
  notes_internal = null,
  force_year = null,
  admin_id = null,
}) {
  return withTransaction(async (conn) => {
    const { year, seq, offer_number } = await allocateOfferNumber(conn, force_year);

    const offer_uuid = uuidv4();
    const public_uuid = uuidv4();

    const [res] = await conn.query(
      `
      INSERT INTO offer (
        offer_uuid, public_uuid,
        offer_year, offer_seq, offer_number,
        status, customer_id,
        currency, vat_rate, valid_until,
        notes_internal, notes_public,
        subtotal_amount, discount_amount, vat_amount, total_amount,
        created_by_admin_id
      )
      VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, 0.00, 0.00, 0.00, 0.00, ?)
      `,
      [
        offer_uuid, public_uuid,
        year, seq, offer_number,
        customer_id,
        currency_code, vat_rate, toDateOnly(valid_until),
        notes_internal, notes_public,
        admin_id,
      ]
    );

    const offer_id = res.insertId;

    const [[row]] = await conn.query(
      `SELECT o.* FROM offer o WHERE o.offer_id = ?`,
      [offer_id]
    );
    row.offer_id = offer_id;
    return row;
  });
}

/**
 * Replace all items for draft and recalc header totals (NET model).
 * Line discounts are baked into line NET prices; header discount remains whatever is set on the offer.
 */
async function replaceItemsAndRecalc(offer_id, items = []) {
  return withTransaction(async (conn) => {
    const [[offer]] = await conn.query(`SELECT * FROM offer WHERE offer_id = ? FOR UPDATE`, [offer_id]);
    if (!offer) throw new Error('Offer not found');
    if (String(offer.status) !== 'draft') throw new Error('Only draft offers can be edited');

    await conn.query(`DELETE FROM offer_item WHERE offer_id = ?`, [offer_id]);

    let lineNo = 0;
    let sumSubtotalC = 0;  // sum of NET line totals (after line discounts)

    for (const it of items) {
      lineNo += 1;

      const qty = Math.max(0, Number(it.quantity || 1));
      const originalUnit = Number(it.unit_price ?? 0) || 0; // NET
      const dt = it.discount_type === 'percent' || it.discount_type === 'amount' ? it.discount_type : null;
      const dv = Number(it.discount_value ?? 0) || 0;
      const taxRate = it.tax_rate != null && it.tax_rate !== '' ? Number(it.tax_rate) : Number(offer.vat_rate || 0);

      const unitC = toCents(originalUnit);
      const grossLineC = Math.round(unitC * qty); // NET line before (line) discount

      let discC = 0;
      if (dt === 'amount') {
        discC = Math.min(grossLineC, toCents(dv));
      } else if (dt === 'percent') {
        discC = Math.min(grossLineC, Math.round(grossLineC * (Math.max(0, dv) / 100)));
      }

      const effLineNetC = Math.max(0, grossLineC - discC);
      const effUnitNetC = qty > 0 ? Math.round(effLineNetC / qty) : 0;

      sumSubtotalC += effLineNetC;

      const desc = it.description
        || (it.display
              ? `${it.display.make_name || it.display.make || ''} ${it.display.model_name || it.display.model || ''} ${it.display.year || it.display.model_year || ''} — ${it.display.edition_name || it.display.edition || 'Edition'}`.trim()
              : `Vehicle #${it.vehicle_id || ''}`);

      const meta = {
        vehicle_id: it.vehicle_id ?? null,
        ui_discount_type: dt,
        ui_discount_value: dv,
        ui_original_unit_price: originalUnit,
        ui_effective_unit_price: fromCents(effUnitNetC),
        ui_tax_rate: taxRate,
        ui_description: desc,
      };

      await conn.query(
        `
        INSERT INTO offer_item (
          offer_id, line_no, item_type,
          vehicle_id, description,
          quantity, unit_price, vat_rate, line_total,
          metadata_json
        )
        VALUES (?, ?, 'vehicle', ?, ?, ?, ?, ?, ?, CAST(? AS JSON))
        `,
        [
          offer_id, lineNo, it.vehicle_id || null, desc,
          qty, fromCents(effUnitNetC), taxRate, fromCents(effLineNetC), JSON.stringify(meta)
        ]
      );
    }

    // Keep header discount as present on the offer (do NOT overwrite with line discounts)
    const headerDiscC = toCents(offer.discount_amount || 0);
    const vatRate = Number(offer.vat_rate || 0);

    const netAfterDiscC = Math.max(0, sumSubtotalC - headerDiscC);
    const vatC = Math.round(netAfterDiscC * (vatRate / 100));
    const totalC = netAfterDiscC + vatC;

    await conn.query(
      `
      UPDATE offer
      SET subtotal_amount = ?, vat_amount = ?, total_amount = ?
      WHERE offer_id = ?
      `,
      [fromCents(sumSubtotalC), fromCents(vatC), fromCents(totalC), offer_id]
    );

    const [[updated]] = await conn.query(`SELECT * FROM offer WHERE offer_id = ?`, [offer_id]);
    return updated;
  });
}

async function getOfferByUUID(uuid) {
  const pool = getPool();
  const [[offer]] = await pool.query('SELECT * FROM offer WHERE offer_uuid=?', [uuid]);
  if (!offer) return null;

  const [items] = await pool.query(
    `SELECT offer_item_id, offer_id, line_no, item_type, vehicle_id, description,
            quantity, unit_price, vat_rate, line_total, metadata_json, created_at
       FROM offer_item
      WHERE offer_id=?
      ORDER BY line_no`,
    [offer.offer_id]
  );

  const [[pdfMeta]] = await pool.query(
    `SELECT version_no, status, gcs_bucket, gcs_path, bytes_size, sha256_hex, created_at
       FROM offer_pdf_version
      WHERE offer_id=?
      ORDER BY version_no DESC
      LIMIT 1`,
    [offer.offer_id]
  );

  return { offer, items, latest_pdf: pdfMeta || null };
}

async function listOffers({ term = null, limit = 25, offset = 0, status = null } = {}) {
  const pool = getPool();
  let sql = `
    SELECT o.offer_uuid, o.offer_number, o.status, o.created_at, o.valid_until,
           o.currency, o.total_amount, o.customer_id,
           c.display_name AS customer_name
      FROM offer o
      LEFT JOIN customer c ON c.customer_id = o.customer_id
  `;
  const where = [];
  const args = [];
  if (status) { where.push('o.status=?'); args.push(status); }
  if (term) {
    where.push('(o.offer_number LIKE ? OR c.display_name LIKE ?)');
    args.push(`%${term}%`, `%${term}%`);
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
  args.push(Number(limit), Number(offset));
  const [rows] = await pool.query(sql, args);
  return rows;
}

async function updateDraftFields(uuid, patch = {}) {
  const pool = getPool();
  const fields = [];
  const args = [];
  const allowed = ['customer_id', 'currency', 'vat_rate', 'valid_until', 'notes_public', 'notes_internal', 'discount_amount'];
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) {
      fields.push(`${k}=?`);
      args.push(patch[k]);
    }
  }
  if (!fields.length) return;

  args.push(uuid);
  await pool.query(
    `UPDATE offer SET ${fields.join(', ')}
      WHERE offer_uuid=? AND status IN ('draft','revised')`,
    args
  );
}

/**
 * Add a vehicle line (NET). If metadata_json missing, insert null.
 */
async function addVehicleLine(uuid, { item_type, vehicle_id, quantity, unit_price, description = null, metadata_json = null }) {
  if (vehicle_id == null) throw new Error('vehicle_id required');
  if (quantity == null || unit_price == null) throw new Error('quantity and unit_price required');

  await withTransaction(async (conn) => {
    const [[offer]] = await conn.query(
      'SELECT offer_id, status, vat_rate FROM offer WHERE offer_uuid=? FOR UPDATE',
      [uuid]
    );
    if (!offer) throw new Error('Offer not found');
    if (!['draft', 'revised'].includes(offer.status)) throw new Error('Offer not editable');

    const [[ln]] = await conn.query(
      'SELECT COALESCE(MAX(line_no),0)+1 AS next_no FROM offer_item WHERE offer_id=?',
      [offer.offer_id]
    );
    const line_no = ln.next_no;

    if (!description) description = `Vehicle #${vehicle_id}`;

    const qty = Number(quantity) || 0;
    const unitNetC = toCents(unit_price);
    const lineTotalC = Math.round(unitNetC * qty);
    const line_total = fromCents(lineTotalC);

    await conn.query(
      `INSERT INTO offer_item
         (offer_id, line_no, item_type, vehicle_id, description, quantity, unit_price, vat_rate, line_total, metadata_json)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        offer.offer_id, line_no, item_type, vehicle_id, description,
        qty, fromCents(unitNetC), offer.vat_rate, line_total,
        metadata_json ? JSON.stringify(metadata_json) : null
      ]
    );

    await recomputeTotals(conn, offer.offer_id);
  });
}

async function updateLine(uuid, line_no, patch = {}) {
  await withTransaction(async (conn) => {
    const [[offer]] = await conn.query('SELECT offer_id, status, vat_rate FROM offer WHERE offer_uuid=? FOR UPDATE', [uuid]);
    if (!offer) throw new Error('Offer not found');
    if (!['draft', 'revised'].includes(offer.status)) throw new Error('Offer not editable');

    const [[row]] = await conn.query(
      'SELECT quantity, unit_price, vat_rate FROM offer_item WHERE offer_id=? AND line_no=? FOR UPDATE',
      [offer.offer_id, line_no]
    );
    if (!row) throw new Error('Line not found');

    const newQty = Object.prototype.hasOwnProperty.call(patch, 'quantity') ? Number(patch.quantity) : Number(row.quantity);
    const newUnit = Object.prototype.hasOwnProperty.call(patch, 'unit_price') ? Number(patch.unit_price) : Number(row.unit_price);
    const newVatRate = Object.prototype.hasOwnProperty.call(patch, 'vat_rate') ? Number(patch.vat_rate) : Number(row.vat_rate || offer.vat_rate);

    const qty = Math.max(0, Number(newQty || 0));
    const unitNetC = toCents(newUnit);
    const lineTotalC = Math.round(unitNetC * qty);

    const sets = [];
    const args = [];

    const allowed = ['description', 'metadata_json'];
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(patch, k)) {
        if (k === 'metadata_json') { sets.push('metadata_json=?'); args.push(JSON.stringify(patch[k])); }
        else { sets.push('description=?'); args.push(patch[k]); }
      }
    }

    sets.push('quantity=?');      args.push(qty);
    sets.push('unit_price=?');    args.push(fromCents(unitNetC));
    sets.push('vat_rate=?');      args.push(newVatRate);
    sets.push('line_total=?');    args.push(fromCents(lineTotalC));

    args.push(offer.offer_id, line_no);
    await conn.query(`UPDATE offer_item SET ${sets.join(', ')} WHERE offer_id=? AND line_no=?`, args);

    await recomputeTotals(conn, offer.offer_id);
  });
}

async function deleteLine(uuid, line_no) {
  await withTransaction(async (conn) => {
    const [[offer]] = await conn.query('SELECT offer_id, status FROM offer WHERE offer_uuid=? FOR UPDATE', [uuid]);
    if (!offer) throw new Error('Offer not found');
    if (!['draft', 'revised'].includes(offer.status)) throw new Error('Offer not editable');

    await conn.query('DELETE FROM offer_item WHERE offer_id=? AND line_no=?', [offer.offer_id, line_no]);

    const [rows] = await conn.query('SELECT offer_item_id FROM offer_item WHERE offer_id=? ORDER BY line_no', [offer.offer_id]);
    let i = 1;
    for (const r of rows) {
      await conn.query('UPDATE offer_item SET line_no=? WHERE offer_item_id=?', [i++, r.offer_item_id]);
    }

    await recomputeTotals(conn, offer.offer_id);
  });
}

async function recomputeTotals(conn, offer_id) {
  const [items] = await conn.query('SELECT line_total FROM offer_item WHERE offer_id=?', [offer_id]);
  const subtotalC = items.reduce((s, r) => s + toCents(r.line_total), 0);

  const [[o]] = await conn.query('SELECT discount_amount, vat_rate FROM offer WHERE offer_id=?', [offer_id]);
  const discountC = toCents(o.discount_amount || 0);
  const vatRate = Number(o.vat_rate || 0);

  const netAfterDiscC = Math.max(0, subtotalC - discountC);
  const vatC = Math.round(netAfterDiscC * (vatRate / 100));
  const totalC = netAfterDiscC + vatC;

  await conn.query(
    'UPDATE offer SET subtotal_amount=?, discount_amount=?, vat_amount=?, total_amount=? WHERE offer_id=?',
    [fromCents(subtotalC), fromCents(discountC), fromCents(vatC), fromCents(totalC), offer_id]
  );
}

async function renderDraftPdf(uuid, admin_id = null) {
  return await withTransaction(async (conn) => {
    const [[offer]] = await conn.query('SELECT * FROM offer WHERE offer_uuid=? FOR UPDATE', [uuid]);
    if (!offer) throw new Error('Offer not found');

    const snapshot = await buildOfferSnapshot(conn, offer.offer_id);

    const [[v]] = await conn.query(
      'SELECT COALESCE(MAX(version_no),0) AS v FROM offer_pdf_version WHERE offer_id=?',
      [offer.offer_id]
    );
    const version_no = (v.v || 0) + 1;

    const pdfBuffer = await renderOfferPdfBuffer(snapshot);
    const up = await uploadOfferPdfBuffer({
      year: offer.offer_year || new Date().getFullYear(),
      offer_number: offer.offer_number || null,
      offer_uuid: offer.offer_uuid,
      version: version_no,
      buffer: pdfBuffer
    });

    await conn.query(
      `INSERT INTO offer_pdf_version
         (offer_id, version_no, status, snapshot_json, gcs_bucket, gcs_path, bytes_size, sha256_hex, created_by_admin_id)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        offer.offer_id, version_no, 'draft', JSON.stringify(snapshot),
        process.env.BUCKET_PRIVATE || 'dm-assets-private', up.gcsKey, up.byte_size, up.sha256, admin_id
      ]
    );

    return { version_no, gcs_path: up.gcsKey };
  });
}

async function issueOffer(uuid, admin_id = null) {
  return await withTransaction(async (conn) => {
    const [[offer]] = await conn.query('SELECT * FROM offer WHERE offer_uuid=? FOR UPDATE', [uuid]);
    if (!offer) throw new Error('Offer not found');
    if (!offer.customer_id) throw new Error('Cannot issue without customer');
    if (offer.status === 'issued') throw new Error('Already issued');

    const { year, seq, offer_number } = await allocateOfferNumber(conn);

    await conn.query(
      'UPDATE offer SET offer_year=?, offer_seq=?, offer_number=?, status="issued" WHERE offer_id=?',
      [year, seq, offer_number, offer.offer_id]
    );

    const snapshot = await buildOfferSnapshot(conn, offer.offer_id);

    const [[v]] = await conn.query('SELECT COALESCE(MAX(version_no),0) AS v FROM offer_pdf_version WHERE offer_id=?', [offer.offer_id]);
    const version_no = (v.v || 0) + 1;

    const pdfBuffer = await renderOfferPdfBuffer(snapshot);
    const up = await uploadOfferPdfBuffer({
      year, offer_number, offer_uuid: offer.offer_uuid, version: version_no, buffer: pdfBuffer
    });

    await conn.query(
      `INSERT INTO offer_pdf_version
         (offer_id, version_no, status, snapshot_json, gcs_bucket, gcs_path, bytes_size, sha256_hex, created_by_admin_id)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        offer.offer_id, version_no, 'issued', JSON.stringify(snapshot),
        process.env.BUCKET_PRIVATE || 'dm-assets-private', up.gcsKey, up.byte_size, up.sha256, admin_id
      ]
    );

    await conn.query(
      'INSERT INTO offer_event (offer_id, event_type, meta_json, admin_id) VALUES (?,?,?,?)',
      [offer.offer_id, 'issued', JSON.stringify({ version_no, gcs_path: up.gcsKey }), admin_id]
    );

    return { offer_number, version_no, gcs_path: up.gcsKey };
  });
}

async function reviseOffer(uuid) {
  const pool = getPool();
  const [r] = await pool.query(
    'UPDATE offer SET status="revised" WHERE offer_uuid=? AND status="issued"',
    [uuid]
  );
  if (!r.affectedRows) throw new Error('Offer not found or not issued');
}

async function getSignedPdfUrl(uuid, version_no, { minutes = 10 } = {}) {
  const pool = getPool();
  const [[o]] = await pool.query('SELECT offer_id FROM offer WHERE offer_uuid=?', [uuid]);
  if (!o) throw new Error('Offer not found');

  const [[v]] = await pool.query(
    'SELECT gcs_path, bytes_size FROM offer_pdf_version WHERE offer_id=? AND version_no=?',
    [o.offer_id, version_no]
  );
  if (!v) throw new Error('Version not found');

  const byteSize = v.bytes_size || 0;
  if (byteSize <= 0) throw new Error('PDF not available');

  return await getSignedOfferPdfUrl(v.gcs_path, { minutes }, byteSize);
}

async function withdrawOffer(uuid, admin_id = null) {
  return await withTransaction(async (conn) => {
    const [[offer]] = await conn.query(
      'SELECT offer_id, status FROM offer WHERE offer_uuid=? FOR UPDATE',
      [uuid]
    );
    if (!offer) throw new Error('Offer not found');

    const current = String(offer.status || '').toLowerCase();
    const allowed = new Set(['draft', 'issued', 'revised', 'signed']);
    if (!allowed.has(current)) {
      throw new Error(`Cannot withdraw offer in status '${offer.status}'.`);
    }

    await conn.query('UPDATE offer SET status="withdrawn" WHERE offer_id=?', [offer.offer_id]);

    await conn.query(
      'INSERT INTO offer_event (offer_id, event_type, meta_json, admin_id) VALUES (?,?,?,?)',
      [offer.offer_id, 'withdrawn', JSON.stringify({ prev_status: offer.status }), admin_id]
    );

    return { status: 'withdrawn' };
  });
}

module.exports = {
  createDraft,
  replaceItemsAndRecalc,
  getOfferByUUID,
  listOffers,
  updateDraftFields,
  addVehicleLine,
  updateLine,
  deleteLine,
  renderDraftPdf,
  issueOffer,
  reviseOffer,
  getSignedPdfUrl,
  withdrawOffer
};
