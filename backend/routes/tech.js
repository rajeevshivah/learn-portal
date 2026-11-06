// ─────────────────────────────────────────────────────────
// Tech feed: news + hackathons personalised by career goal (utils/techFeed.js)
// ─────────────────────────────────────────────────────────
const express      = require('express');
const router       = express.Router();
const asyncHandler = require('express-async-handler');
const { protect, adminOnly } = require('../middleware/auth');
const TechItem   = require('../models/TechItem');
const TechSource = require('../models/TechSource');
const User       = require('../models/User');
const Settings   = require('../models/Settings');
const feed       = require('../utils/techFeed');
const { TRACKS, TRACK_IDS, tracksByKeywords, labelOf } = require('../utils/techTracks');
const { techAccess, grantPass, passSettings } = require('../utils/techAccess');
const TechPass   = require('../models/TechPass');

const okUrl = (u) => { try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; } };
const goalOf = (u) => ({
  tracks: u.techGoal?.tracks || [], custom: u.techGoal?.custom || '', keywords: u.techGoal?.keywords || [],
  city: u.techGoal?.city || '', state: u.techGoal?.state || '',
});
// Without access, students see headlines; the personal tip is replaced by a teaser.
const lockTips = (items) => items.map(it => ({
  ...it, insight: it.insight ? { locked: true, label: it.insight.label } : null,
}));

// ── GET /api/tech/tracks — the goals a student can pick ──
router.get('/tracks', protect, (req, res) => res.json(TRACKS.map(({ id, label }) => ({ id, label }))));

// ── GET /api/tech/goal  ·  PUT /api/tech/goal { tracks: [...], custom: "" } ──
router.get('/goal', protect, asyncHandler(async (req, res) => {
  const u = await User.findById(req.user._id).select('techGoal');
  res.json({ ...goalOf(u), set: Boolean(u.techGoal?.setAt) });
}));

router.put('/goal', protect, asyncHandler(async (req, res) => {
  const picked = [...new Set((Array.isArray(req.body.tracks) ? req.body.tracks : []).filter(t => TRACK_IDS.includes(t)))].slice(0, 5);
  const custom = String(req.body.custom || '').trim().slice(0, 80);
  if (!picked.length && !custom) return res.status(400).json({ message: 'Pick at least one goal, or type your own' });

  const u = await User.findById(req.user._id).select('techGoal');
  let keywords = [];
  let tracks = picked;
  if (custom) {
    const sameAsBefore = custom === (u.techGoal?.custom || '');
    const mapped = sameAsBefore ? { tracks: [], keywords: u.techGoal.keywords || [] } : await feed.mapCustomGoal(custom);
    keywords = mapped.keywords;
    tracks = [...new Set([...picked, ...mapped.tracks])].slice(0, 6);
  }
  u.techGoal = { ...(u.techGoal?.toObject?.() || u.techGoal || {}), tracks, custom, keywords, setAt: new Date() };
  await u.save();
  res.json({ ...goalOf(u), set: true });
}));

// ── PUT /api/tech/location { city, state } — optional, for "near you" events ("" clears) ──
router.put('/location', protect, asyncHandler(async (req, res) => {
  const city = String(req.body.city || '').trim().slice(0, 60);
  const state = String(req.body.state || '').trim().slice(0, 60);
  const u = await User.findById(req.user._id).select('techGoal');
  u.techGoal = { ...(u.techGoal?.toObject?.() || {}), city, state };
  await u.save();
  res.json({ ...goalOf(u), set: Boolean(u.techGoal?.setAt) });
}));

// ── GET /api/tech/access — tips unlocked? and the pass on offer ──
router.get('/access', protect, asyncHandler(async (req, res) => {
  const a = await techAccess(req.user);
  res.json({ full: a.full, reason: a.reason, label: a.label, passUntil: a.passUntil || null,
    offer: a.full || !a.pass.enabled ? null : { price: a.pass.price, days: a.pass.days, freeForPaid: a.pass.freeForPaid } });
}));

