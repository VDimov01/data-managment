// routes/labels.js
const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { bucket } = require('../services/gcs');
const { fetchVehiclesForLabels } = require('../services/labelsdata');
const { ensureVehicleQr } = require('../services/qrUploader'); // you already have this
const router = express.Router();

const mm = v => (v * 72) / 25.4; // mm -> pt
const FONT_PATH = path.join(__dirname, '../assets/fonts/DejaVuSans.ttf');

/**
 * GET /api/labels/vehicles.pdf
 * Query:
 *   - ids=1,2,3  (optional)
 *   - shop_id=... (optional)
 *   - status=Available (optional)
 *   - store=true (optional) => upload resulting PDF to GCS and return JSON {url}
 */
router.get('/vehicles.pdf', async (req, res) => {
  try {
    // Parse query
    const ids = req.query.ids
      ? req.query.ids.split(',').map(s => Number(s)).filter(Boolean)
      : null;
    const shop_id = req.query.shop_id ? Number(req.query.shop_id) : null;
    const status = req.query.status ? String(req.query.status) : null;
    const doStore = String(req.query.store || '').toLowerCase() === 'true';

    // Fetch vehicles
    let rows = await fetchVehiclesForLabels({ ids, shop_id, status });

    // Ensure each has a QR object; generate if missing
    for (const r of rows) {
      if (!r.qr_object_key) {
        await ensureVehicleQr(r.vehicle_id);
        // naive refresh: set a new key (could requery only updated row)
        r.qr_object_key = `qr/veh-${r.vehicle_id}-${r.public_uuid.slice(0,8)}.png`;
      }
    }

    // If storing, we’ll buffer the PDF, upload to GCS, and respond JSON
    if (doStore) {
      const { buffer } = await renderLabelsPdfToBuffer(rows);
      const stamp = new Date().toISOString().slice(0,10).replace(/-/g,'');
      const key = buildLabelsObjectKey({ shop_id, status, ids, stamp });
      const file = bucket.file(key);
      await file.save(buffer, {
        resumable: false,
        contentType: 'application/pdf',
        metadata: { cacheControl: 'public, max-age=31536000, immutable' }
      });
      // generate long-lived signed URL (or makePublic)
      const [signed] = await file.getSignedUrl({ action: 'read', expires: '2099-01-01' });
      res.json({ url: signed, object: key, count: rows.length });
      return;
    }

    // Otherwise stream inline PDF to browser
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="qr-labels.pdf"');
    await renderLabelsPdfToStream(rows, res);
  } catch (e) {
    console.error('[labels] error:', e);
    res.status(500).send(e.message || 'Labels generation failed');
  }
});

function buildLabelsObjectKey({ shop_id, status, ids, stamp }) {
  if (Array.isArray(ids) && ids.length) {
    return `labels/vehicles-${ids.slice(0,10).join('_')}-${stamp}.pdf`;
  }
  const shop = shop_id ? `shop-${shop_id}` : 'all-shops';
  const st = status ? `-${String(status).toLowerCase()}` : '';
  return `labels/${shop}${st}-${stamp}.pdf`;
}

// ===== PDF rendering =====

async function renderLabelsPdfToStream(rows, outStream) {
  const doc = createDoc();
  doc.pipe(outStream);
  await renderGrid(doc, rows);
  doc.end();
}

async function renderLabelsPdfToBuffer(rows) {
  const chunks = [];
  const doc = createDoc();
  doc.on('data', d => chunks.push(d));
  const done = new Promise(resolve => doc.on('end', resolve));
  doc.pipe(fs.createWriteStream('/dev/null')); // noop sink to appease pdfkit
  await renderGrid(doc, rows);
  doc.end();
  await done;
  return { buffer: Buffer.concat(chunks) };
}

function createDoc() {
  const doc = new PDFDocument({ size: 'A4', margin: mm(10) });
  // Font
  if (fs.existsSync(FONT_PATH)) {
    doc.registerFont('DejaVu', FONT_PATH);
    doc.font('DejaVu');
  } else {
    doc.font('Helvetica'); // fallback
  }
  return doc;
}

async function renderGrid(doc, rows) {
  const cellW = mm(50), cellH = mm(65);
  const qrW = mm(46), qrH = mm(46);
  const gap = mm(4);

  const usableW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const cols = Math.max(1, Math.floor((usableW + gap) / (cellW + gap)));

  let x = doc.page.margins.left;
  let y = doc.page.margins.top;
  let col = 0;

  for (const r of rows) {
    if (col >= cols) { col = 0; x = doc.page.margins.left; y += cellH + gap; }
    if (y + cellH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      x = doc.page.margins.left; y = doc.page.margins.top; col = 0;
    }

    // Cell border (thin)
    doc.save().lineWidth(0.5).rect(x, y, cellW, cellH).stroke().restore();

    // QR image from GCS
    if (r.qr_object_key) {
      const [buf] = await bucket.file(r.qr_object_key).download();
      doc.image(buf, x + mm(2), y + mm(2), { width: qrW, height: qrH });
    } else {
      // fallback rectangle
      doc.rect(x + mm(2), y + mm(2), qrW, qrH).stroke();
    }

    // Text (3 lines)
    const centerX = x + cellW / 2;
    let ty = y + mm(2) + qrH + mm(2);
    doc.fontSize(8).fillColor('#000');
    textCentered(doc, safeClamp(r.make, 28), centerX, ty, cellW); ty += mm(5);
    textCentered(doc, safeClamp(`${r.model} ${r.model_year}`, 28), centerX, ty, cellW); ty += mm(5);
    textCentered(doc, safeClamp(r.edition_name, 28), centerX, ty, cellW);

    col += 1; x += cellW + gap;
  }
}

function textCentered(doc, s, cx, y, w) {
  const x = cx - w / 2 + mm(2);
  doc.text(s || '', x, y, { width: w - mm(4), align: 'center' });
}
function safeClamp(s, n = 28) {
  if (!s) return '';
  const t = String(s);
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

module.exports = router;
