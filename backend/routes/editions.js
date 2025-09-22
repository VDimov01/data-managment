// editions.js
const express = require('express');
const router = express.Router();
const { getPool, withTransaction } = require('../db');
const pool = getPool();


/* ================ Helpers ================ */

const DEFAULT_LANG = 'bg';
const DRIVE_TYPE_ALLOWED = new Set(['FWD','RWD','AWD_ON_DEMAND','AWD_FULLTIME']);

// In-memory caches to cut DB roundtrips
const attrIdCache = new Map();         // code -> attribute_id
const driveTypeEnumIdCache = new Map(); // 'FWD' -> enum_id, etc.

/** Resolve attribute_id by code, cached. */
async function getAttributeId(conn, code) {
  if (attrIdCache.has(code)) return attrIdCache.get(code);
  const [[row]] = await conn.query('SELECT attribute_id FROM attribute WHERE code=?', [code]);
  if (!row) throw new Error(`Unknown attribute code: ${code}`);
  attrIdCache.set(code, row.attribute_id);
  return row.attribute_id;
}

/** Resolve enum_id for DRIVE_TYPE by enum code (FWD/RWD/AWD_ON_DEMAND/AWD_FULLTIME), cached. */
async function getDriveTypeEnumId(conn, driveCode) {
  let norm = String(driveCode || '').trim().toUpperCase();

  // Map legacy/synonyms to canonical DB codes
  if (norm === 'AWD') norm = 'AWD_ON_DEMAND';
  if (norm === '4WD' || norm === '4X4') norm = 'AWD_FULLTIME';

  if (!DRIVE_TYPE_ALLOWED.has(norm)) {
    throw new Error(
      `Invalid DRIVE_TYPE: ${driveCode}. Allowed: FWD, RWD, AWD_ON_DEMAND, AWD_FULLTIME`
    );
  }
  if (driveTypeEnumIdCache.has(norm)) return driveTypeEnumIdCache.get(norm);

  const [[ev]] = await conn.query(
    `SELECT enum_id FROM attribute_enum_value WHERE code = ? LIMIT 1`,
    [norm]
  );
  if (!ev) throw new Error(`Enum row for DRIVE_TYPE "${norm}" not found in attribute_enum_value`);
  driveTypeEnumIdCache.set(norm, ev.enum_id);
  return ev.enum_id;
}

/** Upserts JSON sidecar with JSON_MERGE_PATCH, preserving existing keys. */
async function mergeSpecsJson(conn, editionId, json = {}, json_i18n = null) {
  // Ensure carrier
  await conn.query(
    `INSERT INTO edition_specs (edition_id, specs_json, specs_i18n)
     VALUES (?, COALESCE(?, JSON_OBJECT()), ?)
     ON DUPLICATE KEY UPDATE
       specs_json = JSON_MERGE_PATCH(specs_json, COALESCE(VALUES(specs_json), JSON_OBJECT())),
       specs_i18n = JSON_MERGE_PATCH(COALESCE(specs_i18n, JSON_OBJECT()), COALESCE(VALUES(specs_i18n), JSON_OBJECT()))`,
    [editionId, JSON.stringify(json || {}), json_i18n ? JSON.stringify(json_i18n) : null]
  );
}

/** Replaces JSON sidecar (full replace). */
async function replaceSpecsJson(conn, editionId, json = {}, json_i18n = null) {
  await conn.query(
    `INSERT INTO edition_specs (edition_id, specs_json, specs_i18n)
     VALUES (?, COALESCE(?, JSON_OBJECT()), ?)
     ON DUPLICATE KEY UPDATE
       specs_json = VALUES(specs_json),
       specs_i18n = VALUES(specs_i18n)`,
    [editionId, JSON.stringify(json || {}), json_i18n ? JSON.stringify(json_i18n) : null]
  );
}

