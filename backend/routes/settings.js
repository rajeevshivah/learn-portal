const express  = require('express');
const router   = express.Router();
const asyncHandler = require('express-async-handler');
const Settings = require('../models/Settings');
const { protect, adminOnly } = require('../middleware/auth');
const { uploadImage } = require('../config/cloudinary');

// ── ADMIN: read settings ─────────────────────────────────
router.get('/', protect, adminOnly, asyncHandler(async (req, res) => {
  const settings = await Settings.get();
  res.json(settings);
}));

// ── ADMIN: update settings ───────────────────────────────
router.put('/', protect, adminOnly, asyncHandler(async (req, res) => {
  const settings = await Settings.get();
  ['upiId', 'upiName', 'paymentNote', 'paymentQrUrl'].forEach(f => {
    if (req.body[f] !== undefined) settings[f] = req.body[f];
  });
  await settings.save();
  res.json(settings);
}));

// ── ADMIN: upload a custom payment QR image ──────────────
router.post('/payment-qr', protect, adminOnly, uploadImage.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No image uploaded' });
  const settings = await Settings.get();
  settings.paymentQrUrl = req.file.path;   // Cloudinary URL
  await settings.save();
  res.json(settings);
}));

// ── ADMIN: remove the custom QR (fall back to generated) ──
router.delete('/payment-qr', protect, adminOnly, asyncHandler(async (req, res) => {
  const settings = await Settings.get();
  settings.paymentQrUrl = '';
  await settings.save();
  res.json(settings);
}));

module.exports = router;

