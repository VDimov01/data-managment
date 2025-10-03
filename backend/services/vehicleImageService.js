// services/vehicleImageService.js
const { getPool, withTransaction } = require('../db');
const { bucketPrivate } = require('./gcs');
const { vehicleHierKey } = require('./path');
const { getVehiclePathParts } = require('./vehiclePathParts');

async function listVehicleImages(vehicleId) {
  const [rows] = await getPool().query(
    `SELECT vehicle_image_id, vehicle_id, object_key, content_type, bytes,
            width_px, height_px, caption, sort_order, is_primary, created_at
     FROM vehicle_image
     WHERE vehicle_id = ?
     ORDER BY is_primary DESC, sort_order ASC, vehicle_image_id ASC`, [vehicleId]
  );
  return rows;
}

async function uploadVehicleImages(vehicleId, files = []) {
  if (!files.length) return [];
  const parts = await getVehiclePathParts(vehicleId); // maker, model, year, edition, uuid

  const created = [];
  for (const f of files) {
    const key = vehicleHierKey({ ...parts, originalName: f.originalname, buffer: f.buffer, filetype: "images" });
    const file = bucketPrivate.file(key);

    // Save to GCS (private bucket)
    await file.save(f.buffer, {
      resumable: false,
      contentType: f.mimetype || 'application/octet-stream',
      metadata: { cacheControl: 'private, max-age=31536000, immutable' }
    });

    // Get metadata (size, contentType)
    const [meta] = await file.getMetadata().catch(() => [{}]);
    const bytes = Number(meta.size || f.size || 0);
    const contentType = meta.contentType || f.mimetype || null;

    // Insert row, tolerate duplicates (idempotent re-uploads of same content)
    try {
      const [res] = await getPool().query(
        `INSERT INTO vehicle_image
           (vehicle_id, object_key, content_type, bytes, caption, sort_order, is_primary)
         VALUES (?, ?, ?, ?, NULL, 0, 0)`,
        [vehicleId, key, contentType, bytes]
      );
      created.push({ vehicle_image_id: res.insertId, object_key: key, content_type: contentType, bytes });
    } catch (e) {
      // Duplicate object_key for same vehicle -> select existing row and return it
      if (e && e.code === 'ER_DUP_ENTRY') {
        const [[row]] = await getPool().query(
          `SELECT vehicle_image_id, object_key, content_type, bytes
           FROM vehicle_image WHERE vehicle_id=? AND object_key=?`,
          [vehicleId, key]
        );
        if (row) created.push(row);
        else throw e;
      } else {
        throw e;
      }
    }
  }
  return created;
}

async function streamVehicleImage(res, vehicleId, imageId) {
  const [[row]] = await getPool().query(
    `SELECT object_key, content_type FROM vehicle_image WHERE vehicle_id=? AND vehicle_image_id=?`,
    [vehicleId, imageId]
  );
  if (!row) return false;
  res.setHeader('Content-Type', row.content_type || 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  bucketPrivate.file(row.object_key)
    .createReadStream()
    .on('error', (e) => { res.statusCode = 500; res.end(e.message); })
    .pipe(res);
  return true;
}

async function setPrimaryImage(vehicleId, imageId) {
  await withTransaction(async (conn) => {
    await conn.query(`UPDATE vehicle_image SET is_primary=0 WHERE vehicle_id=?`, [vehicleId]);
    const [r] = await conn.query(
      `UPDATE vehicle_image SET is_primary=1 WHERE vehicle_id=? AND vehicle_image_id=?`,
      [vehicleId, imageId]
    );
    if (r.affectedRows === 0) throw new Error('Image not found for this vehicle');
  });
}

async function updateImageMeta(vehicleId, imageId, { caption, sort_order }) {
  const fields = [], params = [];
  if (caption !== undefined) { fields.push('caption=?'); params.push(caption); }
  if (sort_order !== undefined) { fields.push('sort_order=?'); params.push(Number(sort_order) || 0); }
  if (!fields.length) return;
  params.push(vehicleId, imageId);
  await getPool().query(
    `UPDATE vehicle_image SET ${fields.join(', ')} WHERE vehicle_id=? AND vehicle_image_id=?`,
    params
  );
}

async function deleteVehicleImage(vehicleId, imageId) {
  const [[row]] = await getPool().query(
    `SELECT object_key FROM vehicle_image WHERE vehicle_id=? AND vehicle_image_id=?`,
    [vehicleId, imageId]
  );
  if (!row) return;
  await bucketPrivate.file(row.object_key).delete().catch(() => {});
  await getPool().query(
    `DELETE FROM vehicle_image WHERE vehicle_id=? AND vehicle_image_id=?`,
    [vehicleId, imageId]
  );
}

module.exports = {
  listVehicleImages,
  uploadVehicleImages,
  streamVehicleImage,
  setPrimaryImage,
  updateImageMeta,
  deleteVehicleImage
};
