// backend/routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../db');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');

const pool = getPool();
const router = express.Router();

const JWT_SECRET  = process.env.JWT_SECRET  || 'dev_secret_change_me';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';

// Helper: issue token + cookie
function setAuthCookie(res, token) {
  const secure = !!Number(process.env.COOKIE_SECURE || '0');
  res.cookie('auth_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: 1000 * 60 * 60 * 8, // 8h
  });
}

// POST /api/auth/login
// body: { emailOrUsername, password }
router.post('/login', async (req, res) => {
  try {
    const { emailOrUsername, email, username, password } = req.body || {};
    const identifier = emailOrUsername || email || username;
    if (!identifier || !password) return res.status(400).json({ error: 'Missing credentials' });

    const [[admin]] = await pool.query(
      `SELECT id, uuid, username, email, password_hash, first_name, last_name
         FROM admin
        WHERE email = ? OR username = ?
        LIMIT 1`,
      [identifier, identifier]
    );
    if (!admin) return res.status(401).json({ error: 'Грешно име или парола' });

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) return res.status(401).json({ error: 'Грешно име или парола' });

    const payload = {
      sub: String(admin.id),
      uuid: admin.uuid,
      email: admin.email,
      username: admin.username,
      role: 'admin',
      name: `${admin.first_name} ${admin.last_name}`.trim(),
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    setAuthCookie(res, token);
    res.json({ token, user: payload });
  } catch (e) {
    console.error('POST /auth/login', e);
    res.status(500).json({ error: 'Login error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ ok: true });
});

// GET /api/auth/me  (optional: mount requireAuth here to trust req.user)
router.get('/me', (req, res) => {
  const token = (req.cookies && req.cookies.auth_token) ||
                ((req.headers.authorization || '').split(' ')[1] || null);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ user: payload });
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

// Create a new admin (only existing admins)
// POST /api/auth/admins
// body: { email, username, password, first_name, last_name }
router.post('/admins', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { email, username, password, first_name, last_name } = req.body || {};
    if (!email || !username || !password || !first_name || !last_name) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const uuid = uuidv4();

    await pool.query(
      `INSERT INTO admin (uuid, username, email, password_hash, first_name, last_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuid, username, email, password_hash, first_name, last_name]
    );

    res.status(201).json({ ok: true, uuid, email, username, first_name, last_name });
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username or email already taken' });
    }
    console.error('POST /auth/admins', e);
    res.status(500).json({ error: 'Create admin failed' });
  }
});

module.exports = router;
