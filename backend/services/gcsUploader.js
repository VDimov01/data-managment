// backend/services/gcsUploader.js
const path = require('path');
const crypto = require('crypto');
const { bucketPublic, bucketPrivate } = require('./gcs');

function slug(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function fileExt(originalname, mimetype) {
  // Prefer original extension
  const ext = path.extname(originalname || '').toLowerCase();
  if (ext) return ext;
  if (mimetype && mimetype.startsWith('image/')) return '.' + mimetype.split('/')[1];
  return ''; // last resort
}

/**
 * Upload image to GCS. Returns { publicUrl, gcsKey }.
 * @param {object} opts
 *   - file: Multer file (memoryStorage or diskStorage)
 *   - visibility: 'public' | 'private' (default 'public')
 *   - maker, model, year, part, editionId
 */
async function uploadToGCS(opts) {
  const {
    file,
    visibility = 'public',
    maker,
    model,
    year,
    part = 'unsorted',
    editionId,
  } = opts;

  if (!file) throw new Error('Missing file');

  // choose bucket
  const bucket = visibility === 'private' ? bucketPrivate : bucketPublic;

  const makerSlug  = slug(maker);
  const modelSlug  = slug(model);
  const yearSlug   = String(year || '').trim();
  const partSlug   = ['main','exterior','interior','unsorted'].includes(String(part).toLowerCase())
    ? String(part).toLowerCase()
    : 'unsorted';

  const baseDir = `cars/${makerSlug}/${modelSlug}${yearSlug ? `-${yearSlug}` : ''}/${partSlug}`;

  const ext = fileExt(file.originalname, file.mimetype);
  const rand = crypto.randomBytes(4).toString('hex');
  const baseName = slug(path.basename(file.originalname, path.extname(file.originalname))) || 'image';
  const gcsKey = `${baseDir}/${Date.now()}-${rand}-${baseName}${ext}`;

  const blob = bucket.file(gcsKey);

  // Build a stream from either memory or disk
  const hasBuffer = file.buffer && Buffer.isBuffer(file.buffer);
  const stream = blob.createWriteStream({
    resumable: false,
    contentType: file.mimetype || 'application/octet-stream',
    metadata: {
      cacheControl: visibility === 'public' ? 'public, max-age=31536000, immutable' : 'private, max-age=0, no-cache',
    },
  });

  await new Promise((resolve, reject) => {
    stream.on('error', reject);
    stream.on('finish', resolve);
    if (hasBuffer) {
      stream.end(file.buffer);
    } else if (file.path) {
      // diskStorage: pipe a read stream
      const fs = require('fs');
      fs.createReadStream(file.path).on('error', reject).pipe(stream);
    } else {
      reject(new Error('Unsupported Multer file (no buffer or path)'));
    }
  });

  const publicUrl =
    visibility === 'public'
      ? `https://storage.googleapis.com/${bucket.name}/${encodeURI(gcsKey)}`
      : null;

  return { publicUrl, gcsKey };
}

module.exports = { uploadToGCS };
