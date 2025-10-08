// backend/services/cryptoCust.js
const crypto = require('crypto');

const AES_ALGO = 'aes-256-gcm';
const IV_LEN = 12;   // GCM standard
const TAG_LEN = 16;  // GCM tag

function parseKey(envVal, name) {
  if (!envVal) throw new Error(`${name} missing`);
  // allow either plain base64 or raw 32B hex
  let s = envVal.trim();
  if (s.startsWith('base64:')) s = s.slice(7).trim();
  const b64 = /^[A-Za-z0-9+/=]+$/.test(s);
  const key = b64 ? Buffer.from(s, 'base64') : Buffer.from(s, 'hex');
  if (key.length !== 32) throw new Error(`${name} must be 32 bytes`);
  return key;
}

const AES_KEY  = parseKey(process.env.CUSTOMER_AES_KEY,  'CUSTOMER_AES_KEY');
const HMAC_KEY = parseKey(process.env.CUSTOMER_HMAC_KEY, 'CUSTOMER_HMAC_KEY');

// v1:<b64(iv)>:<b64(ct)>:<b64(tag)>
function encryptNationalId(plain) {
  if (plain == null || plain === '') return null;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(AES_ALGO, AES_KEY, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${ct.toString('base64')}:${tag.toString('base64')}`;
}

function decryptNationalId(enc) {
  if (!enc) return null;
  const parts = String(enc).split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Unsupported NI format');
  const iv  = Buffer.from(parts[1], 'base64');
  const ct  = Buffer.from(parts[2], 'base64');
  const tag = Buffer.from(parts[3], 'base64');
  const dec = crypto.createDecipheriv(AES_ALGO, AES_KEY, iv);
  dec.setAuthTag(tag);
  const pt = Buffer.concat([dec.update(ct), dec.final()]);
  return pt.toString('utf8');
}

// constant-key, deterministic, indexable
function hashNationalId(plain) {
  if (plain == null || plain === '') return null;
  return crypto.createHmac('sha256', HMAC_KEY).update(String(plain), 'utf8').digest(); // Buffer(32)
}

function last4(plain) {
  if (!plain) return null;
  const s = String(plain).replace(/\D+/g, '');
  return s.slice(-4).padStart(4, '0');
}

function mask(plain) {
  if (!plain) return null;
  const s = String(plain);
  if (s.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
}

module.exports = {
  encryptNationalId,
  decryptNationalId,
  hashNationalId,
  last4,
  mask,
};
