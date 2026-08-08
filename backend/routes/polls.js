const express      = require('express');
const router       = express.Router();
const asyncHandler = require('express-async-handler');
const Poll         = require('../models/Poll');
const { protect, adminOnly } = require('../middleware/auth');

// Shape a poll for the student: include whether THIS user has voted and which
// option they picked, so the client can show the locked live-results view.
const shapeForUser = (poll, userId) => {
  const mine = poll.voters.find(v => String(v.user) === String(userId));
  return {
    _id:        poll._id,
    question:   poll.question,
    options:    poll.options.map(o => ({ _id: o._id, text: o.text, votes: o.votes })),
    totalVotes: poll.totalVotes,
    hasVoted:   !!mine,
    votedOptionId: mine ? String(mine.optionId) : null,
    createdAt:  poll.createdAt,
  };
};

// ─────────────────────────────────────────────────────────
// STUDENT
// ─────────────────────────────────────────────────────────

// GET /api/polls/active — the current active poll (or null)
router.get('/active', protect, asyncHandler(async (req, res) => {
  const poll = await Poll.findOne({ isActive: true }).sort({ createdAt: -1 });
  if (!poll) return res.json(null);
  res.json(shapeForUser(poll, req.user._id));
}));

// POST /api/polls/:id/vote  { optionId } — one locked vote per user
router.post('/:id/vote', protect, asyncHandler(async (req, res) => {
  const { optionId } = req.body;
  const poll = await Poll.findById(req.params.id);
  if (!poll || !poll.isActive) {
    return res.status(404).json({ message: 'Poll not found or closed' });
  }

  // Already voted? Votes are locked — return current results, no change.
  if (poll.voters.some(v => String(v.user) === String(req.user._id))) {
    return res.status(200).json(shapeForUser(poll, req.user._id));
  }

  const option = poll.options.id(optionId);
  if (!option) return res.status(400).json({ message: 'Invalid option' });

  option.votes += 1;
  poll.voters.push({ user: req.user._id, optionId: option._id });
  await poll.save();

  res.json(shapeForUser(poll, req.user._id));
}));

// ─────────────────────────────────────────────────────────
// ADMIN
// ─────────────────────────────────────────────────────────

// GET /api/polls/admin/all — every poll with full tallies
router.get('/admin/all', protect, adminOnly, asyncHandler(async (req, res) => {
  const polls = await Poll.find().sort({ createdAt: -1 });
  res.json(polls);
}));

// POST /api/polls — create a poll. Creating a new active poll deactivates others.
router.post('/', protect, adminOnly, asyncHandler(async (req, res) => {
  const { question, options } = req.body;
  const cleaned = (options || []).map(o => (typeof o === 'string' ? o : o.text))
    .map(t => (t || '').trim()).filter(Boolean);

  if (!question || !question.trim()) {
    return res.status(400).json({ message: 'Question is required' });
  }
  if (cleaned.length < 2 || cleaned.length > 4) {
    return res.status(400).json({ message: 'Provide 2 to 4 options' });
  }

  // Only one active poll at a time.
  await Poll.updateMany({ isActive: true }, { isActive: false });

  const poll = await Poll.create({
    question: question.trim(),
    options:  cleaned.map(text => ({ text, votes: 0 })),
    isActive: true,
  });
  res.status(201).json(poll);
}));

// PUT /api/polls/:id/close — stop showing it to students (keeps results)
router.put('/:id/close', protect, adminOnly, asyncHandler(async (req, res) => {
  const poll = await Poll.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!poll) return res.status(404).json({ message: 'Poll not found' });
  res.json(poll);
}));

// PUT /api/polls/:id/reopen — make it the active poll again
router.put('/:id/reopen', protect, adminOnly, asyncHandler(async (req, res) => {
  await Poll.updateMany({ isActive: true }, { isActive: false });
  const poll = await Poll.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
  if (!poll) return res.status(404).json({ message: 'Poll not found' });
  res.json(poll);
}));

// DELETE /api/polls/:id — remove the poll entirely
router.delete('/:id', protect, adminOnly, asyncHandler(async (req, res) => {
  const poll = await Poll.findByIdAndDelete(req.params.id);
  if (!poll) return res.status(404).json({ message: 'Poll not found' });
  res.json({ message: 'Poll deleted' });
}));

module.exports = router;
