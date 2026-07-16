const express  = require('express');
const router   = express.Router();
const asyncHandler = require('express-async-handler');
const Progress = require('../models/Progress');
const Episode  = require('../models/Episode');
const { protect } = require('../middleware/auth');

// ── Mark an episode complete ─────────────────────────────
router.post('/:episodeId/complete', protect, asyncHandler(async (req, res) => {
  const episode = await Episode.findById(req.params.episodeId);
  if (!episode) return res.status(404).json({ message: 'Episode not found' });
  try {
    await Progress.create({
      user: req.user._id,
      course: episode.course,
      episode: episode._id,
    });
  } catch (e) {
    if (e.code !== 11000) throw e;  // duplicate = already completed, idempotent
  }
  res.status(201).json({ message: 'Marked complete' });
}));

// ── Un-mark (undo) ───────────────────────────────────────
router.delete('/:episodeId/complete', protect, asyncHandler(async (req, res) => {
  await Progress.deleteOne({ user: req.user._id, episode: req.params.episodeId });
  res.json({ message: 'Unmarked' });
}));

// ── My completed episode ids for one course ──────────────
router.get('/course/:courseId', protect, asyncHandler(async (req, res) => {
  const rows = await Progress.find({ user: req.user._id, course: req.params.courseId })
    .select('episode completedAt');
  res.json(rows);
}));

// ── Dashboard summary: per-course progress + last activity ──
router.get('/summary', protect, asyncHandler(async (req, res) => {
  // completed counts per course
  const completed = await Progress.aggregate([
    { $match: { user: req.user._id } },
    { $group: {
        _id: '$course',
        completed: { $sum: 1 },
        lastActivity: { $max: '$completedAt' },
        lastEpisode: { $last: '$episode' },
      } },
  ]);

  // published episode totals per course
  const totals = await Episode.aggregate([
    { $match: { isPublished: true } },
    { $group: { _id: '$course', total: { $sum: 1 } } },
  ]);
  const totalMap = Object.fromEntries(totals.map(t => [String(t._id), t.total]));

  res.json(completed.map(c => ({
    course: c._id,
    completed: c.completed,
    total: totalMap[String(c._id)] || 0,
    lastActivity: c.lastActivity,
    lastEpisode: c.lastEpisode,
  })));
}));

module.exports = router;
