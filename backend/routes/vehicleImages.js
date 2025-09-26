// routes/vehicleImages.js
const express = require('express');
const router = express.Router();
const { uploadMemory } = require('../middlewares/upload');
// TODO: add your admin auth middleware here
const {
  listVehicleImages, uploadVehicleImages, streamVehicleImage,
  setPrimaryImage, updateImageMeta, deleteVehicleImage
} = require('../services/vehicleImageService');

router.get('/:id/images', async (req, res) => {
  try {
    const rows = await listVehicleImages(Number(req.params.id));
    const base = `${req.protocol}://${req.get('host')}/api`;
    res.json(rows.map(r => ({
      ...r,
      stream_url: `${base}/vehicleImages/${req.params.id}/images/${r.vehicle_image_id}`
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/images', uploadMemory.array('images', 10), async (req, res) => {
  try {
    const created = await uploadVehicleImages(Number(req.params.id), req.files || []);
    res.json({ created });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/:id/images/:imageId', async (req, res) => {
  const ok = await streamVehicleImage(res, Number(req.params.id), Number(req.params.imageId));
  if (!ok) res.status(404).end();
});

router.post('/:id/images/:imageId/primary', async (req, res) => {
  try { await setPrimaryImage(Number(req.params.id), Number(req.params.imageId)); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/:id/images/:imageId', async (req, res) => {
  try {
    await updateImageMeta(Number(req.params.id), Number(req.params.imageId), {
      caption: req.body.caption,
      sort_order: req.body.sort_order
    });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id/images/:imageId', async (req, res) => {
  try { await deleteVehicleImage(Number(req.params.id), Number(req.params.imageId)); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
