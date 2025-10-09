// backend/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

function readToken(req) {
  const h = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/.exec(h);
  if (m) return m[1];
  if (req.cookies && req.cookies.dm_session) return req.cookies.dm_session;
  return null;
}

function requireAuth(req, res, next) {
  try {
    const token = readToken(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { sub, uuid, email, username, role }
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (role && req.user.role !== role) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

module.exports = { requireAuth, requireRole };
