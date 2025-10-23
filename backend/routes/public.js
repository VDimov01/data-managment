// routes/public.js
const express = require('express');
const router = express.Router();
const { getPool } = require('../db');
const pool = getPool();
const { storage, BUCKET_PRIVATE, bucketPrivate } = require('../services/gcs');
const { getVehiclePathParts } = require('../services/vehiclePathParts');
const { getSignedReadUrl } = require('../services/contractPDF.js');
const { getSignedOfferPdfUrl } = require('../services/offers/offerStorage');
const { Readable } = require('node:stream');


/** ---------------- helpers (same behavior as brochures.js) ---------------- */

async function signPrivate(gcsPath, { minutes = 10 } = {}) {
  const expires = Date.now() + minutes * 60 * 1000;
  const [signedUrl] = await storage.bucket(BUCKET_PRIVATE).file(gcsPath).getSignedUrl({
    action: 'read',
    expires
  });
  return { signedUrl, expiresAt: new Date(expires).toISOString() };
}

function labelFromCode(code) {
  // "HEADLIGHT_LOW_BEAM_TYPE" -> "Headlight Low Beam Type"
  return String(code)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b([a-z])/g, (m, c) => c.toUpperCase());
}


function coerceForOutput(dt, raw) {
  if (raw == null) return null;
  if (dt === 'boolean') return !!raw;
  if (dt === 'int') {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    const z = Math.trunc(n);
    return z === 0 ? null : z; // skip zero
  }
  if (dt === 'decimal') {
    const x = Number(raw);
    if (!Number.isFinite(x)) return null;
    return Math.abs(x) < 1e-9 ? null : x; // skip ~0
  }
  const s = String(raw).trim();
  return s ? s : null;
}

function safeParseJsonMaybe(x) {
  if (!x) return null;
  if (Buffer.isBuffer(x)) {
    try { return JSON.parse(x.toString('utf8')); } catch { return null; }
  }
  if (typeof x === 'string') {
    try { return JSON.parse(x); } catch { return null; }
  }
  if (typeof x === 'object') return x;
  return null;
}

/** Load specs_json + specs_i18n for many editions, return Map(edition_id -> {json, i18n}) */
async function loadSpecsMap(conn, edIds) {
  if (!edIds.length) return new Map();
  const ph = edIds.map(() => '?').join(',');
  const [rows] = await conn.query(
    `SELECT edition_id, specs_json, specs_i18n
       FROM edition_specs
      WHERE edition_id IN (${ph})`,
    edIds
  );
  const m = new Map();
  for (const r of rows) {
    m.set(r.edition_id, {
      json:  safeParseJsonMaybe(r.specs_json) || {},
      i18n:  safeParseJsonMaybe(r.specs_i18n) || {}
    });
  }
  return m;
}

async function resolveEditionIds(conn, brochureId) {
  const [[b]] = await conn.query(
    `SELECT brochure_id, make_id, model_id, selection_mode
       FROM brochure WHERE brochure_id=?`, [brochureId]
  );
  if (!b) throw new Error('Brochure not found');

  if (b.selection_mode === 'EDITIONS') {
    const [eds] = await conn.query(
      `SELECT edition_id FROM brochure_edition WHERE brochure_id=?`, [brochureId]
    );
    return eds.map(x => x.edition_id);
  }

  if (b.selection_mode === 'YEARS') {
    const [eds] = await conn.query(
      `SELECT e.edition_id
         FROM brochure_year byy
         JOIN model_year my ON my.model_year_id = byy.model_year_id
         JOIN edition e     ON e.model_year_id = my.model_year_id
        WHERE byy.brochure_id=?`,
      [brochureId]
    );
    return eds.map(x => x.edition_id);
  }

  // ALL_YEARS
  const [eds] = await conn.query(
    `SELECT e.edition_id
       FROM model mo
       JOIN model_year my ON my.model_id = mo.model_id
       JOIN edition e     ON e.model_year_id = my.model_year_id
      WHERE mo.model_id = (SELECT model_id FROM brochure WHERE brochure_id=?)
      ORDER BY my.year, e.name`,
    [brochureId]
  );
  return eds.map(x => x.edition_id);
}

/**
 * Compute compare (public): EAV (+enum,+i18n) seeded, then overlay specs_json (+i18n),
 * filter all-null, optional only-differences, sort by display_group/order.
 */
