const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const Feedback = require('../models/Feedback');
const LiveEvent = require('../models/LiveEvent');
const Registration = require('../models/Registration');
const { protect, adminOnly } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────
// Rules
//  • Only confirmed (active) registrants can rate.
//  • A class can be rated once it has started (students often rate at the end of class)
//    and up to PROMPT_DAYS after it ended — after that it is no longer prompted,
//    but can still be rated from the event page.
//  • The program review opens once half the classes have ended.
// ─────────────────────────────────────────────────────────
const PROMPT_DAYS = 3;
const endOf = (s) => new Date(s.startsAt).getTime() + (s.durationMins || 60) * 60000;
const sorted = (ss) => [...(ss || [])].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
const programReviewOpen = (event, now = Date.now()) => {
  const ss = event.sessions || [];
  if (!ss.length) return false;
  const ended = ss.filter(s => endOf(s) < now).length;
  return event.isCompleted || ended >= Math.ceil(ss.length / 2);
};
const shortName = (name = '') => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Student';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
};
const round1 = (n) => Math.round(n * 10) / 10;

// ── STUDENT: what should I be asked to rate right now? ───
// Returns classes I attended-registered for that started recently and I haven't rated,
// plus any program review that is open and not yet written.
router.get('/pending', protect, asyncHandler(async (req, res) => {
  const regs = await Registration.find({ user: req.user._id, status: 'active' }).select('event');
  if (!regs.length) return res.json({ classes: [], programs: [] });
  const events = await LiveEvent.find({ _id: { $in: regs.map(r => r.event) } })
    .select('title slug sessions isCompleted');
  const mine = await Feedback.find({ user: req.user._id, event: { $in: events.map(e => e._id) } })
    .select('event sessionId');
  const done = new Set(mine.map(f => `${f.event}:${f.sessionId || 'program'}`));
  const now = Date.now();

  const classes = [];
  const programs = [];
  for (const e of events) {
    const ss = sorted(e.sessions);
    ss.forEach((s, i) => {
      const started = new Date(s.startsAt).getTime() <= now;
      const fresh = now - endOf(s) < PROMPT_DAYS * 864e5;
      if (started && fresh && !done.has(`${e._id}:${s._id}`)) {
        classes.push({ eventId: e._id, eventTitle: e.title, eventSlug: e.slug,
          sessionId: s._id, number: i + 1, title: s.title, startsAt: s.startsAt });
      }
    });
    if (programReviewOpen(e, now) && !done.has(`${e._id}:program`)) {
      programs.push({ eventId: e._id, eventTitle: e.title, eventSlug: e.slug, isCompleted: Boolean(e.isCompleted) });
    }
  }
  // Most recent class first; only the latest few to keep the prompt light
  classes.sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));
  res.json({ classes: classes.slice(0, 3), programs });
}));

// ── STUDENT: my feedback for one event ───────────────────
router.get('/mine', protect, asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.query.event)) return res.status(400).json({ message: 'event is required' });
  const rows = await Feedback.find({ user: req.user._id, event: req.query.event })
    .select('sessionId rating comment consentToFeature updatedAt');
  res.json(rows);
}));

// ── STUDENT: submit / edit feedback ──────────────────────
// Body: { eventId, sessionId?, rating 1-5, comment?, consentToFeature? }
router.post('/', protect, asyncHandler(async (req, res) => {
  const { eventId, sessionId } = req.body;
  const rating = Number(req.body.rating);
  if (!mongoose.isValidObjectId(eventId)) return res.status(400).json({ message: 'Event is required' });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ message: 'Pick 1 to 5 stars' });
  const comment = String(req.body.comment || '').trim().slice(0, 600);

  const reg = await Registration.findOne({ user: req.user._id, event: eventId, status: 'active' });
  if (!reg && req.user.role !== 'admin') return res.status(403).json({ message: 'Only registered students can give feedback' });

  const event = await LiveEvent.findById(eventId).select('sessions isCompleted');
  if (!event) return res.status(404).json({ message: 'Event not found' });

  let sid = null;
  if (sessionId) {
    const s = event.sessions.id(sessionId);
    if (!s) return res.status(404).json({ message: 'Class not found' });
    if (new Date(s.startsAt).getTime() > Date.now()) {
      return res.status(400).json({ message: 'You can rate this class once it starts' });
    }
    sid = s._id;
  } else if (!programReviewOpen(event)) {
    return res.status(400).json({ message: 'The program review opens after half the classes are done' });
  }

  const set = { rating, comment, consentToFeature: Boolean(req.body.consentToFeature) };
  // Withdrawing consent removes it from the public page immediately.
  if (!set.consentToFeature) { set.featured = false; set.featuredAt = null; }

  let fb;
  try {
    fb = await Feedback.findOneAndUpdate(
      { user: req.user._id, event: eventId, sessionId: sid },
      { $set: set, $setOnInsert: { user: req.user._id, event: eventId, sessionId: sid } },
      { upsert: true, new: true, runValidators: true },
    );
  } catch (e) {
    if (e.code !== 11000) throw e; // double-tap race → retry as plain update
    fb = await Feedback.findOneAndUpdate({ user: req.user._id, event: eventId, sessionId: sid }, { $set: set }, { new: true });
  }
  res.status(201).json({ message: 'Thanks for the feedback!', feedback: fb });
}));

