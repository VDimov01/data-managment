const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const {getPool} = require('../db'); // adjust if your pool lives elsewhere
const pool = getPool();
const React = require('react');
const { ensureEditionSpecsPdf, getSignedUrl } = require('../services/specsPDF');
const { decryptNationalId } = require('../services/cryptoCust.js');
const { getCurrentUserId } = require('../utils/getCurrentUser');

const {
  renderContractPdfBuffer,
  uploadContractPdfBuffer,
  getSignedReadUrl,
} = require('../services/contractPDF');

const {
  renderInvoicePdfBuffer,
  uploadInvoicePdfBuffer,
  getSignedInvoiceReadUrl,
} = require('../services/invoiceServicePDF');


async function withTxn(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Pull the buyer shape your PDFs expect. Fix column names here if your schema differs.
async function loadBuyer(conn, customer_id) {
  const [rows] = await conn.query(
    `
    SELECT
      c.customer_id, c.customer_type,
      c.company_name, c.vat_number, c.address_line, c.city, c.country, c.email, c.phone,
      c.rep_first_name, c.rep_middle_name, c.rep_last_name,
      c.first_name, c.middle_name, c.last_name, c.display_name,
      c.national_id_enc, c.tax_id
    FROM customer c
    WHERE c.customer_id = ?
    `,
    [customer_id]
  );
  if (!rows.length) throw new Error('Customer not found');
  
  let national_id = null;
  try { national_id = decryptNationalId(rows[0].national_id_enc); } catch {}

  rows[0].national_id = national_id;

  return rows[0];
}

// Pull item snapshots (joins for text fields + the DECIMAL unit_price)
async function loadItemsSnapshot(conn, contract_id) {
  const [rows] = await conn.query(
    `
    SELECT
      ci.contract_item_id,
      ci.vehicle_id,
      ci.quantity,
      ci.unit_price,
      ci.discount_type,
      ci.discount_value,
      ci.line_total,
      ci.currency_code,

      v.vin, v.mileage,
      mo.name AS model,
      mk.name AS maker,
      e.name  AS edition,
      
      cext.color_id AS exterior_color_id,
      cext.name_bg     AS exterior_color,
      cint.color_id AS interior_color_id,
      cint.name_bg     AS interior_color

    FROM contract_item ci

    JOIN vehicle v     ON v.vehicle_id = ci.vehicle_id
    JOIN edition e     ON e.edition_id = v.edition_id
    JOIN model_year my ON my.model_year_id = e.model_year_id
    JOIN model mo      ON mo.model_id = my.model_id
    JOIN make mk       ON mk.make_id = mo.make_id
    LEFT JOIN color cext ON cext.color_id = v.exterior_color_id AND cext.type = 'exterior'
    LEFT JOIN color cint ON cint.color_id = v.interior_color_id AND cint.type = 'interior'
    WHERE ci.contract_id = ?
    ORDER BY ci.contract_item_id
    `,
    [contract_id]
  );

  return rows.map(r => ({
    vehicle_id: r.vehicle_id,
    quantity: r.quantity,
    unit_price: r.unit_price,           // DECIMAL as string from driver
    discount_type: r.discount_type,
    discount_amount: r.discount_value,
    line_total: r.line_total,
    currency_code: r.currency_code,
    vin: r.vin,
    exterior_color: r.exterior_color,
    interior_color: r.interior_color,
    mileage: r.mileage,
    maker: r.maker,
    model: r.model,
    edition: r.edition,
  }));
}

function toMySqlDateTime(dt) {
  if (!dt) return null;
  // accept 'YYYY-MM-DD' or ISO; output 'YYYY-MM-DD HH:MM:SS'
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

async function nextContractNumber(conn) {
  // naive example; replace with your own sequence generator
  const [r] = await conn.query(`SELECT LPAD(IFNULL(MAX(contract_id)+1,1), 6, '0') AS n FROM contract`);
  return `CNT-${r[0].n}`;
}

async function nextInvoiceNumber(conn) {
  const [r] = await conn.query(
    `SELECT LPAD(IFNULL(MAX(invoice_id)+1,1), 6, '0') AS n FROM invoice`
  );
  return `INV-${r[0].n}`;
}

function toDecimalString(val) {
  if (val == null || val === '') return null;
  const n = Number(String(val).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2); // DECIMAL(12,2) string
}

function computeLineTotals(qty, unitPriceStr, discount_type, discount_value, tax_rate) {
  const unit = Number(unitPriceStr);
  const sub  = qty * unit;
  let disc = 0;
  if (discount_type === 'amount') {
    disc = Math.max(0, Number(toDecimalString(discount_value) || 0));
  } else if (discount_type === 'percent') {
    const p = Math.max(0, Number(toDecimalString(discount_value) || 0));
    disc = sub * (p / 100);
  }
  const taxableBase = Math.max(0, sub - disc);
  const tax = tax_rate != null ? taxableBase * (Number(toDecimalString(tax_rate)) / 100) : 0;
  const total = taxableBase + tax;
  return {
    subtotal: sub,
    discount: disc,
    tax,
    total: Number.isFinite(total) ? total : 0
  };
}

function buildItemTitle(v) {
  const parts = [
    v.make_name, v.model_name, v.year ? `(${v.year})` : null, '—', v.edition_name || 'Edition'
  ].filter(Boolean);
  return parts.join(' ');
}

function buildItemSubtitle(v) {
  const bits = [];
  bits.push(`VIN: ${v.vin || '—'}`);
  if (v.mileage_km != null) bits.push(`Mileage: ${v.mileage_km} km`);
  return bits.join(' • ');
}

// ---------- endpoints ----------

// GET /api/contracts
router.get('/', async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10)));
    const offset = (page - 1) * limit;
    const status = (req.query.status || '').toLowerCase();
    const q      = (req.query.q || '').trim();

    const where = [];
    const params = [];

    if (status && ['draft','issued','viewed','signed','declined','withdrawn','expired'].includes(status)) {
      where.push(`c.status = ?`);
      params.push(status);
    }
    if (q) {
      where.push(`(
        c.contract_number LIKE ? OR
        c.uuid LIKE ? OR
        cust.display_name LIKE ?
      )`);
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Main page rows
    const [rows] = await pool.query(
      `
      SELECT
        c.contract_id, c.uuid, c.contract_number, c.status, c.type, c.currency_code,
        c.valid_until, c.total, c.created_at, c.updated_at, c.customer_id,
        cust.display_name, cust.customer_type, cust.phone, cust.email,
        COALESCE(ic.item_count, 0) AS items_count,
        COALESCE(vx.vehicles_json, JSON_ARRAY()) AS vehicles_json
      FROM contract c
      JOIN customer cust ON cust.customer_id = c.customer_id
      LEFT JOIN (
        SELECT contract_id, COUNT(*) AS item_count
        FROM contract_item
        GROUP BY contract_id
      ) ic ON ic.contract_id = c.contract_id
      LEFT JOIN (
        SELECT
          ci.contract_id,
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'vehicle_id', v.vehicle_id,
              'vin', v.vin,
              'asking_price', v.asking_price,
              'make_name', mk.name,
              'model_name', md.name,
              'year', my.year,
              'edition_name', ed.name
            )
          ) AS vehicles_json
        FROM contract_item ci
        JOIN vehicle v        ON v.vehicle_id = ci.vehicle_id
        JOIN edition ed       ON ed.edition_id = v.edition_id
        JOIN model_year my    ON my.model_year_id = ed.model_year_id
        JOIN model md         ON md.model_id = my.model_id
        JOIN make mk          ON mk.make_id = md.make_id
        GROUP BY ci.contract_id
      ) vx ON vx.contract_id = c.contract_id
      ${whereSql}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    // Total count for pagination
    const [countRows] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM contract c
      JOIN customer cust ON cust.customer_id = c.customer_id
      ${whereSql}
      `,
      params
    );

    const items = rows.map(r => ({
      contract_id: r.contract_id,
      uuid: r.uuid,
      contract_number: r.contract_number,
      status: r.status,
      type: r.type,
      currency_code: r.currency_code,
      valid_until: r.valid_until,
      total: r.total,
      created_at: r.created_at,
      updated_at: r.updated_at,
      customer_id: r.customer_id,
      customer_display_name: r.display_name,
      customer_type: r.customer_type,
      customer_phone: r.phone,
      customer_email: r.email,
      items_count: Number(r.items_count || 0),
      vehicles: (() => {
        try {
          const arr = JSON.parse(r.vehicles_json || '[]');
          return Array.isArray(arr) ? arr.filter(Boolean) : [];
        } catch { return []; }
      })()
    }));

    res.json({
      page, limit, total: countRows[0]?.total || 0,
      items
    });
  } catch (e) {
    console.error('GET /contracts', e);
    res.status(500).json({ error: 'DB error' });
  }
});


