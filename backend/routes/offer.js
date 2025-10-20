// backend/routes/offers.js
const express = require('express');
const {
  createDraft, listOffers, getOfferByUUID, updateDraftFields,
  addVehicleLine, updateLine, deleteLine,
  renderDraftPdf, issueOffer, reviseOffer, getSignedPdfUrl,
  withdrawOffer
} = require('../services/offers/offerServices');

const router = express.Router();

// Create draft
router.post('/', async (req, res) => {
  try {
    const offer = await createDraft({ ...(req.body || {}), admin_id: req.user?.id || null });
    res.json({ offer });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// List
router.get('/', async (req, res) => {
  try {
    const rows = await listOffers({
      term: req.query.term || null,
      status: req.query.status || null,
      limit: Number(req.query.limit || 25),
      offset: Number(req.query.offset || 0)
    });
    res.json(rows);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Detail
router.get('/:uuid', async (req, res) => {
  try {
    const data = await getOfferByUUID(req.params.uuid);
    if (!data) return res.status(404).end();
    res.json(data);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Update draft fields
router.put('/:uuid', async (req, res) => {
  try {
    await updateDraftFields(req.params.uuid, req.body || {});
    const data = await getOfferByUUID(req.params.uuid);
    res.json(data);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Add vehicle line
router.post('/:uuid/items', async (req, res) => {
  try {
    const { item_type, vehicle_id, quantity, unit_price, description, metadata_json } = req.body || {};
    await addVehicleLine(req.params.uuid, { item_type, vehicle_id, quantity, unit_price, description, metadata_json });
    const data = await getOfferByUUID(req.params.uuid);
    res.json(data);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Update a line
router.put('/:uuid/items/:lineNo', async (req, res) => {
  try {
    await updateLine(req.params.uuid, Number(req.params.lineNo), req.body || {});
    const data = await getOfferByUUID(req.params.uuid);
    res.json(data);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Delete a line
router.delete('/:uuid/items/:lineNo', async (req, res) => {
  try {
    await deleteLine(req.params.uuid, Number(req.params.lineNo));
    const data = await getOfferByUUID(req.params.uuid);
    res.json(data);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Render draft PDF (stores a new 'draft' version and uploads privately)
router.post('/:uuid/render-draft', async (req, res) => {
  try {
    const out = await renderDraftPdf(req.params.uuid, req.user?.id || null);
    res.json(out);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Issue (allocates number, stores 'issued' version)
router.post('/:uuid/issue', async (req, res) => {
  try {
    const out = await issueOffer(req.params.uuid, req.user?.id || null);
    res.json(out);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Mark for revision (unlock for editing)
router.post('/:uuid/revise', async (req, res) => {
  try {
    await reviseOffer(req.params.uuid);
    const data = await getOfferByUUID(req.params.uuid);
    res.json(data);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Signed URL for a specific version
router.get('/:uuid/pdfs/:version/signed-url', async (req, res) => {
  try {
    const url = await getSignedPdfUrl(req.params.uuid, Number(req.params.version), { minutes: Number(req.query.minutes || 10) });
    res.json(url);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Withdraw
router.post('/:uuid/withdraw', async (req, res) => {
  try {
    const out = await withdrawOffer(req.params.uuid, req.user?.id || null);
    res.json(out);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
