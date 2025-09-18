// routes/compares.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getPool } = require('../db');
const pool = getPool();

/* -------------------- helpers (match brochures) -------------------- */

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

/** Load specs_json + specs_i18n for many editions */
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
      json: safeParseJsonMaybe(r.specs_json) || {},
      i18n: safeParseJsonMaybe(r.specs_i18n) || {}
    });
  }
  return m;
}

/* -------------------- compute (EAV + JSON + i18n) -------------------- */
// language: 'bg' | 'en'
async function computeCompare(conn, editionIds, onlyDifferences = 0, language = 'bg') {
  if (!editionIds?.length) return { editions: [], rows: [] };
  const ph = editionIds.map(() => '?').join(',');

  // 1) Header (editions)
  const [eds] = await conn.query(
    `SELECT 
       e.edition_id, e.name AS edition_name,
       my.year, mo.name AS model_name, m.name AS make_name
     FROM edition e
     JOIN model_year my ON e.model_year_id = my.model_year_id
     JOIN model mo ON my.model_id = mo.model_id
     JOIN make m ON mo.make_id = m.make_id
     WHERE e.edition_id IN (${ph})
     ORDER BY m.name, mo.name, my.year, e.name`,
    editionIds
  );
  const editions = eds.map(r => ({
    edition_id: r.edition_id,
    edition_name: r.edition_name,
    year: r.year,
    model_name: r.model_name,
    make_name: r.make_name
  }));

  // 2) Attribute definitions (all)
  const [defs] = await conn.query(
    `SELECT attribute_id, code, name, name_bg, unit, data_type, category,
            COALESCE(display_group, category) AS display_group,
            COALESCE(display_order, 9999)     AS display_order
       FROM attribute
     ORDER BY COALESCE(display_group, category), COALESCE(display_order, 9999), name`
  );
  const byCode = new Map(defs.map(d => [d.code, d]));

  // 3) Effective EAV for selected editions (+ enum label)
  const [eav] = await conn.query(
    `SELECT 
       v.edition_id, a.attribute_id, a.code, a.name, a.name_bg, a.unit, a.data_type, a.category,
       v.value_numeric, v.value_text, v.value_boolean, v.value_enum_id,
       aev.code AS enum_code,
       CASE WHEN v.value_enum_id IS NULL THEN NULL
            WHEN ?='en' THEN aev.label_en ELSE aev.label_bg END AS enum_label
     FROM v_effective_edition_attributes v
     JOIN attribute a ON a.attribute_id = v.attribute_id
     LEFT JOIN attribute_enum_value aev ON aev.enum_id = v.value_enum_id
     WHERE v.edition_id IN (${ph})
     ORDER BY a.category, a.name`,
    [language, ...editionIds]
  );

  const rowMap = new Map(); // code -> row
  const ensureRow = (def) => {
    if (!rowMap.has(def.code)) {
      rowMap.set(def.code, {
        code: def.code,
        name: def.name,
        name_bg: def.name_bg,
        unit: def.unit,
        data_type: def.data_type,
        category: def.category,
        values: {} // edition_id -> val
      });
    }
    return rowMap.get(def.code);
  };

  // EAV pass
  for (const r of eav) {
    const def = byCode.get(r.code);
    if (!def) continue;
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

  // 4) Overlay JSON sidecar (prefer BG i18n for text)
  const specsMap = await loadSpecsMap(conn, editionIds);
  for (const ed of editions) {
    const spec = specsMap.get(ed.edition_id);
    if (!spec) continue;

    const root = spec.json || {};
    const i18n = spec.i18n || {};
    const attr  = root.attributes || {};
    const bgMap = (i18n.bg || {}).attributes || {};

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

  const L = String(language || 'bg');
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

  // 5) Filter rows
  const rowsOut = [];
  for (const row of rowMap.values()) {
    const vals = editions.map(e => row.values[e.edition_id] ?? null);
    const allNull = vals.every(v => v === null);
    if (allNull) continue;
    if (onlyDifferences) {
      const sig = JSON.stringify(vals[0]);
      const differs = vals.some(v => JSON.stringify(v) !== sig);
      if (!differs) continue;
    }
    rowsOut.push(row);
  }

  // 6) Sort by display group / order / name
  rowsOut.sort((a, b) => {
    const da = byCode.get(a.code), db = byCode.get(b.code);
    const g  = String(da?.display_group || da?.category || '')
                .localeCompare(String(db?.display_group || db?.category || ''));
    if (g) return g;
    const o  = (da?.display_order ?? 9999) - (db?.display_order ?? 9999);
    if (o) return o;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  return { editions, rows: rowsOut };
}

/* -------------------- snapshot JSON unwrapping -------------------- */
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
    return null;
  }
  return null;
}

/* -------------------- routes -------------------- */
/** List (search + pagination) */
router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
  const offset = (page - 1) * limit;
  try {
    const where = q ? 'WHERE title LIKE ? OR description LIKE ?' : '';
    const params = q ? [`%${q}%`, `%${q}%`] : [];
    const [[{cnt}]] = await pool.query(`SELECT COUNT(*) cnt FROM compare_sheet ${where}`, params);
    const [rows] = await pool.query(
      `SELECT compare_id, public_uuid, title, description, only_differences, language, is_snapshot, created_at, updated_at
         FROM compare_sheet
         ${where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?`,
      q ? [...params, limit, offset] : [limit, offset]
    );
    res.json({ total: cnt, compares: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

/** Create */
router.post('/', async (req, res) => {
  const { title, description = null, only_differences = 0, language = 'bg', edition_ids = [], snapshot = 0 } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ error: 'title required' });
  if (!Array.isArray(edition_ids) || edition_ids.length === 0) return res.status(400).json({ error: 'edition_ids array required' });

  const uuid = crypto.randomUUID();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [ins] = await conn.query(
      `INSERT INTO compare_sheet (public_uuid, title, description, only_differences, language, is_snapshot)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuid, title.trim(), description, only_differences ? 1 : 0, language, snapshot ? 1 : 0]
    );
    const compareId = ins.insertId;

    const uniq = Array.from(new Set(edition_ids.map(Number).filter(Number.isFinite)));
    if (!uniq.length) throw new Error('No valid edition_ids');

    const values = uniq.map((id, i) => [compareId, id, i]);
    await conn.query(
      `INSERT INTO compare_sheet_edition (compare_id, edition_id, sort_order)
       VALUES ${values.map(()=>'(?,?,?)').join(',')}`,
      values.flat()
    );

    if (snapshot) {
      const data = await computeCompare(conn, uniq, only_differences ? 1 : 0, language);
      await conn.query(
        `UPDATE compare_sheet SET snapshot_json = CAST(? AS JSON) WHERE compare_id=?`,
        [JSON.stringify(data), compareId]
      );
    }

    await conn.commit();
    res.status(201).json({ compare_id: compareId, public_uuid: uuid });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    console.error(e);
    res.status(500).json({ error: 'Failed to create compare' });
  } finally {
    conn.release();
  }
});

/** Read selection (for editing form) */
router.get('/:id/selection', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  try {
    const [[row]] = await pool.query(`SELECT * FROM compare_sheet WHERE compare_id=?`, [id]);
    if (!row) return res.status(404).json({ error: 'not found' });
    const [eds] = await pool.query(`SELECT edition_id FROM compare_sheet_edition WHERE compare_id=? ORDER BY sort_order, edition_id`, [id]);
    res.json({
      title: row.title,
      description: row.description,
      only_differences: !!row.only_differences,
      language: row.language,
      is_snapshot: !!row.is_snapshot,
      edition_ids: eds.map(x => x.edition_id)
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

/** Update */
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });

  const { title, description = null, only_differences = 0, language = 'bg', edition_ids = [], snapshot = 0 } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ error: 'title required' });
  if (!Array.isArray(edition_ids) || edition_ids.length === 0) return res.status(400).json({ error: 'edition_ids required' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [u] = await conn.query(
      `UPDATE compare_sheet
          SET title=?, description=?, only_differences=?, language=?, is_snapshot=?
        WHERE compare_id=?`,
      [title.trim(), description, only_differences ? 1 : 0, language, snapshot ? 1 : 0, id]
    );
    if (u.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'not found' });
    }

    await conn.query(`DELETE FROM compare_sheet_edition WHERE compare_id=?`, [id]);
    const uniq = Array.from(new Set(edition_ids.map(Number).filter(Number.isFinite)));
    const values = uniq.map((eid, i) => [id, eid, i]);
    await conn.query(
      `INSERT INTO compare_sheet_edition (compare_id, edition_id, sort_order)
       VALUES ${values.map(()=>'(?,?,?)').join(',')}`,
      values.flat()
    );

    if (snapshot) {
      const data = await computeCompare(conn, uniq, only_differences ? 1 : 0, language);
      await conn.query(
        `UPDATE compare_sheet SET snapshot_json = CAST(? AS JSON) WHERE compare_id=?`,
        [JSON.stringify(data), id]
      );
    } else {
      await conn.query(`UPDATE compare_sheet SET snapshot_json = NULL WHERE compare_id=?`, [id]);
    }

    await conn.commit();
    res.json({ message: 'updated' });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    console.error(e);
    res.status(500).json({ error: 'update failed' });
  } finally {
    conn.release();
  }
});

/** Delete */
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  try {
    const [r] = await pool.query(`DELETE FROM compare_sheet WHERE compare_id=?`, [id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'not found' });
    res.status(204).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'delete failed' });
  }
});

/** Resolve (admin preview) */
router.get('/:id/resolve', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  try {
    const [[cmp]] = await pool.query(`SELECT * FROM compare_sheet WHERE compare_id=?`, [id]);
    if (!cmp) return res.status(404).json({ error: 'not found' });

    if (cmp.is_snapshot && cmp.snapshot_json != null) {
      const snap = unwrapSnapshotJson(cmp.snapshot_json);
      if (snap) return res.json(snap);
      console.warn(`Compare ${id} snapshot corrupted; computing live`);
    }

    const [eds] = await pool.query(
      `SELECT edition_id FROM compare_sheet_edition
        WHERE compare_id=?
      ORDER BY sort_order, edition_id`,
      [id]
    );
    const ids = eds.map(x => x.edition_id);
    const data = await computeCompare(pool, ids, cmp.only_differences ? 1 : 0, cmp.language || 'bg');
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'resolve failed' });
  }
});

/** Attach / Detach to customer (optional) */
router.post('/:id/attach', async (req, res) => {
  const id = Number(req.params.id);
  const { customer_id, is_visible = 1, pinned = 0, sort_order = 0, note = null } = req.body || {};
  if (!Number.isFinite(id) || !Number.isFinite(Number(customer_id))) {
    return res.status(400).json({ error: 'compare_id and customer_id required' });
  }
  try {
    await pool.query(
      `INSERT INTO customer_compare (customer_id, compare_id, is_visible, pinned, sort_order, note)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
        is_visible=VALUES(is_visible), pinned=VALUES(pinned), sort_order=VALUES(sort_order), note=VALUES(note)`,
      [customer_id, id, is_visible ? 1 : 0, pinned ? 1 : 0, sort_order, note]
    );
    res.json({ message: 'attached' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'attach failed' });
  }
});

router.delete('/:id/attach/:customerId', async (req, res) => {
  const id = Number(req.params.id);
  const customerId = Number(req.params.customerId);
  if (!Number.isFinite(id) || !Number.isFinite(customerId)) return res.status(400).json({ error: 'bad id' });
  try {
    await pool.query(`DELETE FROM customer_compare WHERE compare_id=? AND customer_id=?`, [id, customerId]);
    res.status(204).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'detach failed' });
  }
});

module.exports = router;