/** Upsert numeric/boolean/text EAV in one transaction. */
async function upsertEavPayload(conn, editionId, { eavNumeric = [], eavBoolean = [], eavText = [] }) {
  // numeric
  for (const it of eavNumeric) {
    const code = String(it.code || '').trim();
    if (!code) continue;
    const val = Number(it.val);
    const attributeId = await getAttributeId(conn, code);
    await conn.query(
      `INSERT INTO edition_attribute (edition_id, attribute_id, value_numeric, value_text, value_boolean, value_enum_id)
       VALUES (?, ?, ?, NULL, NULL, NULL)
       ON DUPLICATE KEY UPDATE value_numeric = VALUES(value_numeric),
                               value_text = NULL, value_boolean = NULL, value_enum_id = NULL`,
      [editionId, attributeId, Number.isFinite(val) ? val : null]
    );
  }

  // boolean
  for (const it of eavBoolean) {
    const code = String(it.code || '').trim();
    if (!code) continue;
    const v = it.val;
    const b = (v === true || v === 1 || v === '1' || v === 'true') ? 1 :
              (v === false || v === 0 || v === '0' || v === 'false') ? 0 : null;
    const attributeId = await getAttributeId(conn, code);
    await conn.query(
      `INSERT INTO edition_attribute (edition_id, attribute_id, value_numeric, value_text, value_boolean, value_enum_id)
       VALUES (?, ?, NULL, NULL, ?, NULL)
       ON DUPLICATE KEY UPDATE value_boolean = VALUES(value_boolean),
                               value_text = NULL, value_numeric = NULL, value_enum_id = NULL`,
      [editionId, attributeId, b]
    );
  }

  // text (i18n). Default lang is bg; 'en' is optional.
  for (const it of eavText) {
    const code = String(it.code || '').trim();
    if (!code) continue;
    const en = (it.en ?? '').toString().trim() || null;
    const bg = (it.bg ?? '').toString().trim() || null;

    const attributeId = await getAttributeId(conn, code);
    // Ensure holder
    await conn.query(
      `INSERT IGNORE INTO edition_attribute (edition_id, attribute_id) VALUES (?, ?)`,
      [editionId, attributeId]
    );

    if (bg) {
      await conn.query(
        `INSERT INTO edition_attribute_i18n (edition_id, attribute_id, lang, value_text)
         VALUES (?, ?, 'bg', ?)
         ON DUPLICATE KEY UPDATE value_text = VALUES(value_text)`,
        [editionId, attributeId, bg]
      );
    }
    if (en) {
      await conn.query(
        `INSERT INTO edition_attribute_i18n (edition_id, attribute_id, lang, value_text)
         VALUES (?, ?, 'en', ?)
         ON DUPLICATE KEY UPDATE value_text = VALUES(value_text)`,
        [editionId, attributeId, en]
      );
    }

    // Optional: keep edition_attribute.value_text as BG for compatibility (fallbacks in old GET)
    if (bg) {
      await conn.query(
        `UPDATE edition_attribute SET value_text = ? WHERE edition_id=? AND attribute_id=?`,
        [bg, editionId, attributeId]
      );
    }
  }
}

/** Upsert DRIVE_TYPE enum safely (code is FWD/RWD/AWD_ON_DEMAND/AWD_FULLTIME). */
async function upsertDriveType(conn, editionId, driveCodeOrLabel) {
  if (driveCodeOrLabel == null) return;

  // Accept labels/phrases and map to canonical before lookup
  const r = String(driveCodeOrLabel).trim().toLowerCase();
  let code = '';
  if (['front','front wheel drive','предно'].includes(r)) code = 'FWD';
  else if (['rear','rear wheel drive','задно'].includes(r)) code = 'RWD';
  else if (['awd','awd (on-demand)','awd (при нужда)'].includes(r)) code = 'AWD_ON_DEMAND';
  else if (['4wd','4x4','awd (full-time)','awd (постоянно)'].includes(r)) code = 'AWD_FULLTIME';
  else code = String(driveCodeOrLabel).trim().toUpperCase();

  const enumId = await getDriveTypeEnumId(conn, code);
  const driveAttrId = await getAttributeId(conn, 'DRIVE_TYPE');

  await conn.query(
    `INSERT INTO edition_attribute (edition_id, attribute_id, value_enum_id, value_numeric, value_text, value_boolean)
     VALUES (?, ?, ?, NULL, NULL, NULL)
     ON DUPLICATE KEY UPDATE value_enum_id = VALUES(value_enum_id),
                             value_text = NULL, value_numeric = NULL, value_boolean = NULL`,
    [editionId, driveAttrId, enumId]
  );
}


// helper at top of file (once)
function asJson(val, fallback) {
  if (val == null) return fallback;
  if (Buffer.isBuffer(val)) {
    try { return JSON.parse(val.toString('utf8')); } catch { return fallback; }
  }
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  if (typeof val === 'object') return val; // already parsed by mysql2
  return fallback;
}

/* ================ Routes ================ */


