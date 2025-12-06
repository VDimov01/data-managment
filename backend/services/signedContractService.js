const { bucketPrivate, storage, BUCKET_PRIVATE } = require('./gcs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

/**
 * Uploads a signed contract PDF buffer to GCS.
 * Path: contracts/<uuid>/signed/<filename>
 */
async function uploadSignedContractPdf({ contract_uuid, buffer, originalName }) {
    // Coerce to Buffer
    const bytes = Buffer.isBuffer(buffer)
        ? buffer
        : (buffer instanceof Uint8Array ? Buffer.from(buffer) : null);

    if (!bytes) throw new Error('uploadSignedContractPdf: expected Buffer bytes');

    // sanitize filename
    const safeName = (originalName || 'signed_contract.pdf').replace(/[^\w.\-]+/g, '_');
    // We add a random suffix or timestamp to avoid collisions if multiple signed versions are uploaded?
    // actually, let's keep it simple for now, or use a UUID prefix if needed.
    // The table has a PK, so maybe just use the original name or a standard name.
    // Let's use a unique name to be safe.
    const uniqueName = `${Date.now()}_${safeName}`;
    const gcsKey = `contracts/${contract_uuid}/signed_${uniqueName}`;
    
    const file = bucketPrivate.file(gcsKey);

    await file.save(bytes, {
        resumable: false,
        metadata: {
            contentType: 'application/pdf',
            metadata: { contract_uuid, type: 'signed_contract' },
        },
    });

    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    return { gcsKey, size: bytes.length, sha256, filename: uniqueName };
}

async function getSignedReadUrl(gcsKey, { minutes = 15 } = {}) {
    if (!gcsKey) return null;
    const expires = Date.now() + minutes * 60 * 1000;
    const [signedUrl] = await storage.bucket(BUCKET_PRIVATE).file(gcsKey).getSignedUrl({
        action: 'read',
        expires,
    });
    return { signedUrl, expiresAt: new Date(expires).toISOString() };
}

module.exports = {
    uploadSignedContractPdf,
    getSignedReadUrl
};
