// routes/colors.js
const express = require('express');
const router = express.Router();
const { getPool } = require('../db');
const pool = getPool();

/**
 * GET /api/colors
 * Query: type=exterior|interior, q=<search>, limit, offset
 */
router.get('/', async (req, res) => {
  try {
    const { type, q, limit = 1000, offset = 0 } = req.query;
    const where = [];
    const params = [];

    if (type) { where.push('type = ?'); params.push(type); }
    if (q) { where.push('LOWER(name) LIKE ?'); params.push(`%${String(q).toLowerCase()}%`); }

    const sql = `
      SELECT color_id, name, name_bg, type, oem_code
      FROM color
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY type, name
      LIMIT ? OFFSET ?
    `;
    params.push(Number(limit), Number(offset));

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/colors', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Convenience filters
router.get('/exterior', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT color_id, name, name_bg, type, oem_code FROM color WHERE type="exterior" ORDER BY name'
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/colors/exterior', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.get('/interior', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT color_id, name, name_bg, type, oem_code FROM color WHERE type="interior" ORDER BY name'
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/colors/interior', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET one
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT color_id, name, name_bg, type, oem_code FROM color WHERE color_id = ?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/colors/:id', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// CREATE
// POST create color
router.post('/', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const type = String(req.body?.type || '').trim().toLowerCase(); // 'exterior' | 'interior'
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (type !== 'exterior' && type !== 'interior') {
      return res.status(400).json({ error: "type must be 'exterior' or 'interior'" });
    }

    // prevent duplicates (unique by type+name)
    try {
      const [r] = await pool.query(
        `INSERT INTO color (name_bg, type) VALUES (?, ?)`,
        [name, type]
      );
      res.status(201).json({ color_id: r.insertId, name, type });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Color already exists for this type' });
      }
      throw err;
    }
  } catch (e) {
    console.error('POST /api/colors', e);
    res.status(500).json({ error: 'Database error' });
  }
});


// UPDATE
router.put('/:id', async (req, res) => {
  try {
    const { name, type, oem_code } = req.body || {};
    if (!name && !type && typeof oem_code === 'undefined') {
      return res.status(400).json({ error: 'No fields to update' });
    }
    if (type && !['exterior', 'interior'].includes(type)) {
      return res.status(400).json({ error: 'type must be exterior or interior' });
    }

    // if name or type change, guard duplicates (type,name)
    if (name || type) {
      const [curr] = await pool.query('SELECT name, name_bg, type FROM color WHERE color_id=?', [req.params.id]);
      if (!curr.length) return res.status(404).json({ error: 'Not found' });

      const nextName = name ?? curr[0].name;
      const nextType = type ?? curr[0].type;

      const [dupes] = await pool.query(
        'SELECT 1 FROM color WHERE type=? AND name=? AND color_id<>? LIMIT 1',
        [nextType, nextName, req.params.id]
      );
      if (dupes.length) return res.status(409).json({ error: 'Color already exists for this type' });
    }

    const fields = [];
    const params = [];
    if (typeof name !== 'undefined') { fields.push('name=?'); params.push(name); }
    if (typeof name_bg !== 'undefined') { fields.push('name_bg=?'); params.push(name_bg); }
    if (typeof type !== 'undefined') { fields.push('type=?'); params.push(type); }
    if (typeof oem_code !== 'undefined') { fields.push('oem_code=?'); params.push(oem_code); }
    params.push(req.params.id);

    await pool.query(`UPDATE color SET ${fields.join(', ')} WHERE color_id=?`, params);

    const [rows] = await pool.query(
      'SELECT color_id, name, name_bg, type, oem_code FROM color WHERE color_id = ?',
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/colors/:id', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE (fails with 409 if referenced by any vehicle)
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[ref]] = await pool.query(
      `SELECT
         SUM(CASE WHEN exterior_color_id = ? THEN 1 ELSE 0 END) AS ext_refs,
         SUM(CASE WHEN interior_color_id = ? THEN 1 ELSE 0 END) AS int_refs
       FROM vehicle`,
      [id, id]
    );
    if ((ref?.ext_refs || 0) > 0 || (ref?.int_refs || 0) > 0) {
      return res.status(409).json({ error: 'Color is in use by vehicles and cannot be deleted' });
    }

    const [r] = await pool.query('DELETE FROM color WHERE color_id=?', [id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    // FK errors, etc.
    if (err && err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'Color is referenced and cannot be deleted' });
    }
    console.error('DELETE /api/colors/:id', err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