// Cancel contract & release vehicles
router.post('/:contract_id/cancel', async (req, res) => {
  try {
    const contract_id = Number(req.params.contract_id);
    const { force = false } = req.body || {};
    if (!contract_id) return res.status(400).json({ error: 'contract_id required' });

    const out = await withTxn(async (conn) => {
      // Lock contract row
      const [[contract]] = await conn.query(
        `SELECT * FROM contract WHERE contract_id = ? FOR UPDATE`,
        [contract_id]
      );
      if (!contract) throw new Error('contract not found');

      // Optional guard: block cancel if signed unless force=true
      if (contract.status === 'signed' && !force) {
        throw new Error('contract is signed; pass { force: true } to cancel anyway');
      }

      // Lock all vehicles reserved by this contract (so nobody races us)
      const [locks] = await conn.query(
        `SELECT vehicle_id
           FROM vehicle
          WHERE reserved_by_contract_id = ?
          FOR UPDATE`,
        [contract_id]
      );

      // Release vehicles
      const [rel] = await conn.query(
        `UPDATE vehicle
            SET reserved_by_contract_id = NULL,
                reserved_at = NULL,
                reserved_until = NULL,
                status = "Available"
          WHERE reserved_by_contract_id = ?`,
        [contract_id]
      );

      // Mark contract withdrawn (admin-driven cancel)
      await conn.query(
        `UPDATE contract
            SET status = 'withdrawn',
                updated_at = NOW()
          WHERE contract_id = ?`,
        [contract_id]
      );

      return {
        contract_id,
        released_count: rel.affectedRows || 0,
        status: 'withdrawn'
      };
    });

    res.json(out);
  } catch (e) {
    console.error('POST /contracts/:contract_id/cancel', e);
    res.status(400).json({ error: e.message || 'Cancel failed' });
  }
});



// Create draft
// body: { customer_id, type: 'ADVANCE'|'REGULAR', expires_at?: ISO, currency_code?: 'BGN', advance_amount?: DECIMAL as number/string, note?: string }
router.post('/', async (req, res) => {
  try {
    const {
      customer_id,
      type, // 'ADVANCE' | 'REGULAR'
      currency,                  // optional; we’ll also accept currency_code
      currency_code = 'BGN',
      valid_until,               // optional
      expires_at,                // frontend might send this name
      note = null,
      contract_number,
      advance_amount = null,
      buyer_snapshot = null,     // optional JSON object
      buyer_snapshot_json = null // optional JSON object (alt key)
    } = req.body || {};

    if (!customer_id) return res.status(400).json({ error: 'customer_id is required' });
    if (!['ADVANCE','REGULAR','REGULAR EXTENDED'].includes(type)) {
      return res.status(400).json({ error: 'type must be ADVANCE/REGULAR/REGULAR EXTENDED' });
    }

    const out = await withTxn(async (conn) => {
      // pull fresh buyer data if not provided by client
      const fromDb = await loadBuyer(conn, customer_id); // make sure this returns an object
      const snapshotObj = buyer_snapshot || buyer_snapshot_json || fromDb;
      if (!snapshotObj || typeof snapshotObj !== 'object') {
        throw new Error('buyer_snapshot is required (server can derive it via loadBuyer)');
      }
      const snapshotJson = JSON.stringify(snapshotObj);

      const contract_uuid = uuidv4();
      const status = 'draft';
      const typeNorm = type; // already validated
      const curr = (currency || currency_code || 'BGN').toUpperCase().slice(0,3);

      // accept either valid_until or expires_at (YYYY-MM-DD or ISO); store as DATETIME
      let vu = null;
      const rawVU = valid_until || expires_at || null;
      if (rawVU) {
        // If just a date is provided, set end of day for “valid until”
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(rawVU))) {
          vu = `${rawVU} 23:59:59`;
        } else {
          vu = toMySqlDateTime(rawVU);
        }
      }

      // MUST be provided (NOT NULL column). Replace with real auth.
      const created_by_user_id = getCurrentUserId(req);

      // contract_number is NOT NULL UNIQUE; generate if blank
      const number = (contract_number && String(contract_number).trim())
        ? String(contract_number).trim()
        : await nextContractNumber(conn);

      const [ins] = await conn.execute(
        `
        INSERT INTO contract
          (uuid, status, contract_number, type, customer_id,
           currency, currency_code, advance_amount, note, valid_until,
           created_by_user_id, created_at, buyer_snapshot_json)
        VALUES
          (?, ?, ?, ?, ?,
           ?, ?, ?, ?, ?,
           ?, NOW(), CAST(? AS JSON))
        `,
        [
          contract_uuid, status, number, typeNorm, customer_id,
          curr, curr, (advance_amount ?? null), (note ?? null), vu,
          created_by_user_id, snapshotJson
        ]
      );

      const [[row]] = await conn.query(`SELECT * FROM contract WHERE contract_id = ?`, [ins.insertId]);
      return row;
    });

    res.status(201).json(out);
  } catch (e) {
    console.error('POST /contracts', e);
    res.status(500).json({ error: e.message || 'DB error' });
  }
});


// Add/replace items on a draft
// body: { items: [...], advance_amount?: string|null }
router.put('/:contract_id/items', async (req, res) => {
  try {
    const contract_id = Number(req.params.contract_id);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!contract_id || items.length === 0) {
      return res.status(400).json({ error: 'contract_id and items required' });
    }

    // detect presence vs. value so we don't overwrite unintentionally
    const hasAdvanceInBody = Object.prototype.hasOwnProperty.call(req.body, 'advance_amount');
    let advAmount = null;
    if (hasAdvanceInBody) {
      const raw = req.body.advance_amount;
      // reuse your helper if you already have it:
      advAmount = (raw == null || raw === '') ? null : toDecimalString(raw);
      if (advAmount != null && Number(advAmount) < 0) {
        return res.status(400).json({ error: 'advance_amount must be >= 0' });
      }
    }

    const result = await withTxn(async (conn) => {
      // Load contract
      const [[contract]] = await conn.query(`SELECT * FROM contract WHERE contract_id = ?`, [contract_id]);
      if (!contract) throw new Error('contract not found');
      if (contract.status !== 'draft') throw new Error('only DRAFT contracts can be edited');

      // Optional: enforce business rule – only allow setting advance for ADVANCE contracts
      if (hasAdvanceInBody && contract.type !== 'ADVANCE') {
        throw new Error('advance_amount can only be set for ADVANCE contracts');
      }

      const vehicleIds = items.map(i => Number(i.vehicle_id)).filter(Boolean);
      if (!vehicleIds.length) throw new Error('items must include vehicle_id');

      // Load vehicles...
      const [veh] = await conn.query(
        `
        SELECT
          v.vehicle_id, v.asking_price, v.edition_id, v.vin,
          v.exterior_color_id, v.interior_color_id, v.mileage,
          e.name AS edition_name,
          my.year,
          mo.name AS model_name,
          m.name  AS make_name
        FROM vehicle v
        JOIN edition e     ON e.edition_id     = v.edition_id
        JOIN model_year my ON my.model_year_id = e.model_year_id
        JOIN model mo      ON mo.model_id      = my.model_id
        JOIN make  m       ON m.make_id        = mo.make_id
        WHERE v.vehicle_id IN (${vehicleIds.map(()=>'?').join(',')})
        `,
        vehicleIds
      );
      const byId = new Map(veh.map(v => [v.vehicle_id, v]));
      if (byId.size !== vehicleIds.length) {
        const missing = vehicleIds.filter(id => !byId.has(id));
        throw new Error(`vehicles not found: ${missing.join(',')}`);
      }

      // Replace all items
      await conn.query(`DELETE FROM contract_item WHERE contract_id = ?`, [contract_id]);

      let pos = 1;
      const currency = (contract.currency_code || 'BGN').toUpperCase().slice(0,3);

      for (const raw of items) {
        const v = byId.get(Number(raw.vehicle_id));
        const qty = 1; // <— always 1

        const explicitUnit = toDecimalString(raw.unit_price);
        const fallbackUnit = toDecimalString(v.asking_price);
        const unit_price   = explicitUnit ?? fallbackUnit;
        if (unit_price == null) {
          throw new Error(`vehicle ${v.vehicle_id} has no price (send unit_price or set asking_price)`);
        }

        // Optional discount/tax (keep what you already had)
        const discount_type  = (raw.discount_type === 'amount' || raw.discount_type === 'percent') ? raw.discount_type : null;
        const discount_value = discount_type ? toDecimalString(raw.discount_value) : null;
        const tax_rate       = raw.tax_rate != null ? toDecimalString(raw.tax_rate) : null;

        const { total } = computeLineTotals(qty, unit_price, discount_type, discount_value, tax_rate);
        const line_total = toDecimalString(total);

        const title    = buildItemTitle(v);
        const subtitle = buildItemSubtitle(v);

        const spec_snapshot = {
          vehicle_id: v.vehicle_id,
          vin: v.vin || null,
          make: v.make_name,
          model: v.model_name,
          year: v.year,
          edition: v.edition_name,
          mileage_km: v.mileage_km ?? null,
          asking_price: fallbackUnit ? Number(fallbackUnit) : null,
          currency_code: currency,
          quantity: qty,
        };

        await conn.execute(
          `
          INSERT INTO contract_item
            (contract_id, vehicle_id, quantity, unit_price,
             discount_type, discount_value, tax_rate, line_total,
             title, subtitle, spec_snapshot_json, position,
             currency_code, created_at)
          VALUES
            (?, ?, ?, ?,
             ?, ?, ?, ?,
             ?, ?, CAST(? AS JSON), ?,
             ?, NOW())
          `,
          [
            contract_id, v.vehicle_id, qty, unit_price,
            discount_type, discount_value, tax_rate, line_total,
            title, subtitle, JSON.stringify(spec_snapshot), pos++,
            currency
          ]
        );
      }

      // Recalc totals from items
      const [[tot]] = await conn.query(
        `
        SELECT
          COALESCE(SUM(quantity * unit_price), 0) AS subtotal,
          COALESCE(SUM(
            CASE
              WHEN discount_type = 'amount'  THEN COALESCE(discount_value,0)
              WHEN discount_type = 'percent' THEN (quantity * unit_price) * (COALESCE(discount_value,0)/100)
              ELSE 0
            END
          ), 0) AS discount_total,
          COALESCE(SUM(
            CASE
              WHEN tax_rate IS NOT NULL THEN
                ((quantity * unit_price) -
                  COALESCE(
                    CASE
                      WHEN discount_type = 'amount'  THEN discount_value
                      WHEN discount_type = 'percent' THEN (quantity * unit_price) * (discount_value/100)
                      ELSE 0
                    END, 0
                  )
                ) * (tax_rate/100)
              ELSE 0
            END
          ), 0) AS tax_total,
          COALESCE(SUM(line_total), 0) AS total
        FROM contract_item
        WHERE contract_id = ?
        `,
        [contract_id]
      );

      // Build dynamic UPDATE so we only touch advance_amount if it was provided
      let sql = `
        UPDATE contract
           SET subtotal = ?, discount_total = ?, tax_total = ?, total = ?, updated_at = NOW()
      `;
      const params = [tot.subtotal, tot.discount_total, tot.tax_total, tot.total];

      if (hasAdvanceInBody) {
        sql += `, advance_amount = ?`;
        params.push(advAmount); // can be null to clear
      }

      sql += ` WHERE contract_id = ?`;
      params.push(contract_id);

      await conn.execute(sql, params);

      const [rows] = await conn.query(
        `SELECT * FROM contract_item WHERE contract_id = ? ORDER BY position ASC`,
        [contract_id]
      );

      return { contract_id, items: rows, totals: tot, advance_amount: hasAdvanceInBody ? advAmount : contract.advance_amount };
    });

    res.json(result);
  } catch (e) {
    console.error('PUT /contracts/:id/items', e);
    res.status(400).json({ error: e.message || 'Bad request' });
  }
});


