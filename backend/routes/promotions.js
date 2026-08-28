const express   = require('express');
const router    = express.Router();
const Promotion = require('../models/Promotion');
const Roadmap   = require('../models/Roadmap');
const { protect, adminOnly } = require('../middleware/auth');

// Small async wrapper so thrown errors reach the global handler.
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Has this event already happened (or been marked done)? Used to auto-hide.
// endsAt is a virtual on LiveEvent derived from its sessions.
const eventIsOver = (ev) => {
  if (!ev) return true;
  if (ev.isCompleted) return true;
  const ends = ev.endsAt || ev.startsAt;
  if (ends && new Date(ends) < new Date()) return true;
  return false;
};

// Shape a populated promotion into the flat object the funnel page renders.
// Returns null if the promotion can't/shouldn't be shown (missing or dead target).
const shapeForPublic = (p) => {
  if (p.kind === 'course') {
    const c = p.course;
    if (!c || !c.isPublished) return null;   // don't promote unpublished/deleted courses
    return {
      id: p._id,
      kind: 'course',
      headline: p.headline || c.title,
      subtext:  p.subtext  || c.description || '',
      ctaLabel: p.ctaLabel || 'Explore the course',
      href: `/courses/${c.slug}`,
      thumbnail: c.thumbnail || '',
      price: c.isPaid ? c.price : 0,
      isPaid: !!c.isPaid,
    };
  }
  // event
  const e = p.event;
  if (!e || !e.isPublished || eventIsOver(e)) return null;   // AUTO-HIDE past webinars
  return {
    id: p._id,
    kind: 'event',
    headline: p.headline || e.title,
    subtext:  p.subtext  || e.description || '',
    ctaLabel: p.ctaLabel || 'Register for the webinar',
    href: `/live/${e.slug}`,
    thumbnail: e.thumbnail || '',
    startsAt: e.startsAt || null,
    price: e.isPaid ? e.price : 0,
    isPaid: !!e.isPaid,
  };
};

// ── PUBLIC: promotions to show on a given roadmap page ─────
// Resolves global ('all') + page-specific ('selected' containing this roadmap),
// drops dead/unpublished targets, and orders them.
router.get('/public/for-roadmap/:slug', wrap(async (req, res) => {
  const roadmap = await Roadmap.findOne({ slug: req.params.slug, isPublished: true }).select('_id');
  if (!roadmap) return res.json([]);   // no roadmap => nothing to promote, page still works

  const promos = await Promotion.find({
    isActive: true,
    $or: [
      { scope: 'all' },
      { scope: 'selected', roadmaps: roadmap._id },
    ],
  })
    .sort({ order: 1, createdAt: -1 })
    .populate('course', 'title slug description thumbnail isPaid price isPublished')
    .populate('event',  'title slug description thumbnail isPaid price isPublished isCompleted sessions');

  const shaped = promos.map(shapeForPublic).filter(Boolean);
  res.json(shaped);
}));

// ── ADMIN: list all promotions (with target titles + live/expired flag) ──
router.get('/', protect, adminOnly, wrap(async (req, res) => {
  const promos = await Promotion.find()
    .sort({ order: 1, createdAt: -1 })
    .populate('course', 'title slug isPublished')
    .populate('event',  'title slug isPublished isCompleted sessions')
    .populate('roadmaps', 'title slug');

  const shaped = promos.map(p => {
    const obj = p.toObject();
    if (p.kind === 'event') obj.expired = eventIsOver(p.event);
    return obj;
  });
  res.json(shaped);
}));

// ── ADMIN: create ─────────────────────────────────────────
router.post('/', protect, adminOnly, wrap(async (req, res) => {
  const { kind, course, event, headline, subtext, ctaLabel, scope, roadmaps, order } = req.body;
  const promo = await Promotion.create({
    kind,
    course:  kind === 'course' ? (course || null) : null,
    event:   kind === 'event'  ? (event  || null) : null,
    headline: headline || '',
    subtext:  subtext  || '',
    ctaLabel: ctaLabel || '',
    scope:   scope === 'selected' ? 'selected' : 'all',
    roadmaps: scope === 'selected' ? (roadmaps || []) : [],
    order:   order || 0,
  });
  res.status(201).json(promo);
}));

// ── ADMIN: update ─────────────────────────────────────────
router.put('/:id', protect, adminOnly, wrap(async (req, res) => {
  const promo = await Promotion.findById(req.params.id);
  if (!promo) return res.status(404).json({ message: 'Promotion not found' });

  const b = req.body;
  if (b.kind !== undefined)     promo.kind = b.kind;
  if (b.course !== undefined)   promo.course = b.course || null;
  if (b.event !== undefined)    promo.event = b.event || null;
  if (b.headline !== undefined) promo.headline = b.headline;
  if (b.subtext !== undefined)  promo.subtext = b.subtext;
  if (b.ctaLabel !== undefined) promo.ctaLabel = b.ctaLabel;
  if (b.scope !== undefined)    promo.scope = b.scope;
  if (b.roadmaps !== undefined) promo.roadmaps = b.roadmaps || [];
  if (b.isActive !== undefined) promo.isActive = b.isActive;
  if (b.order !== undefined)    promo.order = b.order;

  // keep target consistent with kind
  if (promo.kind === 'course') promo.event = null;
  if (promo.kind === 'event')  promo.course = null;

  await promo.save();
  res.json(promo);
}));

// ── ADMIN: delete ─────────────────────────────────────────
router.delete('/:id', protect, adminOnly, wrap(async (req, res) => {
  const promo = await Promotion.findById(req.params.id);
  if (!promo) return res.status(404).json({ message: 'Promotion not found' });
  await promo.deleteOne();
  res.json({ message: 'Promotion deleted' });
}));

module.exports = router;
