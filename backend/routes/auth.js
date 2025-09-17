const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const authenticateToken = require('../middlewares/authMiddleware.js');

// Protected route: GET /api/dashboard
router.get('/dashboard', authenticateToken, (req, res) => {
  res.json({
    message: `Hello ${req.user.username}, welcome to the dashboard!`,
  });
  console.log(`Dashboard accessed by user: ${req.user.username}`);
});

module.exports = router;

// POST /api/login
router.post('/', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  try {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
        console.log('✅ Connected to MySQL auth');
    const [rows] = await connection.execute(
      'SELECT * FROM admin WHERE username = ?',
      [username]
    );

    if (rows.length === 0)
      return res.status(401).json({ error: 'Invalid credentials' });

    const admin = rows[0];
    const isMatch = await bcrypt.compare(password, admin.password_hash);

    if (!isMatch)
      return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      {
        id: admin.id,
        uuid: admin.uuid,
        username: admin.username,
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token, username: admin.username, firstname: admin.first_name, lastname: admin.last_name, uuid: admin.uuid });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