// Issue contract (generate version 1+, reserve vehicles)
// routes/contracts.js  (patch this handler)
router.post('/:contract_id/issue', async (req, res) => {
  try {
    const contract_id = Number(req.params.contract_id);
    const { override_reserved = false } = req.body || {};

    // derive created_by_user_id; adjust to your auth
    const createdBy = getCurrentUserId(req);
    // const createdBy = 2; // TEMPORARY HACK; fix your auth

    if (!contract_id) {
      return res.status(400).json({ error: 'contract_id required' });
    }

    const out = await withTxn(async (conn) => {
      const [[contract]] = await conn.query(
        `SELECT * FROM contract WHERE contract_id = ? FOR UPDATE`,
        [contract_id]
      );
      if (!contract) throw new Error('contract not found');
      if (contract.status === 'issued' && !override_reserved) {
        throw new Error('already issued');
      }

      const buyer  = await loadBuyer(conn, contract.customer_id);
      const items  = await loadItemsSnapshot(conn, contract_id);
      if (!items.length) throw new Error('contract has no items');

      // lock vehicles
      const vehicleIds = items.map(i => i.vehicle_id);
      const [locks] = await conn.query(
        `SELECT vehicle_id, reserved_by_contract_id
           FROM vehicle
          WHERE vehicle_id IN (${vehicleIds.map(()=>'?').join(',')})
          FOR UPDATE`,
        vehicleIds
      );
      for (const r of locks) {
        if (r.reserved_by_contract_id && r.reserved_by_contract_id !== contract_id) {
          throw new Error(`vehicle ${r.vehicle_id} reserved by another contract`);
        }
      }

      // DECIMAL-safe total
      const [[tot]] = await conn.query(
        `SELECT COALESCE(SUM(quantity * line_total), 0) AS total
           FROM contract_item WHERE contract_id = ?`,
        [contract_id]
      );
      const total_amount   = tot.total; // DECIMAL string
      const advance_amount = contract.type === 'ADVANCE' ? contract.advance_amount : null;

      // next version
      const [[ver]] = await conn.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_ver
           FROM contract_pdf WHERE contract_id = ?`,
        [contract_id]
      );
      const version = ver.next_ver;

      // render + upload
      const buffer = await renderContractPdfBuffer({
        type: contract.type,
        buyer,
        items,
        advance_amount,
      });

      const { gcsKey, size, sha256 } = await uploadContractPdfBuffer({
        contract_uuid: contract.uuid,
        version,
        buffer,
      });

      // required columns for contract_pdf
      const filename      = `contract-${contract.contract_number || contract.uuid}-v${String(version).padStart(3, '0')}.pdf`;
      const content_type  = 'application/pdf';
      const public_url    = null; // private bucket

      const [insPdf] = await conn.query(
        `INSERT INTO contract_pdf
           (contract_id, version, filename, content_type, byte_size, sha256, public_url, created_at, created_by_user_id, gcs_key)
         VALUES
           (?,           ?,       ?,        ?,            ?,         ?,      ?,          NOW(),     ?,                 ?)`,
        [contract_id, version, filename, content_type, size, sha256, public_url, createdBy, gcsKey]
      );

      // reserve vehicles until contract.valid_until
      const reservedUntil = contract.valid_until || null;
      await conn.query(
        `UPDATE vehicle
            SET reserved_by_contract_id = ?, reserved_at = NOW(), reserved_until = ?, status = "Reserved"
          WHERE vehicle_id IN (${vehicleIds.map(()=>'?').join(',')})`,
        [contract_id, reservedUntil, ...vehicleIds]
      );

      // update contract – align with your schema (lowercase status; total column names)
      await conn.query(
        `UPDATE contract
            SET status = 'issued',
                pdf_generated_at = NOW(),
                latest_pdf_id = ?,
                total = ?,
                pdf_sha256 = ?,
                pdf_url = NULL
          WHERE contract_id = ?`,
        [insPdf.insertId, total_amount, sha256, contract_id]
      );

      const signed = await getSignedReadUrl(gcsKey, { minutes: 10 });
      return {
        contract_id,
        version,
        gcsKey,
        total: total_amount,         // DECIMAL string
        advance_amount,              // DECIMAL string or null
        pdf: {
          ...signed,                 // { signedUrl, expiresAt }
          filename,
          content_type,
          byte_size: size,
          sha256,
        }
      };
    });

    res.json(out);
  } catch (e) {
    console.error('POST /contracts/:contract_id/issue', e);
    res.status(400).json({ error: e.message || 'Issue failed' });
  }
});


// Regenerate (new version; keep history)
router.post('/:contract_id/pdf', async (req, res) => {
  try {
    const contract_id = Number(req.params.contract_id);
    if (!contract_id) return res.status(400).json({ error: 'invalid id' });

    const createdBy = getCurrentUserId(req);

    const out = await withTxn(async (conn) => {
      const [[c]] = await conn.query(`SELECT * FROM contract WHERE contract_id = ? FOR UPDATE`, [contract_id]);
      if (!c) throw new Error('contract not found');

      const buyer = await loadBuyer(conn, c.customer_id);
      const items = await loadItemsSnapshot(conn, contract_id);
      if (!items.length) throw new Error('contract has no items');

      // next version
      const [[ver]] = await conn.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_ver
           FROM contract_pdf WHERE contract_id = ?`,
        [contract_id]
      );
      const version = ver.next_ver;

      // render & upload
      const advance_amount = c.type === 'ADVANCE' ? c.advance_amount : null;
      const buffer = await renderContractPdfBuffer({
        type: c.type,
        buyer,
        items,
        advance_amount,
      });
      const { gcsKey, size, sha256 } = await uploadContractPdfBuffer({
        contract_uuid: c.uuid,
        version,
        buffer,
      });

      const filename     = `contract-${c.contract_number || c.uuid}-v${String(version).padStart(3, '0')}.pdf`;
      const content_type = 'application/pdf';
      const public_url   = null;

      const [insPdf] = await conn.query(
        `INSERT INTO contract_pdf
           (contract_id, version, filename, content_type, byte_size, sha256, public_url, created_at, created_by_user_id, gcs_key)
         VALUES
           (?,           ?,       ?,        ?,            ?,         ?,      ?,          NOW(),     ?,                 ?)`,
        [contract_id, version, filename, content_type, size, sha256, public_url, createdBy, gcsKey]
      );

      // Update contract bookkeeping (do NOT change status or reserve)
      await conn.query(
        `UPDATE contract
            SET latest_pdf_id = ?,
                pdf_generated_at = NOW(),
                pdf_sha256 = ?,
                pdf_url = NULL
          WHERE contract_id = ?`,
        [insPdf.insertId, sha256, contract_id]
      );

      const signed = await getSignedReadUrl(gcsKey, { minutes: 10 });

      return {
        contract_id,
        version,
        pdf: {
          ...signed,
          filename,
          content_type,
          byte_size: size,
          sha256
        }
      };
    });

    res.json(out);
  } catch (e) {
    console.error('POST /contracts/:id/pdf', e);
    res.status(400).json({ error: e.message || 'Regeneration failed' });
  }
});


