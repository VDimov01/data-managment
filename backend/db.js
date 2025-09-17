// db.js
const mysql = require('mysql2/promise');
require('dotenv').config();

// const db = mysql.createPool({
//   host: process.env.MYSQL_HOST,
//   user: process.env.MYSQL_USER,
//   password: process.env.MYSQL_PASSWORD,
//   database: process.env.MYSQL_DATABASE,
//   port: process.env.DB_PORT || 3306,
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0,
//   timezone: 'Z',
// });

// db.js

let pool; // singleton

function createPoolFromUrl(urlStr) {
  const url = new URL(urlStr);
  const sslEnv = (process.env.MYSQL_SSL || url.searchParams.get('ssl') || '').toLowerCase();
  const useSSL = sslEnv === '1' || sslEnv === 'true' || sslEnv === 'required';

  return mysql.createPool({
    host: url.hostname,
    user: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    database: url.pathname ? url.pathname.replace(/^\//, '') : undefined,
    port: url.port ? Number(url.port) : 3306,

    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONN_LIMIT) || 10,
    queueLimit: 0,
    enableKeepAlive: true,
    // Keep UTC timestamps predictable; remove if you prefer local time:
    timezone: 'Z',
    // Optional: return DECIMAL/NEWDECIMAL as numbers instead of strings
    decimalNumbers: true,

    // SSL only if needed (e.g., PlanetScale). Railway usually doesn't need it.
    ...(useSSL ? { ssl: { rejectUnauthorized: true } } : {})
  });
}

function getPool() {
  if (pool) return pool;

  if (process.env.DATABASE_URL) {
    pool = createPoolFromUrl(process.env.DATABASE_URL);
  } else {
    if (!process.env.MYSQL_HOST) {
      throw new Error('Missing DB config: set DATABASE_URL or MYSQL_HOST/USER/PASSWORD/DATABASE');
    }
    const useSSL = (process.env.MYSQL_SSL || '').toLowerCase() === 'true';
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      port: Number(process.env.DB_PORT) || 3306,

      waitForConnections: true,
      connectionLimit: Number(process.env.DB_CONN_LIMIT) || 10,
      queueLimit: 0,
      enableKeepAlive: true,
      timezone: 'Z',
      decimalNumbers: true,
      ...(useSSL ? { ssl: { rejectUnauthorized: true } } : {})
    });
  }

  // Optional: do a quick ping on startup
  (async () => {
    try {
      const conn = await pool.getConnection();
      await conn.ping();
      conn.release();
      console.log('[db] pool ready');
    } catch (e) {
      console.error('[db] initial ping failed:', e.message);
    }
  })();

  // Clean shutdown (don’t call pool.end() per request!)
  process.once('SIGINT', async () => { try { await pool.end(); } catch {} process.exit(0); });
  process.once('SIGTERM', async () => { try { await pool.end(); } catch {} process.exit(0); });

  return pool;
}

// Helper for transactions
async function withTransaction(fn) {
  const p = getPool();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const res = await fn(conn);
    await conn.commit();
    return res;
  } catch (err) {
    try { await conn.rollback(); } catch {}
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { getPool, withTransaction };
