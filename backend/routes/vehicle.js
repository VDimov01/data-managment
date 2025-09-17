const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { getPool } = require('../db');
const pool = getPool();

const ALLOWED_STATUS = new Set([
  'InTransit','Available','Reserved','Sold','Service','Demo'
]);

router.get('/', async (req, res) => {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    try {
        const [rows] = await connection.execute(`
            SELECT 
  v.vehicle_id,
  v.vin,
  v.stock_number,
  m.name  AS make,
  mo.name AS model,
  my.year AS model_year,
  e.name  AS edition,

  cext.color_id AS exterior_color_id,
  cext.name_bg     AS exterior_color,
  cint.color_id AS interior_color_id,
  cint.name_bg     AS interior_color,

  v.asking_price,
  v.status,
  v.mileage,
  v.shop_id,
  s.name AS shop_name,
  s.address AS shop_address,
  s.city AS shop_city,

  a.name    AS attribute_name,
  a.name_bg AS attribute_name_bg,
  ea.value_numeric,
  ea.value_text,
  ea.value_boolean,
  a.unit
FROM vehicle v
JOIN edition     e  ON v.edition_id = e.edition_id
JOIN model_year  my ON e.model_year_id = my.model_year_id
JOIN model       mo ON my.model_id = mo.model_id
JOIN make        m  ON mo.make_id = m.make_id
LEFT JOIN shop   s  ON v.shop_id = s.shop_id

LEFT JOIN color cext ON cext.color_id = v.exterior_color_id AND cext.type = 'exterior'
LEFT JOIN color cint ON cint.color_id = v.interior_color_id AND cint.type = 'interior'

LEFT JOIN edition_attribute ea ON e.edition_id = ea.edition_id
LEFT JOIN attribute         a  ON ea.attribute_id = a.attribute_id
ORDER BY v.vehicle_id;

        `);

        // Optionally, group attributes by vehicle for easier frontend consumption
    const vehicles = {};
    rows.forEach(row => {
      if (!vehicles[row.vehicle_id]) {
        vehicles[row.vehicle_id] = {
          vehicle_id: row.vehicle_id,
          vin: row.vin,
          stock_number: row.stock_number,
          make: row.make,
          model: row.model,
          model_year: row.model_year,
          edition: row.edition,
          asking_price: row.asking_price,
          status: row.status,
          mileage: row.mileage,
          shop_name: row.shop_name,
          shop_address: row.shop_address,
          shop_city: row.shop_city,
          exterior_color: row.exterior_color,
          interior_color: row.interior_color,
          exterior_color_id: row.exterior_color_id,
          interior_color_id: row.interior_color_id,
          shop_id: row.shop_id,
          attributes: []
        };
      }

      if (row.attribute_name) {
        vehicles[row.vehicle_id].attributes.push({
          name: row.attribute_name,
          name_bg: row.attribute_name_bg,
          numeric: row.value_numeric,
          text: row.value_text,
          boolean: row.value_boolean,
          unit: row.unit
        });
      }
    });

    res.json(Object.values(vehicles));
    } catch (error) {
        console.error('Error fetching vehicles:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        await connection.end();
    }
});

// POST /api/vehicles
router.post('/', async (req, res) => {
  try {
    let {
      vin,
      stock_number = null,
      edition_id,
      exterior_color_id = null,
      interior_color_id = null,
      shop_id = null,
      status = 'InTransit',
      asking_price = null,
      mileage = 0,
      acquisition_cost = null, // optional
    } = req.body || {};

    // Normalize
    vin = String(vin || '').trim().toUpperCase();
    stock_number = stock_number == null || stock_number === '' ? null : String(stock_number).trim();
    edition_id = Number(edition_id);
    exterior_color_id = exterior_color_id ? Number(exterior_color_id) : null;
    interior_color_id = interior_color_id ? Number(interior_color_id) : null;
    shop_id = shop_id ? Number(shop_id) : null;
    asking_price = asking_price === '' || asking_price == null ? null : Number(asking_price);
    acquisition_cost = acquisition_cost === '' || acquisition_cost == null ? null : Number(acquisition_cost);
    mileage = mileage === '' || mileage == null ? 0 : Math.trunc(Number(mileage));
    status = String(status || 'InTransit');

    if (!vin || !Number.isFinite(edition_id)) {
      return res.status(400).json({ error: 'vin and edition_id are required' });
    }
    if (!ALLOWED_STATUS.has(status)) {
      return res.status(400).json({ error: `status must be one of: ${[...ALLOWED_STATUS].join(', ')}` });
    }
    if (asking_price !== null && !Number.isFinite(asking_price)) {
      return res.status(400).json({ error: 'asking_price must be a number' });
    }
    if (acquisition_cost !== null && !Number.isFinite(acquisition_cost)) {
      return res.status(400).json({ error: 'acquisition_cost must be a number' });
    }
    if (!Number.isFinite(mileage)) {
      return res.status(400).json({ error: 'mileage must be a number' });
    }

    // Validate references
    const [[ed]] = await pool.query('SELECT edition_id FROM edition WHERE edition_id=?', [edition_id]);
    if (!ed) return res.status(400).json({ error: 'edition_id not found' });

    if (exterior_color_id !== null) {
      const [[c]] = await pool.query('SELECT type FROM color WHERE color_id=?', [exterior_color_id]);
      if (!c) return res.status(400).json({ error: 'exterior_color_id not found' });
      if (c.type !== 'exterior') return res.status(400).json({ error: 'exterior_color_id must be type=exterior' });
    }
    if (interior_color_id !== null) {
      const [[c]] = await pool.query('SELECT type FROM color WHERE color_id=?', [interior_color_id]);
      if (!c) return res.status(400).json({ error: 'interior_color_id not found' });
      if (c.type !== 'interior') return res.status(400).json({ error: 'interior_color_id must be type=interior' });
    }
    if (shop_id !== null) {
      const [[s]] = await pool.query('SELECT shop_id FROM shop WHERE shop_id=?', [shop_id]);
      if (!s) return res.status(400).json({ error: 'shop_id not found' });
    }

    // Insert
    const [r] = await pool.query(
      `INSERT INTO vehicle
         (vin, stock_number, edition_id, exterior_color_id, interior_color_id, shop_id,
          status, asking_price, mileage, acquisition_cost)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [vin, stock_number, edition_id, exterior_color_id, interior_color_id, shop_id,
       status, asking_price, mileage, acquisition_cost]
    );

    res.status(201).json({ vehicle_id: r.insertId });
  } catch (err) {
    // Duplicate key (VIN/stock_number)
    if (err && err.code === 'ER_DUP_ENTRY') {
      const msg = (err.sqlMessage || '').toLowerCase();
      if (msg.includes('vin')) return res.status(409).json({ error: 'VIN already exists' });
      if (msg.includes('stock_number')) return res.status(409).json({ error: 'Stock number already exists' });
      return res.status(409).json({ error: 'Duplicate value' });
    }
    console.error('POST /api/vehicles', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// UPDATE vehicle (full update using current payload semantics)
router.put('/:id', async (req, res) => {
  const vehicleId = Number(req.params.id);
  if (!Number.isFinite(vehicleId)) return res.status(400).json({ error: 'Invalid vehicle id' });

  try {
    // Load existing so we can default edition_id if client doesn’t send it
    const [[current]] = await pool.query('SELECT * FROM vehicle WHERE vehicle_id=?', [vehicleId]);
    if (!current) return res.status(404).json({ error: 'Vehicle not found' });

    let {
      vin,
      stock_number = null,
      edition_id = current.edition_id, // default to current if not supplied
      exterior_color_id = null,
      interior_color_id = null,
      shop_id = null,
      status = current.status,
      asking_price = null,
      mileage = 0,
      acquisition_cost = null,
    } = req.body || {};

    // normalize
    vin = String(vin ?? current.vin).trim().toUpperCase();
    stock_number = stock_number == null || stock_number === '' ? null : String(stock_number).trim();
    edition_id = Number(edition_id);
    exterior_color_id = exterior_color_id ? Number(exterior_color_id) : null;
    interior_color_id = interior_color_id ? Number(interior_color_id) : null;
    shop_id = shop_id ? Number(shop_id) : null;
    status = String(status || current.status);
    asking_price = asking_price === '' || asking_price == null ? null : Number(asking_price);
    acquisition_cost = acquisition_cost === '' || acquisition_cost == null ? null : Number(acquisition_cost);
    mileage = mileage === '' || mileage == null ? 0 : Math.trunc(Number(mileage));

    if (!vin || !Number.isFinite(edition_id)) {
      return res.status(400).json({ error: 'vin and edition_id are required' });
    }
    if (!ALLOWED_STATUS.has(status)) {
      return res.status(400).json({ error: `status must be one of: ${[...ALLOWED_STATUS].join(', ')}` });
    }
    if (asking_price !== null && !Number.isFinite(asking_price)) {
      return res.status(400).json({ error: 'asking_price must be a number' });
    }
    if (acquisition_cost !== null && !Number.isFinite(acquisition_cost)) {
      return res.status(400).json({ error: 'acquisition_cost must be a number' });
    }
    if (!Number.isFinite(mileage)) {
      return res.status(400).json({ error: 'mileage must be a number' });
    }

    // validate refs
    const [[ed]] = await pool.query('SELECT edition_id FROM edition WHERE edition_id=?', [edition_id]);
    if (!ed) return res.status(400).json({ error: 'edition_id not found' });

    if (exterior_color_id !== null) {
      const [[c]] = await pool.query('SELECT type FROM color WHERE color_id=?', [exterior_color_id]);
      if (!c) return res.status(400).json({ error: 'exterior_color_id not found' });
      if (c.type !== 'exterior') return res.status(400).json({ error: 'exterior_color_id must be type=exterior' });
    }
    if (interior_color_id !== null) {
      const [[c]] = await pool.query('SELECT type FROM color WHERE color_id=?', [interior_color_id]);
      if (!c) return res.status(400).json({ error: 'interior_color_id not found' });
      if (c.type !== 'interior') return res.status(400).json({ error: 'interior_color_id must be type=interior' });
    }
    if (shop_id !== null) {
      const [[s]] = await pool.query('SELECT shop_id FROM shop WHERE shop_id=?', [shop_id]);
      if (!s) return res.status(400).json({ error: 'shop_id not found' });
    }

    await pool.query(
      `UPDATE vehicle SET
        vin=?,
        stock_number=?,
        edition_id=?,
        exterior_color_id=?,
        interior_color_id=?,
        shop_id=?,
        status=?,
        asking_price=?,
        mileage=?,
        acquisition_cost=?
       WHERE vehicle_id=?`,
      [vin, stock_number, edition_id, exterior_color_id, interior_color_id, shop_id, status, asking_price, mileage, acquisition_cost, vehicleId]
    );

    res.json({ message: 'Updated' });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      const msg = (err.sqlMessage || '').toLowerCase();
      if (msg.includes('vin')) return res.status(409).json({ error: 'VIN already exists' });
      if (msg.includes('stock_number')) return res.status(409).json({ error: 'Stock number already exists' });
      return res.status(409).json({ error: 'Duplicate value' });
    }
    console.error('PUT /api/vehicles/:id', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/vehicles/:id
router.delete('/:id', async (req, res) => {
  const vehicleId = Number(req.params.id);
  if (!Number.isFinite(vehicleId)) {
    return res.status(400).json({ error: 'Invalid vehicle id' });
  }
  try {
    const [r] = await pool.query('DELETE FROM vehicle WHERE vehicle_id=?', [vehicleId]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    return res.status(204).end();
  } catch (e) {
    console.error('DELETE /api/vehicles/:id', e);
    // If later you add FKs (e.g., offers/contracts) this might throw ER_ROW_IS_REFERENCED:
    // return res.status(409).json({ error: 'Vehicle is referenced by other records' });
    return res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