// Latest PDF signed URL by contract UUID
router.get('/:uuid/pdf/latest', async (req, res) => {
  try {
    const { uuid } = req.params;
    const [[ctr]] = await pool.query(`SELECT contract_id FROM contract WHERE uuid = ?`, [uuid]);
    if (!ctr) return res.status(404).json({ error: 'Not found' });

    const [[row]] = await pool.query(
      `SELECT gcs_key, version
         FROM contract_pdf
        WHERE contract_id = ?
        ORDER BY version DESC
        LIMIT 1`,
      [ctr.contract_id]
    );
    if (!row) return res.status(404).json({ error: 'No PDF yet' });

    const signed = await getSignedReadUrl(row.gcs_key, { minutes: 10 });
    res.json({ version: row.version, ...signed });
  } catch (e) {
    console.error('GET /contracts/:uuid/pdf/latest', e);
    res.status(500).json({ error: 'Server error' });
  }
});


// POST /api/contracts/:id/specs-pdfs  body: { lang?: 'bg' }
router.post('/:contract_id/specs-pdfs', async (req, res) => {
  try {
    const contract_id = Number(req.params.contract_id);
    const lang = (req.body?.lang || 'bg').toLowerCase() === 'en' ? 'en' : 'bg';
    if (!contract_id) return res.status(400).json({ error: 'contract_id required' });

    const out = await withTxn(async (conn) => {
      const [[ctr]] = await conn.query(`SELECT * FROM contract WHERE contract_id = ?`, [contract_id]);
      if (!ctr) throw new Error('contract not found');

      const [items] = await conn.query(`
        SELECT ci.contract_item_id, v.edition_id
        FROM contract_item ci
        JOIN vehicle v ON v.vehicle_id = ci.vehicle_id
        WHERE ci.contract_id = ?`, [contract_id]);

      if (!items.length) throw new Error('no items');

      const created_by_user_id = getCurrentUserId(req);

      // Ensure spec per edition once
      const byEdition = new Map();
      for (const it of items) {
        if (!byEdition.has(it.edition_id)) {
          const { reused, row } = await ensureEditionSpecsPdf(conn, {
            edition_id: it.edition_id,
            lang,
            created_by_user_id
          });
          byEdition.set(it.edition_id, row);
        }
      }

      const results = [];
      for (const it of items) {
        const spec = byEdition.get(it.edition_id);

        // Is it already attached for this contract_item?
        const [[exists]] = await conn.query(
          `SELECT 1 FROM contract_attachment
           WHERE contract_id = ? AND contract_item_id = ? AND attachment_type='edition_specs_pdf'
             AND edition_specs_pdf_id = ?
           LIMIT 1`,
          [contract_id, it.contract_item_id, spec.edition_specs_pdf_id]
        );
        if (!exists) {
          await conn.query(`
            INSERT INTO contract_attachment
              (contract_id, contract_item_id, attachment_type, edition_specs_pdf_id, visibility, created_at, created_by_user_id)
            VALUES
              (?, ?, 'edition_specs_pdf', ?, 'internal', NOW(), ?)`,
            [contract_id, it.contract_item_id, spec.edition_specs_pdf_id, created_by_user_id]
          );
        }

        const signed = await getSignedUrl(spec.gcs_key, 10);
        results.push({
          contract_item_id: it.contract_item_id,
          edition_id: it.edition_id,
          edition_specs_pdf_id: spec.edition_specs_pdf_id,
          version: spec.version,
          filename: spec.filename,
          sha256: spec.sha256,
          signedUrl: signed.signedUrl,
          expiresAt: signed.expiresAt,
          byte_size: spec.byte_size,
        });
      }

      return { contract_id, lang, attachments: results };
    });

    res.json(out);
  } catch (e) {
    console.error('POST /contracts/:id/specs-pdfs', e);
    res.status(400).json({ error: e.message || 'Generation failed' });
  }
});


