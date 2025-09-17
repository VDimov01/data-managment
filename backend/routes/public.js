// routes/public.js
const express = require('express');
const router = express.Router();
const { getPool } = require('../db');
const pool = getPool();

/** ---------- helpers you already had ---------- */
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
        WHERE byy.brochure_id=?`, [brochureId]
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

async function computeCompare(conn, editionIds, onlyDifferences = 0) {
  if (!editionIds.length) return { editions: [], rows: [] };

  const placeholders = editionIds.map(() => '?').join(',');
  const [eds] = await conn.query(
    `SELECT e.edition_id, e.name AS edition_name, my.year, mo.name AS model_name, m.name AS make_name
       FROM edition e
       JOIN model_year my ON e.model_year_id = my.model_year_id
       JOIN model mo ON my.model_id = mo.model_id
       JOIN make m ON mo.make_id = m.make_id
      WHERE e.edition_id IN (${placeholders})
      ORDER BY m.name, mo.name, my.year, e.name`,
    editionIds
  );

  const [vals] = await conn.query(
    `SELECT ea.edition_id, a.attribute_id, a.code, a.name, a.name_bg, a.unit, a.data_type, a.category,
            ea.value_numeric, ea.value_text, ea.value_boolean
       FROM edition_attribute ea
       JOIN attribute a ON a.attribute_id = ea.attribute_id
      WHERE ea.edition_id IN (${placeholders})
      ORDER BY a.category, a.name`,
    editionIds
  );

  const attrMap = new Map();
  for (const v of vals) {
    const key = v.attribute_id;
    if (!attrMap.has(key)) {
      attrMap.set(key, {
        attribute_id: v.attribute_id,
        code: v.code,
        name: v.name,
        name_bg: v.name_bg,
        unit: v.unit,
        data_type: v.data_type,
        category: v.category,
        values: {}
      });
    }
    const row = attrMap.get(key);
    let val = null;
    if (v.data_type === 'boolean') val = v.value_boolean == null ? null : !!v.value_boolean;
    else if (v.data_type === 'text') val = v.value_text;
    else val = v.value_numeric;
    row.values[v.edition_id] = val;
  }

  let rows = Array.from(attrMap.values()).sort(
    (a, b) => (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || '')
  );

  if (onlyDifferences) {
    rows = rows.filter(r => {
      const all = eds.map(e => r.values[e.edition_id] ?? null);
      return new Set(all.map(x => JSON.stringify(x))).size > 1;
    });
  }

  return { editions: eds, rows };
}

/** ---------- NEW: safe JSON unwrap for snapshot_json ---------- */
function unwrapSnapshotJson(snap) {
  if (snap == null) return null;

  // mysql2 might already parse JSON to a JS object
  if (typeof snap === 'object' && !Buffer.isBuffer(snap)) {
    return snap;
  }

  // Buffer -> try parse as UTF-8 JSON
  if (Buffer.isBuffer(snap)) {
    const s = snap.toString('utf8');
    try { return JSON.parse(s); } catch { return null; }
  }

  // String -> parse if it looks like JSON; else treat as corrupted
  if (typeof snap === 'string') {
    const t = snap.trim();
    if (t.startsWith('{') || t.startsWith('[')) {
      try { return JSON.parse(t); } catch { return null; }
    }
    // e.g. "[object Object]" or other junk
    return null;
  }

  // Anything else: unknown
  return null;
}

/**
 * GET /api/public/customers/:uuid/brochures
 * Returns an array of { brochure_id, title, data: { editions, rows } }
 */
router.get('/customers/:uuid/brochures', async (req, res) => {
  const uuid = String(req.params.uuid || '').trim();
  try {
    const [[cust]] = await pool.query(
      `SELECT customer_id FROM customer WHERE public_uuid=?`,
      [uuid]
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
        if (snap) {
          out.push({ brochure_id: b.brochure_id, title: b.title, data: snap });
          continue;
        }
        // Corrupted snapshot -> gracefully fall back to live compute
        console.warn(`Brochure ${b.brochure_id} snapshot is corrupted; falling back to live.`);
      }

      const edIds = await resolveEditionIds(pool, b.brochure_id);
      const compare = await computeCompare(pool, edIds, b.only_differences ? 1 : 0);
      out.push({ brochure_id: b.brochure_id, title: b.title, data: compare });
    }

    res.json(out);
  } catch (e) {
    console.error('public brochures by uuid', e);
    res.status(500).json({ error: 'Database error' });
  }
});

router.get('/customers/:uuid/compares', async (req, res) => {
  const uuid = String(req.params.uuid || '').trim();
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
        `SELECT edition_id FROM compare_sheet_edition WHERE compare_id=? ORDER BY sort_order, edition_id`,
        [cs.compare_id]
      );
      const ids = eds.map(x => x.edition_id);
      const data = await computeCompare(pool, ids, cs.only_differences ? 1 : 0);
      out.push({ compare_id: cs.compare_id, title: cs.title, data });
    }

    res.json(out);
  } catch (e) {
    console.error('public compares by uuid', e);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