async function computeCompare(conn, edIds, onlyDiff, lang = 'bg') {
  if (!edIds.length) return { editions: [], rows: [] };
  const ph = edIds.map(() => '?').join(',');

  // 1) Header (editions)
  const [eds] = await conn.query(
    `SELECT 
       e.edition_id, e.name AS edition_name,
       my.year, mo.name AS model_name, m.name AS make_name
     FROM edition e
     JOIN model_year my ON my.model_year_id = e.model_year_id
     JOIN model      mo ON mo.model_id      = my.model_id
     JOIN make       m  ON m.make_id        = mo.make_id
     WHERE e.edition_id IN (${ph})
     ORDER BY m.name, mo.name, my.year DESC, e.name`,
    edIds
  );
  const editions = eds.map(r => ({
    edition_id: r.edition_id,
    edition_name: r.edition_name,
    year: r.year,
    model_name: r.model_name,
    make_name: r.make_name
  }));

  // 2) Attribute definitions (full list)
  const [defs] = await conn.query(
    `SELECT attribute_id, code, name, name_bg, unit, data_type, category,
            COALESCE(display_group, category) AS display_group,
            COALESCE(display_order, 9999)     AS display_order
       FROM attribute
     ORDER BY COALESCE(display_group, category), COALESCE(display_order, 9999), name`
  );
  const byCode = new Map(defs.map(d => [d.code, d]));

  // 3) EAV values (include enum & i18n text)
  const [eav] = await conn.query(
    `SELECT 
       ea.edition_id, a.attribute_id, a.code, a.name, a.name_bg, a.unit, a.data_type, a.category, a.display_group, a.display_order,
       ea.value_numeric, COALESCE(eai.value_text, ea.value_text) AS value_text, ea.value_boolean, ea.value_enum_id,
       aev.code AS enum_code,
       CASE WHEN ea.value_enum_id IS NULL THEN NULL
            WHEN ? = 'en' THEN aev.label_en ELSE aev.label_bg END AS enum_label
     FROM edition_attribute ea
     JOIN attribute a ON a.attribute_id = ea.attribute_id
     LEFT JOIN attribute_enum_value aev ON aev.enum_id = ea.value_enum_id
     LEFT JOIN edition_attribute_i18n eai
            ON eai.edition_id=ea.edition_id AND eai.attribute_id=ea.attribute_id AND eai.lang=?
     WHERE ea.edition_id IN (${ph})
     ORDER BY a.category, a.name`,
    [lang, lang, ...edIds]
  );

  // 4) Row map
  const rowMap = new Map(); // code -> row
  function ensureRow(def) {
    if (!rowMap.has(def.code)) {
      rowMap.set(def.code, {
        code: def.code,
        name: def.name,
        name_bg: def.name_bg,
        unit: def.unit,
        data_type: def.data_type,
        category: def.category,
        display_group: def.display_group,
        display_order: def.display_order,
        values: {}
      });
    }
    return rowMap.get(def.code);
  }

  // Seed with EAV (prefer enum label if applicable)
  for (const r of eav) {
    const def = byCode.get(r.code); if (!def) continue;
    const row = ensureRow(def);
    let val = null;
    if (def.data_type === 'enum') {
      val = r.enum_label || r.enum_code || null;
    } else if (def.data_type === 'text') {
      val = coerceForOutput('text', r.value_text);
    } else if (def.data_type === 'boolean') {
      val = coerceForOutput('boolean', r.value_boolean);
    } else if (def.data_type === 'int') {
      val = coerceForOutput('int', r.value_numeric);
    } else if (def.data_type === 'decimal') {
      val = coerceForOutput('decimal', r.value_numeric);
    }
    if (val !== null) row.values[r.edition_id] = val;
  }

  // 5) Overlay specs_json + specs_i18n
  const specsMap = await loadSpecsMap(conn, edIds);
  for (const ed of editions) {
    const spec = specsMap.get(ed.edition_id);
    if (!spec) continue;

    const root = spec.json || {};
    const i18n = spec.i18n || {};
    const attr = root.attributes || {};
    const L = String(lang || 'bg');
    const i18nAttrs = (i18n[L] && i18n[L].attributes) ? i18n[L].attributes : {};

    for (const code of Object.keys(attr)) {
  const rec = attr[code] || {};
  let def = byCode.get(code);

  // If the code is not in the attribute table, create a synthetic def
  if (!def) {
    def = {
      code,
      name: labelFromCode(code),
      name_bg: labelFromCode(code),      // we don't have label i18n; reuse fallback
      unit: rec.u ?? null,               // take unit from JSON if provided
      data_type: rec.dt || 'text',
      category: 'Misc',
      display_group: 'Misc',
      display_order: 9999
    };
    byCode.set(code, def); // so sorting & downstream lookups work
  }

  const row = ensureRow(def);
  // If attribute table has no unit but JSON does, fill it once
  if (row.unit == null && rec.u) row.unit = rec.u;

  const L = String(lang || 'bg');
  const i18nAttrs = (i18n[L] && i18n[L].attributes) ? i18n[L].attributes : {};
  const dt = rec.dt || def.data_type;

  // prefer i18n text when dt is text
  let v = rec.v;
  if (dt === 'text' && i18nAttrs && i18nAttrs[code] != null) {
    v = i18nAttrs[code];
  }

  const coerced = coerceForOutput(dt, v);
  if (coerced !== null) {
    row.values[ed.edition_id] = coerced; // overlay/override any EAV seed
  }
}
  }

  // 6) Filter: drop all-null; optional only-differences
  const rowsOut = [];
  for (const row of rowMap.values()) {
    const vals = editions.map(e => row.values[e.edition_id] ?? null);
    const allNull = vals.every(v => v === null);
    if (allNull) continue;

    if (onlyDiff) {
      const first = JSON.stringify(vals[0]);
      const differs = vals.some(v => JSON.stringify(v) !== first);
      if (!differs) continue;
    }
    rowsOut.push(row);
  }

  // 7) Sort: display_group/order then name
  rowsOut.sort((a, b) => {
    const da = byCode.get(a.code), db = byCode.get(b.code);
    const g  = String(da?.display_group || da?.category || '').localeCompare(String(db?.display_group || db?.category || ''));
    if (g) return g;
    const o  = (da?.display_order ?? 9999) - (db?.display_order ?? 9999);
    if (o) return o;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  return { editions, rows: rowsOut };
}

/** ---------- snapshot JSON unwrap (unchanged idea) ---------- */
function unwrapSnapshotJson(snap) {
  if (snap == null) return null;
  if (typeof snap === 'object' && !Buffer.isBuffer(snap)) return snap;
  if (Buffer.isBuffer(snap)) {
    try { return JSON.parse(snap.toString('utf8')); } catch { return null; }
  }
  if (typeof snap === 'string') {
    const t = snap.trim();
    if (t.startsWith('{') || t.startsWith('[')) {
      try { return JSON.parse(t); } catch { return null; }
    }
    return null; // e.g. "[object Object]"
  }
  return null;
}

/** ---------------------- Public endpoints ---------------------- */

// Get customer display name
router.get('/customer/:uuid', async (req, res) => {
  const uuid = String(req.params.uuid || '').trim();

  try{
    const [[cust]] = await pool.query(
      `SELECT display_name FROM customer WHERE public_uuid=?`, [uuid]
    );
    if(!cust) return res.status(404).json({ error: 'Not found' })
    res.json(cust);

  }catch(e){
    console.error('Customer public portal', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * GET /api/public/customers/:uuid/brochures?lang=bg|en
 * -> [{ brochure_id, title, data:{ editions, rows } }]
 */
router.get('/customers/:uuid/brochures', async (req, res) => {
  const uuid = String(req.params.uuid || '').trim();
  const lang = (req.query.lang === 'en' ? 'en' : 'bg');
  try {
    const [[cust]] = await pool.query(
      `SELECT customer_id FROM customer WHERE public_uuid=?`, [uuid]
    );
    if (!cust) return res.status(404).json({ error: 'not found' });

    const [links] = await pool.query(
      `SELECT b.*
         FROM customer_brochure cb
         JOIN brochure b ON b.brochure_id = cb.brochure_id
        WHERE cb.customer_id=? AND cb.is_visible=1
        ORDER BY cb.pinned DESC, cb.sort_order ASC, cb.attached_at DESC`,
      [cust.customer_id]
    );

    const out = [];
    for (const b of links) {
      if (b.is_snapshot && b.snapshot_json != null) {
        const snap = unwrapSnapshotJson(b.snapshot_json);
        if (snap) { out.push({ brochure_id: b.brochure_id, title: b.title, data: snap }); continue; }
        console.warn(`Brochure ${b.brochure_id} snapshot corrupted; falling back to live.`);
      }
      const edIds = await resolveEditionIds(pool, b.brochure_id);
      const compare = await computeCompare(pool, edIds, b.only_differences ? 1 : 0, lang);
      out.push({ brochure_id: b.brochure_id, title: b.title, data: compare });
    }
    res.json(out);
  } catch (e) {
    console.error('public brochures by uuid', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * GET /api/public/customers/:uuid/compares?lang=bg|en
 * -> [{ compare_id, title, data:{ editions, rows } }]
 */
router.get('/customers/:uuid/compares', async (req, res) => {
  const uuid = String(req.params.uuid || '').trim();
  const lang = (req.query.lang === 'en' ? 'en' : 'bg');
  try {
    const [[cust]] = await pool.query(`SELECT customer_id FROM customer WHERE public_uuid=?`, [uuid]);
    if (!cust) return res.status(404).json({ error: 'not found' });

    const [links] = await pool.query(
      `SELECT c.*
         FROM customer_compare cc
         JOIN compare_sheet c ON c.compare_id = cc.compare_id
        WHERE cc.customer_id=? AND cc.is_visible=1
        ORDER BY cc.pinned DESC, cc.sort_order ASC, cc.attached_at DESC`,
      [cust.customer_id]
    );

    const out = [];
    for (const cs of links) {
      if (cs.is_snapshot && cs.snapshot_json != null) {
        const snap = unwrapSnapshotJson(cs.snapshot_json);
        if (snap) { out.push({ compare_id: cs.compare_id, title: cs.title, data: snap }); continue; }
        console.warn(`Compare ${cs.compare_id} snapshot corrupted; computing live`);
      }
      const [eds] = await pool.query(
        `SELECT edition_id FROM compare_sheet_edition
          WHERE compare_id=? ORDER BY sort_order, edition_id`, [cs.compare_id]
      );
      const ids = eds.map(x => x.edition_id);
      const data = await computeCompare(pool, ids, cs.only_differences ? 1 : 0, lang);
      out.push({ compare_id: cs.compare_id, title: cs.title, data });
    }
    res.json(out);
  } catch (e) {
    console.error('public compares by uuid', e);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/public/vehicles/:uuid
router.get('/vehicles/:uuid', async (req, res) => {
  const { uuid } = req.params;
  // get vehicle
  const [vehRows] = await pool.query(
    `SELECT v.vehicle_id, v.public_uuid, v.vin, v.stock_number, v.mileage,
            v.status, v.release_date, v.asking_price, v.edition_id, v.shop_id,
            cext.color_id AS exterior_color_id,
            cext.name_bg     AS exterior_color,
            cint.color_id AS interior_color_id,
            cint.name_bg     AS interior_color
     FROM vehicle v
     LEFT JOIN color cext ON cext.color_id = v.exterior_color_id AND cext.type = 'exterior'
     LEFT JOIN color cint ON cint.color_id = v.interior_color_id AND cint.type = 'interior'
     WHERE v.public_uuid = ?`, [uuid]);

  if (vehRows.length === 0) return res.status(404).json({ error: 'Not found' });
  const v = vehRows[0];

  const parts = await getVehiclePathParts(v.vehicle_id); // maker, model, year, edition, uuid

  // Pull edition + attributes however you already do it
  // e.g. your existing EAV resolver for editions:
  // const attrs = await getEditionAttributes(v.edition_id);

  // Build a sanitized payload
  res.json({
    public_uuid: v.public_uuid,
    stock_number: v.stock_number,
    vin_last6: v.vin.slice(-6),         // optional: obfuscate
    mileage: v.mileage,
    status: v.status,
    release_date: v.release_date,
    asking_price: v.asking_price,
    edition_id: v.edition_id,
    make: parts.maker,
    model: parts.model,
    model: parts.model_year,
    edition_name: parts.edition,
    exterior_color: v.exterior_color,
    interior_color: v.interior_color,
    exterior_color_id: v.exterior_color_id,
    interior_color_id: v.interior_color_id,
    // attributes: attrs,
  });
});

/**
 * List public images for a vehicle by UUID.
 * Returns ordered rows with a stream_url you can use directly in <img>.
 */
router.get('/vehicles/:uuid/images', async (req, res) => {
  const uuid = String(req.params.uuid);
  const pool = getPool();

  // find vehicle_id from uuid
  const [[veh]] = await pool.query(
    'SELECT vehicle_id FROM vehicle WHERE public_uuid = ? LIMIT 1',
    [uuid]
  );
  if (!veh) return res.status(404).json({ error: 'Vehicle not found' });

  const [rows] = await pool.query(
    `SELECT vehicle_image_id, object_key, content_type, bytes,
            caption, sort_order, is_primary, created_at
     FROM vehicle_image
     WHERE vehicle_id = ?
     ORDER BY is_primary DESC, sort_order ASC, vehicle_image_id ASC`,
    [veh.vehicle_id]
  );

  const base = `${req.protocol}://${req.get('host')}/api/public/vehicles/${uuid}/images`;
  const out = rows.map(r => ({
    vehicle_image_id: r.vehicle_image_id,
    caption: r.caption,
    sort_order: r.sort_order,
    is_primary: r.is_primary,
    bytes: r.bytes,
    stream_url: `${base}/${r.vehicle_image_id}`
  }));

  res.json(out);
});

/**
 * Stream a single image by UUID + imageId.
 * Verifies the image belongs to that vehicle before streaming from GCS.
 */
router.get('/vehicles/:uuid/images/:imageId', async (req, res) => {
  const uuid = String(req.params.uuid);
  const imageId = Number(req.params.imageId);
  const pool = getPool();

  const [[row]] = await pool.query(
    `SELECT vi.object_key, vi.content_type
       FROM vehicle_image vi
       JOIN vehicle v ON v.vehicle_id = vi.vehicle_id
      WHERE v.public_uuid = ? AND vi.vehicle_image_id = ?
      LIMIT 1`,
    [uuid, imageId]
  );

  if (!row) return res.status(404).end();

  res.setHeader('Content-Type', row.content_type || 'image/jpeg');
  // public caching is fine; objects are immutable (we set long max-age in GCS)
  res.setHeader('Cache-Control', 'public, max-age=86400');

  bucketPrivate.file(row.object_key)
    .createReadStream()
    .on('error', (e) => {
      res.statusCode = 500;
      res.end(e.message);
    })
    .pipe(res);
});

// GET /api/public/customers/:uuid/contracts
// Lists contracts for the public customer, only non-withdrawn, issued/viewed/signed
// GET /public/customers/:uuid/contracts  (multi-query version)
router.get('/customers/:uuid/contracts', async (req, res) => {
  try {
    const { uuid } = req.params;

    // 0) resolve customer_id
    const [[cust]] = await pool.query(
      `SELECT customer_id FROM customer WHERE public_uuid = ? LIMIT 1`,
      [uuid]
    );
    if (!cust) return res.status(404).json({ error: 'Customer not found' });

    // optional paging (keep it simple for public)
    const page  = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset = (page - 1) * limit;

    // 1) contracts for this customer (issued/viewed/signed only)
    const [contracts] = await pool.query(
      `
      SELECT
        c.contract_id, c.uuid, c.contract_number, c.status, c.type,
        c.currency_code, c.valid_until, c.total, c.created_at, c.updated_at
      FROM contract c
      WHERE c.customer_id = ?
        AND c.status IN ('issued','viewed','signed')
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [cust.customer_id, limit, offset]
    );

    // total for pagination
    const [[cnt]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM contract c
      WHERE c.customer_id = ?
        AND c.status IN ('issued','viewed','signed')
      `,
      [cust.customer_id]
    );

    if (contracts.length === 0) {
      return res.json({ page, limit, total: cnt.total || 0, items: [] });
    }

    // 2) fetch ALL items for these contract_ids in one query, then group in Node
    const contractIds = contracts.map(c => c.contract_id);
    const placeholders = contractIds.map(() => '?').join(',');

    const [rows] = await pool.query(
      `
      SELECT
        ci.contract_id,
        v.vehicle_id, v.vin, v.asking_price,
        mk.name AS make, md.name AS model, my.year AS model_year,
        ed.name AS edition,
        cext.name_bg AS exterior_color,
        cint.name_bg AS interior_color,
        v.mileage
      FROM contract_item ci
      JOIN vehicle     v   ON v.vehicle_id = ci.vehicle_id
      JOIN edition     ed  ON ed.edition_id = v.edition_id
      JOIN model_year  my  ON my.model_year_id = ed.model_year_id
      JOIN model       md  ON md.model_id = my.model_id
      JOIN make        mk  ON mk.make_id = md.make_id
      LEFT JOIN color  cext ON cext.color_id = v.exterior_color_id AND cext.type = 'exterior'
      LEFT JOIN color  cint ON cint.color_id = v.interior_color_id AND cint.type = 'interior'
      WHERE ci.contract_id IN (${placeholders})
      ORDER BY ci.contract_id, ci.position, ci.contract_item_id
      `,
      contractIds
    );

    // 3) group by contract_id in JS
    const byCtr = new Map();
    for (const r of rows) {
      if (!byCtr.has(r.contract_id)) byCtr.set(r.contract_id, []);
      byCtr.get(r.contract_id).push({
        vehicle_id: r.vehicle_id,
        vin: r.vin,
        asking_price: r.asking_price,
        make: r.make,
        model: r.model,
        model_year: r.model_year,
        edition: r.edition,
        exterior_color: r.exterior_color,
        interior_color: r.interior_color,
        mileage: r.mileage,
      });
    }

    // attach arrays
    const items = contracts.map(c => ({
      ...c,
      items_count: byCtr.get(c.contract_id)?.length || 0,
      vehicles: byCtr.get(c.contract_id) || [],
    }));

    return res.json({ page, limit, total: cnt.total || 0, items });
  } catch (e) {
    console.error('GET /public/customers/:uuid/contracts', e);
    res.status(500).json({ error: 'DB error' });
  }
});


// Latest PDF signed URL by contract UUID
router.get('/customers/contracts/:uuid/pdf/latest', async (req, res) => {
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

// ---------------------------------------------------------------------------
// PUBLIC: list offers for a customer portal link
// GET /api/public/customers/:uuid/offers
// ---------------------------------------------------------------------------
router.get('/customers/:uuid/offers', async (req, res) => {
  const pool = getPool();
  try {
    const { uuid } = req.params;

    // 0) resolve customer_id
    const [[cust]] = await pool.query(
      `SELECT customer_id FROM customer WHERE public_uuid = ? LIMIT 1`,
      [uuid]
    );
    if (!cust) return res.status(404).json({ error: 'Customer not found' });

    // paging (public: simple)
    const page  = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset = (page - 1) * limit;

    // 1) offers for this customer (publicly visible statuses)
    const [offers] = await pool.query(
      `
      SELECT
        o.offer_id,
        o.offer_uuid,
        o.public_uuid     AS offer_public_uuid,
        o.offer_number,
        o.status,
        o.currency,
        o.total_amount,
        o.valid_until,
        o.created_at,
        (SELECT MAX(pv.version_no) FROM offer_pdf_version pv WHERE pv.offer_id = o.offer_id) AS latest_version,
        EXISTS(SELECT 1 FROM offer_pdf_version pv WHERE pv.offer_id = o.offer_id) AS has_pdf
      FROM offer o
      WHERE o.customer_id = ?
        AND o.status IN ('issued','accepted','rejected','expired','withdrawn','converted')
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [cust.customer_id, limit, offset]
    );

    // total for pagination
    const [[cnt]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM offer o
      WHERE o.customer_id = ?
        AND o.status IN ('issued','accepted','rejected','expired','withdrawn','converted')
      `,
      [cust.customer_id]
    );

    if (offers.length === 0) {
      return res.json({ page, limit, total: cnt.total || 0, items: [] });
    }

    // 2) fetch ALL items (vehicles) for these offers in one shot
    const offerIds = offers.map(o => o.offer_id);
    const ph = offerIds.map(() => '?').join(',');
    const [rows] = await pool.query(
      `
      SELECT
        oi.offer_id,
        oi.line_no,
        oi.vehicle_id,
        v.vin,
        mk.name  AS make_name,
        md.name  AS model_name,
        my.year AS year,
        ed.name  AS edition_name,
        cext.name_bg AS exterior_color,
        cint.name_bg AS interior_color,
        v.mileage
      FROM offer_item oi
      LEFT JOIN vehicle     v   ON v.vehicle_id = oi.vehicle_id
      LEFT JOIN edition     ed  ON ed.edition_id = v.edition_id
      LEFT JOIN model_year  my  ON my.model_year_id = ed.model_year_id
      LEFT JOIN model       md  ON md.model_id = my.model_id
      LEFT JOIN make        mk  ON mk.make_id = md.make_id
      LEFT JOIN color       cext ON cext.color_id = v.exterior_color_id AND cext.type = 'exterior'
      LEFT JOIN color       cint ON cint.color_id = v.interior_color_id AND cint.type = 'interior'
      WHERE oi.offer_id IN (${ph})
      ORDER BY oi.offer_id, oi.line_no
      `,
      offerIds
    );

    // 3) group vehicles by offer_id
    const vehByOffer = new Map();
    for (const r of rows) {
      if (!vehByOffer.has(r.offer_id)) vehByOffer.set(r.offer_id, []);
      vehByOffer.get(r.offer_id).push({
        vehicle_id: r.vehicle_id,
        vin: r.vin,
        make_name: r.make_name,
        model_name: r.model_name,
        year: r.year,
        edition_name: r.edition_name,
        exterior_color: r.exterior_color,
        interior_color: r.interior_color,
        mileage: r.mileage,
      });
    }

    // attach arrays
    const items = offers.map(o => ({
      ...o,
      vehicles: vehByOffer.get(o.offer_id) || []
    }));

    res.json({ page, limit, total: cnt.total || 0, items });
  } catch (e) {
    console.error('GET /public/customers/:uuid/offers', e);
    res.status(500).json({ error: 'DB error' });
  }
});


// ---------------------------------------------------------------------------
// PUBLIC: latest PDF for an offer (by offer_uuid)
// GET /api/public/customers/offers/:offerUuid/pdf/latest
// ---------------------------------------------------------------------------
router.get('/customers/offers/:offer_public_uuid/pdf/latest', async (req, res) => {
  const pool = getPool();
  try {
    const { offer_public_uuid } = req.params;
    const [[o]] = await pool.query(
      'SELECT offer_id FROM offer WHERE public_uuid = ?',
      [offer_public_uuid]
    );
    if (!o) return res.status(404).json({ error: 'Offer not found' });

    const [[v]] = await pool.query(
      'SELECT version_no, gcs_path FROM offer_pdf_version WHERE offer_id=? ORDER BY version_no DESC LIMIT 1',
      [o.offer_id]
    );
    if (!v) return res.status(404).json({ error: 'No PDF generated yet' });

    const { signedUrl, expiresAt } = await getSignedOfferPdfUrl(v.gcs_path, { minutes: Number(req.query.minutes || 10) });
    res.json({ signedUrl, expiresAt, version_no: v.version_no });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Failed to get signed url' });
  }
});

function encodeFilenameRFC5987(name) {
  return encodeURIComponent(name).replace(/['()]/g, escape).replace(/\*/g, '%2A');
}

/** Append Content-Disposition to signed URL (GCS/S3 compatible) */
function withContentDisposition(signedUrl, filename, storageHint = 'gcs') {
  const u = new URL(signedUrl);
  const cd = `attachment; filename="${filename}"; filename*=UTF-8''${encodeFilenameRFC5987(filename)}`;

  // GCS uses response-content-disposition
  // S3 uses ResponseContentDisposition
  // Add both; irrelevant ones are ignored by the other provider
  u.searchParams.set('response-content-disposition', cd);
  u.searchParams.set('ResponseContentDisposition', cd);

  // Optional: content type hint
  u.searchParams.set('response-content-type', 'application/pdf');
  u.searchParams.set('ResponseContentType', 'application/pdf');

  return u.toString();
}

router.get('/customers/offers/:offerUuid/pdf/latest/download', async (req, res) => {
  try {
    const { offerUuid } = req.params;

    const [[o]] = await pool.query(
      'SELECT offer_id FROM offer WHERE public_uuid = ?',
      [offerUuid]
    );
    if (!o) return res.status(404).json({ error: 'Offer not found' });

    const [[v]] = await pool.query(
      'SELECT version_no, gcs_path FROM offer_pdf_version WHERE offer_id=? ORDER BY version_no DESC LIMIT 1',
      [o.offer_id]
    );
    if (!v) return res.status(404).json({ error: 'No PDF generated yet' });

    const meta = await getSignedOfferPdfUrl(v.gcs_path, { minutes: 15 });
    if (!meta?.signedUrl) return res.status(404).json({ error: 'PDF not available' });

    const filename = meta.filename || `Оферта-${offerUuid}.pdf`;
    const cdHeader = `attachment; filename="${filename}"; filename*=UTF-8''${encodeFilenameRFC5987(filename)}`;

    // Try to stream the file (best for iOS + in-app browsers)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s guard

    const upstream = await fetch(meta.signedUrl, { redirect: 'follow', signal: controller.signal });
    clearTimeout(timeout);

    if (upstream.ok && upstream.body) {
      const ct = upstream.headers.get('content-type') || 'application/pdf';
      const cl = upstream.headers.get('content-length');

      res.setHeader('Content-Type', ct);
      res.setHeader('Content-Disposition', cdHeader);
      if (cl) res.setHeader('Content-Length', cl);
      res.setHeader('Cache-Control', 'private, max-age=120');

      // IMPORTANT: undici/web stream → Node stream
      return Readable.fromWeb(upstream.body).pipe(res);
    }

    // Upstream not OK (expired 403/404 etc.) → log and fallback to redirect
    const status = upstream.status;
    const snippet = await upstream.text().catch(() => '');
    console.warn('PDF upstream not OK', { status, snippet: snippet.slice(0, 200) });

    // Last resort: redirect to the signed URL (viewer will handle it)
    return res.redirect(302, meta.signedUrl);

  } catch (e) {
    console.error('PUBLIC download proxy error', e);
    return res.status(502).json({ error: 'Upstream download failed' });
  }
});


// helper if you don't already have it in the file
// function safeParseJsonMaybe(x) {
//   if (!x) return null;
//   if (typeof x === 'object') return x;
//   try { return JSON.parse(x); } catch { return null; }
// }

// --- GET /api/public/editions/:editionId/attributes
// Returns merged (EAV + JSON) with full metadata from `attribute`, already typed.
router.get('/editions/:editionId/attributes', async (req, res) => {
  const edId = Number(req.params.editionId);
  const lang = (req.query.lang === 'en' ? 'en' : 'bg');
  if (!edId) return res.status(400).json({ error: 'Invalid edition id' });

  try {
    // 1) Attribute defs for all codes (for JSON-only codes too)
    const [defsRows] = await pool.query(`
      SELECT attribute_id, code, name, name_bg, unit, data_type, category, display_group, display_order
      FROM attribute
    `);
    const defByCode = new Map(defsRows.filter(d => d.code).map(d => [d.code, d]));

    // 2) Effective EAV (+ enum label in requested lang)
    const [eff] = await pool.query(`
      SELECT
        a.attribute_id, a.code, a.name, a.name_bg, a.unit, a.data_type,
        a.category, a.display_group, a.display_order,
        v.value_numeric, v.value_text, v.value_boolean, v.value_enum_id,
        aev.code AS enum_code,
        CASE WHEN v.value_enum_id IS NULL THEN NULL
             WHEN ?='en' THEN aev.label_en ELSE aev.label_bg
        END AS enum_label
      FROM v_effective_edition_attributes v
      JOIN attribute a ON a.attribute_id = v.attribute_id
      LEFT JOIN attribute_enum_value aev ON aev.enum_id = v.value_enum_id
      WHERE v.edition_id = ?
    `, [lang, edId]);

    // 3) Sidecar JSON + i18n
    const [[specsRow]] = await pool.query(
      `SELECT specs_json, specs_i18n FROM edition_specs WHERE edition_id = ? LIMIT 1`,
      [edId]
    );
    const sj  = safeParseJsonMaybe(specsRow?.specs_json) || { attributes: {} };
    const sji = safeParseJsonMaybe(specsRow?.specs_i18n) || {};
    const i18 = (sji[lang] && sji[lang].attributes) ? sji[lang].attributes : {};

    // 4) Merge into code->item with precedence:
    //    boolean: EAV boolean -> JSON boolean
    //    int/decimal: EAV numeric -> JSON numeric
    //    enum: EAV enum label/enum_code -> JSON v (string)
    //    text: JSON i18n -> JSON v -> EAV text
    const outByCode = new Map();

    // Seed from EAV
    for (const r of eff) {
      let value = null;
      switch (r.data_type) {
        case 'enum':
          value = r.enum_label || r.enum_code || null;
          break;
        case 'boolean':
          value = r.value_boolean == null ? null : !!r.value_boolean;
          break;
        case 'int': {
          const n = Number(r.value_numeric);
          value = Number.isFinite(n) ? Math.trunc(n) : null;
          break;
        }
        case 'decimal': {
          const x = Number(r.value_numeric);
          value = Number.isFinite(x) ? x : null;
          break;
        }
        default: {
          const s = (r.value_text ?? '').toString().trim();
          value = s || null;
        }
      }
      const base = defByCode.get(r.code) || r;
      outByCode.set(r.code, {
        attribute_id: r.attribute_id,
        code: r.code,
        name: base.name,
        name_bg: base.name_bg || base.name || r.code,
        unit: base.unit,
        data_type: base.data_type || r.data_type || 'text',
        category: base.category || 'Other',
        display_group: base.display_group || base.category || 'Other',
        display_order: base.display_order ?? 9999,
        value
      });
    }

    // Merge JSON-only and fill missing from defs
    for (const [code, obj] of Object.entries(sj.attributes || {})) {
      const def = defByCode.get(code);
      const dt  = obj?.dt || def?.data_type || 'text';
      let v = null;

      if (dt === 'text') {
        // prefer i18n if present
        const s = (i18[code] != null) ? String(i18[code]) : (obj?.v != null ? String(obj.v) : '');
        v = s.trim() || null;
      } else if (dt === 'boolean') {
        v = (obj?.v === true || obj?.v === 1 || obj?.v === '1');
      } else if (dt === 'int') {
        const n = Number(obj?.v);
        v = Number.isFinite(n) ? Math.trunc(n) : null;
      } else if (dt === 'decimal') {
        const x = Number(obj?.v);
        v = Number.isFinite(x) ? x : null;
      } else if (dt === 'enum') {
        v = obj?.v != null ? String(obj.v) : null; // no enum table here; just show label/text
      } else {
        v = obj?.v ?? null;
      }

      const existing = outByCode.get(code);
      if (existing) {
        // Fill only if EAV didn’t provide a value
        if (existing.value == null && v != null) existing.value = v;
        if (!existing.unit && (obj?.u || def?.unit)) existing.unit = obj?.u || def?.unit;
        // Also keep richer display_group/name from defs if missing
        if (!existing.display_group && (def?.display_group || def?.category))
          existing.display_group = def?.display_group || def?.category;
        if (!existing.name_bg && (def?.name_bg || def?.name))
          existing.name_bg = def?.name_bg || def?.name;
        continue;
      }

      outByCode.set(code, {
        attribute_id: def?.attribute_id ?? null,
        code,
        name: def?.name || code,
        name_bg: def?.name_bg || def?.name || code,
        unit: def?.unit || obj?.u || null,
        data_type: dt,
        category: def?.category || 'Other',
        display_group: def?.display_group || def?.category || 'Other',
        display_order: def?.display_order ?? 9999,
        value: v
      });
    }

    // 5) finalize: drop empty (keep 0/false), stable order
    const items = Array.from(outByCode.values())
      .filter(x => {
        const v = x.value;
        if (v === null || v === undefined) return false;
        if (typeof v === 'string' && v.trim() === '') return false;
        return true;
      })
      .sort((a, b) => {
        // group order: numeric prefix (“01 …”) if present
        const seq = (g) => {
          const m = String(g || '').match(/^\s*(\d{1,3})\b/);
          return m ? Number(m[1]) : 999;
        };
        const ag = seq(a.display_group), bg = seq(b.display_group);
        if (ag !== bg) return ag - bg;

        const gA = String(a.display_group || '');
        const gB = String(b.display_group || '');
        if (gA !== gB) return gA.localeCompare(gB, lang);

        const ao = Number.isFinite(a.display_order) ? a.display_order : 9999;
        const bo = Number.isFinite(b.display_order) ? b.display_order : 9999;
        if (ao !== bo) return ao - bo;

        const la = a.name_bg || a.name || a.code;
        const lb = b.name_bg || b.name || b.code;
        return String(la).localeCompare(String(lb), lang);
      });

    res.json({ edition_id: edId, lang, items });
  } catch (e) {
    console.error('public edition attributes (merged)', e);
    res.status(500).json({ error: 'Database error' });
  }
});



module.exports = router;
