// routes/customers.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../db');
const {
  encryptNationalId, decryptNationalId, hashNationalId, last4, mask
} = require('../services/cryptoCust');

const pool = getPool();

function toBool01(v, def = 1) {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  if (v === true || s === '1' || s === 'true' || s === 'yes') return 1;
  if (v === false || s === '0' || s === 'false' || s === 'no') return 0;
  return def;
}

function parseCustomerBody(body = {}, isUpdate = false) {
  const t = String(body.customer_type || '').trim();
  const customer_type = (t === 'Company' || t === 'Individual') ? t : null;

  const first_name  = body.first_name  != null ? String(body.first_name).trim()  : null;
  const middle_name = body.middle_name != null ? String(body.middle_name).trim() : null;
  const last_name   = body.last_name   != null ? String(body.last_name).trim()   : null;

  const company_name    = body.company_name    != null ? String(body.company_name).trim()    : null;
  const rep_first_name  = body.rep_first_name  != null ? String(body.rep_first_name).trim()  : null;
  const rep_middle_name = body.rep_middle_name != null ? String(body.rep_middle_name).trim() : null;
  const rep_last_name   = body.rep_last_name   != null ? String(body.rep_last_name).trim()   : null;

  const email           = body.email           != null ? String(body.email).trim()           : null;
  const phone           = body.phone           != null ? String(body.phone).trim()           : null;
  const secondary_phone = body.secondary_phone != null ? String(body.secondary_phone).trim() : null;

  const country      = body.country      != null ? String(body.country).trim() : null;
  const city         = body.city         != null ? String(body.city).trim()                  : null;
  const address_line = body.address_line != null ? String(body.address_line).trim()          : null;
  const postal_code  = body.postal_code  != null ? String(body.postal_code).trim()           : null;

  const tax_id       = body.tax_id       != null ? String(body.tax_id).trim()       : null;
  const vat_number   = body.vat_number   != null ? String(body.vat_number).trim()   : null;
  const national_id  = body.national_id  != null ? String(body.national_id).trim()  : null; // plaintext from client

  const notes    = body.notes    != null ? String(body.notes).trim() : null;
  const is_active = toBool01(body.is_active, 1);
  const public_uuid = body.public_uuid ? String(body.public_uuid).trim() : null;

  if (!isUpdate) {
    if (!customer_type) throw new Error('customer_type must be Individual or Company');
    if (customer_type === 'Individual' && !first_name && !last_name) {
      throw new Error('For Individual, first_name or last_name is required');
    }
    if (customer_type === 'Company' && !company_name) {
      throw new Error('For Company, company_name is required');
    }
  }

  return {
    customer_type,
    first_name, middle_name, last_name,
    company_name, rep_first_name, rep_middle_name, rep_last_name,
    email, phone, secondary_phone,
    country, city, address_line, postal_code,
    tax_id, vat_number, national_id, // plaintext; we’ll encrypt it below
    notes, is_active,
    public_uuid
  };
}

