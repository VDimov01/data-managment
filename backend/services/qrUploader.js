// services/qrUploader.js
const QRCode = require('qrcode');
const { bucketPrivate } = require('./gcs');
const { getPool } = require('../db');

const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN; // e.g. https://bydcars.bg
if (!PUBLIC_ORIGIN) console.warn('[qr] PUBLIC_ORIGIN missing. Set it in env.');

function buildVehiclePublicUrl(uuid) {
  return `${PUBLIC_ORIGIN}/vehicles/${uuid}`;
}
function qrObjectKey(vehicleId, uuid) {
  return `qr/veh-${vehicleId}-${uuid.slice(0,8)}.png`; // deterministic
}

// High-res for print labels. Quiet zone matters.
async function generateQrPng(url) {
  return QRCode.toBuffer(url, {
    errorCorrectionLevel: 'M',      // use 'H' only if you overlay a logo
    width: 1024,                    // ~300dpi for 50mm labels
    margin: 4,                      // quiet zone
    type: 'png'
  });
}

async function ensureVehicleQr(vehicleId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT vehicle_id, public_uuid, qr_png_path
       FROM vehicle WHERE vehicle_id=?`,
    [vehicleId]
  );
  if (!rows.length) throw new Error('Vehicle not found');

  const v = rows[0];
  const destUrl = buildVehiclePublicUrl(v.public_uuid);
  const buf = await generateQrPng(destUrl);

  const key = qrObjectKey(v.vehicle_id, v.public_uuid);
  const file = bucketPrivate.file(key);

  await file.save(buf, {
    resumable: false,
    contentType: 'image/png',
    metadata: { cacheControl: 'public, max-age=31536000, immutable' }
  });

  // Decide exposure:
  const objectKey = key; // e.g. 'qr/veh-123-abcdef12.png'
    let publicUrl = null;

if ((process.env.QR_PUBLIC_READ || '').toLowerCase() === 'true') {
  await file.makePublic().catch(()=>{});
  publicUrl = `https://storage.googleapis.com/${bucketPrivate.name}/${key}`;
}

// store short key; url only if public
await pool.query(
  `UPDATE vehicle SET qr_object_key=?, qr_png_path=? WHERE vehicle_id=?`,
  [objectKey, publicUrl, vehicleId]
);

return {
   vehicle_id: v.vehicle_id,
   // canonical names:
   qr_object_key: objectKey,
   qr_png_path: publicUrl,
   // legacy names (so old UI doesn’t break):
   objectKey,
   publicUrl,
   destination: destUrl
 };
}

async function backfillVehicleQrs() {
  const pool = getPool();
  const [rows] = await pool.query(`SELECT vehicle_id FROM vehicle WHERE qr_object_key IS NULL`);
  let ok = 0, fail = 0;
  for (const r of rows) {
    try { await ensureVehicleQr(r.vehicle_id); ok++; } catch (e) { console.error('[qr] fail', r.vehicle_id, e.message); fail++; }
  }
  return { generated: ok, failed: fail };
}

module.exports = { ensureVehicleQr, backfillVehicleQrs };
