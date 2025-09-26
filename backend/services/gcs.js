// services/gcs.js
const { Storage } = require('@google-cloud/storage');
const path = require('path');

const storage = new Storage(
  process.env.GOOGLE_APPLICATION_CREDENTIALS ? {} : {
    keyFilename: path.join(__dirname, '../config/your-sa.json'),
  }
);

const BUCKET_PRIVATE = process.env.BUCKET_PRIVATE || process.env.BUCKET_NAME_QR || process.env.BUCKET_NAME_IMAGES || 'dm-assets-private';
const BUCKET_PUBLIC  = process.env.BUCKET_PUBLIC  || 'dm-assets-public';

const bucketPrivate = storage.bucket(BUCKET_PRIVATE);
const bucketPublic  = storage.bucket(BUCKET_PUBLIC);

module.exports = { storage, bucketPrivate, bucketPublic, BUCKET_PRIVATE, BUCKET_PUBLIC };
