// routes/public.js
const express = require('express');
const router = express.Router();
const { getPool } = require('../db');
const pool = getPool();

/** ---------------- helpers (same behavior as brochures.js) ---------------- */
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
  const [vehRows] = await db.query(
    `SELECT v.vehicle_id, v.public_uuid, v.vin, v.stock_number, v.mileage,
            v.status, v.asking_price, v.edition_id, v.shop_id
     FROM vehicle v
     WHERE v.public_uuid = ?`, [uuid]);

  if (vehRows.length === 0) return res.status(404).json({ error: 'Not found' });
  const v = vehRows[0];

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
    asking_price: v.asking_price,
    edition_id: v.edition_id,
    // attributes: attrs,
  });
});


module.exports = router;