// -------- LIST --------
router.get('/', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  try {
    let where = 'WHERE 1=1';
    const params = [];
    if (q) {
      where += ` AND (
        COALESCE(display_name,'') LIKE ?
        OR COALESCE(company_name,'') LIKE ?
        OR COALESCE(first_name,'') LIKE ?
        OR COALESCE(middle_name,'') LIKE ?
        OR COALESCE(last_name,'') LIKE ?
        OR COALESCE(email,'') LIKE ?
        OR COALESCE(phone,'') LIKE ?
        OR COALESCE(city,'') LIKE ?
        OR COALESCE(public_uuid,'') LIKE ?
      )`;
      const s = `%${q}%`;
      params.push(s, s, s, s, s, s, s, s, s);
    }

    const [[{ cnt }]] = await pool.query(`SELECT COUNT(*) AS cnt FROM customer ${where}`, params);

    const [rows] = await pool.query(
      `SELECT customer_id, public_uuid, customer_type,
              first_name, middle_name, last_name,
              company_name, rep_first_name, rep_middle_name, rep_last_name,
              email, phone, secondary_phone,
              country, city, address_line, postal_code,
              tax_id, vat_number,
              national_id_enc, national_id_last4,
              display_name, notes, is_active,
              created_at, updated_at
       FROM customer
       ${where}
       ORDER BY display_name ASC, customer_id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // Don’t decrypt everything for a list; return masked + last4
    const customers = rows.map(r => ({
      ...r,
      national_id: decryptNationalId(r.national_id_enc)
    }));

    res.json({ page, limit, total: cnt, totalPages: Math.max(1, Math.ceil(cnt/limit)), customers });
  } catch (e) {
    console.error('GET /api/customers', e);
    res.status(500).json({ error: 'Database error' });
  }
});

// -------- GET BY ID (decrypt full) --------
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const [rows] = await pool.query(
      `SELECT * FROM customer WHERE customer_id=?`, [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    const row = rows[0];
    let national_id = null;
    try { national_id = decryptNationalId(row.national_id_enc); } catch {}
    row.national_id = national_id;
    delete row.national_id_enc;
    res.json(row);
  } catch (e) {
    console.error('GET /api/customers/:id', e);
    res.status(500).json({ error: 'Database error' });
  }
});

// -------- GET BY UUID (decrypt full for public page if you really need it) --------
router.get('/by-uuid/:uuid', async (req, res) => {
  const uuid = String(req.params.uuid || '').trim();
  if (!uuid || uuid.length > 36) return res.status(400).json({ error: 'Invalid uuid' });
  try {
    const [rows] = await pool.query(`SELECT * FROM customer WHERE public_uuid=?`, [uuid]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    const row = rows[0];
    let national_id = null;
    try { national_id = decryptNationalId(row.national_id_enc); } catch {}
    row.national_id = national_id;
    delete row.national_id_enc;
    res.json(row);
  } catch (e) {
    console.error('GET /api/customers/by-uuid/:uuid', e);
    res.status(500).json({ error: 'Database error' });
  }
});

// -------- CREATE (encrypt) --------
router.post('/', async (req, res) => {
  try {
    const c = parseCustomerBody(req.body, false);
    const pub = c.public_uuid || uuidv4();

    let national_id_enc = null, national_id_hash = null, national_id_last4 = null;
    if (c.national_id) {
      national_id_enc = encryptNationalId(c.national_id);
      national_id_hash = hashNationalId(c.national_id);   // Buffer(32)
      national_id_last4 = last4(c.national_id);
    }

    const [r] = await pool.query(
      `INSERT INTO customer
       (public_uuid, customer_type,
        first_name, middle_name, last_name,
        company_name, rep_first_name, rep_middle_name, rep_last_name,
        email, phone, secondary_phone,
        country, city, address_line, postal_code,
        tax_id, vat_number,
        national_id_enc, national_id_hash, national_id_last4,
        notes, is_active)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        pub, c.customer_type,
        c.first_name, c.middle_name, c.last_name,
        c.company_name, c.rep_first_name, c.rep_middle_name, c.rep_last_name,
        c.email, c.phone, c.secondary_phone,
        c.country, c.city, c.address_line, c.postal_code,
        c.tax_id, c.vat_number,
        national_id_enc, national_id_hash, national_id_last4,
        c.notes, c.is_active
      ]
    );

    res.status(201).json({ customer_id: r.insertId, public_uuid: pub });
  } catch (e) {
    // probable duplicate (national_id_hash unique)
    if (e && e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Customer with the same national ID already exists' });
    }
    console.error('POST /api/customers', e);
    res.status(400).json({ error: e.message || 'Invalid payload' });
  }
});

// -------- UPDATE (encrypt if provided) --------
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const [exists] = await pool.query('SELECT customer_id FROM customer WHERE customer_id=?', [id]);
    if (!exists.length) return res.status(404).json({ error: 'Not found' });

    const c = parseCustomerBody(req.body, true);
    const pub = c.public_uuid || null;

    // if national_id provided -> rotate enc/hash/last4; otherwise leave as is
    let national_id_enc = null, national_id_hash = null, national_id_last4 = null;
    let setNI = '';
    const args = [];

    if (c.national_id != null && c.national_id !== '') {
      national_id_enc = encryptNationalId(c.national_id);
      national_id_hash = hashNationalId(c.national_id);
      national_id_last4 = last4(c.national_id);
      setNI = `,
        national_id_enc=?,
        national_id_hash=?,
        national_id_last4=?`;
      args.push(national_id_enc, national_id_hash, national_id_last4);
    }

    await pool.query(
      `UPDATE customer SET
        public_uuid = COALESCE(?, public_uuid),
        customer_type=?,
        first_name=?, middle_name=?, last_name=?,
        company_name=?, rep_first_name=?, rep_middle_name=?, rep_last_name=?,
        email=?, phone=?, secondary_phone=?,
        country=?, city=?, address_line=?, postal_code=?,
        tax_id=?, vat_number=?${setNI},
        notes=?, is_active=?
       WHERE customer_id=?`,
      [
        pub,
        c.customer_type,
        c.first_name, c.middle_name, c.last_name,
        c.company_name, c.rep_first_name, c.rep_middle_name, c.rep_last_name,
        c.email, c.phone, c.secondary_phone,
        c.country, c.city, c.address_line, c.postal_code,
        c.tax_id, c.vat_number,
        ...args,
        c.notes, c.is_active,
        id
      ]
    );

    res.json({ message: 'Updated' });
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Customer with the same national ID already exists' });
    }
    console.error('PUT /api/customers/:id', e);
    res.status(400).json({ error: e.message || 'Invalid payload' });
  }
});

// -------- DELETE --------
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const [r] = await pool.query('DELETE FROM customer WHERE customer_id=?', [id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (e) {
    console.error('DELETE /api/customers/:id', e);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
