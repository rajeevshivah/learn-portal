const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const ApiKey = require('../models/ApiKey');
const { protect, adminOnly, loginOnly } = require('../middleware/auth');

// Access keys are managed only by a signed-in admin on the website (never by a key).
router.use(protect, adminOnly, loginOnly);

const ALLOWED_DAYS = [30, 90, 180, 365];

// ── GET /api/apikeys — my keys (never the secret) ────────
router.get('/', asyncHandler(async (req, res) => {
  const keys = await ApiKey.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json(keys);
}));

// ── POST /api/apikeys — create; the key is returned ONCE ──
// Body: { name, days: 30|90|180|365, write: boolean }
router.post('/', asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  if (!name) return res.status(400).json({ message: 'Give the key a name, e.g. "Claude on my laptop"' });
  const days = Number(req.body.days) || 90;
  if (!ALLOWED_DAYS.includes(days)) return res.status(400).json({ message: 'Expiry must be 30, 90, 180 or 365 days' });

  const token = 'lp_' + crypto.randomBytes(32).toString('hex');
  const key = await ApiKey.create({
    name,
    prefix: token.slice(0, 10),
    digest: crypto.createHash('sha256').update(token).digest('hex'),
    user: req.user._id,
    scopes: req.body.write ? ['read', 'write'] : ['read'],
    expiresAt: new Date(Date.now() + days * 864e5),
  });
  res.status(201).json({ _id: key._id, name: key.name, scopes: key.scopes, expiresAt: key.expiresAt, token });
}));

// ── DELETE /api/apikeys/:id — revoke immediately ─────────
router.delete('/:id', asyncHandler(async (req, res) => {
  const key = await ApiKey.findOne({ _id: req.params.id, user: req.user._id });
  if (!key) return res.status(404).json({ message: 'Key not found' });
  if (!key.revokedAt) { key.revokedAt = new Date(); await key.save(); }
  res.json({ message: 'Key revoked' });
}));

module.exports = router;
