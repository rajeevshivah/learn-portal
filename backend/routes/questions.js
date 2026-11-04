const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const Question = require('../models/Question');
const Reply    = require('../models/Reply');
const Episode  = require('../models/Episode');
const Course   = require('../models/Course');
const User     = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');
const { hasCourseAccess } = require('../middleware/access');

// ── Discussion threads (Stack Overflow style) ────────────
// A doubt is a thread. Anyone with access to the course can answer, comment
// under an answer, and upvote. The asker (or admin) accepts one answer.
// The instructor's answers are badged and shown first.

const DAY = 24 * 60 * 60 * 1000;
const LIMITS = { questions: 10, replies: 30 };   // per student per 24h
const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));
const same = (a, b) => String(a) === String(b);
const isAdmin = (u) => u?.role === 'admin';
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Can this user see/post in this episode's threads?
const canAccessEpisode = async (user, episodeId) => {
  if (!isId(episodeId)) return { ok: false, code: 404, message: 'Lesson not found' };
  const episode = await Episode.findById(episodeId).populate('course', 'isPaid title slug');
  if (!episode) return { ok: false, code: 404, message: 'Lesson not found' };
  const access = await hasCourseAccess(user, episode.course);
  if (!access && !episode.isFreePreview) {
    return { ok: false, code: 403, message: 'Join this course to see and ask doubts' };
  }
  return { ok: true, episode, course: episode.course };
};

const canAccessCourse = async (user, ref) => {
  const course = isId(ref)
    ? await Course.findById(ref).select('title slug isPaid')
    : await Course.findOne({ slug: String(ref).toLowerCase() }).select('title slug isPaid');
  if (!course) return { ok: false, code: 404, message: 'Course not found' };
  if (!(await hasCourseAccess(user, course))) {
    return { ok: false, code: 403, message: 'Join this course to see and ask doubts' };
  }
  return { ok: true, course };
};

// Thread access: lesson threads follow the lesson's rules (free previews are
// open); course-wide threads need course access.
const canAccessThread = async (user, q) => {
  if (q.hidden && !isAdmin(user)) return { ok: false, code: 404, message: 'This thread was removed' };
  if (q.episode) return canAccessEpisode(user, q.episode._id || q.episode);
  return canAccessCourse(user, q.course._id || q.course);
};

const overLimit = async (Model, user, max) => {
  if (isAdmin(user)) return false;
  const n = await Model.countDocuments({ user: user._id, createdAt: { $gte: new Date(Date.now() - DAY) } });
  return n >= max;
};

// Old doubts had one `answer` string. The first time a thread is opened,
// turn it into a real instructor reply so it can be voted on and accepted.
const migrateLegacy = async (q) => {
  if (q.legacyMigrated || !q.answer) return;
  const admin = await User.findOne({ role: 'admin' }).select('_id');
  if (!admin) return;
  const exists = await Reply.exists({ question: q._id, legacy: true });
  if (!exists) {
    await Reply.create({
      question: q._id, user: admin._id, text: q.answer, isAdmin: true, legacy: true,
      createdAt: q.answeredAt || q.updatedAt, updatedAt: q.answeredAt || q.updatedAt,
    });
  }
  q.legacyMigrated = true;
  await recount(q);
};

// Recompute a thread's counters from its replies (no aggregation needed).
const recount = async (q) => {
  const replies = await Reply.find({ question: q._id, hidden: false })
    .select('user parent isAdmin text createdAt').sort({ createdAt: 1 });
  const answers = replies.filter(r => !r.parent);
  const instructor = answers.filter(r => r.isAdmin);
  const last = replies[replies.length - 1];
  q.replyCount = answers.length;
  q.isAnswered = instructor.length > 0;
  q.answeredAt = instructor[0]?.createdAt || null;
  q.answer = instructor[instructor.length - 1]?.text || '';
  q.lastReplyAt = last?.createdAt || null;
  q.lastReplyBy = last?.user || null;
  q.lastActivityAt = last?.createdAt || q.createdAt;
  if (q.acceptedReply && !answers.some(r => same(r._id, q.acceptedReply))) q.acceptedReply = null;
  await q.save({ timestamps: false });
};

