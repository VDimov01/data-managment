const express = require("express");
const multer = require("multer");
const mysql = require("mysql2/promise");
const uploadToGCS = require("../services/gcsUploader");
const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
const IMAGES_BUCKET = process.env.BUCKET_NAME_IMAGES;

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const { getPool } = require('../db');
const pool = getPool();

// Try to extract the object key from a public or signed GCS URL
function extractGcsKeyFromUrl(url) {
  if (!url) return null;
  try {
    // 1) https://storage.googleapis.com/<bucket>/<key>
    const m1 = url.match(/^https?:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/i);
    if (m1 && m1[1] && m1[2]) return { bucket: m1[1], key: decodeURIComponent(m1[2]) };

    // 2) https://<bucket>.storage.googleapis.com/<key>
    const m2 = url.match(/^https?:\/\/([^./]+)\.storage\.googleapis\.com\/(.+)$/i);
    if (m2 && m2[1] && m2[2]) return { bucket: m2[1], key: decodeURIComponent(m2[2]) };

    // 3) Signed URL form .../storage/v1/b/<bucket>/o/<url-encoded key>?...
    const m3 = url.match(/\/storage\/v1\/b\/([^/]+)\/o\/([^?]+)/i);
    if (m3 && m3[1] && m3[2]) return { bucket: m3[1], key: decodeURIComponent(m3[2]) };

  } catch (_) {}
  return null;
}

async function deleteGcsObject({ bucket, key }) {
  const b = bucket || IMAGES_BUCKET;
  if (!b || !key) return;
  try {
    await storage.bucket(b).file(key).delete();
  } catch (err) {
    // If object is already gone, don't fail the whole request
    if (err.code === 404) return;
    throw err;
  }
}

// Upload images for a car
router.post("/:carId-:carMaker-:carModel-:carYear-:carPart", upload.array("images", 10), async (req, res) => {
  const { carId, carMaker, carModel, carYear, carPart } = req.params;
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  try {
    const uploadedImages = [];

    for (const file of req.files) {
      let objectKey = `cars/${carMaker}/${carModel}/${file.originalname}`;

      if (carPart === "exterior") {
    objectKey = `cars/${carMaker}/${carModel} ${carYear}/exterior/${file.originalname}`;
  } else if (carPart === "interior") {
    objectKey = `cars/${carMaker}/${carModel} ${carYear}/interior/${file.originalname}`;
  } else if (carPart === "main") {
    objectKey = `cars/${carMaker}/${carModel} ${carYear}/main/${file.originalname}`;
  }
      // Optionally, you can check if a file with the same name already exists and handle it (e.g., skip, rename, etc.)
      // For simplicity, this example will overwrite existing files with the same name.

      // Upload to GCS
      const imageUrl = await uploadToGCS(file, carId, carMaker, carModel, carYear, carPart);
      await connection.execute(
        "INSERT INTO edition_image (edition_id, image_url, gcs_object, maker, model, part, year) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [carId, imageUrl, objectKey, carMaker, carModel, carPart, carYear]
      );
      uploadedImages.push(imageUrl);
    }

    res.json({ success: true, images: uploadedImages });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Image upload failed" });
  } finally {
    await connection.end();
  }
});

// Get images for a car
router.get("/:carId-:carMaker-:carModel-:carYear", async (req, res) => {
  const { carId, carMaker, carModel, carYear } = req.params;
  const connection = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    const [rows] = await connection.execute(
      "SELECT * FROM edition_image WHERE maker = ? AND model = ? AND year = ? ORDER BY uploaded_at DESC",
      [carMaker, carModel, carYear]
    );

    res.json({ images: rows });
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ error: "Failed to get images" });
  } finally {
    await connection.end();
  }
});

// DELETE /api/edition-images/:imageId
router.delete('/:imageId', async (req, res) => {
  const imageId = Number(req.params.imageId);
  try {
    const [[row]] = await pool.query(
      'SELECT id, image_url, gcs_object FROM edition_image WHERE id=?',
      [imageId]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });

    // Prefer stored key; otherwise try to derive from URL
    let keyInfo = null;
    if (row.gcs_object) {
      keyInfo = { bucket: IMAGES_BUCKET, key: row.gcs_object };
    } else {
      keyInfo = extractGcsKeyFromUrl(row.image_url);
      if (!keyInfo) {
        // If you also saved locally in earlier versions, you can unlink the local file here.
        // Otherwise, proceed to DB delete to avoid being stuck.
        console.warn('Could not derive GCS key from URL; deleting DB row only.');
      }
    }

    if (keyInfo?.key) {
      await deleteGcsObject(keyInfo);
    }

    await pool.query('DELETE FROM edition_image WHERE id=?', [imageId]);
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error('DELETE /api/edition-images/:imageId', e);
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
