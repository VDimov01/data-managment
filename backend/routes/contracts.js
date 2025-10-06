const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const {getPool} = require('../db'); // adjust if your pool lives elsewhere
const pool = getPool();
const React = require('react');
const { ensureEditionSpecsPdf, getSignedUrl } = require('../services/specsPDF');


const {
  renderContractPdfBuffer,
  uploadContractPdfBuffer,
  getSignedReadUrl,
} = require('../services/contractPDF');

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
      c.national_id, c.tax_id
    FROM customer c
    WHERE c.customer_id = ?
    `,
    [customer_id]
  );
  if (!rows.length) throw new Error('Customer not found');
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
    if (!['ADVANCE','REGULAR'].includes(type)) {
      return res.status(400).json({ error: 'type must be ADVANCE or REGULAR' });
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
      const created_by_user_id = req.user?.user_id || 1;

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
// body: { items: [{ vehicle_id, quantity, unit_price? }] }
// If unit_price not provided, default from vehicle.asking_price (DECIMAL).
router.put('/:contract_id/items', async (req, res) => {
  try {
    const contract_id = Number(req.params.contract_id);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!contract_id || items.length === 0) {
      return res.status(400).json({ error: 'contract_id and items required' });
    }

    const result = await withTxn(async (conn) => {
      // Load contract
      const [[contract]] = await conn.query(`SELECT * FROM contract WHERE contract_id = ?`, [contract_id]);
      if (!contract) throw new Error('contract not found');
      if (contract.status !== 'draft') throw new Error('only DRAFT contracts can be edited');

      const vehicleIds = items.map(i => Number(i.vehicle_id)).filter(Boolean);
      if (!vehicleIds.length) throw new Error('items must include vehicle_id');

      // Load vehicles with names for nice title
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
        JOIN edition e    ON e.edition_id    = v.edition_id
        JOIN model_year my ON my.model_year_id = e.model_year_id
        JOIN model mo     ON mo.model_id     = my.model_id
        JOIN make  m      ON m.make_id       = mo.make_id
        WHERE v.vehicle_id IN (${vehicleIds.map(()=>'?').join(',')})
        `,
        vehicleIds
      );
      const byId = new Map(veh.map(v => [v.vehicle_id, v]));
      if (byId.size !== vehicleIds.length) {
        const missing = vehicleIds.filter(id => !byId.has(id));
        throw new Error(`vehicles not found: ${missing.join(',')}`);
      }

      // Replace all items (your existing approach)
      await conn.query(`DELETE FROM contract_item WHERE contract_id = ?`, [contract_id]);

      let pos = 1;
      const currency = (contract.currency_code || 'BGN').toUpperCase().slice(0,3);

      for (const raw of items) {
        const v = byId.get(Number(raw.vehicle_id));
        const qty = Math.max(1, Math.trunc(raw.quantity || 1));

        // unit price: explicit -> asking_price
        const explicitUnit = toDecimalString(raw.unit_price);
        const fallbackUnit = toDecimalString(v.asking_price);
        const unit_price   = explicitUnit ?? fallbackUnit;
        if (unit_price == null) {
          throw new Error(`vehicle ${v.vehicle_id} has no price (send unit_price or set asking_price)`);
        }

        // Optional discount & tax
        const discount_type  = (raw.discount_type === 'amount' || raw.discount_type === 'percent') ? raw.discount_type : null;
        const discount_value = discount_type ? toDecimalString(raw.discount_value) : null;
        const tax_rate       = raw.tax_rate != null ? toDecimalString(raw.tax_rate) : null;

        // Compute totals (line_total is required)
        const { total /* subtotal, discount, tax */ } =
          computeLineTotals(qty, unit_price, discount_type, discount_value, tax_rate);
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

      // Recalc contract totals from items
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

      await conn.execute(
        `UPDATE contract
           SET subtotal = ?, discount_total = ?, tax_total = ?, total = ?, updated_at = NOW()
         WHERE contract_id = ?`,
        [tot.subtotal, tot.discount_total, tot.tax_total, tot.total, contract_id]
      );

      // Return snapshot (reuse your helper if you have one)
      // const snap = await loadItemsSnapshot(conn, contract_id);
      const [rows] = await conn.query(
        `SELECT * FROM contract_item WHERE contract_id = ? ORDER BY position ASC`,
        [contract_id]
      );

      return { contract_id, items: rows, totals: tot };
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
    // const createdBy = Number(
    //   (req.user && (req.user.user_id ?? req.user.id)) ??
    //   (req.auth && req.auth.user_id) ??
    //   req.headers['x-user-id']
    // ) || 0;
    const createdBy = 999; // TEMPORARY HACK; fix your auth

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
        `SELECT COALESCE(SUM(quantity * unit_price), 0) AS total
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

    const createdBy = Number(
      (req.user && (req.user.user_id ?? req.user.id)) ??
      (req.auth && req.auth.user_id) ??
      req.headers['x-user-id']
    ) || 0;

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

      const created_by_user_id = req.user?.user_id || 1;

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



module.exports = router;
