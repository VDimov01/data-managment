// routes/cascade.js
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');

// GET /makes
router.get('/makes', async (_req, res) => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await conn.execute('SELECT make_id, name FROM make ORDER BY name');
    res.json(rows);
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'DB error' });
  } finally { await conn.end(); }
});

// GET /models?make_id=123
router.get('/models', async (req, res) => {
  const { make_id } = req.query;
  if (!make_id) return res.status(400).json({ error: 'make_id required' });
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await conn.execute(
      'SELECT model_id, name FROM model WHERE make_id=? ORDER BY name', [make_id]
    );
    res.json(rows);
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'DB error' });
  } finally { await conn.end(); }
});

// GET /model-years?model_id=456
router.get('/model-years', async (req, res) => {
  const { model_id } = req.query;
  if (!model_id) return res.status(400).json({ error: 'model_id required' });
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await conn.execute(
      'SELECT model_year_id, year FROM model_year WHERE model_id=? ORDER BY year DESC', [model_id]
    );
    res.json(rows);
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'DB error' });
  } finally { await conn.end(); }
});

// GET /editions?model_year_id=789
router.get('/editions', async (req, res) => {
  const { model_year_id } = req.query;
  if (!model_year_id) return res.status(400).json({ error: 'model_year_id required' });
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await conn.execute(
      'SELECT edition_id, name, my.year FROM edition e JOIN model_year my ON my.model_year_id = e.model_year_id WHERE e.model_year_id=? ORDER BY name', [model_year_id]
    );
    res.json(rows);
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'DB error' });
  } finally { await conn.end(); }
});

module.exports = router;