// ── PUBLIC: testimonials + rating for marketing pages ────
// Featured reviews only (student consented + admin featured). Names shortened.
router.get('/public', asyncHandler(async (req, res) => {
  const limit = Math.min(12, Math.max(1, Number(req.query.limit) || 6));
  const [stats] = await Feedback.aggregate([
    { $match: { hidden: false } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 }, students: { $addToSet: '$user' } } },
    { $project: { avg: 1, count: 1, students: { $size: '$students' } } },
  ]);
  const featured = await Feedback.find({ featured: true, consentToFeature: true, hidden: false })
    .sort({ featuredAt: -1 }).limit(limit)
    .populate('user', 'name avatar')
    .populate('event', 'title');
  res.json({
    average: stats ? round1(stats.avg) : null,
    ratings: stats ? stats.count : 0,
    students: stats ? stats.students : 0,
    testimonials: featured.map(f => ({
      id: f._id,
      name: shortName(f.user?.name),
      avatar: f.user?.avatar || '',
      rating: f.rating,
      comment: f.comment,
      program: f.event?.title || '',
    })),
  });
}));

// ─────────────────────────────────────────────────────────
// ADMIN
// ─────────────────────────────────────────────────────────

// ── Per-class summary for one event ──────────────────────
router.get('/admin/summary/:eventId', protect, adminOnly, asyncHandler(async (req, res) => {
  const event = await LiveEvent.findById(req.params.eventId).select('title sessions');
  if (!event) return res.status(404).json({ message: 'Event not found' });
  const regCount = await Registration.countDocuments({ event: event._id, status: 'active' });
  const rows = await Feedback.aggregate([
    { $match: { event: event._id, hidden: false } },
    { $group: {
        _id: '$sessionId', avg: { $avg: '$rating' }, count: { $sum: 1 },
        r1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
        r2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
        r3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
        r4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
        r5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
        comments: { $sum: { $cond: [{ $gt: [{ $strLenCP: '$comment' }, 0] }, 1, 0] } },
      } },
  ]);
  const by = new Map(rows.map(r => [String(r._id), r]));
  const shape = (r) => r ? {
    average: round1(r.avg), count: r.count, comments: r.comments,
    distribution: { 1: r.r1, 2: r.r2, 3: r.r3, 4: r.r4, 5: r.r5 },
  } : { average: null, count: 0, comments: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  const now = Date.now();
  res.json({
    eventId: event._id, title: event.title, confirmedStudents: regCount,
    program: shape(by.get('null')),
    classes: sorted(event.sessions).map((s, i) => ({
      sessionId: s._id, number: i + 1, title: s.title, startsAt: s.startsAt,
      started: new Date(s.startsAt).getTime() <= now, ...shape(by.get(String(s._id))),
    })),
  });
}));

// ── List individual feedback (filterable) ────────────────
// ?event=&session=<id>|program&maxRating=&withComment=1&featured=1&consented=1
router.get('/admin/list', protect, adminOnly, asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.event) q.event = req.query.event;
  if (req.query.session === 'program') q.sessionId = null;
  else if (req.query.session) q.sessionId = req.query.session;
  if (req.query.maxRating) q.rating = { $lte: Number(req.query.maxRating) };
  if (req.query.withComment === '1') q.comment = { $ne: '' };
  if (req.query.featured === '1') q.featured = true;
  if (req.query.consented === '1') q.consentToFeature = true;
  const rows = await Feedback.find(q)
    .sort({ createdAt: -1 }).limit(300)
    .populate('user', 'name email avatar')
    .populate('event', 'title sessions');
  res.json(rows.map(f => {
    const s = f.sessionId && f.event?.sessions ? f.event.sessions.id(f.sessionId) : null;
    return {
      _id: f._id, rating: f.rating, comment: f.comment,
      student: f.user?.name, email: f.user?.email, avatar: f.user?.avatar,
      event: f.event?._id, eventTitle: f.event?.title,
      sessionId: f.sessionId, classTitle: f.sessionId ? (s?.title || 'Removed class') : 'Program review',
      consentToFeature: f.consentToFeature, featured: f.featured, hidden: f.hidden,
      createdAt: f.createdAt, updatedAt: f.updatedAt,
    };
  }));
}));

// ── Feature / unfeature / hide ───────────────────────────
// Body: { featured?: boolean, hidden?: boolean }
router.put('/admin/:id', protect, adminOnly, asyncHandler(async (req, res) => {
  const fb = await Feedback.findById(req.params.id);
  if (!fb) return res.status(404).json({ message: 'Feedback not found' });
  if (req.body.featured !== undefined) {
    if (req.body.featured && !fb.consentToFeature) {
      return res.status(400).json({ message: 'This student did not allow publishing their review' });
    }
    if (req.body.featured && !fb.comment) {
      return res.status(400).json({ message: 'Only reviews with a written comment can be featured' });
    }
    fb.featured = Boolean(req.body.featured);
    fb.featuredAt = fb.featured ? new Date() : null;
  }
  if (req.body.hidden !== undefined) {
    fb.hidden = Boolean(req.body.hidden);
    if (fb.hidden) { fb.featured = false; fb.featuredAt = null; }
  }
  await fb.save();
  res.json(fb);
}));

module.exports = router;