const author = (u) => u ? { _id: u._id, name: u.name, avatar: u.avatar || '', isAdmin: u.role === 'admin' } : { name: 'Former student' };

// Thread summary for lists
const summary = (q, me) => ({
  _id: q._id,
  text: q.text,
  user: author(q.user),
  course: q.course?._id ? { _id: q.course._id, title: q.course.title, slug: q.course.slug } : q.course,
  episode: q.episode?._id ? { _id: q.episode._id, title: q.episode.title, episodeNumber: q.episode.episodeNumber } : (q.episode || null),
  replyCount: q.replyCount || (q.answer && !q.legacyMigrated ? 1 : 0),
  score: (q.upvotes || []).length,
  voted: (q.upvotes || []).some(id => same(id, me._id)),
  solved: Boolean(q.acceptedReply),
  isAnswered: q.isAnswered,
  locked: q.locked,
  hidden: q.hidden,
  mine: same(q.user?._id || q.user, me._id),
  createdAt: q.createdAt,
  lastActivityAt: q.lastActivityAt || q.answeredAt || q.createdAt,
});

const sortThreads = (list, sort) => {
  const t = (q) => new Date(q.lastActivityAt || q.answeredAt || q.createdAt).getTime();
  if (sort === 'new') return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (sort === 'top') return list.sort((a, b) => (b.upvotes?.length || 0) - (a.upvotes?.length || 0) || t(b) - t(a));
  return list.sort((a, b) => t(b) - t(a));
};

// Shared list logic for a course or a lesson
const listThreads = async (req, base) => {
  const { filter = 'all', sort = 'active', q: search = '' } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const per = 20;
  const find = { ...base };
  if (!isAdmin(req.user)) find.hidden = { $ne: true };
  if (filter === 'unanswered') { find.replyCount = { $in: [0, null] }; find.isAnswered = false; }
  if (filter === 'solved') find.acceptedReply = { $ne: null };
  if (filter === 'mine') find.user = req.user._id;
  const term = String(search).trim().slice(0, 80);
  if (term) find.text = { $regex: escapeRx(term), $options: 'i' };

  const rows = await Question.find(find)
    .populate('user', 'name avatar role')
    .populate('episode', 'title episodeNumber')
    .sort({ createdAt: -1 })
    .limit(500);
  const sorted = sortThreads(rows, sort);
  const slice = sorted.slice((page - 1) * per, page * per);
  return {
    total: sorted.length,
    page,
    pages: Math.max(1, Math.ceil(sorted.length / per)),
    threads: slice.map(q => summary(q, req.user)),
  };
};

// ── Ask a doubt (lesson or whole course) ─────────────────
router.post('/', protect, asyncHandler(async (req, res) => {
  const { episodeId, courseId, text } = req.body;
  const body = String(text || '').trim();
  if (!body) return res.status(400).json({ message: 'Write your doubt first' });
  if (body.length > 5000) return res.status(400).json({ message: 'Keep it under 5000 characters' });

  let check;
  if (episodeId) check = await canAccessEpisode(req.user, episodeId);
  else if (courseId) check = await canAccessCourse(req.user, courseId);
  else return res.status(400).json({ message: 'Pick a course or lesson' });
  if (!check.ok) return res.status(check.code).json({ message: check.message });

  if (await overLimit(Question, req.user, LIMITS.questions)) {
    return res.status(429).json({ message: `You can ask ${LIMITS.questions} doubts a day. Try again tomorrow.` });
  }

  const question = await Question.create({
    user: req.user._id,
    course: check.course._id,
    episode: episodeId || null,
    text: body,
    lastActivityAt: new Date(),
    legacyMigrated: true,
  });
  res.status(201).json(question);
}));

// ── Threads under a lesson ───────────────────────────────
router.get('/episode/:episodeId', protect, asyncHandler(async (req, res) => {
  const check = await canAccessEpisode(req.user, req.params.episodeId);
  if (!check.ok) return res.status(check.code).json({ message: check.message });
  res.json(await listThreads(req, { episode: check.episode._id }));
}));

