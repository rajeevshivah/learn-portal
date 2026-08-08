const express      = require('express');
const router       = express.Router();
const asyncHandler = require('express-async-handler');
const Suggestion   = require('../models/Suggestion');
const { protect, adminOnly } = require('../middleware/auth');

// Light rate-guard: cap how many a single student can send in a day so the
// admin list doesn't get spammed.
const DAILY_LIMIT = 5;

// ─────────────────────────────────────────────────────────
// STUDENT
// ─────────────────────────────────────────────────────────

// POST /api/suggestions  { text } — submit a topic idea
router.post('/', protect, asyncHandler(async (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ message: 'Please write a topic' });
  if (text.length > 500) return res.status(400).json({ message: 'Keep it under 500 characters' });

  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const todays = await Suggestion.countDocuments({ user: req.user._id, createdAt: { $gte: since } });
  if (todays >= DAILY_LIMIT) {
    return res.status(429).json({ message: "Thanks! You've sent a few already — try again tomorrow." });
  }

  await Suggestion.create({ user: req.user._id, text });
  res.status(201).json({ message: 'Suggestion sent' });
}));

// GET /api/suggestions/mine — this student's own suggestions (so the box can
// confirm what they've sent). Returns just text + date.
router.get('/mine', protect, asyncHandler(async (req, res) => {
  const list = await Suggestion.find({ user: req.user._id })
    .sort({ createdAt: -1 }).limit(10).select('text createdAt');
  res.json(list);
}));

// ─────────────────────────────────────────────────────────
// ADMIN
// ─────────────────────────────────────────────────────────

// GET /api/suggestions/admin/all — every suggestion with who sent it
router.get('/admin/all', protect, adminOnly, asyncHandler(async (req, res) => {
  const list = await Suggestion.find()
    .populate('user', 'name email avatar')
    .sort({ createdAt: -1 });
  res.json(list);
}));

// PUT /api/suggestions/:id/review — toggle reviewed flag
router.put('/:id/review', protect, adminOnly, asyncHandler(async (req, res) => {
  const s = await Suggestion.findById(req.params.id);
  if (!s) return res.status(404).json({ message: 'Not found' });
  s.reviewed = !s.reviewed;
  await s.save();
  res.json(s);
}));

// DELETE /api/suggestions/:id
router.delete('/:id', protect, adminOnly, asyncHandler(async (req, res) => {
  const s = await Suggestion.findByIdAndDelete(req.params.id);
  if (!s) return res.status(404).json({ message: 'Not found' });
  res.json({ message: 'Deleted' });
}));

module.exports = router;
