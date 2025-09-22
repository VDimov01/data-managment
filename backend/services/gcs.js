// services/gcs.js
const { Storage } = require('@google-cloud/storage');
const path = require('path');

// Prefer ADC (GOOGLE_APPLICATION_CREDENTIALS). Fallback to your local json path for dev.
const storage = new Storage(
  process.env.GOOGLE_APPLICATION_CREDENTIALS ? {} : {
    keyFilename: path.join(__dirname, '../config/your-sa.json'),
  }
);

const BUCKET_NAME =
  process.env.BUCKET_NAME_QR ||
  process.env.BUCKET_NAME_IMAGES || // reuse images bucket if you want
  'test_bucket-2004';

const bucket = storage.bucket(BUCKET_NAME);

module.exports = { storage, bucket, BUCKET_NAME };
