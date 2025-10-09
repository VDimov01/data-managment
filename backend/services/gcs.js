// services/gcs.js
const fs = require('fs');
const path = require('path');

// 1) Credentials bootstrap: prefer GOOGLE_APPLICATION_CREDENTIALS;
//    if not set and GCP_SA_JSON (or GCP_SA_JSON_B64) exists, write a temp file and point to it.
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  if (process.env.GCP_SA_JSON) {
    const credPath = path.join('/tmp', 'gcp-sa.json');
    fs.writeFileSync(credPath, process.env.GCP_SA_JSON, 'utf-8');
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
  } else if (process.env.GCP_SA_JSON_B64) {
    const buf = Buffer.from(process.env.GCP_SA_JSON_B64, 'base64');
    const credPath = path.join('/tmp', 'gcp-sa.json');
    fs.writeFileSync(credPath, buf);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
  }
}

const { Storage } = require('@google-cloud/storage');

const storage = new Storage(
  process.env.GOOGLE_APPLICATION_CREDENTIALS ? {} : {
    keyFilename: path.join(__dirname, '../config/luminous-lodge-466913-n1-c0a750ea52df.json'),
  }
);

const BUCKET_PRIVATE = process.env.BUCKET_PRIVATE || 'dm-assets-private';
const BUCKET_PUBLIC  = process.env.BUCKET_PUBLIC  || 'dm-assets-public';

const bucketPrivate = storage.bucket(BUCKET_PRIVATE);
const bucketPublic  = storage.bucket(BUCKET_PUBLIC);

module.exports = { storage, bucketPrivate, bucketPublic, BUCKET_PRIVATE, BUCKET_PUBLIC };
