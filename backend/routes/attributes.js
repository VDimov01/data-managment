const express = require('express');
const router = express.Router();
const mysql = require("mysql2/promise");


// Return all attributes (id, code, names, unit, data_type, category)
router.get('/', async (_req, res) => {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await connection.query(`
      SELECT attribute_id, code, name, name_bg, unit, data_type, category
      FROM attribute
      ORDER BY category, name
    `);
    res.json(rows);
  } catch (err) {
    console.error('GET /attributes error:', err.message);
    res.status(500).json({ error: 'Database error' });
  } finally {
    await connection.end();
  }
});

module.exports = router;
