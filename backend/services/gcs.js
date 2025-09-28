// services/gcs.js
const { Storage } = require('@google-cloud/storage');
const path = require('path');

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