// ── Threads across a course (Discussions page) ───────────
router.get('/course/:courseRef', protect, asyncHandler(async (req, res) => {
  const check = await canAccessCourse(req.user, req.params.courseRef);
  if (!check.ok) return res.status(check.code).json({ message: check.message });
  const data = await listThreads(req, { course: check.course._id });
  res.json({ course: { _id: check.course._id, title: check.course.title, slug: check.course.slug }, ...data });
}));

// ── Student: new replies on my doubts (Home notifications) ──
router.get('/my/activity', protect, asyncHandler(async (req, res) => {
  const mine = await Question.find({
    user: req.user._id,
    hidden: { $ne: true },
    lastReplyAt: { $gte: new Date(Date.now() - 30 * DAY) },
  })
    .populate('lastReplyBy', 'name role')
    .populate('course', 'title slug')
    .sort({ lastReplyAt: -1 })
    .limit(30);
  const fresh = mine.filter(q =>
    q.lastReplyBy && !same(q.lastReplyBy._id, req.user._id) &&
    (!q.ownerSeenAt || q.lastReplyAt > q.ownerSeenAt)).slice(0, 5);
  const out = [];
  for (const q of fresh) {
    const n = await Reply.countDocuments({
      question: q._id, hidden: false, user: { $ne: req.user._id },
      createdAt: { $gt: q.ownerSeenAt || new Date(0) },
    });
    out.push({
      _id: q._id, text: q.text, course: q.course, newReplies: n || 1,
      lastReplyBy: q.lastReplyBy?.name, byInstructor: q.lastReplyBy?.role === 'admin',
      lastReplyAt: q.lastReplyAt, solved: Boolean(q.acceptedReply),
    });
  }
  res.json(out);
}));

// ── Student: my recently answered doubts (kept for older clients) ──
router.get('/my/answered', protect, asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 14 * DAY);
  const questions = await Question.find({
    user: req.user._id,
    isAnswered: true,
    answeredAt: { $gte: since },
  })
    .populate('episode', 'title episodeNumber')
    .populate('course', 'title slug')
    .sort({ answeredAt: -1 })
    .limit(5);
  res.json(questions);
}));

// ── ADMIN: needs the instructor (no instructor reply, not solved) ──
router.get('/unanswered', protect, adminOnly, asyncHandler(async (req, res) => {
  const questions = await Question.find({ isAnswered: false, acceptedReply: null, hidden: { $ne: true } })
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
    .populate('course', 'title slug')
    .sort({ createdAt: -1 })
    .limit(200);
  res.json(questions);
}));

// ── ADMIN: answer a doubt (creates an instructor reply) ──
router.put('/:id/answer', protect, adminOnly, asyncHandler(async (req, res) => {
  const answer = String(req.body.answer || '').trim();
  if (!answer) return res.status(400).json({ message: 'Answer text is required' });
  if (!isId(req.params.id)) return res.status(404).json({ message: 'Question not found' });
  const question = await Question.findById(req.params.id);
  if (!question) return res.status(404).json({ message: 'Question not found' });
  await migrateLegacy(question);
  await Reply.create({ question: question._id, user: req.user._id, text: answer.slice(0, 5000), isAdmin: true });
  await recount(question);
  res.json({ message: 'Answered', question });
}));

