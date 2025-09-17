const express = require("express");
const mysql = require("mysql2/promise");
const db = require('../db.js');

const router = express.Router();

// GET all shops
router.get("/", async (req, res) => {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await connection.query("SELECT id, name, city, address FROM shops");
    await connection.end();

    res.json(rows);
  } catch (err) {
    console.error("Error fetching shops:", err);
    res.status(500).json({ error: "Failed to fetch shops" });
  }
});

// shops.js
router.get('/new', async (req, res) => {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await connection.execute(`SELECT shop_id, name, address FROM shop ORDER BY name`);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  } finally{
    await connection.end();
  }
});

module.exports = router;