router.get('/:contract_id/specs-pdfs', async (req, res) => {
  try {
    const contract_id = Number(req.params.contract_id);
    if (!contract_id) return res.status(400).json({ error: 'contract_id required' });

    const [rows] = await pool.query(`
      SELECT a.contract_attachment_id,
             s.edition_specs_pdf_id, s.edition_id, s.lang, s.version,
             s.filename, s.byte_size, s.sha256, s.gcs_key, s.created_at, v.vehicle_id,
             v.vin, e.name AS edition_name,
             my.year, m.name AS model_name, mk.name AS make_name
        FROM contract_attachment a
        JOIN edition_specs_pdf s ON s.edition_specs_pdf_id = a.edition_specs_pdf_id
        JOIN contract c ON c.contract_id = a.contract_id
        JOIN contract_item ci ON ci.contract_item_id = a.contract_item_id
        JOIN vehicle v ON v.vehicle_id = ci.vehicle_id
        JOIN edition e ON e.edition_id = s.edition_id
        JOIN model_year my ON my.model_year_id = e.model_year_id
        JOIN model m ON m.model_id = my.model_id
        JOIN make mk ON mk.make_id = m.make_id
       WHERE a.contract_id = ? AND a.attachment_type = 'edition_specs_pdf' AND a.visibility = 'internal'
       ORDER BY s.created_at DESC, s.version DESC`, [contract_id]);

    const augmented = [];
    for (const r of rows) {
      const { signedUrl, expiresAt } = await require('../services/specsPDF').getSignedUrl(r.gcs_key, 10);
      augmented.push({
        contract_attachment_id: r.contract_attachment_id,
        edition_specs_pdf_id: r.edition_specs_pdf_id,
        edition_id: r.edition_id,
        lang: r.lang,
        version: r.version,
        filename: r.filename,
        byte_size: r.byte_size,
        sha256: r.sha256,
        created_at: r.created_at,
        vehicle_id : r.vehicle_id,
        vin        : r.vin,
        edition_name: r.edition_name,
        year       : r.year,
        model_name : r.model_name,
        make_name  : r.make_name,
        signedUrl, expiresAt,
      });
    }

    res.json({ contract_id, attachments: augmented });
  } catch (e) {
    console.error('GET /contracts/:id/specs-pdfs', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark contract as SIGNED and sell all its vehicles
router.post('/:contract_id/sign', async (req, res) => {
  try {
    const contract_id = Number(req.params.contract_id);
    if (!contract_id) return res.status(400).json({ error: 'contract_id required' });

    // who did it (swap to real auth)
    const userId = Number(
      (req.user && (req.user.user_id ?? req.user.id)) ??
      req.headers['x-user-id'] ?? 1
    ) || 1;

    const result = await withTxn(async (conn) => {
      // Lock contract
      const [[ctr]] = await conn.query(
        `SELECT * FROM contract WHERE contract_id = ? FOR UPDATE`,
        [contract_id]
      );
      if (!ctr) throw new Error('contract not found');

      // Only allow from issued (or viewed if you want to be lenient)
      if (!['issued', 'viewed'].includes(String(ctr.status))) {
        throw new Error(`cannot sign contract from status "${ctr.status}"`);
      }

      // Load items + lock vehicles
      const [rows] = await conn.query(
        `
        SELECT
          ci.contract_item_id, ci.vehicle_id, ci.unit_price, ci.currency_code,
          v.status AS vehicle_status, v.reserved_by_contract_id
        FROM contract_item ci
        JOIN vehicle v ON v.vehicle_id = ci.vehicle_id
        WHERE ci.contract_id = ?
        FOR UPDATE
        `,
        [contract_id]
      );
      if (!rows.length) throw new Error('contract has no items');

      // Guard rails
      for (const r of rows) {
        if (String(r.vehicle_status) === 'Sold') {
          throw new Error(`vehicle ${r.vehicle_id} already Sold`);
        }
        if (r.reserved_by_contract_id && r.reserved_by_contract_id !== contract_id) {
          throw new Error(`vehicle ${r.vehicle_id} reserved by another contract`);
        }
      }

      // Soft policy: warn if any handovers are not signed
      const [hrs] = await conn.query(
        `
        SELECT hr.handover_record_id, hr.status, hr.contract_item_id
        FROM handover_record hr
        WHERE hr.contract_id = ?
        `,
        [contract_id]
      );
      const notSigned = (hrs || []).filter(h => h.status !== 'signed');
      const warnings = [];
      if (notSigned.length) {
        warnings.push(
          `Има ${notSigned.length} приемо-предавателни протокола, които не са подписани.`
        );
      }

      // Do the updates
      const now = new Date();
      const vehiclesSold = [];
      const soldNote = `Sold via contract ${ctr.contract_number || ctr.uuid}`;

      for (const r of rows) {
        const price = r.unit_price ?? null; // DECIMAL string ok
        const currency = (r.currency_code || ctr.currency_code || 'BGN').toUpperCase().slice(0,3);

        // Status event (audit)
        await conn.query(
          `INSERT INTO vehicle_status_event
            (vehicle_id, old_status, new_status, changed_by, note, created_at)
           VALUES (?, ?, 'Sold', ?, ?, NOW())`,
          [r.vehicle_id, r.vehicle_status, userId, soldNote]
        );

        // Vehicle -> Sold (+ durable link + clear reservation)
        await conn.query(
          `
          UPDATE vehicle
             SET status = 'Sold',
                 reserved_by_contract_id = NULL,
                 reserved_until = NULL,
                 sold_by_contract_id = ?,
                 sold_at = NOW(),
                 sold_price = ?,
                 sold_currency = ?
           WHERE vehicle_id = ?
          `,
          [contract_id, price, currency, r.vehicle_id]
        );

        vehiclesSold.push(r.vehicle_id);
      }

      // Contract -> signed
      await conn.query(
        `UPDATE contract SET status='signed', signed_at = NOW(), updated_at = NOW() WHERE contract_id = ?`,
        [contract_id]
      );

      return {
        contract_id,
        status: 'signed',
        signed_at: now.toISOString(),
        vehicles_sold: vehiclesSold,
        handover_summary: { total: hrs.length, not_signed: notSigned.length },
        warnings
      };
    });

    res.json(result);
  } catch (e) {
    console.error('POST /contracts/:id/sign', e);
    res.status(400).json({ error: e.message || 'Sign failed' });
  }
});

// Create a contract draft from an existing offer (with type + advance support)
// POST /api/contracts/from-offer
// body: {
//   offer_id? | offer_uuid? | offer_number?,
//   type?: 'REGULAR'|'ADVANCE',
//   advance_amount?: DECIMAL string|number,
//   mark_converted?: boolean
// }
router.post('/from-offer', async (req, res) => {
  try {
    const {
      offer_id = null,
      offer_uuid = null,
      offer_number = null,
      type = 'REGULAR',
      advance_amount = null,
      mark_converted = false,
    } = req.body || {};

    if (!offer_id && !offer_uuid && !offer_number) {
      return res.status(400).json({ error: 'Provide offer_id or offer_uuid or offer_number' });
    }
    if (!['REGULAR', 'ADVANCE', 'REGULAR EXTENDED'].includes(type)) {
      return res.status(400).json({ error: "type must be 'REGULAR', 'ADVANCE' or 'REGULAR EXTENDED'" });
    }

    // Validate/normalize advance
    let advanceNorm = null;
    const hasAdvanceInBody = Object.prototype.hasOwnProperty.call(req.body || {}, 'advance_amount');
    if (hasAdvanceInBody) {
      advanceNorm = (advance_amount == null || advance_amount === '') ? null : Number(advance_amount).toFixed(2);
      if (advanceNorm != null && Number(advanceNorm) < 0) {
        return res.status(400).json({ error: 'advance_amount must be >= 0' });
      }
      if (type !== 'ADVANCE' && advanceNorm != null) {
        return res.status(400).json({ error: 'advance_amount can only be set for ADVANCE contracts' });
      }
    }

    const out = await withTxn(async (conn) => {
      // 1) Load + lock offer
      const where = offer_id
        ? { sql: 'offer_id = ?', val: offer_id }
        : offer_uuid
          ? { sql: 'offer_uuid = ?', val: offer_uuid }
          : { sql: 'offer_number = ?', val: offer_number };

      const [[offer]] = await conn.query(
        `SELECT * FROM offer WHERE ${where.sql} FOR UPDATE`,
        [where.val]
      );
      if (!offer) throw new Error('Offer not found');
      if (!offer.customer_id) throw new Error('Offer has no customer_id');

      // 2) Items (vehicle-only)
      const [items] = await conn.query(
        `SELECT offer_item_id, offer_id, line_no, item_type, vehicle_id, description,
                quantity, unit_price, unit_price_gross, vat_rate, line_total, metadata_json
           FROM offer_item
          WHERE offer_id = ?
          ORDER BY line_no`,
        [offer.offer_id]
      );

      const vehItems = items.filter(
        (it) => it.item_type === 'vehicle' && it.vehicle_id && Number(it.quantity) > 0
      );
      if (vehItems.length === 0) {
        throw new Error('Offer contains no vehicle lines to convert');
      }

      // 3) Load vehicle joins for title/subtitle
      const ids = [...new Set(vehItems.map((i) => Number(i.vehicle_id)))];
      const [vrows] = await conn.query(
        `SELECT v.vehicle_id, v.vin, v.mileage AS mileage_km,
                ed.name AS edition_name, my.year,
                md.name AS model_name, mk.name AS make_name
           FROM vehicle v
           JOIN edition ed     ON ed.edition_id = v.edition_id
           JOIN model_year my  ON my.model_year_id = ed.model_year_id
           JOIN model md       ON md.model_id = my.model_id
           JOIN make mk        ON mk.make_id = md.make_id
          WHERE v.vehicle_id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
      const vmap = new Map(vrows.map((r) => [Number(r.vehicle_id), r]));

      // Prevent double-reservation
      const [alreadyReserved] = await conn.query(
        `SELECT vehicle_id FROM vehicle
          WHERE vehicle_id IN (${ids.map(() => '?').join(',')})
            AND reserved_by_contract_id IS NOT NULL`,
        ids
      );
      if (alreadyReserved.length) {
        const bad = alreadyReserved.map((r) => r.vehicle_id).join(', ');
        throw new Error(`Some vehicles are already reserved: [${bad}]`);
      }

      // 4) Snapshot buyer & create contract header (persist type + advance)
      const buyer = await loadBuyer(conn, offer.customer_id);
      const contract_uuid = uuidv4();
      const number = await nextContractNumber(conn);
      const curr = (offer.currency || 'BGN').toUpperCase().slice(0, 3);
      const vu = null;
      const created_by_user_id = getCurrentUserId(req);

      const [insC] = await conn.execute(
        `INSERT INTO contract
           (uuid, status, contract_number, type, customer_id,
            currency, currency_code, advance_amount, valid_until,
            created_by_user_id, created_at, buyer_snapshot_json, note)
         VALUES
           (?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, NOW(), CAST(? AS JSON), ?)`,
        [
          contract_uuid,
          number,
          type,                          // <-- persist type
          offer.customer_id,
          curr,
          curr,
          advanceNorm,                   // <-- persist advance_amount (null if not provided)
          vu,
          created_by_user_id,
          JSON.stringify(buyer),
          `Converted from offer ${offer.offer_number}`,
        ]
      );
      const contract_id = insC.insertId;

      // 5) Insert items + compute totals
      let subtotal = 0, discount_total = 0, tax_total = 0, total = 0;
      let pos = 1;

      for (const it of vehItems) {
        const v = vmap.get(Number(it.vehicle_id));
        if (!v) throw new Error(`Vehicle ${it.vehicle_id} not found/join failed`);

        const qty = Number(it.quantity) || 1;
        const unit = toDecimalString(it.unit_price) ?? '0.00';
        const tax_rate = it.vat_rate != null ? toDecimalString(it.vat_rate) : null;

        const t = computeLineTotals(qty, unit, null, null, tax_rate);
        subtotal += t.subtotal;
        discount_total += t.discount;
        tax_total += t.tax;
        total += t.total;

        const title = buildItemTitle(v);
        const subtitle = buildItemSubtitle(v);

        await conn.execute(
          `INSERT INTO contract_item
             (contract_id, vehicle_id, quantity, unit_price,
              discount_type, discount_value, tax_rate, line_total,
              title, subtitle, position, currency_code)
           VALUES
             (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)`,
          [
            contract_id,
            it.vehicle_id,
            qty,
            unit,
            tax_rate,
            toDecimalString(t.total) ?? '0.00',
            title,
            subtitle || null,
            pos++,
            curr,
          ]
        );
      }

      await conn.execute(
        `UPDATE contract
            SET subtotal = ?, discount_total = ?, tax_total = ?, total = ?
          WHERE contract_id = ?`,
        [
          toDecimalString(subtotal) ?? '0.00',
          toDecimalString(discount_total) ?? '0.00',
          toDecimalString(tax_total) ?? '0.00',
          toDecimalString(total) ?? '0.00',
          contract_id,
        ]
      );

      // 7) Optionally mark offer converted
      if (mark_converted) {
        await conn.execute(
          `UPDATE offer
              SET status = 'converted', updated_at = NOW()
            WHERE offer_id = ?`,
          [offer.offer_id]
        );
      }

      const [[contractRow]] = await conn.query(
        `SELECT * FROM contract WHERE contract_id = ?`,
        [contract_id]
      );

      return { contract: contractRow, inserted_items: vehItems.length };
    });

    res.status(201).json(out);
  } catch (e) {
    console.error('POST /contracts/from-offer', e);
    res.status(400).json({ error: e.message || 'Convert failed' });
  }
});

// GET /api/contracts/:contract_id/payments
router.get('/:contract_id/payments', async (req, res) => {
  try {
    const contract_id = Number(req.params.contract_id);
    if (!contract_id) {
      return res.status(400).json({ error: 'invalid contract_id' });
    }

    // Вади договора, за да сме сигурни, че съществува
    const [[ctr]] = await pool.query(
      `SELECT contract_id, customer_id, total, currency_code, currency
         FROM contract
        WHERE contract_id = ?`,
      [contract_id]
    );
    if (!ctr) {
      return res.status(404).json({ error: 'contract not found' });
    }

    // Всички плащания по договора
    const [rows] = await pool.query(
      `
      SELECT
        contract_payment_id,
        contract_id,
        customer_id,
        amount,
        currency_code,
        method,
        paid_at,
        reference,
        note,
        created_at,
        created_by_user_id
      FROM contract_payment
      WHERE contract_id = ?
      ORDER BY paid_at ASC, contract_payment_id ASC
      `,
      [contract_id]
    );

    // Агрегати
    const [[agg]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS paid_total
         FROM contract_payment
        WHERE contract_id = ?`,
      [contract_id]
    );

    const contractTotal = Number(ctr.total || 0);
    const paidTotal = Number(agg.paid_total || 0);
    const outstanding = contractTotal - paidTotal;

    res.json({
      contract_id,
      currency_code: (ctr.currency_code || ctr.currency || 'BGN').toUpperCase().slice(0, 3),
      contract_total: contractTotal,
      paid_total: paidTotal,
      outstanding_total: outstanding,
      payments: rows
    });
  } catch (e) {
    console.error('GET /contracts/:contract_id/payments', e);
    res.status(500).json({ error: 'DB error' });
  }
});

// POST /api/contracts/:contract_id/payments
// body: { amount, method, paid_at?, reference?, note? }
router.post('/:contract_id/payments', async (req, res) => {
  try {
    const contract_id = Number(req.params.contract_id);
    if (!contract_id) {
      return res.status(400).json({ error: 'contract_id required' });
    }

    const { amount, method, paid_at, reference = null, note = null } = req.body || {};

    if (amount == null || amount === '') {
      return res.status(400).json({ error: 'amount is required' });
    }

    const amountStr = toDecimalString(amount);
    if (!amountStr) {
      return res.status(400).json({ error: 'invalid amount' });
    }
    const amountNum = Number(amountStr);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return res.status(400).json({ error: 'amount must be > 0' });
    }

    const allowedMethods = ['cash', 'bank_transfer', 'card', 'leasing', 'other'];
    if (!allowedMethods.includes(method)) {
      return res.status(400).json({ error: `method must be one of ${allowedMethods.join(', ')}` });
    }

    let paidAtStr = null;
    if (paid_at) {
      paidAtStr = toMySqlDateTime(paid_at);
      if (!paidAtStr) {
        return res.status(400).json({ error: 'invalid paid_at' });
      }
    }

    const createdBy = getCurrentUserId(req);

    const result = await withTxn(async (conn) => {
      // lock contract
      const [[ctr]] = await conn.query(
        `SELECT contract_id, customer_id, status, total, currency_code, currency
           FROM contract
          WHERE contract_id = ? FOR UPDATE`,
        [contract_id]
      );
      if (!ctr) {
        throw new Error('contract not found');
      }

      const status = String(ctr.status);
      // не позволяваме плащания по draft/withdrawn/expired
      if (!['issued', 'viewed', 'signed'].includes(status)) {
        throw new Error(`cannot register payment for contract in status "${status}"`);
      }

      // текущо платено
      const [[agg]] = await conn.query(
        `SELECT COALESCE(SUM(amount), 0) AS paid_total
           FROM contract_payment
          WHERE contract_id = ?`,
        [contract_id]
      );

      const contractTotal = Number(ctr.total || 0);
      const alreadyPaid = Number(agg.paid_total || 0);

      // защита срещу overpayment, ако имаме смислена total сума
      if (contractTotal > 0 && alreadyPaid + amountNum - contractTotal > 0.005) {
        throw new Error('Плащането надвишава общата сума по договора');
      }

      const currency_code = (ctr.currency_code || ctr.currency || 'BGN').toUpperCase().slice(0, 3);
      const paidAtValue = paidAtStr || toMySqlDateTime(new Date().toISOString());

      const [ins] = await conn.query(
        `
        INSERT INTO contract_payment
          (contract_id, customer_id, amount, currency_code, method, paid_at, reference, note, created_at, created_by_user_id)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
        `,
        [
          contract_id,
          ctr.customer_id,
          amountStr,
          currency_code,
          method,
          paidAtValue,
          reference || null,
          note || null,
          createdBy
        ]
      );

      const [[payment]] = await conn.query(
        `SELECT * FROM contract_payment WHERE contract_payment_id = ?`,
        [ins.insertId]
      );

      const paidTotalAfter = alreadyPaid + amountNum;
      const outstandingAfter = contractTotal - paidTotalAfter;

      return {
        contract_id,
        payment,
        totals: {
          contract_total: contractTotal,
          paid_total: paidTotalAfter,
          outstanding_total: outstandingAfter
        }
      };
    });

    res.status(201).json(result);
  } catch (e) {
    console.error('POST /contracts/:contract_id/payments', e);
    res.status(400).json({ error: e.message || 'Payment create failed' });
  }
});

// GET /api/contracts/:contract_id/invoices
router.get('/:contract_id/invoices', async (req, res) => {
  try {
    const contract_id = Number(req.params.contract_id);
    if (!contract_id) {
      return res.status(400).json({ error: 'contract_id required' });
    }

    const [rows] = await pool.query(
      `
      SELECT
        i.invoice_id,
        i.uuid,
        i.invoice_number,
        i.type,
        i.status,
        i.issue_date,
        i.due_date,
        i.total,
        i.currency_code,
        i.contract_payment_id,
        p.amount AS payment_amount,
        p.paid_at AS payment_paid_at,
        i.created_at
      FROM invoice i
      LEFT JOIN contract_payment p
        ON p.contract_payment_id = i.contract_payment_id
      WHERE i.contract_id = ?
      ORDER BY i.issue_date DESC, i.invoice_id DESC
      `,
      [contract_id]
    );

    res.json({
      contract_id,
      items: rows
    });
  } catch (e) {
    console.error('GET /contracts/:contract_id/invoices', e);
    res.status(500).json({ error: 'DB error' });
  }
});

// POST /api/contracts/:contract_id/invoices
// body: {
//   type?: 'PROFORMA'|'INVOICE',
//   mode?: 'FULL'|'PAYMENT',
//   contract_payment_id?: number,
//   issue_date?: string,
//   due_date?: string,
//   note_public?: string,
//   note_internal?: string
// }
router.post('/:contract_id/invoices', async (req, res) => {
  try {
    const contract_id = Number(req.params.contract_id);
    if (!contract_id) {
      return res.status(400).json({ error: 'contract_id required' });
    }

    const {
      type = 'INVOICE',
      mode = 'FULL', // 'FULL' (по договор) или 'PAYMENT' (по плащане)
      contract_payment_id = null,
      issue_date = null,
      due_date = null,
      note_public = null,
      note_internal = null
    } = req.body || {};

    const allowedTypes = ['PROFORMA', 'INVOICE'];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({ error: `type must be one of ${allowedTypes.join(', ')}` });
    }

    const allowedModes = ['FULL', 'PAYMENT'];
    if (!allowedModes.includes(mode)) {
      return res.status(400).json({ error: `mode must be one of ${allowedModes.join(', ')}` });
    }

    const out = await withTxn(async (conn) => {
      // 1) Lock contract
      const [[ctr]] = await conn.query(
        `SELECT * FROM contract WHERE contract_id = ? FOR UPDATE`,
        [contract_id]
      );
      if (!ctr) throw new Error('contract not found');

      const status = String(ctr.status);

      // Бизнес правило: фактура (INVOICE) само от подписан договор,
      // проформа може и по-рано
      if (type === 'INVOICE' && status !== 'signed') {
        throw new Error('Може да се издава фактура само по подписан договор');
      }

      // 2) Payment (само ако сме в режим "PAYMENT")
      let paymentRow = null;
      if (mode === 'PAYMENT') {
        const pid = Number(contract_payment_id);
        if (!pid) throw new Error('contract_payment_id е задължителен при mode="PAYMENT"');

        const [[p]] = await conn.query(
          `SELECT * FROM contract_payment WHERE contract_payment_id = ? AND contract_id = ?`,
          [pid, contract_id]
        );
        if (!p) {
          throw new Error('Това плащане не е по този договор');
        }

        // По желание: не позволяваме двойно фактуриране на едно и също плащане
        const [[existsInv]] = await conn.query(
          `SELECT invoice_id, invoice_number
             FROM invoice
            WHERE contract_payment_id = ?
            LIMIT 1`,
          [pid]
        );
        if (existsInv) {
          throw new Error(
            `За това плащане вече има издадена фактура (${existsInv.invoice_number})`
          );
        }

        if (Number(p.amount) <= 0) {
          throw new Error('Сумата на плащането трябва да е > 0');
        }

        paymentRow = p;
      }

      // 3) Items от договора (за FULL режим)
      let contractItems = [];
      if (mode === 'FULL') {
        const [items] = await conn.query(
          `SELECT *
             FROM contract_item
            WHERE contract_id = ?
            ORDER BY position ASC, contract_item_id ASC`,
          [contract_id]
        );
        if (!items.length) {
          throw new Error('contract has no items');
        }
        contractItems = items;
      }

      // 4) Buyer snapshot
      let buyerSnapshotStr = null;
      if (ctr.buyer_snapshot_json) {
        if (typeof ctr.buyer_snapshot_json === 'string') {
          buyerSnapshotStr = ctr.buyer_snapshot_json;
        } else {
          buyerSnapshotStr = JSON.stringify(ctr.buyer_snapshot_json);
        }
      } else {
        const buyer = await loadBuyer(conn, ctr.customer_id);
        buyerSnapshotStr = JSON.stringify(buyer);
      }
      if (!buyerSnapshotStr) buyerSnapshotStr = '{}';

      const currencyCode = (ctr.currency_code || ctr.currency || 'BGN')
        .toUpperCase()
        .slice(0, 3);

      const createdBy = getCurrentUserId(req);
      const invoice_uuid   = uuidv4();
      const invoice_number = await nextInvoiceNumber(conn);

      // 5) Обща логика за дати
      let issueDateStr;
      if (issue_date) {
        issueDateStr = toMySqlDateTime(issue_date);
      } else if (mode === 'PAYMENT' && paymentRow && paymentRow.paid_at) {
        issueDateStr = toMySqlDateTime(paymentRow.paid_at);
      } else {
        issueDateStr = toMySqlDateTime(new Date());
      }
      const dueDateStr = due_date ? toMySqlDateTime(due_date) : null;

      // 6) Totals + invoice + items според mode
      let subtotalStr, discountStr, taxStr, totalStr;
      let itemsCount = 0;
      let invoice_id; // ще го сетнем в двата режима

      if (mode === 'FULL') {
        // ---- Фактура за целия договор ----
        subtotalStr = toDecimalString(ctr.subtotal)       || '0.00';
        discountStr = toDecimalString(ctr.discount_total) || '0.00';
        taxStr      = toDecimalString(ctr.tax_total)      || '0.00';
        totalStr    = toDecimalString(ctr.total)          || '0.00';

        const [insInv] = await conn.execute(
          `
          INSERT INTO invoice
            (uuid, invoice_number,
             contract_id, contract_payment_id, customer_id,
             buyer_snapshot_json,
             type, status,
             issue_date, due_date,
             currency_code,
             subtotal, discount_total, tax_total, total,
             note_public, note_internal,
             created_by_user_id, created_at)
          VALUES
            (?, ?, ?, ?, ?, CAST(? AS JSON),
             ?, ?,
             ?, ?,
             ?,
             ?, ?, ?, ?,
             ?, ?,
             ?, NOW())
          `,
          [
            invoice_uuid,
            invoice_number,
            contract_id,
            // ако искаш можеш да подадеш payment и в FULL режим, но не променя сумите
            paymentRow ? paymentRow.contract_payment_id : null,
            ctr.customer_id,
            buyerSnapshotStr,
            type,
            'issued',
            issueDateStr,
            dueDateStr,
            currencyCode,
            subtotalStr,
            discountStr,
            taxStr,
            totalStr,
            note_public || null,
            note_internal || null,
            createdBy
          ]
        );

        invoice_id = insInv.insertId;

        let lineNo = 1;
        for (const ci of contractItems) {
          const qty = Number(ci.quantity || 1);

          let metaStr = null;
          if (ci.spec_snapshot_json) {
            if (typeof ci.spec_snapshot_json === 'string') {
              metaStr = ci.spec_snapshot_json;
            } else {
              metaStr = JSON.stringify(ci.spec_snapshot_json);
            }
          }

          await conn.execute(
            `
            INSERT INTO invoice_item
              (invoice_id, contract_item_id, line_no,
               title, subtitle,
               quantity, unit_price,
               discount_type, discount_value,
               tax_rate, line_total,
               currency_code, metadata_json, created_at)
            VALUES
              (?, ?, ?, ?, ?,
               ?, ?,
               ?, ?,
               ?, ?,
               ?, CAST(? AS JSON), NOW())
            `,
            [
              invoice_id,
              ci.contract_item_id,
              lineNo++,
              ci.title,
              ci.subtitle,
              qty,
              ci.unit_price,
              ci.discount_type,
              ci.discount_value,
              ci.tax_rate,
              ci.line_total,
              currencyCode,
              metaStr
            ]
          );
        }

        itemsCount = contractItems.length;

      } else {
        // ---- Фактура по конкретно плащане ----
        if (!paymentRow) {
          throw new Error('paymentRow missing in PAYMENT mode');
        }

        const payAmount = Number(paymentRow.amount);
        if (!(payAmount > 0)) {
          throw new Error('Сумата на плащането трябва да е > 0');
        }

        // Ефективна ставка на ДДС по договора:
        // нето = subtotal - discount_total, VAT = tax_total
        const netContract  = Number(ctr.subtotal || 0) - Number(ctr.discount_total || 0);
        const vatContract  = Number(ctr.tax_total || 0);
        let effRate = 0; // напр. 0.2 за 20%
        if (netContract > 0 && vatContract > 0) {
          effRate = vatContract / netContract;
        }

        let netPayment  = payAmount;
        let vatPayment  = 0;
        if (effRate > 0) {
          netPayment = payAmount / (1 + effRate);
          vatPayment = payAmount - netPayment;
        }

        subtotalStr = toDecimalString(netPayment) || '0.00';
        discountStr = '0.00';
        taxStr      = toDecimalString(vatPayment) || '0.00';
        totalStr    = toDecimalString(payAmount)  || '0.00';

        const [insInv] = await conn.execute(
          `
          INSERT INTO invoice
            (uuid, invoice_number,
             contract_id, contract_payment_id, customer_id,
             buyer_snapshot_json,
             type, status,
             issue_date, due_date,
             currency_code,
             subtotal, discount_total, tax_total, total,
             note_public, note_internal,
             created_by_user_id, created_at)
          VALUES
            (?, ?, ?, ?, ?, CAST(? AS JSON),
             ?, ?,
             ?, ?,
             ?,
             ?, ?, ?, ?,
             ?, ?,
             ?, NOW())
          `,
          [
            invoice_uuid,
            invoice_number,
            contract_id,
            paymentRow.contract_payment_id,
            ctr.customer_id,
            buyerSnapshotStr,
            type,
            'issued',
            issueDateStr,
            dueDateStr,
            currencyCode,
            subtotalStr,
            discountStr,
            taxStr,
            totalStr,
            note_public || null,
            note_internal || null,
            createdBy
          ]
        );

        invoice_id = insInv.insertId;

        const effRatePctStr =
          effRate > 0 ? toDecimalString(effRate * 100) : null;

        // Един ред: "Авансово плащане по договор ..."
        const title = `Авансово плащане по договор ${ctr.contract_number || ctr.uuid}`;
        const subtitleParts = [];
        if (paymentRow.paid_at) {
          subtitleParts.push(
            `Дата на плащане: ${new Date(paymentRow.paid_at).toLocaleDateString('bg-BG')}`
          );
        }
        if (paymentRow.method) {
          subtitleParts.push(`Метод: ${paymentRow.method}`);
        }
        const subtitle = subtitleParts.join(' • ') || null;

        const meta = {
          contract_payment_id: paymentRow.contract_payment_id,
          amount: Number(paymentRow.amount),
          paid_at: paymentRow.paid_at,
          method: paymentRow.method || null,
          reference: paymentRow.reference || null
        };

        await conn.execute(
          `
          INSERT INTO invoice_item
            (invoice_id, contract_item_id, line_no,
             title, subtitle,
             quantity, unit_price,
             discount_type, discount_value,
             tax_rate, line_total,
             currency_code, metadata_json, created_at)
          VALUES
            (?, NULL, 1,
             ?, ?,
             1, ?,
             NULL, NULL,
             ?, ?,
             ?, CAST(? AS JSON), NOW())
          `,
          [
            invoice_id,
            title,
            subtitle,
            subtotalStr,             // unit_price = нето сума
            effRatePctStr,           // ДДС % или NULL
            totalStr,                // line_total = бруто (платената сума)
            currencyCode,
            JSON.stringify(meta)
          ]
        );

        itemsCount = 1;
      }

      // === ОБЩА ЧАСТ: генериране на PDF + запис в invoice_pdf ===

      const [[invoiceRow]] = await conn.query(
        `SELECT * FROM invoice WHERE invoice_id = ?`,
        [invoice_id]
      );
      const [invItems] = await conn.query(
        `SELECT *
           FROM invoice_item
          WHERE invoice_id = ?
          ORDER BY line_no ASC, invoice_item_id ASC`,
        [invoice_id]
      );

      let buyerObj;
      try {
        buyerObj = JSON.parse(buyerSnapshotStr || '{}');
      } catch {
        buyerObj = {};
      }

      const buffer = await renderInvoicePdfBuffer({
        template: type,          // 'INVOICE' или 'PROFORMA'
        invoice: invoiceRow,
        buyer: buyerObj,
        contract: ctr,
        items: invItems,
      });

      const [[ver]] = await conn.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_ver
           FROM invoice_pdf
          WHERE invoice_id = ?`,
        [invoice_id]
      );
      const version = ver.next_ver;

      const filename    = `invoice-${invoiceRow.invoice_number || invoiceRow.uuid}-v${String(version).padStart(3, '0')}.pdf`;
      const contentType = 'application/pdf';

      const { gcsKey, size, sha256 } = await uploadInvoicePdfBuffer({
        invoice_id,
        invoice_number: invoiceRow.invoice_number,
        version,
        buffer,
      });

      const [insPdf] = await conn.execute(
        `
        INSERT INTO invoice_pdf
          (invoice_id, version, filename, content_type, byte_size, sha256, public_url, created_at, created_by_user_id, gcs_key)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)
        `,
        [invoice_id, version, filename, contentType, size, sha256, null, createdBy, gcsKey]
      );

      return {
        invoice: invoiceRow,
        items_count: itemsCount,
        pdf: {
          invoice_pdf_id: insPdf.insertId,
          version,
          filename,
          byte_size: size,
          sha256,
          gcs_key: gcsKey,
        }
      };
    });

    res.status(201).json(out);
  } catch (e) {
    console.error('POST /contracts/:contract_id/invoices', e);
    res.status(400).json({ error: e.message || 'Create invoice failed' });
  }
});

// GET latest invoice PDF by invoice UUID
// Ако router-ът е закачен като app.use('/api/contracts', router),
// пътят реално ще е: GET /api/contracts/invoices/:uuid/pdf/latest
router.get('/invoices/:uuid/pdf/latest', async (req, res) => {
  try {
    const { uuid } = req.params;
    if (!uuid) {
      return res.status(400).json({ error: 'uuid required' });
    }

    const [[inv]] = await pool.query(
      `SELECT invoice_id, invoice_number FROM invoice WHERE uuid = ?`,
      [uuid]
    );
    if (!inv) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const [[row]] = await pool.query(
      `SELECT invoice_pdf_id, invoice_id, version, filename, content_type, byte_size, sha256, gcs_key
         FROM invoice_pdf
        WHERE invoice_id = ?
        ORDER BY version DESC
        LIMIT 1`,
      [inv.invoice_id]
    );
    if (!row) {
      return res.status(404).json({ error: 'No PDF yet' });
    }

    const signed = await getSignedInvoiceReadUrl(row.gcs_key, { minutes: 10 });

    res.json({
      invoice_pdf_id: row.invoice_pdf_id,
      invoice_id: row.invoice_id,
      invoice_number: inv.invoice_number,
      version: row.version,
      filename: row.filename,
      content_type: row.content_type || 'application/pdf',
      byte_size: row.byte_size,
      sha256: row.sha256,
      signedUrl: signed.signedUrl,
      expiresAt: signed.expiresAt,
    });
  } catch (e) {
    console.error('GET /contracts/invoices/:uuid/pdf/latest', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/contracts/invoices/:uuid/pdf
// Регенерира нов PDF за съществуваща фактура (без да създава нова invoice)
router.post('/invoices/:uuid/pdf', async (req, res) => {
  try {
    const { uuid } = req.params;
    if (!uuid) return res.status(400).json({ error: 'invoice uuid required' });

    const createdBy = getCurrentUserId(req);

    const out = await withTxn(async (conn) => {
      // 1) Зареждаме и заключваме фактурата
      const [[inv]] = await conn.query(
        `SELECT * FROM invoice WHERE uuid = ? FOR UPDATE`,
        [uuid]
      );
      if (!inv) throw new Error('invoice not found');

      // 2) Контрактът (за всеки случай, ако ти трябва нещо от него)
      const [[ctr]] = await conn.query(
        `SELECT * FROM contract WHERE contract_id = ?`,
        [inv.contract_id]
      );
      if (!ctr) throw new Error('contract not found');

      // 3) Редовете на фактурата
      const [items] = await conn.query(
        `SELECT *
           FROM invoice_item
          WHERE invoice_id = ?
          ORDER BY line_no ASC, invoice_item_id ASC`,
        [inv.invoice_id]
      );
      if (!items.length) throw new Error('invoice has no items');

      // 4) Buyer snapshot
      let buyer = null;
      try {
        if (inv.buyer_snapshot_json) {
          if (typeof inv.buyer_snapshot_json === 'string') {
            buyer = JSON.parse(inv.buyer_snapshot_json);
          } else {
            buyer = inv.buyer_snapshot_json;
          }
        }
      } catch {
        buyer = null;
      }
      if (!buyer) {
        // fallback – дърпаме клиента от contract.customer_id
        buyer = await loadBuyer(conn, ctr.customer_id);
      }

      // 5) Следваща версия на PDF
      const [[ver]] = await conn.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_ver
           FROM invoice_pdf
          WHERE invoice_id = ?`,
        [inv.invoice_id]
      );
      const version = ver.next_ver;

      //6) Вземи имена на издалия фактурата потребител
      const [[userRow]] = await conn.query(
        `SELECT first_name, last_name, email FROM admin
        WHERE id=?`,
        [createdBy]
      );

      // 7) Рендер на PDF по текущите данни + темплейта
      const buffer = await renderInvoicePdfBuffer({
        template: inv.type, // 'INVOICE' или 'PROFORMA'
        invoice: inv,
        buyer,
        contract: ctr,
        items,
        user: userRow
      });




      const { gcsKey, size, sha256 } = await uploadInvoicePdfBuffer({
        invoice_uuid: inv.uuid,
        version,
        buffer,
      });

      const filename = `invoice-${inv.invoice_number || inv.uuid}-v${String(
        version
      ).padStart(3, '0')}.pdf`;
      const content_type = 'application/pdf';

      const [insPdf] = await conn.query(
        `INSERT INTO invoice_pdf
           (invoice_id, version, filename, content_type,
            byte_size, sha256, public_url,
            created_at, created_by_user_id, gcs_key)
         VALUES
           (?, ?, ?, ?, ?, ?, NULL, NOW(), ?, ?)`,
        [inv.invoice_id, version, filename, content_type, size, sha256, createdBy, gcsKey]
      );

      await conn.query(
        `UPDATE invoice
            SET latest_pdf_id = ?
          WHERE invoice_id = ?`,
        [insPdf.insertId, inv.invoice_id]
      );

      const signed = await getSignedInvoiceReadUrl(gcsKey, { minutes: 10 });

      return {
        invoice_id: inv.invoice_id,
        uuid: inv.uuid,
        version,
        pdf: {
          ...signed,
          filename,
          content_type,
          byte_size: size,
          sha256,
        },
      };
    });

    res.json(out);
  } catch (e) {
    console.error('POST /contracts/invoices/:uuid/pdf', e);
    res.status(400).json({ error: e.message || 'Regenerate invoice PDF failed' });
  }
});


// GET /api/contracts/:contract_id
router.get('/:contract_id', async (req, res) => {
  try {
    const contract_id = Number(req.params.contract_id);
    if (!contract_id) return res.status(400).json({ error: 'invalid id' });

    const [[c]] = await pool.query(
      `SELECT c.*, cust.display_name
         FROM contract c
         JOIN customer cust ON cust.customer_id = c.customer_id
        WHERE c.contract_id = ?`,
      [contract_id]
    );
    if (!c) return res.status(404).json({ error: 'not found' });

    const [items] = await pool.query(
      `
      SELECT
        ci.contract_item_id, ci.vehicle_id, ci.quantity, ci.unit_price, ci.line_total,
        v.vin, v.asking_price,
        mk.name AS make_name, md.name AS model_name, my.year, ed.name AS edition_name
      FROM contract_item ci
      JOIN vehicle v   ON v.vehicle_id = ci.vehicle_id
      LEFT JOIN edition ed    ON ed.edition_id = v.edition_id
      LEFT JOIN model_year my ON my.model_year_id = ed.model_year_id
      LEFT JOIN model md      ON md.model_id = my.model_id
      LEFT JOIN make mk       ON mk.make_id = md.make_id
      WHERE ci.contract_id = ?
      ORDER BY ci.position ASC, ci.contract_item_id ASC
      `,
      [contract_id]
    );

    const [pdfs] = await pool.query(
      `SELECT contract_pdf_id, version, filename, byte_size, sha256, created_at
         FROM contract_pdf
        WHERE contract_id = ?
        ORDER BY version DESC`,
      [contract_id]
    );

    res.json({
      contract: c,
      items,
      pdfs
    });
  } catch (e) {
    console.error('GET /contracts/:id', e);
    res.status(500).json({ error: 'DB error' });
  }
});

module.exports = router;
