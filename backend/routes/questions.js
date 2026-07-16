const express  = require('express');
const router   = express.Router();
const asyncHandler = require('express-async-handler');
const Question = require('../models/Question');
const Episode  = require('../models/Episode');
const { protect, adminOnly } = require('../middleware/auth');
const { hasCourseAccess } = require('../middleware/access');

// Helper — can this user interact with this episode's Q&A?
const canAccessEpisode = async (user, episodeId) => {
  const episode = await Episode.findById(episodeId).populate('course', 'isPaid');
  if (!episode) return { ok: false, code: 404, message: 'Episode not found' };
  const access = await hasCourseAccess(user, episode.course);
  if (!access && !episode.isFreePreview) {
    return { ok: false, code: 403, message: 'Purchase this course to ask doubts' };
  }
  return { ok: true, episode };
};

// ── Ask a doubt ──────────────────────────────────────────
router.post('/', protect, asyncHandler(async (req, res) => {
  const { episodeId, text } = req.body;
  if (!episodeId || !text || !text.trim()) {
    return res.status(400).json({ message: 'Question text is required' });
  }
  const check = await canAccessEpisode(req.user, episodeId);
  if (!check.ok) return res.status(check.code).json({ message: check.message });

  const question = await Question.create({
    user: req.user._id,
    course: check.episode.course._id,
    episode: episodeId,
    text: text.trim(),
  });
  res.status(201).json(question);
}));

// ── Doubts under an episode (visible to everyone with access) ──
router.get('/episode/:episodeId', protect, asyncHandler(async (req, res) => {
  const check = await canAccessEpisode(req.user, req.params.episodeId);
  if (!check.ok) return res.status(check.code).json({ message: check.message });

  const questions = await Question.find({ episode: req.params.episodeId })
    .populate('user', 'name avatar')
    .sort({ createdAt: -1 })
    .limit(100);
  res.json(questions);
}));

// ── Student deletes their own unanswered doubt ───────────
router.delete('/:id', protect, asyncHandler(async (req, res) => {
  const question = await Question.findById(req.params.id);
  if (!question) return res.status(404).json({ message: 'Question not found' });
  const isOwner = String(question.user) === String(req.user._id);
  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && (!isOwner || question.isAnswered)) {
    return res.status(403).json({ message: 'Cannot delete this question' });
  }
  await question.deleteOne();
  res.json({ message: 'Question deleted' });
}));

// ── ADMIN: unanswered queue ──────────────────────────────
router.get('/unanswered', protect, adminOnly, asyncHandler(async (req, res) => {
  const questions = await Question.find({ isAnswered: false })
    .populate('user', 'name email avatar')
    .populate('episode', 'title episodeNumber')
    .populate('course', 'title slug')
    .sort({ createdAt: 1 });   // oldest first
  res.json(questions);
}));

// ── ADMIN: all doubts (history) ──────────────────────────
router.get('/all', protect, adminOnly, asyncHandler(async (req, res) => {
  const questions = await Question.find()
    .populate('user', 'name email')
    .populate('episode', 'title episodeNumber')
    .populate('course', 'title')
    .sort({ createdAt: -1 })
    .limit(200);
  res.json(questions);
}));

// ── ADMIN: answer a doubt ────────────────────────────────
router.put('/:id/answer', protect, adminOnly, asyncHandler(async (req, res) => {
  const { answer } = req.body;
  if (!answer || !answer.trim()) {
    return res.status(400).json({ message: 'Answer text is required' });
  }
  const question = await Question.findById(req.params.id);
  if (!question) return res.status(404).json({ message: 'Question not found' });
  question.answer = answer.trim();
  question.isAnswered = true;
  question.answeredAt = new Date();
  await question.save();
  res.json({ message: 'Answered', question });
}));

module.exports = router;
