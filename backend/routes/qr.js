// routes/qr.js
const express = require('express');
const router = express.Router();
const { ensureVehicleQr, backfillVehicleQrs } = require('../services/qrUploader');
const { bucketPrivate } = require('../services/gcs');
const { getPool } = require('../db');

// TODO: add your admin auth middleware here

router.post('/vehicles/:id', async (req, res) => {
  try {
    const out = await ensureVehicleQr(Number(req.params.id));
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/vehicles/:id/qr.png', async (req, res) => {
  const id = Number(req.params.id);
  const [[row]] = await getPool().query(
    'SELECT qr_object_key FROM vehicle WHERE vehicle_id=?', [id]
  );
  if (!row) return res.status(404).end();

  let key = row.qr_object_key;
  if (!key) {
    // generate once if missing
    await ensureVehicleQr(id);
    const [[r2]] = await getPool().query(
      'SELECT qr_object_key FROM vehicle WHERE vehicle_id=?', [id]
    );
    key = r2?.qr_object_key;
    if (!key) return res.status(500).send('QR key missing after generation');
  }

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
  bucketPrivate.file(key).createReadStream()
    .on('error', (e) => res.status(500).end(e.message))
    .pipe(res);
});

router.post('/vehicles/qrs/backfill', async (req, res) => {
  try {
    const out = await backfillVehicleQrs();
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
