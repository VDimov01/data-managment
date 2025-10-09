// backend/routes/carImages.js
const express = require('express');
const multer = require('multer');
const { getPool } = require('../db');

// Reuse the single GCS client + buckets
const { storage, bucketPublic, BUCKET_PUBLIC } = require('../services/gcs');
// Reuse the uploader that already knows how to place files & name them
const { uploadToGCS } = require('../services/gcsUploader');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const pool = getPool();

const VALID_PARTS = new Set(['main', 'exterior', 'interior', 'unsorted']);

// ---- helpers ---------------------------------------------------------------

async function nextSort(conn, editionId, part) {
  const [[row]] = await conn.query(
    'SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM edition_image WHERE edition_id=? AND COALESCE(part,"unsorted")=?',
    [editionId, part || 'unsorted']
  );
  return row?.next || 1;
}

// If you only ever upload to the PUBLIC bucket, we can delete from there.
async function deleteFromPublicBucket(key) {
  if (!key) return;
  try {
    await bucketPublic.file(key).delete();
  } catch (err) {
    if (err?.code === 404) return; // already gone
    throw err;
  }
}

// Optional: derive a GCS object key from a public URL (fallback when gcs_object is null)
function extractKeyFromPublicUrl(url) {
  if (!url) return null;
  try {
    // https://storage.googleapis.com/<bucket>/<key>
    let m = url.match(/^https?:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/i);
    if (m) return { bucket: m[1], key: decodeURIComponent(m[2]) };
    // https://<bucket>.storage.googleapis.com/<key>
    m = url.match(/^https?:\/\/([^./]+)\.storage\.googleapis\.com\/(.+)$/i);
    if (m) return { bucket: m[1], key: decodeURIComponent(m[2]) };
  } catch (_) {}
  return null;
}

// ---- routes ----------------------------------------------------------------

// Upload images into a specific part
// POST /api/car-images/:editionId-:maker-:model-:year-:part
router.post('/:editionId-:maker-:model-:year-:part', upload.array('images', 20), async (req, res) => {
  const { editionId, maker, model, year, part } = req.params;
  const edId = Number(editionId);
  const p = (part || 'unsorted').toLowerCase();
  const effectivePart = VALID_PARTS.has(p) ? p : 'unsorted';

  if (!edId) return res.status(400).json({ error: 'Invalid editionId' });
  if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // If uploading to "main", only first file becomes primary (we clear existing).
    if (effectivePart === 'main') {
      await conn.query('UPDATE edition_image SET is_primary=0 WHERE edition_id=?', [edId]);
    }

    const created = [];
    let primaryUsed = false;

    for (const file of req.files) {
      const { publicUrl, gcsKey } = await uploadToGCS({
        file,
        visibility: 'public',
        maker,
        model,
        year,
        part: effectivePart,
        editionId: edId,
      });

      let rowPart = effectivePart;
      let isPrimary = 0;

      if (effectivePart === 'main' && !primaryUsed) {
        isPrimary = 1;
        primaryUsed = true;
      } else if (effectivePart === 'main') {
        // if extra files go to "main", demote them to unsorted
        rowPart = 'unsorted';
      }

      const sort = await nextSort(conn, edId, rowPart);

      const [r] = await conn.query(
        `INSERT INTO edition_image
           (edition_id, image_url, gcs_object, maker, model, part, year, is_primary, sort_order)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [edId, publicUrl, gcsKey, maker, model, rowPart, Number(year) || null, isPrimary, sort]
      );

      created.push({
        id: r.insertId,
        edition_id: edId,
        image_url: publicUrl,
        gcs_object: gcsKey,
        maker,
        model,
        year: Number(year) || null,
        part: rowPart,
        is_primary: isPrimary,
        sort_order: sort,
      });
    }

    await conn.commit();
    res.json({ success: true, created });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Image upload failed' });
  } finally {
    conn.release();
  }
});

// List images for an edition
// GET /api/car-images/:editionId-:maker-:model-:year
router.get('/:editionId-:maker-:model-:year', async (req, res) => {
  const { editionId, maker, model, year } = req.params;
  const edId = Number(editionId);
  if (!edId) return res.status(400).json({ error: 'Invalid editionId' });

  try {
    const [rows] = await pool.query(
      `SELECT id, edition_id, image_url, gcs_object, maker, model, part, year, is_primary, sort_order, uploaded_at
         FROM edition_image
        WHERE edition_id = ? AND maker = ? AND model = ? AND year = ?
        ORDER BY is_primary DESC,
                 CASE COALESCE(part,'unsorted')
                   WHEN 'main' THEN 0 WHEN 'exterior' THEN 1 WHEN 'interior' THEN 2 ELSE 3 END,
                 sort_order ASC, id ASC`,
      [edId, maker, model, year]
    );
    res.json({ images: rows });
  } catch (err) {
    console.error('Fetch error:', err);
    res.status(500).json({ error: 'Failed to get images' });
  }
});

// Update image meta (part/sort_order/is_primary)
// PATCH /api/car-images/:imageId
router.patch('/:imageId', async (req, res) => {
  const imageId = Number(req.params.imageId);
  const { part, sort_order, is_primary } = req.body || {};
  if (!imageId) return res.status(400).json({ error: 'Invalid image id' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[img]] = await conn.query(
      'SELECT id, edition_id, part, is_primary FROM edition_image WHERE id=?',
      [imageId]
    );
    if (!img) throw new Error('Not found');

    let newPart = (part ?? img.part ?? 'unsorted').toLowerCase();
    if (!VALID_PARTS.has(newPart)) newPart = 'unsorted';

    // If becoming primary OR moving to main -> ensure single primary
    if (is_primary === 1 || (newPart === 'main' && img.part !== 'main')) {
      await conn.query('UPDATE edition_image SET is_primary=0 WHERE edition_id=?', [img.edition_id]);
    }

    const nextPrimary = (is_primary === 1) || (newPart === 'main');
    let newSort = Number.isFinite(Number(sort_order)) ? Number(sort_order) : null;
    if (newSort == null || newSort < 0) {
      newSort = await nextSort(conn, img.edition_id, newPart);
    }

    await conn.query(
      `UPDATE edition_image
          SET part = ?, sort_order = ?, is_primary = ?
        WHERE id = ?`,
      [newPart, newSort, nextPrimary ? 1 : 0, imageId]
    );

    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    console.error('PATCH /car-images/:imageId', e);
    res.status(400).json({ error: e.message || 'Update failed' });
  } finally {
    conn.release();
  }
});

// Delete image (also remove from GCS if we have the key)
// DELETE /api/car-images/:imageId
router.delete('/:imageId', async (req, res) => {
  const imageId = Number(req.params.imageId);
  if (!imageId) return res.status(400).json({ error: 'Invalid image id' });

  try {
    const [[row]] = await pool.query(
      'SELECT id, image_url, gcs_object FROM edition_image WHERE id=?',
      [imageId]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });

    // Prefer stored key; else derive key from URL (assumes public bucket)
    const key = row.gcs_object || extractKeyFromPublicUrl(row.image_url)?.key || null;
    if (key) await deleteFromPublicBucket(key);

    await pool.query('DELETE FROM edition_image WHERE id=?', [imageId]);
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error('DELETE /api/car-images/:imageId', e);
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
