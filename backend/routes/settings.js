const express  = require('express');
const router   = express.Router();
const asyncHandler = require('express-async-handler');
const Settings = require('../models/Settings');
const { protect, adminOnly } = require('../middleware/auth');

// ── ADMIN: read settings ─────────────────────────────────
router.get('/', protect, adminOnly, asyncHandler(async (req, res) => {
  const settings = await Settings.get();
  res.json(settings);
}));

// ── ADMIN: update settings ───────────────────────────────
router.put('/', protect, adminOnly, asyncHandler(async (req, res) => {
  const settings = await Settings.get();
  ['upiId', 'upiName', 'paymentNote'].forEach(f => {
    if (req.body[f] !== undefined) settings[f] = req.body[f];
  });
  await settings.save();
  res.json(settings);
}));

module.exports = router;
