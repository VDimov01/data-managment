const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { getPool, withTransaction } = require('../db');
const pool = getPool();
const { v4: uuidv4 } = require('uuid');
const { getSignedReadUrl } = require('../services/contractPDF');

const ALLOWED_STATUS = new Set([
  'InTransit','Available','Reserved','Sold','Service','Demo'
]);

router.get('/', async (req, res) => {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    try {
        const [rows] = await connection.execute(`
            SELECT 
  v.vehicle_id,
  v.vin,
  v.stock_number,
  v.public_uuid,
  v.qr_object_key,
  v.qr_png_path,
  m.name  AS make,
  mo.name AS model,
  my.year AS model_year,
  e.name  AS edition,

  cext.color_id AS exterior_color_id,
  cext.name_bg     AS exterior_color,
  cint.color_id AS interior_color_id,
  cint.name_bg     AS interior_color,

  v.asking_price,
  v.status,
  v.expected_arrival_earliest,
  v.expected_arrival_latest,
  v.arrived_at,
  v.reserved_by_contract_id,
  v.reserved_at,
  v.reserved_until,
  v.mileage,
  v.release_date,
  v.shop_id,
  s.name AS shop_name,
  s.address AS shop_address,
  s.city AS shop_city,

  a.name    AS attribute_name,
  a.name_bg AS attribute_name_bg,
  ea.value_numeric,
  ea.value_text,
  ea.value_boolean,
  a.unit
FROM vehicle v
JOIN edition     e  ON v.edition_id = e.edition_id
JOIN model_year  my ON e.model_year_id = my.model_year_id
JOIN model       mo ON my.model_id = mo.model_id
JOIN make        m  ON mo.make_id = m.make_id
LEFT JOIN shop   s  ON v.shop_id = s.shop_id

LEFT JOIN color cext ON cext.color_id = v.exterior_color_id AND cext.type = 'exterior'
LEFT JOIN color cint ON cint.color_id = v.interior_color_id AND cint.type = 'interior'

LEFT JOIN edition_attribute ea ON e.edition_id = ea.edition_id
LEFT JOIN attribute         a  ON ea.attribute_id = a.attribute_id
ORDER BY v.vehicle_id;

        `);

        // Optionally, group attributes by vehicle for easier frontend consumption
    const vehicles = {};
    rows.forEach(row => {
      if (!vehicles[row.vehicle_id]) {
        vehicles[row.vehicle_id] = {
          vehicle_id: row.vehicle_id,
          vin: row.vin,
          stock_number: row.stock_number,
          make: row.make,
          model: row.model,
          model_year: row.model_year,
          edition: row.edition,
          asking_price: row.asking_price,
          status: row.status,
          release_date: row.release_date,
          mileage: row.mileage,
          shop_name: row.shop_name,
          shop_address: row.shop_address,
          shop_city: row.shop_city,
          exterior_color: row.exterior_color,
          interior_color: row.interior_color,
          exterior_color_id: row.exterior_color_id,
          interior_color_id: row.interior_color_id,
          shop_id: row.shop_id,
          public_uuid: row.public_uuid,
          qr_object_key: row.qr_object_key,
          qr_png_path: row.qr_png_path,
          expected_arrival_earliest: row.expected_arrival_earliest,
          expected_arrival_latest: row.expected_arrival_latest,
          arrived_at: row.arrived_at,
          reserved_by_contract_id: row.reserved_by_contract_id,
          reserved_at: row.reserved_at,
          reserved_until: row.reserved_until,
          attributes: []
        };
      }

      if (row.attribute_name) {
        vehicles[row.vehicle_id].attributes.push({
          name: row.attribute_name,
          name_bg: row.attribute_name_bg,
          numeric: row.value_numeric,
          text: row.value_text,
          boolean: row.value_boolean,
          unit: row.unit
        });
      }
    });

    res.json(Object.values(vehicles));
    } catch (error) {
        console.error('Error fetching vehicles:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        await connection.end();
    }
});

// POST /api/vehicles
router.post('/', async (req, res) => {
  try {
    let {
      vin,
      stock_number = null,
      release_date = null,
      edition_id,
      exterior_color_id = null,
      interior_color_id = null,
      shop_id = null,
      status = 'InTransit',
      asking_price = null,
      mileage = 0,
      acquisition_cost = null,
      expected_arrival_date = null,         // optional single date "YYYY-MM-DD"
      expected_arrival_earliest = null,     // optional window start
      expected_arrival_latest = null        // optional window end
    } = req.body || {};

    const publicUuid = uuidv4();


    // Normalize
    vin = String(vin || '').trim().toUpperCase();
    stock_number = stock_number == null || stock_number === '' ? null : String(stock_number).trim();
    release_date = release_date == null || release_date === '' ? null : String(release_date).trim();
    edition_id = Number(edition_id);
    exterior_color_id = exterior_color_id ? Number(exterior_color_id) : null;
    interior_color_id = interior_color_id ? Number(interior_color_id) : null;
    shop_id = shop_id ? Number(shop_id) : null;
    asking_price = asking_price === '' || asking_price == null ? null : Number(asking_price);
    acquisition_cost = acquisition_cost === '' || acquisition_cost == null ? null : Number(acquisition_cost);
    mileage = mileage === '' || mileage == null ? 0 : Math.trunc(Number(mileage));
    status = String(status || 'InTransit');

      // ETA normalization: if a single date is provided, pin both ends to it
    const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (expected_arrival_date && !isDate(expected_arrival_date)) {
      return res.status(400).json({ error: 'expected_arrival_date must be YYYY-MM-DD' });
    }
    if (expected_arrival_earliest && !isDate(expected_arrival_earliest)) {
      return res.status(400).json({ error: 'expected_arrival_earliest must be YYYY-MM-DD' });
    }
    if (expected_arrival_latest && !isDate(expected_arrival_latest)) {
      return res.status(400).json({ error: 'expected_arrival_latest must be YYYY-MM-DD' });
    }
    if (expected_arrival_date && (!expected_arrival_earliest && !expected_arrival_latest)) {
      expected_arrival_earliest = expected_arrival_latest = expected_arrival_date;
    }
    if (expected_arrival_earliest && expected_arrival_latest &&
        expected_arrival_earliest > expected_arrival_latest) {
      return res.status(400).json({ error: 'expected_arrival_earliest must be <= expected_arrival_latest' });
    }

    if (!vin || !Number.isFinite(edition_id)) {
      return res.status(400).json({ error: 'vin and edition_id are required' });
    }
    if (!ALLOWED_STATUS.has(status)) {
      return res.status(400).json({ error: `status must be one of: ${[...ALLOWED_STATUS].join(', ')}` });
    }
    if (asking_price !== null && !Number.isFinite(asking_price)) {
      return res.status(400).json({ error: 'asking_price must be a number' });
    }
    if (acquisition_cost !== null && !Number.isFinite(acquisition_cost)) {
      return res.status(400).json({ error: 'acquisition_cost must be a number' });
    }
    if (!Number.isFinite(mileage)) {
      return res.status(400).json({ error: 'mileage must be a number' });
    }

    // Validate references
    const [[ed]] = await pool.query('SELECT edition_id FROM edition WHERE edition_id=?', [edition_id]);
    if (!ed) return res.status(400).json({ error: 'edition_id not found' });

    if (exterior_color_id !== null) {
      const [[c]] = await pool.query('SELECT type FROM color WHERE color_id=?', [exterior_color_id]);
      if (!c) return res.status(400).json({ error: 'exterior_color_id not found' });
      if (c.type !== 'exterior') return res.status(400).json({ error: 'exterior_color_id must be type=exterior' });
    }
    if (interior_color_id !== null) {
      const [[c]] = await pool.query('SELECT type FROM color WHERE color_id=?', [interior_color_id]);
      if (!c) return res.status(400).json({ error: 'interior_color_id not found' });
      if (c.type !== 'interior') return res.status(400).json({ error: 'interior_color_id must be type=interior' });
    }
    if (shop_id !== null) {
      const [[s]] = await pool.query('SELECT shop_id FROM shop WHERE shop_id=?', [shop_id]);
      if (!s) return res.status(400).json({ error: 'shop_id not found' });
    }

    // Insert (with ETA handling + status audit) in a txn
    const out = await withTransaction(async (conn) => {
      //helper
      const addDaysUTC = (d, days) => {
          const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
          dt.setUTCDate(dt.getUTCDate() + days);
        return dt.toISOString().slice(0, 10); // YYYY-MM-DD
      };

      // Build SQL with optional ETA window
      const cols = [
        'vin','release_date','edition_id','exterior_color_id','interior_color_id','shop_id',
        'status','asking_price','mileage','acquisition_cost','public_uuid'
      ];

      const vals = [vin, release_date, edition_id, exterior_color_id, interior_color_id, shop_id,
              status, asking_price, mileage, acquisition_cost, publicUuid];

      let etaClause = '';

        // if status is InTransit and no ETA provided -> default 60..90 days from today
      if (status === 'InTransit') {
        let e = expected_arrival_earliest || null;
        let l = expected_arrival_latest   || null;

        // If a single date was provided, you already normalized to earliest/latest earlier
        if (!e && !l) {
          const now = new Date();
          e = addDaysUTC(now, 60);
          l = addDaysUTC(now, 90);
        }
        cols.push('expected_arrival_earliest','expected_arrival_latest');
        vals.push(e, l);
      }

      const sql = `
        INSERT INTO vehicle (${cols.join(',')})
        VALUES (${cols.map(_=>'?').join(',')})
      `;
      const [r] = await conn.query(sql + etaClause, vals);

      // status audit row
      await conn.query(
        `INSERT INTO vehicle_status_event (vehicle_id, old_status, new_status, note)
           VALUES (?,?,?,?)`,
        [r.insertId, status, status, 'created']
      );
      return r.insertId;
    });

    res.status(201).json({
      vehicle_id: out,
      status,
      expected_arrival_earliest: expected_arrival_earliest || null,
      expected_arrival_latest: expected_arrival_latest || null
    });
  } catch (err) {
    // Duplicate key (VIN/stock_number)
    if (err && err.code === 'ER_DUP_ENTRY') {
      const msg = (err.sqlMessage || '').toLowerCase();
      if (msg.includes('vin')) return res.status(409).json({ error: 'VIN already exists' });
      if (msg.includes('stock_number')) return res.status(409).json({ error: 'Stock number already exists' });
      return res.status(409).json({ error: 'Duplicate value' });
    }
    console.error('POST /api/vehicles', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// UPDATE vehicle (full update using current payload semantics)
// PUT /api/vehicles/:id  (with ETA + status transition support)
router.put('/:id', async (req, res) => {
  const vehicleId = Number(req.params.id);
  if (!Number.isFinite(vehicleId)) return res.status(400).json({ error: 'Invalid vehicle id' });

  // helpers
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

  try {
    // Lock the row; we’ll decide defaults based on current state
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [[current]] = await conn.query(
        'SELECT * FROM vehicle WHERE vehicle_id=? FOR UPDATE',
        [vehicleId]
      );
      if (!current) {
        await conn.rollback(); conn.release();
        return res.status(404).json({ error: 'Vehicle not found' });
      }

      let {
        vin,
        stock_number = null,
        release_date = null,
        edition_id = current.edition_id,
        exterior_color_id = null,
        interior_color_id = null,
        shop_id = null,
        status = current.status,
        asking_price = null,
        mileage = 0,
        acquisition_cost = null,

        // ETA inputs
        expected_arrival_date = null,        // single date, optional
        expected_arrival_earliest = null,    // window start, optional
        expected_arrival_latest = null,      // window end, optional
        clear_eta = false,                   // optional boolean to wipe ETA
        note = null                          // optional note for audit
      } = req.body || {};

      // normalize
      vin = String(vin ?? current.vin).trim().toUpperCase();
      stock_number = stock_number == null || stock_number === '' ? null : String(stock_number).trim();
      release_date = release_date == null || release_date === '' ? null : String(release_date).trim();
      edition_id = Number(edition_id);
      exterior_color_id = exterior_color_id ? Number(exterior_color_id) : null;
      interior_color_id = interior_color_id ? Number(interior_color_id) : null;
      shop_id = shop_id ? Number(shop_id) : null;
      status = String(status || current.status);
      asking_price = asking_price === '' || asking_price == null ? null : Number(asking_price);
      acquisition_cost = acquisition_cost === '' || acquisition_cost == null ? null : Number(acquisition_cost);
      mileage = mileage === '' || mileage == null ? 0 : Math.trunc(Number(mileage));

      if (!vin || !Number.isFinite(edition_id)) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: 'vin and edition_id are required' });
      }
      if (!ALLOWED_STATUS.has(status)) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: `status must be one of: ${[...ALLOWED_STATUS].join(', ')}` });
      }
      if (asking_price !== null && !Number.isFinite(asking_price)) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: 'asking_price must be a number' });
      }
      if (acquisition_cost !== null && !Number.isFinite(acquisition_cost)) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: 'acquisition_cost must be a number' });
      }
      if (!Number.isFinite(mileage)) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: 'mileage must be a number' });
      }

      // validate refs
      const [[ed]] = await conn.query('SELECT edition_id FROM edition WHERE edition_id=?', [edition_id]);
      if (!ed) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'edition_id not found' }); }
      if (exterior_color_id !== null) {
        const [[c]] = await conn.query('SELECT type FROM color WHERE color_id=?', [exterior_color_id]);
        if (!c) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'exterior_color_id not found' }); }
        if (c.type !== 'exterior') { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'exterior_color_id must be type=exterior' }); }
      }
      if (interior_color_id !== null) {
        const [[c2]] = await conn.query('SELECT type FROM color WHERE color_id=?', [interior_color_id]);
        if (!c2) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'interior_color_id not found' }); }
        if (c2.type !== 'interior') { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'interior_color_id must be type=interior' }); }
      }
      if (shop_id !== null) {
        const [[s]] = await conn.query('SELECT shop_id FROM shop WHERE shop_id=?', [shop_id]);
        if (!s) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'shop_id not found' }); }
      }

      // ----- ETA normalization -----
      if (expected_arrival_date && !isDate(expected_arrival_date)) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: 'expected_arrival_date must be YYYY-MM-DD' });
      }
      if (expected_arrival_earliest && !isDate(expected_arrival_earliest)) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: 'expected_arrival_earliest must be YYYY-MM-DD' });
      }
      if (expected_arrival_latest && !isDate(expected_arrival_latest)) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: 'expected_arrival_latest must be YYYY-MM-DD' });
      }
      if (expected_arrival_date && (!expected_arrival_earliest && !expected_arrival_latest)) {
        expected_arrival_earliest = expected_arrival_date;
        expected_arrival_latest = expected_arrival_date;
      }
      if (expected_arrival_earliest && expected_arrival_latest &&
          expected_arrival_earliest > expected_arrival_latest) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: 'expected_arrival_earliest must be <= expected_arrival_latest' });
      }

      const statusChanged = status !== current.status;

      // Build update set + params
      const sets = [
        'vin=?','release_date=?','edition_id=?','exterior_color_id=?','interior_color_id=?',
        'shop_id=?','status=?','asking_price=?','mileage=?','acquisition_cost=?'
      ];
      const params = [vin, release_date, edition_id, exterior_color_id, interior_color_id,
                      shop_id, status, asking_price, mileage, acquisition_cost];

      let etaEarliest = expected_arrival_earliest;
      let etaLatest   = expected_arrival_latest;

      // If switching to InTransit and no ETA provided, default +60/+90 days
      if (statusChanged && status === 'InTransit' && !etaEarliest && !etaLatest && !clear_eta) {
        const [[d]] = await conn.query('SELECT CURRENT_DATE() AS today');
        const [[def]] = await conn.query(
          'SELECT DATE_ADD(? , INTERVAL 60 DAY) AS e, DATE_ADD(? , INTERVAL 90 DAY) AS l',
          [d.today, d.today]
        );
        etaEarliest = def.e;  // YYYY-MM-DD
        etaLatest   = def.l;
      }

      // ETA column updates
      if (clear_eta === true) {
        sets.push('expected_arrival_earliest=NULL','expected_arrival_latest=NULL');
      } else if (etaEarliest || etaLatest) {
        sets.push('expected_arrival_earliest=?','expected_arrival_latest=?');
        params.push(etaEarliest || null, etaLatest || null);
      }

      // If correcting from Available->InTransit (or any -> InTransit), nuke arrived_at (you didn’t arrive yet)
      if (statusChanged && status === 'InTransit') {
        sets.push('arrived_at=NULL');
      }

      // Execute update
      sets.push('reserved_by_contract_id=reserved_by_contract_id'); // no-op to keep SQL valid if sets was empty (paranoia)
      const sql = `UPDATE vehicle SET ${sets.join(', ')} WHERE vehicle_id=?`;
      params.push(vehicleId);
      await conn.query(sql, params);

      // Audit
      if (statusChanged) {
        await conn.query(
          `INSERT INTO vehicle_status_event (vehicle_id, old_status, new_status, note)
           VALUES (?,?,?,?)`,
          [vehicleId, current.status, status, note || (etaEarliest && etaLatest ? `ETA set ${etaEarliest}..${etaLatest}` : null)]
        );
      } else if ((etaEarliest || etaLatest || clear_eta) && note) {
        // Log ETA-only changes as a note (old_status=new_status)
        await conn.query(
          `INSERT INTO vehicle_status_event (vehicle_id, old_status, new_status, note)
           VALUES (?,?,?,?)`,
          [vehicleId, current.status, current.status, `ETA update: ${etaEarliest || 'NULL'}..${etaLatest || 'NULL'} ${note ? '| '+note : ''}`]
        );
      }

      await conn.commit();
      conn.release();

      return res.json({
        ok: true,
        vehicle_id: vehicleId,
        status,
        expected_arrival_earliest: clear_eta ? null : (etaEarliest ?? current.expected_arrival_earliest),
        expected_arrival_latest:   clear_eta ? null : (etaLatest   ?? current.expected_arrival_latest)
      });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      conn.release();
      if (e && e.code === 'ER_DUP_ENTRY') {
        const msg = (e.sqlMessage || '').toLowerCase();
        if (msg.includes('vin'))         return res.status(409).json({ error: 'VIN already exists' });
        if (msg.includes('stock_number'))return res.status(409).json({ error: 'Stock number already exists' });
        return res.status(409).json({ error: 'Duplicate value' });
      }
      console.error('PUT /api/vehicles/:id', e);
      return res.status(500).json({ error: 'Database error' });
    }
  } catch (err) {
    console.error('PUT /api/vehicles/:id (outer)', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// DELETE /api/vehicles/:id
router.delete('/:id', async (req, res) => {
  const vehicleId = Number(req.params.id);
  if (!Number.isFinite(vehicleId)) {
    return res.status(400).json({ error: 'Invalid vehicle id' });
  }
  try {
    const [r] = await pool.query('DELETE FROM vehicle WHERE vehicle_id=?', [vehicleId]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    return res.status(204).end();
  } catch (e) {
    console.error('DELETE /api/vehicles/:id', e);
    // If later you add FKs (e.g., offers/contracts) this might throw ER_ROW_IS_REFERENCED:
    // return res.status(409).json({ error: 'Vehicle is referenced by other records' });
    return res.status(500).json({ error: 'Database error' });
  }
  }
);

// GET /api/vehicles/:id/contracts
router.get('/:id/contracts', async (req, res) => {
  const vehicleId = Number(req.params.id);
  if (!Number.isFinite(vehicleId)) return res.status(400).json({ error: 'Invalid ID' });

  try {
    const [rows] = await pool.query(`
      SELECT
        c.contract_id, c.contract_number, c.uuid, c.status, c.created_at,
        ci.unit_price,
        cp.filename AS gen_filename, cp.gcs_key AS gen_key, cp.version AS gen_ver,
        scp.filename AS signed_filename, scp.gcs_key AS signed_key
      FROM contract_item ci
      JOIN contract c ON c.contract_id = ci.contract_id
      LEFT JOIN contract_pdf cp ON cp.contract_pdf_id = c.latest_pdf_id
      LEFT JOIN contract_attachment ca
             ON ca.contract_id = c.contract_id
            AND ca.attachment_type = 'signed_contract_pdf'
      LEFT JOIN signed_contract_pdf scp ON scp.signed_contract_pdf_id = ca.signed_contract_pdf_id
      WHERE ci.vehicle_id = ?
      ORDER BY c.created_at DESC
    `, [vehicleId]);

    const results = [];
    for (const r of rows) {
      let genUrl = null;
      let signedUrl = null;

      if (r.gen_key) {
        const s = await getSignedReadUrl(r.gen_key, { minutes: 15 });
        genUrl = s.signedUrl;
      }
      if (r.signed_key) {
        // reuse same signer, strictly it's same bucket private
        const s = await getSignedReadUrl(r.signed_key, { minutes: 15 });
        signedUrl = s.signedUrl;
      }

      results.push({
        contract_id: r.contract_id,
        contract_number: r.contract_number,
        uuid: r.uuid,
        status: r.status,
        created_at: r.created_at,
        unit_price: r.unit_price,
        generated_pdf: r.gen_key ? { filename: r.gen_filename, url: genUrl, version: r.gen_ver } : null,
        signed_pdf: r.signed_key ? { filename: r.signed_filename, url: signedUrl } : null,
      });
    }

    res.json(results);
  } catch (e) {
    console.error('GET /vehicles/:id/contracts', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