// ── GET /api/tech/summary — the one-line strip on Home ──
router.get('/summary', protect, asyncHandler(async (req, res) => {
  const u = await User.findById(req.user._id).select('techGoal');
  if (!u.techGoal?.setAt) return res.json({ goalSet: false });
  feed.refreshIfStale().catch(() => {});
  const goal = goalOf(u);
  const [news, events] = await Promise.all([
    feed.forStudent(goal, { kind: 'news', limit: 200 }),
    feed.forStudent(goal, { kind: 'event', limit: 200 }),
  ]);
  const since = Date.now() - 2 * 864e5;
  const week = Date.now() + 7 * 864e5;
  res.json({
    goalSet: true,
    following: [...goal.tracks.map(labelOf), goal.custom].filter(Boolean),
    newForYou: news.items.filter(i => new Date(i.publishedAt) > since).length,
    closingThisWeek: events.items.filter(i => i.deadline && new Date(i.deadline) < week).length,
    nearYou: events.items.filter(i => i.near).length,
    city: goal.city,
  });
}));

// ── GET /api/tech/feed?kind=news|event&scope=mine|all&track=&skip=&limit= ──
// Refreshes itself in the background when the feed is a few hours old.
router.get('/feed', protect, asyncHandler(async (req, res) => {
  const refreshing = await feed.refreshIfStale();
  const u = await User.findById(req.user._id).select('techGoal');
  const kind = req.query.kind === 'event' ? 'event' : 'news';
  const scope = req.query.scope === 'all' ? 'all' : 'mine';
  const track = TRACK_IDS.includes(req.query.track) ? req.query.track : '';
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  const skip = Math.max(Number(req.query.skip) || 0, 0);
  const goal = goalOf(u);
  const out = await feed.forStudent(goal, { scope: goal.tracks.length || goal.keywords.length ? scope : 'all', kind, track, limit, skip });
  const access = await techAccess(req.user);
  res.json({ ...out, items: access.full ? out.items : lockTips(out.items), locked: !access.full, refreshing, goalSet: Boolean(u.techGoal?.setAt) });
}));

// ─────────────────────────────────────────────────────────
// ADMIN
// ─────────────────────────────────────────────────────────

// ── GET /api/tech/admin/status ──
router.get('/admin/status', protect, adminOnly, asyncHandler(async (req, res) => {
  await feed.ensureSources();
  const s = await Settings.get();
  const [sources, news, events, untagged, students] = await Promise.all([
    TechSource.find().sort({ kind: 1, createdAt: 1 }),
    TechItem.countDocuments({ kind: 'news', hidden: false }),
    TechItem.countDocuments({ kind: 'event', hidden: false, $or: [{ deadline: { $gte: new Date() } }, { deadline: null }] }),
    TechItem.countDocuments({ aiDone: false, aiTries: { $lt: 2 } }),
    User.countDocuments({ 'techGoal.setAt': { $ne: null } }),
  ]);
  const tally = {};
  (await User.find({ 'techGoal.setAt': { $ne: null } }).select('techGoal.tracks').lean())
    .forEach(u => (u.techGoal?.tracks || []).forEach(t => { tally[t] = (tally[t] || 0) + 1; }));
  const goals = Object.entries(tally).map(([_id, n]) => ({ _id, n }));
  const today = new Date().toISOString().slice(0, 10);
  const activePasses = await TechPass.distinct('user', { expiresAt: { $gt: new Date() } });
  const bought = await TechPass.find({ source: 'purchase' }).select('amount').lean();
  const sold = [{ n: bought.length, total: bought.reduce((t, p) => t + (p.amount || 0), 0) }];
  res.json({
    pass: { ...passSettings(s), active: activePasses.length, sold: sold[0]?.n || 0, revenue: sold[0]?.total || 0 },
    lastRefreshAt: s.techLastRefreshAt, refreshing: feed.isRefreshing(), refreshEveryHours: feed.REFRESH_HOURS,
    ai: { enabled: feed.aiEnabled(), today: s.techAi?.day === today ? s.techAi.articles : 0, dailyCap: Number(process.env.TECH_AI_DAILY_ARTICLES || 80), lastError: s.techAi?.lastError || '', waiting: untagged },
    counts: { news, events, studentsWithGoal: students },
    goals: goals.sort((a, b) => b.n - a.n).map(g => ({ track: g._id, label: TRACKS.find(t => t.id === g._id)?.label || g._id, students: g.n })),
    sources,
  });
}));

