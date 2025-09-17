// routes/brochures.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getPool, withTransaction } = require('../db');
const pool = getPool();

/** Helpers */
async function resolveEditionIds(conn, brochureId) {
  // fetch brochure
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

  // 1) edition metadata
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

  // 2) attributes + values for all included editions
  const [vals] = await conn.query(
    `SELECT ea.edition_id, a.attribute_id, a.code, a.name, a.name_bg, a.unit, a.data_type, a.category,
            ea.value_numeric, ea.value_text, ea.value_boolean
       FROM edition_attribute ea
       JOIN attribute a ON a.attribute_id = ea.attribute_id
      WHERE ea.edition_id IN (${placeholders})
      ORDER BY a.category, a.name`,
    editionIds
  );

  // 3) build row map: attribute -> values per edition
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
        values: {} // edition_id -> normalized value
      });
    }
    const row = attrMap.get(key);
    let val = null;
    if (v.data_type === 'boolean') val = v.value_boolean == null ? null : !!v.value_boolean;
    else if (v.data_type === 'text') val = v.value_text;
    else val = v.value_numeric;
    row.values[v.edition_id] = val;
  }

  let rows = Array.from(attrMap.values()).sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || ''));

  if (onlyDifferences) {
    rows = rows.filter(r => {
      const all = eds.map(e => r.values[e.edition_id] ?? null);
      return new Set(all.map(x => JSON.stringify(x))).size > 1;
    });
  }

  return { editions: eds, rows };
}

// pseudo/express handler core needed for the lock route
async function resolveBrochurePayload(conn, brochureIdOrUuid, { byUuid = false } = {}) {
  // 1) Load brochure
  const [brows] = await conn.query(
    byUuid
      ? 'SELECT * FROM brochure WHERE public_uuid = ?'
      : 'SELECT * FROM brochure WHERE brochure_id = ?',
    [brochureIdOrUuid]
  );
  if (!brows.length) throw new Error('Brochure not found');
  const b = brows[0];

  // 2) If snapshot, return the frozen JSON
  if (b.is_snapshot && b.snapshot_json) {
    return JSON.parse(b.snapshot_json);
  }

  // 3) Resolve EDITIONS to compare
  let editions = [];
  if (b.selection_mode === 'ALL_YEARS') {
    const [rows] = await conn.query(`
      SELECT e.edition_id, e.name AS edition_name,
             my.year, mo.name AS model_name, m.name AS make_name
      FROM edition e
      JOIN model_year my ON e.model_year_id = my.model_year_id
      JOIN model mo      ON my.model_id = mo.model_id
      JOIN make  m       ON mo.make_id = m.make_id
      WHERE mo.model_id = ?
      ORDER BY m.name, mo.name, my.year, e.name
    `, [b.model_id]);
    editions = rows;

  } else if (b.selection_mode === 'YEARS') {
    const [rows] = await conn.query(`
      SELECT e.edition_id, e.name AS edition_name,
             my.year, mo.name AS model_name, m.name AS make_name
      FROM brochure_year by2
      JOIN model_year my ON by2.model_year_id = my.model_year_id
      JOIN edition e     ON e.model_year_id   = my.model_year_id
      JOIN model mo      ON my.model_id       = mo.model_id
      JOIN make  m       ON mo.make_id        = m.make_id
      WHERE by2.brochure_id = ?
      ORDER BY m.name, mo.name, my.year, e.name
    `, [b.brochure_id]);
    editions = rows;

  } else { // EDITIONS
    const [rows] = await conn.query(`
      SELECT e.edition_id, e.name AS edition_name,
             my.year, mo.name AS model_name, m.name AS make_name
      FROM brochure_edition be
      JOIN edition e     ON be.edition_id = e.edition_id
      JOIN model_year my ON e.model_year_id = my.model_year_id
      JOIN model mo      ON my.model_id = mo.model_id
      JOIN make  m       ON mo.make_id = m.make_id
      WHERE be.brochure_id = ?
      ORDER BY m.name, mo.name, my.year, e.name
    `, [b.brochure_id]);
    editions = rows;
  }

  // 4) Build compare rows (attributes → values per edition)
  if (editions.length === 0) return { editions: [], rows: [] };

  const ids = editions.map(ed => ed.edition_id);
  const placeholders = ids.map(() => '?').join(',');
  const [attrRows] = await conn.query(
    `
    SELECT a.attribute_id, a.code, a.name, a.name_bg, a.unit, a.category, a.data_type,
           ea.edition_id,
           ea.value_numeric, ea.value_text, ea.value_boolean
    FROM attribute a
    JOIN edition_attribute ea ON ea.attribute_id = a.attribute_id
    WHERE ea.edition_id IN (${placeholders})
    ORDER BY a.category, a.name
    `,
    ids
  );

  // pivot attributes
  const byAttr = new Map();
  for (const r of attrRows) {
    if (!byAttr.has(r.attribute_id)) {
      byAttr.set(r.attribute_id, {
        attribute_id: r.attribute_id,
        code: r.code,
        name: r.name,
        name_bg: r.name_bg,
        unit: r.unit,
        data_type: r.data_type,
        category: r.category,
        values: {}
      });
    }
    const v = (r.data_type === 'boolean')
      ? (r.value_boolean === null ? null : !!r.value_boolean)
      : (r.data_type === 'text')
        ? r.value_text
        : r.value_numeric;
    byAttr.get(r.attribute_id).values[r.edition_id] = v;
  }

  const rows = Array.from(byAttr.values());

  // optionally hide all-null attributes here (frontend already does it)
  // rows = rows.filter(row => ids.some(id => row.values[id] != null));

  return { editions, rows };
}

