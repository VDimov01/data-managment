// routes/compares.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getPool } = require('../db');
const pool = getPool();

/** shared compute: editions + attribute rows (like brochures) */
async function computeCompare(conn, editionIds, onlyDifferences = 0) {
  if (!editionIds?.length) return { editions: [], rows: [] };
  const ph = editionIds.map(() => '?').join(',');

  const [eds] = await conn.query(
    `SELECT e.edition_id, e.name AS edition_name, my.year, mo.name AS model_name, m.name AS make_name
       FROM edition e
       JOIN model_year my ON e.model_year_id = my.model_year_id
       JOIN model mo ON my.model_id = mo.model_id
       JOIN make m ON mo.make_id = m.make_id
      WHERE e.edition_id IN (${ph})
      ORDER BY m.name, mo.name, my.year, e.name`, editionIds
  );

  const [vals] = await conn.query(
    `SELECT ea.edition_id, a.attribute_id, a.code, a.name, a.name_bg, a.unit, a.data_type, a.category,
            ea.value_numeric, ea.value_text, ea.value_boolean
       FROM edition_attribute ea
       JOIN attribute a ON a.attribute_id = ea.attribute_id
      WHERE ea.edition_id IN (${ph})
      ORDER BY a.category, a.name`, editionIds
  );

  const map = new Map();
  for (const v of vals) {
    const key = v.attribute_id;
    if (!map.has(key)) {
      map.set(key, {
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
    const row = map.get(key);
    let val = null;
    if (v.data_type === 'boolean') val = v.value_boolean == null ? null : !!v.value_boolean;
    else if (v.data_type === 'text') val = v.value_text;
    else val = v.value_numeric;
    row.values[v.edition_id] = val;
  }

  // drop attributes that are null across all selected editions
  let rows = Array.from(map.values()).filter(r => {
    const all = eds.map(e => r.values[e.edition_id] ?? null);
    return all.some(x => x !== null && x !== undefined);
  });

  // only differences if requested
  if (onlyDifferences) {
    rows = rows.filter(r => {
      const all = eds.map(e => r.values[e.edition_id] ?? null);
      return new Set(all.map(x => JSON.stringify(x))).size > 1;
    });
  }

  // ordering: category then name
  rows.sort((a,b) =>
    (a.category || '').localeCompare(b.category || '') ||
    (a.name || '').localeCompare(b.name || '')
  );

  return { editions: eds, rows };
}

function unwrapSnapshotJson(snap) {
  if (snap == null) return null;
  if (typeof snap === 'object' && !Buffer.isBuffer(snap)) return snap;
  if (Buffer.isBuffer(snap)) { try { return JSON.parse(snap.toString('utf8')); } catch { return null; } }
  if (typeof snap === 'string') {
    const t = snap.trim();
    if (t.startsWith('{') || t.startsWith('[')) { try { return JSON.parse(t); } catch { return null; } }
    return null;
  }
  return null;
}

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
      `SELECT compare_id, public_uuid, title, description, only_differences, language,
              is_snapshot, created_at, updated_at
         FROM compare_sheet ${where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?`,
      q ? [...params, limit, offset] : [limit, offset]
    );
    res.json({ total: cnt, compares: rows });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'Database error' });
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

    // insert editions
    const uniq = Array.from(new Set(edition_ids.map(Number).filter(Number.isFinite)));
    if (!uniq.length) throw new Error('No valid edition_ids');
    const values = uniq.map((id, i) => [compareId, id, i]);
    await conn.query(
      `INSERT INTO compare_sheet_edition (compare_id, edition_id, sort_order) VALUES ${values.map(()=>'(?,?,?)').join(',')}`,
      values.flat()
    );

    // optional snapshot
    if (snapshot) {
      const data = await computeCompare(conn, uniq, only_differences ? 1 : 0);
      await conn.query(
        `UPDATE compare_sheet SET snapshot_json = CAST(? AS JSON) WHERE compare_id=?`,
        [JSON.stringify(data), compareId]
      );
    }

    await conn.commit();
    res.status(201).json({ compare_id: compareId, public_uuid: uuid });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    console.error(e); res.status(500).json({ error: 'Failed to create compare' });
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
    console.error(e); res.status(500).json({ error: 'Database error' });
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
    if (u.affectedRows === 0) { await conn.rollback(); return res.status(404).json({ error: 'not found' }); }

    await conn.query(`DELETE FROM compare_sheet_edition WHERE compare_id=?`, [id]);
    const uniq = Array.from(new Set(edition_ids.map(Number).filter(Number.isFinite)));
    const values = uniq.map((eid, i) => [id, eid, i]);
    await conn.query(
      `INSERT INTO compare_sheet_edition (compare_id, edition_id, sort_order) VALUES ${values.map(()=>'(?,?,?)').join(',')}`,
      values.flat()
    );

    if (snapshot) {
      const data = await computeCompare(conn, uniq, only_differences ? 1 : 0);
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
    console.error(e); res.status(500).json({ error: 'update failed' });
  } finally { conn.release(); }
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
    console.error(e); res.status(500).json({ error: 'delete failed' });
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
      // corrupted snapshot -> fall back to live
      console.warn(`Compare ${id} snapshot corrupted; computing live`);
    }

    const [eds] = await pool.query(
      `SELECT edition_id FROM compare_sheet_edition WHERE compare_id=? ORDER BY sort_order, edition_id`, [id]
    );
    const ids = eds.map(x => x.edition_id);
    const data = await computeCompare(pool, ids, cmp.only_differences ? 1 : 0);
    res.json(data);
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'resolve failed' });
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
       ON DUPLICATE KEY UPDATE is_visible=VALUES(is_visible), pinned=VALUES(pinned),
                               sort_order=VALUES(sort_order), note=VALUES(note)`,
      [customer_id, id, is_visible ? 1 : 0, pinned ? 1 : 0, sort_order, note]
    );
    res.json({ message: 'attached' });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'attach failed' });
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
    console.error(e); res.status(500).json({ error: 'detach failed' });
  }
});

module.exports = router;
