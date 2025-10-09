// backend/services/gcs.js
const { Storage } = require('@google-cloud/storage');

function parseJsonSafe(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function makeStorage() {
  // Preferred: provide creds via env, avoid temp files entirely.
  // Railway: set GCP_SA_JSON_B64 (base64 of the whole JSON file) OR GCP_SA_JSON (raw JSON string).
  const b64 = process.env.GCP_SA_JSON_B64;
  const raw = process.env.GCP_SA_JSON;

  if (b64) {
    const json = Buffer.from(b64, 'base64').toString('utf8');
    const creds = parseJsonSafe(json);
    if (!creds) throw new Error('GCS: GCP_SA_JSON_B64 is not valid base64-JSON');
    return new Storage({ credentials: creds, projectId: creds.project_id });
  }

  if (raw) {
    const creds = parseJsonSafe(raw);
    if (!creds) throw new Error('GCS: GCP_SA_JSON is not valid JSON');
    return new Storage({ credentials: creds, projectId: creds.project_id });
  }

  // Fallback to GOOGLE_APPLICATION_CREDENTIALS if you’ve set it
  return new Storage(); // will use ADC
}

const storage = makeStorage();

const BUCKET_PRIVATE = process.env.BUCKET_PRIVATE || 'dm-assets-private';
const BUCKET_PUBLIC  = process.env.BUCKET_PUBLIC  || 'dm-assets-public';

const bucketPrivate = storage.bucket(BUCKET_PRIVATE);
const bucketPublic  = storage.bucket(BUCKET_PUBLIC);

module.exports = { storage, bucketPrivate, bucketPublic, BUCKET_PRIVATE, BUCKET_PUBLIC };