// POST /api/brochures
// Body: { title, description?, make_id, model_id,
//         selection_mode: 'ALL_YEARS'|'YEARS'|'EDITIONS',
//         year_ids?: number[], edition_ids?: number[],
//         only_differences?: 0|1, language?: 'bg'|'en',
//         snapshot?: 0|1 }
router.post('/', async (req, res) => {
  const {
    title, description,
    make_id, model_id,
    selection_mode = 'ALL_YEARS',
    year_ids = [], edition_ids = [],
    only_differences = 0,
    language = 'bg',
    snapshot = 0
  } = req.body || {};

  if (!title || !make_id || !model_id) return res.status(400).json({ error: 'title, make_id, model_id required' });

  try {
    const data = await withTransaction(async (conn) => {
      const [ins] = await conn.query(
        `INSERT INTO brochure (public_uuid, title, description, make_id, model_id,
                               selection_mode, only_differences, language, is_snapshot)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [uuidv4(), String(title).trim(), description ?? null, make_id, model_id,
         selection_mode, only_differences ? 1 : 0, language, snapshot ? 1 : 0]
      );
      const brochureId = ins.insertId;

      if (selection_mode === 'YEARS' && year_ids.length) {
        const values = year_ids.map(y => [brochureId, y]);
        await conn.query(`INSERT INTO brochure_year (brochure_id, model_year_id) VALUES ?`, [values]);
      }
      if (selection_mode === 'EDITIONS' && edition_ids.length) {
        const values = edition_ids.map(e => [brochureId, e]);
        await conn.query(`INSERT INTO brochure_edition (brochure_id, edition_id) VALUES ?`, [values]);
      }

      // Snapshot now?
      if (snapshot) {
        const edIds = await resolveEditionIds(conn, brochureId);
        const compare = await computeCompare(conn, edIds, only_differences ? 1 : 0);
        await conn.query(`UPDATE brochure SET snapshot_json=? WHERE brochure_id=?`, [JSON.stringify(compare), brochureId]);
      }

      const [[row]] = await conn.query(`SELECT * FROM brochure WHERE brochure_id=?`, [brochureId]);
      return row;
    });

    res.status(201).json(data);
  } catch (e) {
    console.error('POST /api/brochures', e);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/brochures?q=&page=&limit=
router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  try {
    let where = 'WHERE 1=1';
    const params = [];
    if (q) {
      where += ` AND (title LIKE ? OR description LIKE ?)`;
      params.push(`%${q}%`, `%${q}%`);
    }

    const [[{ cnt }]] = await pool.query(`SELECT COUNT(*) AS cnt FROM brochure ${where}`, params);
    const [rows] = await pool.query(
      `SELECT b.*, mo.name AS model_name, m.name AS make_name
         FROM brochure b
         JOIN model mo ON mo.model_id = b.model_id
         JOIN make m  ON m.make_id  = b.make_id
        ${where}
        ORDER BY b.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({ page, limit, total: cnt, totalPages: Math.max(1, Math.ceil(cnt/limit)), brochures: rows });
  } catch (e) {
    console.error('GET /api/brochures', e);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/brochures/:id
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    const [[row]] = await pool.query(
      `SELECT b.*, mo.name AS model_name, m.name AS make_name
         FROM brochure b
         JOIN model mo ON mo.model_id = b.model_id
         JOIN make m  ON m.make_id  = b.make_id
        WHERE b.brochure_id=?`, [id]
    );
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json(row);
  } catch (e) {
    console.error('GET /api/brochures/:id', e);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/brochures/:id (can also re-snapshot if body.snapshot=1)
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });

  const {
    title, description,
    selection_mode,
    year_ids = [], edition_ids = [],
    only_differences, language,
    snapshot
  } = req.body || {};

  try {
    await withTransaction(async (conn) => {
      const [[exists]] = await conn.query(`SELECT * FROM brochure WHERE brochure_id=?`, [id]);
      if (!exists) throw new Error('not found');

      await conn.query(
        `UPDATE brochure SET
           title=COALESCE(?,title),
           description=COALESCE(?,description),
           selection_mode=COALESCE(?,selection_mode),
           only_differences=COALESCE(?,only_differences),
           language=COALESCE(?,language),
           is_snapshot=COALESCE(?, is_snapshot)
         WHERE brochure_id=?`,
        [
          title ?? null,
          description ?? null,
          selection_mode ?? null,
          (only_differences == null ? null : (only_differences ? 1 : 0)),
          language ?? null,
          (snapshot == null ? null : (snapshot ? 1 : 0)),
          id
        ]
      );

      // replace selection tables if caller provided arrays
      if (selection_mode === 'YEARS') {
        await conn.query(`DELETE FROM brochure_year WHERE brochure_id=?`, [id]);
        if (year_ids.length) {
          const values = year_ids.map(y => [id, y]);
          await conn.query(`INSERT INTO brochure_year (brochure_id, model_year_id) VALUES ?`, [values]);
        }
        await conn.query(`DELETE FROM brochure_edition WHERE brochure_id=?`, [id]); // ensure clean
      } else if (selection_mode === 'EDITIONS') {
        await conn.query(`DELETE FROM brochure_edition WHERE brochure_id=?`, [id]);
        if (edition_ids.length) {
          const values = edition_ids.map(e => [id, e]);
          await conn.query(`INSERT INTO brochure_edition (brochure_id, edition_id) VALUES ?`, [values]);
        }
        await conn.query(`DELETE FROM brochure_year WHERE brochure_id=?`, [id]);
      } else {
        // ALL_YEARS: clear both
        await conn.query(`DELETE FROM brochure_year WHERE brochure_id=?`, [id]);
        await conn.query(`DELETE FROM brochure_edition WHERE brochure_id=?`, [id]);
      }

      // re-snapshot if requested
      if (snapshot) {
        const [[b]] = await conn.query(`SELECT only_differences FROM brochure WHERE brochure_id=?`, [id]);
        const edIds = await resolveEditionIds(conn, id);
        const compare = await computeCompare(conn, edIds, b.only_differences ? 1 : 0);
        await conn.query(`UPDATE brochure SET snapshot_json=?, is_snapshot=1 WHERE brochure_id=?`, [JSON.stringify(compare), id]);
      } else if (snapshot === 0) {
        // switch to live
        await conn.query(`UPDATE brochure SET snapshot_json=NULL, is_snapshot=0 WHERE brochure_id=?`, [id]);
      }
    });

    res.json({ message: 'Updated' });
  } catch (e) {
    if (e.message === 'not found') return res.status(404).json({ error: 'not found' });
    console.error('PUT /api/brochures/:id', e);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/brochures/:id
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    const [r] = await pool.query(`DELETE FROM brochure WHERE brochure_id=?`, [id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'not found' });
    res.status(204).end();
  } catch (e) {
    console.error('DELETE /api/brochures/:id', e);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/brochures/:id/resolve  -> { editions, rows } (snapshot or live)
router.get('/:id/resolve', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT is_snapshot, snapshot_json, only_differences
         FROM brochure
        WHERE brochure_id = ?`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    const b = rows[0];

    if (b.is_snapshot) {
      let snap = b.snapshot_json;

      // mysql2 often returns JSON columns as JS values already.
      if (Buffer.isBuffer(snap)) {
        // unexpected, but handle
        try { snap = JSON.parse(snap.toString('utf8')); } catch {}
      } else if (typeof snap === 'string') {
        // It might be a serialized JSON string; try parsing once.
        try { snap = JSON.parse(snap); }
        catch {
          // If it’s a plain string like [object Object], the snapshot is corrupted
          return res.status(500).json({ error: 'Snapshot JSON is corrupted (stored as plain string)' });
        }
      }
      // If it's already an object/array/whatever: just return it.
      return res.json(snap);
    }

    // Live (non-snapshot) path
    const data = await resolveBrochurePayload(conn, id);
    res.json(data);
  } catch (e) {
    console.error('GET /api/brochures/:id/resolve', e);
    res.status(500).json({ error: 'Resolve failed' });
  } finally {
    conn.release();
  }
});


/**
 * ATTACH a brochure to a customer
 * POST /api/brochures/:brochureId/attachments
 * Body: { customer_id, is_visible?, pinned?, sort_order?, note? }
 */
router.post('/:brochureId/attachments', async (req, res) => {
  const brochureId = Number(req.params.brochureId);
  const { customer_id, is_visible = 1, pinned = 0, sort_order = 0, note = null } = req.body || {};
  if (!Number.isFinite(brochureId) || !Number.isFinite(Number(customer_id))) {
    return res.status(400).json({ error: 'brochureId and customer_id required' });
  }
  try {
    await pool.query(
      `INSERT INTO customer_brochure (customer_id, brochure_id, is_visible, pinned, sort_order, note)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
        is_visible=VALUES(is_visible), pinned=VALUES(pinned), sort_order=VALUES(sort_order), note=VALUES(note)`,
      [customer_id, brochureId, is_visible ? 1 : 0, pinned ? 1 : 0, sort_order, note]
    );
    res.status(201).json({ message: 'Attached' });
  } catch (e) {
    console.error('attach brochure', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * UPDATE attachment meta (visibility, pinned, order, note)
 * PATCH /api/brochures/:brochureId/attachments/:customerId
 */
router.patch('/:brochureId/attachments/:customerId', async (req, res) => {
  const brochureId = Number(req.params.brochureId);
  const customerId = Number(req.params.customerId);
  const { is_visible, pinned, sort_order, note } = req.body || {};
  if (!Number.isFinite(brochureId) || !Number.isFinite(customerId)) {
    return res.status(400).json({ error: 'invalid ids' });
  }
  try {
    const [r] = await pool.query(
      `UPDATE customer_brochure
         SET is_visible = COALESCE(?, is_visible),
             pinned     = COALESCE(?, pinned),
             sort_order = COALESCE(?, sort_order),
             note       = COALESCE(?, note)
       WHERE brochure_id=? AND customer_id=?`,
      [
        is_visible == null ? null : (is_visible ? 1 : 0),
        pinned == null ? null : (pinned ? 1 : 0),
        sort_order == null ? null : sort_order,
        note ?? null,
        brochureId, customerId
      ]
    );
    if (r.affectedRows === 0) return res.status(404).json({ error: 'attachment not found' });
    res.json({ message: 'Updated' });
  } catch (e) {
    console.error('patch attachment', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * DETACH a brochure from a customer
 * DELETE /api/brochures/:brochureId/attachments/:customerId
 */
router.delete('/:brochureId/attachments/:customerId', async (req, res) => {
  const brochureId = Number(req.params.brochureId);
  const customerId = Number(req.params.customerId);
  if (!Number.isFinite(brochureId) || !Number.isFinite(customerId)) {
    return res.status(400).json({ error: 'invalid ids' });
  }
  try {
    const [r] = await pool.query(
      `DELETE FROM customer_brochure WHERE brochure_id=? AND customer_id=?`,
      [brochureId, customerId]
    );
    if (r.affectedRows === 0) return res.status(404).json({ error: 'attachment not found' });
    res.status(204).end();
  } catch (e) {
    console.error('detach brochure', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * LIST customers attached to a brochure (admin)
 * GET /api/brochures/:brochureId/attachments
 */
router.get('/:brochureId/attachments', async (req, res) => {
  const brochureId = Number(req.params.brochureId);
  if (!Number.isFinite(brochureId)) return res.status(400).json({ error: 'invalid id' });
  try {
    const [rows] = await pool.query(
      `SELECT cb.*, c.public_uuid, c.customer_type, c.company_name, c.first_name, c.middle_name, c.last_name, c.email
         FROM customer_brochure cb
         JOIN customer c ON c.customer_id = cb.customer_id
        WHERE cb.brochure_id=?
        ORDER BY cb.pinned DESC, cb.sort_order ASC, cb.attached_at DESC`,
      [brochureId]
    );
    res.json(rows);
  } catch (e) {
    console.error('list attachments by brochure', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/*
 * GET /api/brochures/:id/selection
 * Response:
 * {
 *   brochure_id,
 *   make_id,
 *   model_id,
 *   selection_mode,        // 'ALL_YEARS' | 'YEARS' | 'EDITIONS'
 *   year_ids: number[],    // if selection_mode === 'YEARS'
 *   edition_ids: number[], // if selection_mode === 'EDITIONS'
 *   only_differences: boolean,
 *   language: 'bg' | 'en',
 *   is_snapshot: boolean
 * }
 */
router.get('/:id/selection', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid brochure id' });
  }

  const conn = await pool.getConnection();
  try {
    // 1) Load brochure core
    const [brows] = await conn.query(
      `SELECT brochure_id, make_id, model_id, selection_mode,
              only_differences, language, is_snapshot
       FROM brochure
       WHERE brochure_id = ?`,
      [id]
    );
    if (!brows.length) {
      return res.status(404).json({ error: 'Brochure not found' });
    }
    const b = brows[0];

    // 2) Load selection detail based on mode
    let year_ids = [];
    let edition_ids = [];

    if (b.selection_mode === 'YEARS') {
      const [yrs] = await conn.query(
        `SELECT model_year_id
         FROM brochure_year
         WHERE brochure_id = ?
         ORDER BY model_year_id`,
        [id]
      );
      year_ids = yrs.map(r => r.model_year_id);
    } else if (b.selection_mode === 'EDITIONS') {
      const [eds] = await conn.query(
        `SELECT edition_id
         FROM brochure_edition
         WHERE brochure_id = ?
         ORDER BY edition_id`,
        [id]
      );
      edition_ids = eds.map(r => r.edition_id);
    }

    // 3) Return a clean, form-friendly payload
    res.json({
      brochure_id: b.brochure_id,
      make_id: b.make_id,
      model_id: b.model_id,
      selection_mode: b.selection_mode,
      year_ids,
      edition_ids,
      only_differences: !!b.only_differences,
      language: b.language,
      is_snapshot: !!b.is_snapshot
    });
  } catch (e) {
    console.error('GET /api/brochures/:id/selection error:', e);
    res.status(500).json({ error: 'Database error' });
  } finally {
    conn.release();
  }
});


/**
 * LIST brochures attached to a specific customer (admin)
 * GET /api/brochures/attached?customer_id=123
 */
router.get('/attached/by-customer', async (req, res) => {
  const customerId = Number(req.query.customer_id);
  if (!Number.isFinite(customerId)) return res.status(400).json({ error: 'customer_id required' });
  try {
    const [rows] = await pool.query(
      `SELECT b.*, cb.is_visible, cb.pinned, cb.sort_order, cb.note, cb.attached_at
         FROM customer_brochure cb
         JOIN brochure b ON b.brochure_id = cb.brochure_id
        WHERE cb.customer_id=?
        ORDER BY cb.pinned DESC, cb.sort_order ASC, cb.attached_at DESC`,
      [customerId]
    );
    res.json(rows);
  } catch (e) {
    console.error('list brochures by customer', e);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/brochures/:id/lock
// Makes brochure static by writing snapshot_json and is_snapshot=1
/** LOCK: snapshot current resolved data into snapshot_json */
router.post('/:id/lock', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const data = await resolveBrochurePayload(conn, id); // {editions, rows}
    const json = JSON.stringify(data);

    await conn.query(
      `UPDATE brochure
         SET is_snapshot = 1,
             snapshot_json = CAST(? AS JSON),
             updated_at = NOW()
       WHERE brochure_id = ?`,
      [json, id]
    );

    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    console.error('POST /api/brochures/:id/lock', e);
    res.status(500).json({ error: 'Failed to lock brochure' });
  } finally {
    conn.release();
  }
});

/** UNLOCK: make live again */
router.post('/:id/unlock', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

  const conn = await pool.getConnection();
  try {
    await conn.query(
      `UPDATE brochure
         SET is_snapshot = 0,
             snapshot_json = NULL,
             updated_at = NOW()
       WHERE brochure_id = ?`,
      [id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/brochures/:id/unlock', e);
    res.status(500).json({ error: 'Failed to unlock brochure' });
  } finally {
    conn.release();
  }
});


module.exports = router;