/* GET: list editions */
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT e.edition_id, e.name AS edition_name,
             my.year, mo.name AS model, m.name AS make
      FROM edition e
      JOIN model_year my ON e.model_year_id = my.model_year_id
      JOIN model mo ON my.model_id = mo.model_id
      JOIN make m ON mo.make_id = m.make_id
      ORDER BY m.name, mo.name, my.year, e.name
    `);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/editions', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * POST /api/editions
 * Body: { make: string, model: string, year: number, editionName: string }
 * Creates (or reuses) make → model → model_year, then creates edition (if not exists).
 */
router.post('/', async (req, res) => {
  const { make, model, year, editionName } = req.body;
  if (!make || !model || !year || !editionName) {
    return res.status(400).json({ error: 'make, model, year, editionName are required' });
  }

  try {
    const result = await withTransaction(async (conn) => {
      let [rows] = await conn.query('SELECT make_id FROM make WHERE name=?', [make]);
      const makeId = rows.length ? rows[0].make_id
        : (await conn.query('INSERT INTO make(name) VALUES (?)', [make]))[0].insertId;

      [rows] = await conn.query('SELECT model_id FROM model WHERE make_id=? AND name=?', [makeId, model]);
      const modelId = rows.length ? rows[0].model_id
        : (await conn.query('INSERT INTO model(make_id,name) VALUES (?,?)', [makeId, model]))[0].insertId;

      [rows] = await conn.query('SELECT model_year_id FROM model_year WHERE model_id=? AND `year`=?', [modelId, year]);
      const modelYearId = rows.length ? rows[0].model_year_id
        : (await conn.query('INSERT INTO model_year(model_id, `year`) VALUES (?,?)', [modelId, year]))[0].insertId;

      [rows] = await conn.query('SELECT edition_id FROM edition WHERE model_year_id=? AND name=?', [modelYearId, editionName]);
      if (rows.length) {
        const err = new Error('Edition exists');
        err.status = 409;
        err.edition_id = rows[0].edition_id;
        throw err;
      }

      const [ed] = await conn.query('INSERT INTO edition(model_year_id, name) VALUES (?,?)', [modelYearId, editionName]);
      return { makeId, modelId, modelYearId, editionId: ed.insertId };
    });

    res.status(201).json({
      message: 'Edition created',
      make_id: result.makeId,
      model_id: result.modelId,
      model_year_id: result.modelYearId,
      edition_id: result.editionId
    });
  } catch (e) {
    if (e.status === 409) {
      return res.status(409).json({ error: 'Edition already exists', edition_id: e.edition_id });
    }
    console.error('POST /api/editions', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * GET /api/editions/:editionId/specs?lang=bg|en (bg default)
 * Returns: { json, json_i18n, eav: { numeric:[], boolean:[], text:[] }, enums:{ DRIVE_TYPE?: "FWD" } }
 */
router.get('/:editionId/specs', async (req, res) => {
  const editionId = Number(req.params.editionId);
  const lang = (req.query.lang === 'en' ? 'en' : DEFAULT_LANG);
  if (!Number.isFinite(editionId)) return res.status(400).json({ error: 'Invalid editionId' });

  const conn = await pool.getConnection();
  try {
    // JSON sidecar (no JSON_EXTRACT needed for full doc)
    const [[sp]] = await conn.query(
      `SELECT es.specs_json AS j, es.specs_i18n AS ji18n
         FROM edition_specs es
        WHERE es.edition_id=?`,
      [editionId]
    );

    const json      = asJson(sp?.j,      { attributes: {} }); // stable shape
    const json_i18n = asJson(sp?.ji18n,  null);

    // Pull EAV for this edition, including enum (drive type)
    const [rows] = await conn.query(
      `
      SELECT a.attribute_id, a.code, a.data_type, a.unit, a.is_filterable,
             ea.value_numeric, ea.value_text, ea.value_boolean, ea.value_enum_id,
             aev.code AS enum_code,
             CASE WHEN ea.value_enum_id IS NULL THEN NULL
                  WHEN ?='en' THEN aev.label_en ELSE aev.label_bg END AS enum_label,
             eai.value_text AS value_text_i18n
        FROM edition_attribute ea
        JOIN attribute a ON a.attribute_id=ea.attribute_id
        LEFT JOIN attribute_enum_value aev ON aev.enum_id = ea.value_enum_id
        LEFT JOIN edition_attribute_i18n eai
               ON eai.edition_id = ea.edition_id
              AND eai.attribute_id = ea.attribute_id
              AND eai.lang = ?
       WHERE ea.edition_id = ?`,
      [lang, lang, editionId]
    );

    const eav = { numeric: [], boolean: [], text: [] };
    const enums = {};
    for (const r of rows) {
      if (r.data_type === 'int' || r.data_type === 'decimal') {
        if (r.value_numeric != null) eav.numeric.push({ code: r.code, val: r.value_numeric, unit: r.unit });
      } else if (r.data_type === 'boolean') {
        if (r.value_boolean != null) eav.boolean.push({ code: r.code, val: !!r.value_boolean });
      } else if (r.data_type === 'enum') {
        if (r.code === 'DRIVE_TYPE' && r.enum_code) enums.DRIVE_TYPE = r.enum_code; // return code
      } else {
        const t = (r.value_text_i18n ?? r.value_text) ?? null;
        if (t != null) eav.text.push({ code: r.code, [lang]: String(t) });
      }
    }

    // rows: keep empty array for UI merge step
    res.json({ json, json_i18n, eav, enums, rows: [] });
  } catch (e) {
    console.error('GET /editions/:id/specs', e);
    res.status(500).json({ error: 'DB error' });
  } finally {
    conn.release();
  }
});


/**
 * POST /api/editions/:editionId/specs
 * Body:
 * {
 *   enums: { DRIVE_TYPE?: "FWD" | "RWD" | "AWD" | "4WD" },
 *   eavNumeric: [{code, val}], eavBoolean: [{code, val}],
 *   eavText: [{code, bg, en?}],             // BG default; EN optional
 *   json: {...},                             // sidecar (merged)
 *   json_i18n: {"bg": {...}, "en"?: {...}}   // BG default; EN optional
 * }
 */
router.post('/:editionId/specs', async (req, res) => {
  const editionId = Number(req.params.editionId);
  if (!Number.isFinite(editionId)) return res.status(400).json({ error: 'Invalid editionId' });

  // light payload validation
  const enums = req.body.enums || {};
  const eavNumeric = Array.isArray(req.body.eavNumeric) ? req.body.eavNumeric : [];
  const eavBoolean = Array.isArray(req.body.eavBoolean) ? req.body.eavBoolean : [];
  const eavText    = Array.isArray(req.body.eavText)    ? req.body.eavText    : [];
  const json       = req.body.json || {};
  const json_i18n  = req.body.json_i18n || null;

  try {
    await withTransaction(async (conn) => {
      // 1) enums — only DRIVE_TYPE for now
      if (enums.DRIVE_TYPE != null) {
        await upsertDriveType(conn, editionId, enums.DRIVE_TYPE);
      }

      // 2) EAV numeric/boolean/text (BG default; EN optional)
      await upsertEavPayload(conn, editionId, { eavNumeric, eavBoolean, eavText });

      // 3) JSON sidecar (merge semantics)
      await mergeSpecsJson(conn, editionId, json, json_i18n);
    });

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('POST /editions/:id/specs', e);
    res.status(400).json({ ok: false, error: e.message });
  }
});


/**
 * PUT /api/editions/:editionId/specs?replace=1
 * Same body as POST. If replace=1, the JSON sidecar is **replaced**; otherwise merged.
 * EAV parts are always upserts.
 */
router.put('/:editionId/specs', async (req, res) => {
  const editionId = Number(req.params.editionId);
  if (!Number.isFinite(editionId)) return res.status(400).json({ error: 'Invalid editionId' });
  const replace = req.query.replace === '1' || req.query.replace === 'true';

  const enums = req.body.enums || {};
  const eavNumeric = Array.isArray(req.body.eavNumeric) ? req.body.eavNumeric : [];
  const eavBoolean = Array.isArray(req.body.eavBoolean) ? req.body.eavBoolean : [];
  const eavText    = Array.isArray(req.body.eavText)    ? req.body.eavText    : [];
  const json       = req.body.json || {};
  const json_i18n  = req.body.json_i18n || null;

  try {
    await withTransaction(async (conn) => {
      if (enums.DRIVE_TYPE != null) {
        await upsertDriveType(conn, editionId, enums.DRIVE_TYPE);
      }
      await upsertEavPayload(conn, editionId, { eavNumeric, eavBoolean, eavText });
      if (replace) {
        await replaceSpecsJson(conn, editionId, json, json_i18n);
      } else {
        await mergeSpecsJson(conn, editionId, json, json_i18n);
      }
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /editions/:id/specs', e);
    res.status(400).json({ ok: false, error: e.message });
  }
});


/**
 * DELETE /api/editions/:editionId/specs
 * Query:
 *   purge=json|eav|both (default: json)  — controls what to clear
 *   codes=CSV (only used when purge=eav) — which EAV codes to delete; if absent, deletes none
 */
router.delete('/:editionId/specs', async (req, res) => {
  const editionId = Number(req.params.editionId);
  if (!Number.isFinite(editionId)) return res.status(400).json({ error: 'Invalid editionId' });

  const purge = (req.query.purge || 'json').toLowerCase();
  const codes = String(req.query.codes || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  try {
    await withTransaction(async (conn) => {
      if (purge === 'json' || purge === 'both') {
        await conn.query(`DELETE FROM edition_specs WHERE edition_id=?`, [editionId]);
      }
      if ((purge === 'eav' || purge === 'both') && codes.length) {
        const ph = codes.map(() => '?').join(',');
        const [ids] = await conn.query(
          `SELECT attribute_id FROM attribute WHERE code IN (${ph})`,
          codes
        );
        const aIds = ids.map(r => r.attribute_id);
        if (aIds.length) {
          const ph2 = aIds.map(() => '?').join(',');
          await conn.query(
            `DELETE FROM edition_attribute WHERE edition_id=? AND attribute_id IN (${ph2})`,
            [editionId, ...aIds]
          );
          await conn.query(
            `DELETE FROM edition_attribute_i18n WHERE edition_id=? AND attribute_id IN (${ph2})`,
            [editionId, ...aIds]
          );
        }
      }
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /editions/:id/specs', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});



/**
 * POST /api/editions/compare
 * Body: { edition_ids: number[], only_differences?: boolean, codes?: string[] }
 * Returns: {
 *   editions: [{ edition_id, edition_name, year, model_name, make_name }],
 *   rows: [{ code, name, name_bg, unit, data_type, category, values: { [edition_id]: value|null } }]
 * }
 */
// POST /api/editions/compare
// Body: { edition_ids: number[], only_differences?: boolean, codes?: string[], lang?: 'bg'|'en' }
router.post('/compare', async (req, res) => {
  try {
    const {
      edition_ids = [],
      only_differences = false,
      codes = [],
      lang: bodyLang
    } = req.body;

    const ids = (edition_ids || []).map(Number).filter(Number.isFinite);
    if (!ids.length) return res.status(400).json({ error: 'edition_ids required' });

    const lang = bodyLang === 'en' || req.query.lang === 'en' ? 'en' : 'bg';

    const placeholders = ids.map(() => '?').join(',');

    // --- 1) Always fetch headers so columns show even if no attributes yet
    const [eds] = await pool.query(
      `
      SELECT e.edition_id, e.name AS edition_name,
             my.year, mo.name AS model_name, m.name AS make_name
        FROM edition e
        JOIN model_year my ON my.model_year_id = e.model_year_id
        JOIN model mo ON mo.model_id = my.model_id
        JOIN make  m  ON m.make_id  = mo.make_id
       WHERE e.edition_id IN (${placeholders})
      `,
      ids
    );
    // Preserve requested order
    const edById = new Map(eds.map(r => [r.edition_id, r]));
    const editionsHeader = ids.map(id => edById.get(id)).filter(Boolean);
    if (!editionsHeader.length) return res.status(404).json({ error: 'No such editions' });

    // Optional filter by attribute codes
    const codeFilter = (codes || []).map(s => String(s).trim()).filter(Boolean);
    const codeFilterSql = codeFilter.length ? `AND a.code IN (${codeFilter.map(() => '?').join(',')})` : [];
    const codeParams = codeFilter.length ? codeFilter : [];

    // --- 2) Attribute definitions (for names/units/categories)
    const [defs] = await pool.query(`
      SELECT attribute_id, code, name, name_bg, unit, data_type, category, display_group, display_order
        FROM attribute
    `);
    const defByCode = new Map(defs.map(d => [d.code, d]));

    // --- 3) Effective EAV values (edition ▸ year ▸ model)
    const [eff] = await pool.query(
      `
      SELECT
        v.edition_id,
        a.attribute_id, a.code, a.name, a.name_bg, a.unit, a.data_type, a.category,
        v.value_numeric, v.value_text, v.value_boolean, v.value_enum_id,
        aev.code AS enum_code,
        CASE WHEN v.value_enum_id IS NULL THEN NULL
             WHEN ?='en' THEN aev.label_en ELSE aev.label_bg END AS enum_label
      FROM v_effective_edition_attributes v
      JOIN attribute a ON a.attribute_id = v.attribute_id
      LEFT JOIN attribute_enum_value aev ON aev.enum_id = v.value_enum_id
      WHERE v.edition_id IN (${placeholders})
      ${codeFilterSql ? codeFilterSql : ''}
      `,
      [lang, ...ids, ...codeParams]
    );

    // Helper: add a value into rowMap with skip rules (same as before)
    const rowMap = new Map(); // code -> { code, name, name_bg, unit, data_type, category, values: { [edId]: val } }
    function upsertRowVal(code, meta, edId, dt, rawVal, unitFromVal) {
      if (!code) return;

      // Coerce & skip empties exactly like your old route
      let val = null;
      if (dt === 'text') {
        const s = (rawVal ?? '').toString().trim();
        if (s) val = s;
      } else if (dt === 'boolean') {
        if (rawVal !== null && rawVal !== undefined) val = !!rawVal; // false is valid
      } else if (dt === 'int') {
        const n = rawVal != null ? Number(rawVal) : null;
        if (Number.isFinite(n) && Math.trunc(n) !== 0) val = Math.trunc(n);
      } else if (dt === 'decimal') {
        const x = rawVal != null ? Number(rawVal) : null;
        if (Number.isFinite(x) && Math.abs(x) >= 1e-9) val = x;
      } else if (dt === 'enum') {
        // For enums we keep label/code as raw string; treat empty as null
        const s = (rawVal ?? '').toString().trim();
        if (s) val = s;
      }

      if (val === null) return;

      if (!rowMap.has(code)) {
        rowMap.set(code, {
          code,
          name: meta?.name || code,
          name_bg: meta?.name_bg || meta?.name || code,
          unit: meta?.unit ?? unitFromVal ?? null,
          data_type: meta?.data_type || dt || 'text',
          category: meta?.category || 'Other',
          display_group: meta?.display_group || meta?.category || 'Other',
          display_order: Number.isFinite(meta?.display_order) ? Number(meta.display_order) : 9999,
          values: {}
        });
      }
      const row = rowMap.get(code);
      // Keep a stable unit if def has one; else allow first non-null seen
      if (!row.unit && (meta?.unit || unitFromVal)) row.unit = meta?.unit ?? unitFromVal ?? null;

      // Do not overwrite if something already set (EAV wins over JSON, etc.)
      if (!(edId in row.values)) {
        row.values[edId] = val;
      }
    }

    // Fill from effective EAV
    for (const r of eff) {
      const meta = defByCode.get(r.code);
      if (!meta) continue; // attribute unknown (shouldn't happen if defs are complete)

      if (r.data_type === 'int' || r.data_type === 'decimal') {
        upsertRowVal(r.code, meta, r.edition_id, r.data_type, r.value_numeric, r.unit);
      } else if (r.data_type === 'boolean') {
        upsertRowVal(r.code, meta, r.edition_id, 'boolean', r.value_boolean, r.unit);
      } else if (r.data_type === 'enum') {
        // show localized label if we have it, otherwise enum code
        const display = r.enum_label ?? r.enum_code ?? null;
        upsertRowVal(r.code, meta, r.edition_id, 'enum', display, r.unit);
      } else {
        // text (we generally store text in JSON now; still support legacy)
        upsertRowVal(r.code, meta, r.edition_id, 'text', r.value_text, r.unit);
      }
    }

    // --- 4) Merge JSON sidecar (edition_specs)
    const [specsRows] = await pool.query(
      `SELECT edition_id, specs_json, specs_i18n
         FROM edition_specs
        WHERE edition_id IN (${placeholders})`,
      ids
    );

    const parseMaybeJson = (x) => {
      if (x == null) return null;
      if (typeof x === 'object') return x;
      try { return JSON.parse(x); } catch { return null; }
    };

    for (const s of specsRows) {
      const edId = s.edition_id;
      const j = parseMaybeJson(s.specs_json) || { attributes: {} };
      const ji = parseMaybeJson(s.specs_i18n) || null;
      const i18nAttrs = ji && ji[lang] && ji[lang].attributes ? ji[lang].attributes : {};

      for (const [code, obj] of Object.entries(j.attributes || {})) {
        const meta = defByCode.get(code);
        const dt = (obj && obj.dt) || meta?.data_type || 'text';
        const unit = (obj && obj.u) || meta?.unit || null;

        if (dt === 'text') {
          // Prefer localized string if present
          const t = i18nAttrs[code] ?? (obj ? obj.v : null);
          upsertRowVal(code, meta, edId, 'text', t, unit);
        } else if (dt === 'boolean') {
          const b = obj ? (obj.v === true || obj.v === 1 || obj.v === '1') : null;
          upsertRowVal(code, meta, edId, 'boolean', b, unit);
        } else if (dt === 'int') {
          upsertRowVal(code, meta, edId, 'int', obj ? obj.v : null, unit);
        } else if (dt === 'decimal') {
          upsertRowVal(code, meta, edId, 'decimal', obj ? obj.v : null, unit);
        } else if (dt === 'enum') {
          // You normally won't store enums in JSON with this design, but support it if present
          upsertRowVal(code, meta, edId, 'enum', obj ? obj.v : null, unit);
        } else {
          // fallback as text
          upsertRowVal(code, meta, edId, 'text', obj ? obj.v : null, unit);
        }
      }
    }

    // --- 5) Optional code filter applied after merge (keeps order stable)
    let rowsOut = [];
    for (const [code, row] of rowMap.entries()) {
      if (codeFilter.length && !codeFilter.includes(code)) continue;

      // drop rows where all selected editions are null
      const vals = ids.map(id => row.values[id] ?? null);
      const allNull = vals.every(v => v === null);
      if (allNull) continue;

      rowsOut.push(row);
    }

    // only_differences
    if (only_differences) {
      rowsOut = rowsOut.filter(row => {
        const vals = ids.map(id => row.values[id] ?? null);
        const first = JSON.stringify(vals[0]);
        return vals.some(v => JSON.stringify(v) !== first);
      });
    }


    // sort: display_group (lexical: '01 ...' < '02 ...'), then display_order, then name
      rowsOut.sort((a, b) => {
      const ga = (a.display_group || a.category || '');
      const gb = (b.display_group || b.category || '');
      const gcmp = ga.localeCompare(gb);
      if (gcmp) return gcmp;
      const oa = Number.isFinite(a.display_order) ? a.display_order : 9999;
      const ob = Number.isFinite(b.display_order) ? b.display_order : 9999;
      if (oa !== ob) return oa - ob;
        return (a.name_bg || a.name || '').localeCompare(b.name_bg || b.name || '');
      });

    res.json({ editions: editionsHeader, rows: rowsOut });
  } catch (e) {
    console.error('POST /api/editions/compare', e);
    res.status(500).json({ error: 'DB error' });
  }
});


// routes/editions.js (add below your other routes)
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    // block if used by vehicles
    const [[ref]] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM vehicle WHERE edition_id = ?',
      [id]
    );
    if ((ref?.cnt || 0) > 0) {
      return res.status(409).json({ error: 'Edition is used by vehicles and cannot be deleted' });
    }

    // remove attributes (if FK ON DELETE CASCADE is set on edition_attribute, this is not needed)
    await pool.query('DELETE FROM edition_attribute WHERE edition_id = ?', [id]);

    const [r] = await pool.query('DELETE FROM edition WHERE edition_id = ?', [id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Not found' });

    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error('DELETE /api/editions/:id', e);
    res.status(500).json({ error: 'Database error' });
  }
});



/* GET: edition attributes
   - default: raw edition_attribute merged into attribute defs (your current behavior)
   - effective=1: use inheritance view (edition ▸ model_year ▸ model)
   - lang=en|bg (for enum label and i18n text), default bg
*/
router.get('/:editionId/attributes', async (req, res) => {
  const editionId = Number(req.params.editionId);
  const effective = String(req.query.effective || '') === '1' || String(req.query.effective || '') === 'true';
  const lang = (req.query.lang === 'en' ? 'en' : 'bg');

  if (!Number.isFinite(editionId)) {
    return res.status(400).json({ error: 'Invalid editionId' });
  }

  const conn = await pool.getConnection();
  try {
    // inside GET /api/editions/:editionId/attributes
if (effective) {
  // Always list ALL attributes, LEFT JOIN effective values for this edition
  const [rows] = await conn.query(
    `
    SELECT
      a.attribute_id, a.code, a.name, a.name_bg, a.unit, a.data_type, a.category,
      a.display_group, a.display_order, a.is_filterable,

      v.value_numeric, v.value_text, v.value_boolean, v.value_enum_id, v.source_level,

      aev.code AS enum_code,
      CASE WHEN v.value_enum_id IS NULL THEN NULL
           WHEN ? = 'en' THEN aev.label_en
           ELSE aev.label_bg
      END AS enum_label,

      eai.value_text AS value_text_i18n
    FROM attribute a
    LEFT JOIN v_effective_edition_attributes v
      ON v.attribute_id = a.attribute_id
     AND v.edition_id   = ?
    LEFT JOIN attribute_enum_value aev
      ON aev.enum_id = v.value_enum_id
    LEFT JOIN edition_attribute_i18n eai
      ON eai.edition_id  = ?
     AND eai.attribute_id = a.attribute_id
     AND eai.lang         = ?
    ORDER BY
      COALESCE(a.display_group, a.category),
      COALESCE(a.display_order, 9999),
      a.name
    `,
    [lang, editionId, editionId, lang]
  );

  const normalized = rows.map(r => ({
    attribute_id:  r.attribute_id,
    code:          r.code,
    name:          r.name,
    name_bg:       r.name_bg,
    unit:          r.unit,
    data_type:     r.data_type,
    category:      r.category,
    display_group: r.display_group,
    display_order: r.display_order,
    is_filterable: !!r.is_filterable,

    // expose the source your UI expects
    source:        r.source_level || null,   // 'edition' | 'model_year' | 'model' | null

    // values (prefer i18n text if present)
    value_numeric: r.value_numeric ?? null,
    value_text:    (r.value_text_i18n ?? r.value_text) ?? null,
    value_boolean: r.value_boolean ?? null,
    value_enum_id: r.value_enum_id ?? null,
    enum_code:     r.enum_code ?? null,
    enum_label:    r.enum_label ?? null
  }));

  return res.json(normalized);
}


    // ---------- Legacy/raw mode: your original behavior, with tiny upgrades (enum + i18n) ----------
    const [defs] = await conn.query(`
      SELECT attribute_id, code, name, name_bg, unit, data_type, category, display_group, display_order
      FROM attribute
      ORDER BY COALESCE(display_group, category), COALESCE(display_order, 9999), name
    `);

    const [vals] = await conn.query(
      `SELECT attribute_id, value_numeric, value_text, value_boolean, value_enum_id
         FROM edition_attribute
        WHERE edition_id = ?`,
      [editionId]
    );

    // i18n text overrides (only if present)
    const [i18nRows] = await conn.query(
      `SELECT attribute_id, value_text
         FROM edition_attribute_i18n
        WHERE edition_id = ? AND lang = ?`,
      [editionId, lang]
    );
    const i18nMap = new Map(i18nRows.map(r => [r.attribute_id, r.value_text]));

    // enum labels for rows that have a value_enum_id
    const enumIds = vals.map(v => v.value_enum_id).filter(Boolean);
    let enumMap = new Map();
    if (enumIds.length) {
      const placeholders = enumIds.map(() => '?').join(',');
      const [ers] = await conn.query(
        `SELECT enum_id, code, ${lang === 'en' ? 'label_en' : 'label_bg'} AS label
           FROM attribute_enum_value
          WHERE enum_id IN (${placeholders})`,
        enumIds
      );
      enumMap = new Map(ers.map(r => [r.enum_id, { code: r.code, label: r.label }]));
    }

    const byAttr = new Map(vals.map(v => [v.attribute_id, v]));
    const merged = defs.map(d => {
      const v = byAttr.get(d.attribute_id) || {};
      const enumInfo = v.value_enum_id ? enumMap.get(v.value_enum_id) : null;
      return {
        attribute_id: d.attribute_id,
        code: d.code,
        name: d.name,
        name_bg: d.name_bg,
        unit: d.unit,
        data_type: d.data_type,
        category: d.category,
        display_group: d.display_group,
        display_order: d.display_order,
        // raw values (no inheritance here)
        value_numeric: v.value_numeric ?? null,
        value_text: (i18nMap.get(d.attribute_id) ?? v.value_text ?? null),
        value_boolean: v.value_boolean ?? null,
        value_enum_id: v.value_enum_id ?? null,
        enum_code: enumInfo?.code ?? null,
        enum_label: enumInfo?.label ?? null
      };
    });

    res.json(merged);
  } catch (e) {
    console.error('GET /api/editions/:id/attributes', e);
    res.status(500).json({ error: 'DB error' });
  } finally {
    conn.release();
  }
});

module.exports = router;
