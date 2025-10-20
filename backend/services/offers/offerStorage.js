// backend/services/offerStorage.js
const crypto = require('crypto');
const { bucketPrivate, storage, BUCKET_PRIVATE } = require('../gcs');

function ensureBuffer(buf, label = 'buffer') {
  if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
    throw new Error(`${label}: expected non-empty Buffer`);
  }
  return buf;
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(ensureBuffer(buf)).digest('hex');
}

/**
 * Upload offer PDF buffer to the private bucket.
 * @param {Object} args
 * @param {number} args.year
 * @param {string|null} args.offer_number  e.g. 'OF-2025-00023' (null for drafts)
 * @param {string} args.offer_uuid         used when offer_number is null (drafts)
 * @param {number} args.version            >= 1
 * @param {Buffer} args.buffer
 * @returns {{gcsKey:string, filename:string, byte_size:number, sha256:string, content_type:string}}
 */
async function uploadOfferPdfBuffer({ year, offer_number, offer_uuid, version, buffer }) {
  const ver = String(version).padStart(3, '0');
  const filename = `v${ver}.pdf`;
  const basePath = offer_number
    ? `offers/${year}/${offer_number}`
    : `offers/drafts/${offer_uuid}`;
  const gcsKey = `${basePath}/${filename}`;

  const file = bucketPrivate.file(gcsKey);
  await file.save(ensureBuffer(buffer), {
    resumable: false,
    metadata: {
      contentType: 'application/pdf',
      metadata: {
        offer_number: offer_number || '',
        offer_uuid: offer_uuid || '',
        version: String(version)
      }
    }
  });

  const sha256 = sha256Hex(buffer);
  const byte_size = buffer.length;
  return { gcsKey, filename, byte_size, sha256, content_type: 'application/pdf' };
}

async function getSignedOfferPdfUrl(gcsKey, { minutes = 10 } = {}) {
  const expires = Date.now() + minutes * 60 * 1000;
  const [signedUrl] = await storage.bucket(BUCKET_PRIVATE).file(gcsKey).getSignedUrl({
    action: 'read',
    expires
  });
  return { signedUrl, expiresAt: new Date(expires).toISOString() };
}

module.exports = {
  uploadOfferPdfBuffer,
  getSignedOfferPdfUrl
};
