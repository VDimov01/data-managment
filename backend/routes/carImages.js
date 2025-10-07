// backend/routes/carImages.js
const express = require("express");
const multer = require("multer");
const { Storage } = require("@google-cloud/storage");
const { getPool } = require("../db");
const uploadToGCS = require("../services/gcsUploader");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const pool = getPool();
const storage = new Storage();
// use your actual public bucket var; your old code used BUCKET_NAME_IMAGES inconsistently
const PUBLIC_BUCKET = process.env.BUCKET_PUBLIC;

const VALID_PARTS = new Set(["main", "exterior", "interior", "unsorted"]);

// --- helpers ---
function extractGcsKeyFromUrl(url) {
  if (!url) return null;
  try {
    let m = url.match(/^https?:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/i);
    if (m) return { bucket: m[1], key: decodeURIComponent(m[2]) };
    m = url.match(/^https?:\/\/([^./]+)\.storage\.googleapis\.com\/(.+)$/i);
    if (m) return { bucket: m[1], key: decodeURIComponent(m[2]) };
    m = url.match(/\/storage\/v1\/b\/([^/]+)\/o\/([^?]+)/i);
    if (m) return { bucket: m[1], key: decodeURIComponent(m[2]) };
  } catch (_) {}
  return null;
}

async function deleteGcsObject({ bucket, key }) {
  const b = bucket || PUBLIC_BUCKET;
  if (!b || !key) return;
  try {
    await storage.bucket(b).file(key).delete();
  } catch (err) {
    if (err.code === 404) return;
    throw err;
  }
}

async function nextSort(conn, editionId, part) {
  const [[row]] = await conn.query(
    "SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM edition_image WHERE edition_id=? AND COALESCE(part,'unsorted')=?",
    [editionId, part || "unsorted"]
  );
  return row?.next || 1;
}

// --- Upload images (staging or directly into a part) ---
// POST /api/car-images/:editionId-:maker-:model-:year-:part
router.post("/:editionId-:maker-:model-:year-:part", upload.array("images", 20), async (req, res) => {
  const { editionId, maker, model, year, part } = req.params;
  const edId = Number(editionId);
  const p = (part || "unsorted").toLowerCase();
  const effectivePart = VALID_PARTS.has(p) ? p : "unsorted";

  if (!edId) return res.status(400).json({ error: "Invalid editionId" });
  if (!req.files?.length) return res.status(400).json({ error: "No files uploaded" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // If uploading into 'main': we’ll promote ONLY the first file to primary.
    if (effectivePart === "main") {
      await conn.query("UPDATE edition_image SET is_primary=0 WHERE edition_id=?", [edId]);
    }

    const created = [];
    let primaryUsed = false;

    for (const file of req.files) {
      // Upload to public GCS; your uploader returns a public URL
      const imageUrl = await uploadToGCS(file, edId, maker, model, year, effectivePart);

      // Decide flags & part for this specific file
      let rowPart = effectivePart;
      let isPrimary = 0;
      if (effectivePart === "main" && !primaryUsed) {
        isPrimary = 1;
        primaryUsed = true;
      } else if (effectivePart === "main") {
        // extra files shoved into 'main' are pointless; push to unsorted
        rowPart = "unsorted";
      }

      const sort = await nextSort(conn, edId, rowPart);
      // Try to derive object key (optional)
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
    console.error("Upload error:", err);
    res.status(500).json({ error: "Image upload failed" });
  } finally {
    conn.release();
  }
});

// --- List images for an edition ---
// GET /api/car-images/:editionId-:maker-:model-:year
router.get("/:editionId-:maker-:model-:year", async (req, res) => {
  const { editionId, maker, model, year } = req.params;
  const edId = Number(editionId);
  if (!edId) return res.status(400).json({ error: "Invalid editionId" });

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
    // console.log("Fetched images for edition", edId, rows);
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ error: "Failed to get images" });
  }
});

// --- PATCH meta (part, sort_order, is_primary) ---
// PATCH /api/car-images/:imageId
router.patch("/:imageId", async (req, res) => {
  const imageId = Number(req.params.imageId);
  const { part, sort_order, is_primary } = req.body || {};
  if (!imageId) return res.status(400).json({ error: "Invalid image id" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[img]] = await conn.query("SELECT id, edition_id, part, is_primary FROM edition_image WHERE id=?", [imageId]);
    if (!img) throw new Error("Not found");

    let newPart = (part ?? img.part ?? "unsorted").toLowerCase();
    if (!VALID_PARTS.has(newPart)) newPart = "unsorted";

    // If becoming primary -> one per edition
    if (is_primary === 1 || (newPart === "main" && img.part !== "main")) {
      await conn.query("UPDATE edition_image SET is_primary=0 WHERE edition_id=?", [img.edition_id]);
    }

    // If moving into main and not explicitly asked for is_primary, make it primary.
    const nextPrimary = (is_primary === 1) || (newPart === "main");

    // If changing part AND no sort supplied -> append at end of that part
    let newSort = Number.isFinite(Number(sort_order)) ? Number(sort_order) : null;
    if (newSort == null || newSort < 0) {
      newSort = await nextSort(conn, img.edition_id, newPart);
    }

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
    console.error("PATCH /car-images/:imageId", e);
    res.status(400).json({ error: e.message || "Update failed" });
  } finally {
    conn.release();
  }
});

// --- DELETE image (also remove GCS object if known) ---
router.delete("/:imageId", async (req, res) => {
  const imageId = Number(req.params.imageId);
  try {
    const [[row]] = await pool.query(
      "SELECT id, image_url, gcs_object FROM edition_image WHERE id=?", [imageId]
    );
    if (!row) return res.status(404).json({ error: "Not found" });

    // prefer stored key; otherwise try to derive
    let keyInfo = row.gcs_object
      ? { bucket: PUBLIC_BUCKET, key: row.gcs_object }
      : extractGcsKeyFromUrl(row.image_url);

    if (keyInfo?.key) await deleteGcsObject(keyInfo);

    await pool.query("DELETE FROM edition_image WHERE id=?", [imageId]);
    res.json({ message: "Deleted" });
  } catch (e) {
    console.error("DELETE /api/car-images/:imageId", e);
    res.status(500).json({ error: "Delete failed" });
  }
});

module.exports = router;
