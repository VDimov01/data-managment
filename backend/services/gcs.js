// backend/services/gcs.js
const { Storage } = require('@google-cloud/storage');

/**
 * Single source of truth for the Storage client.
 * Priority:
 * 1) GCP_SA_JSON (full JSON pasted in env) -> pass credentials directly
 * 2) GOOGLE_APPLICATION_CREDENTIALS (path)   -> ADC picks it up
 * 3) Default ADC (works on GCP)
 */
function makeStorage() {
  if (process.env.GCP_SA_JSON) {
    const cred = JSON.parse(process.env.GCP_SA_JSON);
    if (!cred.client_email || !cred.private_key) {
      throw new Error('[gcs] GCP_SA_JSON missing client_email/private_key');
    }
    return new Storage({
      projectId: cred.project_id,
      credentials: {
        client_email: cred.client_email,
        private_key: cred.private_key,
      },
    });
  }
  // If GOOGLE_APPLICATION_CREDENTIALS is set (file path), Storage() will pick it up.
  return new Storage();
}

const storage = makeStorage();

const BUCKET_PRIVATE = process.env.BUCKET_PRIVATE || 'dm-assets-private';
const BUCKET_PUBLIC  = process.env.BUCKET_PUBLIC  || 'test-bucket-2004';

const bucketPrivate = storage.bucket(BUCKET_PRIVATE);
const bucketPublic  = storage.bucket(BUCKET_PUBLIC);

module.exports = {
  storage,
  bucketPrivate,
  bucketPublic,
  BUCKET_PRIVATE,
  BUCKET_PUBLIC,
};