// ── POST /api/tech/admin/refresh — fetch now (waits for it) ──
router.post('/admin/refresh', protect, adminOnly, asyncHandler(async (req, res) => {
  const r = await feed.refresh();
  res.json({ message: `${r.added} new item${r.added === 1 ? '' : 's'} fetched${r.ai?.tagged ? `, ${r.ai.tagged} summarised by AI` : ''}${r.ai?.error ? `. AI: ${r.ai.error}` : r.ai?.skipped ? `. AI skipped: ${r.ai.skipped}` : ''}.`, ...r });
}));

// ── GET /api/tech/admin/items?kind=&q=&hidden= ──
router.get('/admin/items', protect, adminOnly, asyncHandler(async (req, res) => {
  const filter = {};
  if (['news', 'event'].includes(req.query.kind)) filter.kind = req.query.kind;
  if (req.query.hidden === 'true') filter.hidden = true;
  if (req.query.q) filter.title = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const items = await TechItem.find(filter).sort(filter.kind === 'event' ? { deadline: 1 } : { pinned: -1, publishedAt: -1 }).limit(100);
  res.json(items);
}));

// ── PUT /api/tech/admin/items/:id — hide / pin / edit ──
const EDITABLE = ['title', 'url', 'summary', 'tracks', 'importance', 'pinned', 'hidden', 'startsAt', 'endsAt', 'deadline', 'mode', 'location', 'prize', 'organizer', 'imageUrl'];
function cleanItemBody(b) {
  const out = {};
  for (const k of EDITABLE) if (b[k] !== undefined) out[k] = b[k];
  if (out.url !== undefined && !okUrl(out.url)) throw Object.assign(new Error('Link must be a full https:// address'), { status: 400 });
  if (out.tracks !== undefined) out.tracks = (Array.isArray(out.tracks) ? out.tracks : []).filter(t => t === 'general' || TRACK_IDS.includes(t)).slice(0, 4);
  for (const d of ['startsAt', 'endsAt', 'deadline']) if (out[d] !== undefined) out[d] = out[d] ? new Date(out[d]) : null;
  if (out.importance !== undefined) out.importance = Math.min(5, Math.max(1, Number(out.importance) || 3));
  return out;
}
router.put('/admin/items/:id', protect, adminOnly, asyncHandler(async (req, res) => {
  let body;
  try { body = cleanItemBody(req.body); } catch (e) { return res.status(e.status || 400).json({ message: e.message }); }
  const it = await TechItem.findByIdAndUpdate(req.params.id, { $set: body }, { new: true, runValidators: true });
  if (!it) return res.status(404).json({ message: 'Item not found' });
  res.json(it);
}));

router.delete('/admin/items/:id', protect, adminOnly, asyncHandler(async (req, res) => {
  const it = await TechItem.findById(req.params.id);
  if (!it) return res.status(404).json({ message: 'Item not found' });
  if (!it.manual) return res.status(400).json({ message: 'Fetched items come back on the next refresh if deleted. Hide it instead.' });
  await it.deleteOne();
  res.json({ message: 'Deleted' });
}));

// ── POST /api/tech/admin/items — add a hackathon/event (or a news link) by hand ──
// Body: { kind: 'event'|'news', title, url, summary?, tracks?, deadline?, startsAt?, endsAt?, mode?, location?, prize?, organizer?, pinned? }
router.post('/admin/items', protect, adminOnly, asyncHandler(async (req, res) => {
  const kind = req.body.kind === 'news' ? 'news' : 'event';
  let body;
  try { body = cleanItemBody(req.body); } catch (e) { return res.status(e.status || 400).json({ message: e.message }); }
  if (!body.title || !body.url) return res.status(400).json({ message: 'Title and link are required' });
  if (kind === 'event' && !body.deadline && !body.startsAt) return res.status(400).json({ message: 'Add the registration deadline or the start date' });
  if (!body.tracks?.length) body.tracks = tracksByKeywords(`${body.title} ${body.summary || ''}`);
  if (!body.tracks.length) body.tracks = ['general'];
  try {
    const it = await TechItem.create({
      ...body, kind, manual: true, source: 'Shared by Rajeev sir', publishedAt: new Date(),
      importance: body.importance || 4, aiDone: true,   // you wrote it: no AI pass needed
    });
    res.status(201).json(it);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: 'That link is already in the feed' });
    throw e;
  }
}));

