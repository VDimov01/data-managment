// backend/routes/carImages.js
const express = require('express');
const multer = require('multer');
const { getPool } = require('../db');
const uploadToGCS = require('../services/gcsUploader');
const { storage, BUCKET_PUBLIC } = require('../services/gcs'); // <<< use shared

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const pool = getPool();
const VALID_PARTS = new Set(['main','exterior','interior','unsorted']);

function extractGcsKeyFromUrl(url) {
  if (!url) return null;
  let m = url.match(/^https?:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/i);
  if (m) return { bucket: m[1], key: decodeURIComponent(m[2]) };
  m = url.match(/^https?:\/\/([^./]+)\.storage\.googleapis\.com\/(.+)$/i);
  if (m) return { bucket: m[1], key: decodeURIComponent(m[2]) };
  m = url.match(/\/storage\/v1\/b\/([^/]+)\/o\/([^?]+)/i);
  if (m) return { bucket: m[1], key: decodeURIComponent(m[2]) };
  return null;
}

async function deleteGcsObject({ bucket, key }) {
  const b = bucket || BUCKET_PUBLIC;
  if (!b || !key) return;
  try { await storage.bucket(b).file(key).delete(); }
  catch (err) { if (err.code !== 404) throw err; }
}

async function nextSort(conn, editionId, part) {
  const [[row]] = await conn.query(
    'SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM edition_image WHERE edition_id=? AND COALESCE(part,"unsorted")=?',
    [editionId, part || 'unsorted']
  );
  return row?.next || 1;
}

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

    if (effectivePart === 'main') {
      await conn.query('UPDATE edition_image SET is_primary=0 WHERE edition_id=?', [edId]);
    }

    const created = [];
    let primaryUsed = false;

    for (const file of req.files) {
      const imageUrl = await uploadToGCS(file, edId, maker, model, year, effectivePart);

      let rowPart = effectivePart;
      let isPrimary = 0;
      if (effectivePart === 'main' && !primaryUsed) {
        isPrimary = 1; primaryUsed = true;
      } else if (effectivePart === 'main') {
        rowPart = 'unsorted';
      }

      const sort = await nextSort(conn, edId, rowPart);
      const keyInfo = extractGcsKeyFromUrl(imageUrl);
      const gcsKey = keyInfo?.key || null;

      const [r] = await conn.query(
        `INSERT INTO edition_image
           (edition_id, image_url, gcs_object, maker, model, part, year, is_primary, sort_order)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [edId, imageUrl, gcsKey, maker, model, rowPart, Number(year) || null, isPrimary, sort]
      );

      created.push({ id: r.insertId, image_url: imageUrl, part: rowPart, is_primary: isPrimary, sort_order: sort });
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

// GET /api/car-images/:editionId-:maker-:model-:year
router.get('/:editionId-:maker-:model-:year', async (req, res) => {
  const { editionId, maker, model, year } = req.params;
  const edId = Number(editionId);
  if (!edId) return res.status(400).json({ error: 'Invalid editionId' });

  try {
    const [rows] = await pool.query(
      `SELECT id, edition_id, image_url, gcs_object, maker, model, part, year, is_primary, sort_order, uploaded_at
         FROM edition_image
        WHERE maker=? AND model=? AND year=?
        ORDER BY is_primary DESC,
                 CASE COALESCE(part,'unsorted')
                   WHEN 'main' THEN 0 WHEN 'exterior' THEN 1 WHEN 'interior' THEN 2 ELSE 3 END,
                 sort_order ASC, id ASC`,
      [maker, model, year]
    );
    res.json({ images: rows });
  } catch (err) {
    console.error('Fetch error:', err);
    res.status(500).json({ error: 'Failed to get images' });
  }
});

// PATCH /api/car-images/:imageId
router.patch('/:imageId', async (req, res) => {
  const imageId = Number(req.params.imageId);
  const { part, sort_order, is_primary } = req.body || {};
  if (!imageId) return res.status(400).json({ error: 'Invalid image id' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[img]] = await conn.query('SELECT id, edition_id, part, is_primary FROM edition_image WHERE id=?', [imageId]);
    if (!img) throw new Error('Not found');

    let newPart = (part ?? img.part ?? 'unsorted').toLowerCase();
    if (!VALID_PARTS.has(newPart)) newPart = 'unsorted';

    if (is_primary === 1 || (newPart === 'main' && img.part !== 'main')) {
      await conn.query('UPDATE edition_image SET is_primary=0 WHERE edition_id=?', [img.edition_id]);
    }

    const nextPrimary = (is_primary === 1) || (newPart === 'main');

    let newSort = Number.isFinite(Number(sort_order)) ? Number(sort_order) : null;
    if (newSort == null || newSort < 0) newSort = await nextSort(conn, img.edition_id, newPart);

    await conn.query(
      `UPDATE edition_image
          SET part=?, sort_order=?, is_primary=?
        WHERE id=?`,
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

// DELETE /api/car-images/:imageId
router.delete('/:imageId', async (req, res) => {
  const imageId = Number(req.params.imageId);
  try {
    const [[row]] = await pool.query(
      'SELECT id, image_url, gcs_object FROM edition_image WHERE id=?', [imageId]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });

    const keyInfo = row.gcs_object
      ? { bucket: BUCKET_PUBLIC, key: row.gcs_object }
      : extractGcsKeyFromUrl(row.image_url);

    if (keyInfo?.key) await deleteGcsObject(keyInfo);

    await pool.query('DELETE FROM edition_image WHERE id=?', [imageId]);
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error('DELETE /api/car-images/:imageId', e);
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