// ── Reply (answer) or comment under an answer ────────────
router.post('/:id/replies', protect, asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ message: 'Thread not found' });
  const q = await Question.findById(req.params.id);
  if (!q) return res.status(404).json({ message: 'Thread not found' });
  const check = await canAccessThread(req.user, q);
  if (!check.ok) return res.status(check.code).json({ message: check.message });
  if (q.locked && !isAdmin(req.user)) return res.status(403).json({ message: 'This thread is closed for new replies' });

  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ message: 'Write your reply first' });
  const isComment = Boolean(req.body.parent);
  const max = isComment ? 600 : 5000;
  if (text.length > max) return res.status(400).json({ message: `Keep it under ${max} characters` });

  let parent = null;
  if (isComment) {
    if (!isId(req.body.parent)) return res.status(400).json({ message: 'Reply not found' });
    parent = await Reply.findOne({ _id: req.body.parent, question: q._id, hidden: false });
    if (!parent) return res.status(400).json({ message: 'That answer was removed' });
    if (parent.parent) parent = await Reply.findById(parent.parent);   // keep one level deep
  }
  if (await overLimit(Reply, req.user, LIMITS.replies)) {
    return res.status(429).json({ message: `You can post ${LIMITS.replies} replies a day. Try again tomorrow.` });
  }

  await migrateLegacy(q);
  const reply = await Reply.create({
    question: q._id, user: req.user._id, parent: parent?._id || null, text, isAdmin: isAdmin(req.user),
  });
  await recount(q);
  res.status(201).json(reply);
}));

// ── Upvote toggles ───────────────────────────────────────
const toggleVote = async (Model, id, user) => {
  const doc = await Model.findById(id).select('user upvotes question hidden');
  if (!doc || doc.hidden) return { code: 404, message: 'Not found' };
  if (same(doc.user, user._id)) return { code: 400, message: 'You can’t upvote your own post' };
  const had = doc.upvotes.some(u => same(u, user._id));
  await Model.updateOne({ _id: id }, had ? { $pull: { upvotes: user._id } } : { $addToSet: { upvotes: user._id } }, { timestamps: false });
  const fresh = await Model.findById(id).select('upvotes');
  return { doc, voted: !had, score: fresh.upvotes.length };
};

router.post('/:id/vote', protect, asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ message: 'Thread not found' });
  const q = await Question.findById(req.params.id);
  if (!q) return res.status(404).json({ message: 'Thread not found' });
  const check = await canAccessThread(req.user, q);
  if (!check.ok) return res.status(check.code).json({ message: check.message });
  const r = await toggleVote(Question, q._id, req.user);
  if (r.code) return res.status(r.code).json({ message: r.message });
  res.json({ voted: r.voted, score: r.score });
}));

router.post('/replies/:replyId/vote', protect, asyncHandler(async (req, res) => {
  if (!isId(req.params.replyId)) return res.status(404).json({ message: 'Reply not found' });
  const reply = await Reply.findById(req.params.replyId).select('question');
  if (!reply) return res.status(404).json({ message: 'Reply not found' });
  const q = await Question.findById(reply.question);
  const check = q ? await canAccessThread(req.user, q) : { ok: false, code: 404, message: 'Thread not found' };
  if (!check.ok) return res.status(check.code).json({ message: check.message });
  const r = await toggleVote(Reply, reply._id, req.user);
  if (r.code) return res.status(r.code).json({ message: r.message });
  res.json({ voted: r.voted, score: r.score });
}));

// ── Accept an answer (asker or admin); same id again un-accepts ──
router.put('/:id/accept', protect, asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ message: 'Thread not found' });
  const q = await Question.findById(req.params.id);
  if (!q) return res.status(404).json({ message: 'Thread not found' });
  if (!same(q.user, req.user._id) && !isAdmin(req.user)) {
    return res.status(403).json({ message: 'Only the person who asked can accept an answer' });
  }
  const { replyId } = req.body;
  if (!replyId || (q.acceptedReply && same(q.acceptedReply, replyId))) {
    q.acceptedReply = null;
  } else {
    const r = isId(replyId) && await Reply.findOne({ _id: replyId, question: q._id, parent: null, hidden: false });
    if (!r) return res.status(400).json({ message: 'That answer is not in this thread' });
    q.acceptedReply = r._id;
  }
  await q.save({ timestamps: false });
  res.json({ acceptedReply: q.acceptedReply });
}));

// ── ADMIN: lock / unlock, hide / unhide a thread ─────────
router.put('/:id/moderate', protect, adminOnly, asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ message: 'Thread not found' });
  const q = await Question.findById(req.params.id);
  if (!q) return res.status(404).json({ message: 'Thread not found' });
  if (typeof req.body.locked === 'boolean') q.locked = req.body.locked;
  if (typeof req.body.hidden === 'boolean') q.hidden = req.body.hidden;
  await q.save({ timestamps: false });
  res.json({ locked: q.locked, hidden: q.hidden });
}));