// ── Sources: switch on/off, add an RSS feed, remove one you added ──
router.put('/admin/sources/:id', protect, adminOnly, asyncHandler(async (req, res) => {
  const src = await TechSource.findById(req.params.id);
  if (!src) return res.status(404).json({ message: 'Source not found' });
  if (req.body.enabled !== undefined) src.enabled = Boolean(req.body.enabled);
  if (req.body.maxItems !== undefined) src.maxItems = Math.min(50, Math.max(1, Number(req.body.maxItems) || 15));
  if (req.body.tracks !== undefined) src.tracks = (Array.isArray(req.body.tracks) ? req.body.tracks : []).filter(t => TRACK_IDS.includes(t));
  await src.save();
  res.json(src);
}));

router.post('/admin/sources', protect, adminOnly, asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  const url = String(req.body.url || '').trim();
  if (!name || !okUrl(url)) return res.status(400).json({ message: 'Give the source a name and its RSS feed link (https://…)' });
  const tracks = (Array.isArray(req.body.tracks) ? req.body.tracks : []).filter(t => TRACK_IDS.includes(t));
  // Check it really is a feed before saving
  const test = { name, url, type: 'rss' };
  try {
    const items = await feed.FETCHERS.rss(test);
    if (!items.length) return res.status(400).json({ message: 'That link opened, but no articles were found in it. Is it an RSS/Atom feed?' });
  } catch (e) {
    return res.status(400).json({ message: `Couldn’t read that feed: ${e.message}` });
  }
  const src = await TechSource.create({ name, url, type: 'rss', kind: 'news', tracks, maxItems: Math.min(30, Number(req.body.maxItems) || 12) });
  res.status(201).json(src);
}));

router.delete('/admin/sources/:id', protect, adminOnly, asyncHandler(async (req, res) => {
  const src = await TechSource.findById(req.params.id);
  if (!src) return res.status(404).json({ message: 'Source not found' });
  if (src.builtIn) return res.status(400).json({ message: 'Built-in sources can be switched off, not deleted' });
  await src.deleteOne();
  res.json({ message: 'Source removed. Its articles leave the feed as they age out.' });
}));

// ── Tech Pass settings: { enabled?, price?, days?, freeForPaid? } ──
router.put('/admin/pass', protect, adminOnly, asyncHandler(async (req, res) => {
  const s = await Settings.get();
  const cur = passSettings(s);
  const next = { ...cur };
  if (req.body.enabled !== undefined) next.enabled = Boolean(req.body.enabled);
  if (req.body.freeForPaid !== undefined) next.freeForPaid = Boolean(req.body.freeForPaid);
  if (req.body.price !== undefined) {
    const p = Math.round(Number(req.body.price));
    if (!(p >= 1 && p <= 50000)) return res.status(400).json({ message: 'Price must be between ₹1 and ₹50,000' });
    next.price = p;
  }
  if (req.body.days !== undefined) {
    const d = Math.round(Number(req.body.days));
    if (!(d >= 1 && d <= 730)) return res.status(400).json({ message: 'Length must be 1 to 730 days' });
    next.days = d;
  }
  s.techPass = next;
  await s.save();
  res.json(next);
}));

// ── POST /api/tech/admin/passes { email, days, note? } — give a student a pass free ──
router.post('/admin/passes', protect, adminOnly, asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const days = Math.round(Number(req.body.days));
  if (!(days >= 1 && days <= 730)) return res.status(400).json({ message: 'Days must be 1 to 730' });
  const u = await User.findOne({ email });
  if (!u) return res.status(404).json({ message: 'No student has signed in with that email yet' });
  const p = await grantPass(u._id, { days, source: 'gift', note: String(req.body.note || '').slice(0, 200), by: req.user._id });
  res.status(201).json({ message: `${email} has a Tech Pass till ${p.expiresAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}`, pass: p });
}));

// ── GET /api/tech/admin/passes — who has a pass ──
router.get('/admin/passes', protect, adminOnly, asyncHandler(async (req, res) => {
  const rows = await TechPass.find().populate('user', 'name email').sort({ createdAt: -1 }).limit(200);
  res.json(rows);
}));

module.exports = router;