// ── Remove a reply (author or admin). Admin can also restore. ──
router.delete('/replies/:replyId', protect, asyncHandler(async (req, res) => {
  if (!isId(req.params.replyId)) return res.status(404).json({ message: 'Reply not found' });
  const reply = await Reply.findById(req.params.replyId);
  if (!reply) return res.status(404).json({ message: 'Reply not found' });
  if (!same(reply.user, req.user._id) && !isAdmin(req.user)) {
    return res.status(403).json({ message: 'You can only remove your own replies' });
  }
  const restore = isAdmin(req.user) && req.query.restore === '1';
  reply.hidden = !restore;
  await reply.save({ timestamps: false });
  if (!restore) await Reply.updateMany({ parent: reply._id }, { hidden: true }, { timestamps: false });
  const q = await Question.findById(reply.question);
  if (q) await recount(q);
  res.json({ message: restore ? 'Restored' : 'Removed' });
}));

// ── Delete a whole thread: asker before anyone replies, or admin ──
router.delete('/:id', protect, asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ message: 'Question not found' });
  const question = await Question.findById(req.params.id);
  if (!question) return res.status(404).json({ message: 'Question not found' });
  const isOwner = same(question.user, req.user._id);
  const hasReplies = question.isAnswered || question.replyCount > 0 ||
    await Reply.exists({ question: question._id, hidden: false });
  if (!isAdmin(req.user) && (!isOwner || hasReplies)) {
    return res.status(403).json({ message: 'You can delete a doubt only before someone replies' });
  }
  await Reply.deleteMany({ question: question._id });
  await question.deleteOne();
  res.json({ message: 'Question deleted' });
}));

// ── One thread with its answers and comments ─────────────
router.get('/:id', protect, asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ message: 'Thread not found' });
  const q = await Question.findById(req.params.id)
    .populate('user', 'name avatar role')
    .populate('course', 'title slug')
    .populate('episode', 'title episodeNumber');
  if (!q) return res.status(404).json({ message: 'Thread not found' });
  const check = await canAccessThread(req.user, q);
  if (!check.ok) return res.status(check.code).json({ message: check.message });

  await migrateLegacy(q);
  const admin = isAdmin(req.user);
  const replies = await Reply.find({ question: q._id, ...(admin ? {} : { hidden: false }) })
    .populate('user', 'name avatar role')
    .sort({ createdAt: 1 });

  const me = req.user._id;
  const out = replies.map(r => ({
    _id: r._id,
    text: r.text,
    user: author(r.user),
    isAdmin: r.isAdmin,
    parent: r.parent,
    score: r.upvotes.length,
    voted: r.upvotes.some(u => same(u, me)),
    accepted: same(r._id, q.acceptedReply),
    mine: same(r.user?._id, me),
    hidden: r.hidden,
    createdAt: r.createdAt,
  }));
  // Answers: accepted first, then the instructor, then most helpful, then oldest
  const answers = out.filter(r => !r.parent).sort((a, b) =>
    (b.accepted - a.accepted) || (b.isAdmin - a.isAdmin) || (b.score - a.score) ||
    (new Date(a.createdAt) - new Date(b.createdAt)));
  const comments = out.filter(r => r.parent);
  answers.forEach(a => { a.comments = comments.filter(c => same(c.parent, a._id)); });

  if (same(q.user?._id, me)) {
    await Question.updateOne({ _id: q._id }, { ownerSeenAt: new Date() }, { timestamps: false });
  }

  res.json({
    thread: {
      ...summary(q, req.user),
      replyCount: answers.filter(a => !a.hidden).length,
      canAccept: same(q.user?._id, me) || admin,
      canDelete: admin || (same(q.user?._id, me) && answers.length === 0),
      acceptedReply: q.acceptedReply,
    },
    answers,
  });
}));

module.exports = router;
