const express      = require('express');
const router       = express.Router();
const asyncHandler = require('express-async-handler');
const LiveEvent    = require('../models/LiveEvent');
const Registration = require('../models/Registration');
const Course       = require('../models/Course');
const Episode      = require('../models/Episode');
const Settings     = require('../models/Settings');
const { attachBoardNotes } = require('../utils/boardNotes');
const { cloudinary, uploadImage } = require('../config/cloudinary');
const { protect, adminOnly } = require('../middleware/auth');
const User         = require('../models/User');
const RefundRequest = require('../models/RefundRequest');
const meet         = require('../utils/meetGuests');

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

// Is registration still open for this event?
const isRegistrationOpen = (event) => {
  if (!event.isPublished || event.isCompleted) return false;
  const now = new Date();
  if (event.registrationClosesAt) return event.registrationClosesAt > now;
  // default: closes when the first session starts
  const first = event.sessions?.reduce(
    (min, s) => (!min || s.startsAt < min ? s.startsAt : min), null
  );
  return first ? first > now : false;
};

// After registration closes, a program is visible only to people who registered
// (any status, so pending/rejected students still see their status). Admins see all.
const hiddenFrom = (event, registration, user) =>
  user?.role !== 'admin' && event.hideWhenClosed !== false && !registration && !isRegistrationOpen(event);

// Session list for a student: join + recording links only for confirmed
// registrations. Everyone else just learns whether a recording exists.
const shapeSessions = (sessions, active) => (sessions || []).map(s => ({
  ...s,
  joinUrl:      active ? s.joinUrl : '',
  recordingUrl: active ? s.recordingUrl : '',
  hasRecording: Boolean(s.recordingUrl),
  notesUrl:     active ? (s.notesUrl || '') : '',
  hasNotes:     Boolean(s.notesUrl),
}));

// Strip sensitive fields unless the student actually has access.
// joinUrl and whatsappLink are the two things that must never leak.
const shapeEvent = (event, registration) => {
  const obj = event.toObject ? event.toObject() : event;
  const active = registration?.status === 'active';

  return {
    ...obj,
    // Hide the meeting + recording links from anyone not confirmed
    sessions: shapeSessions(obj.sessions, active),
    whatsappLink: active ? obj.whatsappLink : '',
    registrationOpen: isRegistrationOpen(event),
    myRegistration: registration ? {
      status:       registration.status,
      rejectReason: registration.rejectReason,
      utr:          registration.utr,
      registeredAt: registration.createdAt,
    } : null,
  };
};

// ─────────────────────────────────────────────────────────
// Recording → lesson sync
// When an event has a recordingsCourse, every class recording is mirrored as
// a lesson (Episode) in that course: same video, plus any notes uploaded to it.
// Idempotent — safe to call after every save.
// ─────────────────────────────────────────────────────────
const RECORDINGS_PHASE = 'Class Recordings';

async function syncLesson(event, session) {
  const courseId = event.recordingsCourse;
  if (!courseId) return null;
  const url = session.recordingUrl || '';

  let ep = session.publishedEpisode ? await Episode.findById(session.publishedEpisode) : null;
  if (ep && String(ep.course) !== String(courseId)) ep = null; // course was changed → new lesson

  if (ep) {
    let changed = false;
    if (url && ep.youtubeUrl !== url) { ep.youtubeUrl = url; changed = true; }
    if (Boolean(url) !== ep.isPublished) { ep.isPublished = Boolean(url); changed = true; } // no recording → hide lesson
    if (changed) await ep.save();
    return ep;
  }
  if (!url) return null;

  const course = await Course.findById(courseId);
  if (!course) return null;
  if (!course.phases.includes(RECORDINGS_PHASE)) {
    course.phases.push(RECORDINGS_PHASE);
    await course.save();
  }

  const ordered = [...event.sessions].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  const isFirstClass = String(ordered[0]?._id) === String(session._id);

  for (let attempt = 0; attempt < 3; attempt++) {
    const last = await Episode.findOne({ course: courseId }).sort({ episodeNumber: -1 }).select('episodeNumber');
    try {
      ep = await Episode.create({
        course: courseId,
        episodeNumber: (last?.episodeNumber || 0) + 1,
        title: session.title,
        description: `Recording of the live class held on ${new Date(session.startsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}.`,
        phase: RECORDINGS_PHASE,
        youtubeUrl: url,
        duration: `${session.durationMins || 60} min`,
        isPublished: true,
        isFreePreview: isFirstClass, // Class 1 doubles as the free preview for buyers
        tags: ['live-recording'],
      });
      break;
    } catch (e) {
      if (e.code !== 11000 || attempt === 2) throw e; // number taken by a parallel save → retry
    }
  }
  session.publishedEpisode = ep._id;
  return ep;
}

// Mirror every recorded session of an event; saves the event if links changed.
async function syncAllLessons(event) {
  if (!event.recordingsCourse) return;
  // A recordings course without its own image borrows the webinar's thumbnail.
  if (event.thumbnail) {
    await Course.updateOne({ _id: event.recordingsCourse, thumbnail: { $in: ['', null] } }, { $set: { thumbnail: event.thumbnail } });
  }
  let touched = false;
  for (const session of event.sessions) {
    if (!session.recordingUrl && !session.publishedEpisode) continue;
    const before = String(session.publishedEpisode || '');
    await syncLesson(event, session);
    if (String(session.publishedEpisode || '') !== before) touched = true;
  }
  if (await attachBoardNotes(event)) touched = true;   // whiteboard PDF follows the new lesson
  if (touched) await event.save();
}

// ─────────────────────────────────────────────────────────
// STUDENT ROUTES
// ─────────────────────────────────────────────────────────

// ── GET /api/events — list published events ──────────────
// ?type=live-class|workshop  ?course=<id>  ?scope=upcoming|past|all
router.get('/', protect, asyncHandler(async (req, res) => {
  const { type, course, scope = 'upcoming' } = req.query;

  const filter = { isPublished: true };
  if (type && ['live-class', 'workshop'].includes(type)) filter.type = type;
  if (course) filter.course = course;
  if (scope === 'upcoming') filter.isCompleted = false;
  if (scope === 'past')     filter.isCompleted = true;

  const events = await LiveEvent.find(filter)
    .populate('course', 'title slug')
    .sort({ createdAt: -1 })
    .limit(100);

  // Attach this user's registration status to each event
  const ids   = events.map(e => e._id);
  const mine  = await Registration.find({ user: req.user._id, event: { $in: ids } });
  const byEvt = {};
  mine.forEach(r => { byEvt[String(r.event)] = r; });

  let shaped = events
    .filter(e => !hiddenFrom(e, byEvt[String(e._id)], req.user))
    .map(e => shapeEvent(e, byEvt[String(e._id)]));

  // Upcoming events sort by their real start time (a virtual, so done in JS)
  if (scope === 'upcoming') {
    shaped.sort((a, b) => new Date(a.startsAt || 0) - new Date(b.startsAt || 0));
  }

  res.json(shaped);
}));

// ── GET /api/events/public — PUBLIC list of programs open for registration ──
// For the logged-out homepage. Same safe fields as /public/:slug, no payment details.
router.get('/public', asyncHandler(async (req, res) => {
  const events = await LiveEvent.find({ isPublished: true, isCompleted: { $ne: true } })
    .select('type title slug description thumbnail isPaid price mrp startsAt sessions seatLimit registrationClosesAt isPublished isCompleted')
    .sort({ startsAt: 1 });
  const open = events.filter(e => isRegistrationOpen(e));
  res.json(await Promise.all(open.map(async (e) => {
    const out = {
      _id: e._id, type: e.type, title: e.title, slug: e.slug, description: e.description,
      thumbnail: e.thumbnail, isPaid: e.isPaid, price: e.price, mrp: e.mrp, startsAt: e.startsAt,
      classCount: (e.sessions || []).length,
    };
    if (e.seatLimit > 0) {
      const taken = await Registration.countDocuments({ event: e._id, status: { $in: ['active', 'pending'] } });
      out.seatsLeft = Math.max(0, e.seatLimit - taken);
    }
    return out;
  })));
}));

// ── GET /api/events/public/:slug — PUBLIC event detail ───
// No login required. Safe subset only — never leaks joinUrl or whatsappLink.
// Used by the shareable /live/:slug funnel page for logged-out visitors.
// NOTE: must be declared BEFORE '/:slug' so Express matches it first.
router.get('/public/:slug', asyncHandler(async (req, res) => {
  const event = await LiveEvent.findOne({ slug: req.params.slug })
    .populate('course', 'title slug');

  if (!event || !event.isPublished) {
    return res.status(404).json({ message: 'Event not found' });
  }
  // Closed programs stay private: old shared links show a 'registration closed' page.
  if (event.hideWhenClosed !== false && !isRegistrationOpen(event)) {
    return res.status(404).json({ message: 'Registration for this program has closed.', closed: true, title: event.title, slug: event.slug });
  }

  const obj = event.toObject();

  // Public-safe shape: strip every sensitive field.
  const shaped = {
    _id:          obj._id,
    type:         obj.type,
    title:        obj.title,
    slug:         obj.slug,
    description:  obj.description,
    thumbnail:    obj.thumbnail,
    course:       obj.course,
    isPaid:       obj.isPaid,
    price:        obj.price,
    mrp:          obj.mrp,
    startsAt:     obj.startsAt,
    endsAt:       obj.endsAt,
    // schedule shown WITHOUT join links
    sessions: (obj.sessions || []).map(s => ({
      _id: s._id, title: s.title, startsAt: s.startsAt, durationMins: s.durationMins,
    })),
    seatLimit:        obj.seatLimit,
    registrationOpen: isRegistrationOpen(event),
  };

  // Seats left (public info — helps urgency)
  if (event.seatLimit > 0) {
    const taken = await Registration.countDocuments({
      event: event._id, status: { $in: ['active', 'pending'] },
    });
    shaped.seatsLeft = Math.max(0, event.seatLimit - taken);
  }

  // Paid → hand over UPI details so the public page can render QR + UPI id
  if (event.isPaid) {
    const settings = await Settings.get();
    shaped.payment = {
      upiId:   settings.upiId,
      upiName: settings.upiName,
      note:    settings.paymentNote,
      qrUrl:   settings.paymentQrUrl || '',
    };
  }

  res.json(shaped);
}));

// ── GET /api/events/:slug — single event detail ──────────
router.get('/:slug', protect, asyncHandler(async (req, res) => {
  const event = await LiveEvent.findOne({ slug: req.params.slug })
    .populate('course', 'title slug')
    .populate('recordingsCourse', 'title slug');

  if (!event || (!event.isPublished && req.user.role !== 'admin')) {
    return res.status(404).json({ message: 'Event not found' });
  }

  const registration = await Registration.findOne({
    user: req.user._id, event: event._id,
  });
  if (hiddenFrom(event, registration, req.user)) {
    return res.status(404).json({ message: 'Registration for this program has closed.', closed: true });
  }

  const shaped = shapeEvent(event, registration);

  // Seat availability
  if (event.seatLimit > 0) {
    const taken = await Registration.countDocuments({
      event: event._id, status: { $in: ['active', 'pending'] },
    });
    shaped.seatsLeft = Math.max(0, event.seatLimit - taken);
  }

  // Paid + not yet registered -> send UPI details so the form can show them
  if (event.isPaid && registration?.status !== 'active') {
    const settings = await Settings.get();
    shaped.payment = {
      upiId:   settings.upiId,
      upiName: settings.upiName,
      note:    settings.paymentNote,
      qrUrl:   settings.paymentQrUrl || '',
    };
  }

  res.json(shaped);
}));

// ── POST /api/events/:id/register — submit registration ──
// Free event  -> instantly active, WhatsApp link returned in the reply.
// Paid event  -> requires utr, goes to 'pending', link withheld until approval.
router.post(
  '/:id/register',
  protect,
  uploadImage.single('screenshot'),
  asyncHandler(async (req, res) => {
    const { phone, college, expectation, utr } = req.body;

    const event = await LiveEvent.findById(req.params.id);
    if (!event || !event.isPublished) {
      return res.status(404).json({ message: 'Event not found' });
    }
    if (!isRegistrationOpen(event)) {
      return res.status(400).json({ message: 'Registration is closed for this event' });
    }

    // Seat check
    if (event.seatLimit > 0) {
      const taken = await Registration.countDocuments({
        event: event._id, status: { $in: ['active', 'pending'] },
      });
      if (taken >= event.seatLimit) {
        return res.status(400).json({ message: 'All seats are full' });
      }
    }

    let registration = await Registration.findOne({
      user: req.user._id, event: event._id,
    });

    if (registration?.status === 'active') {
      return res.status(400).json({ message: 'You are already registered' });
    }
    if (registration?.status === 'pending') {
      return res.status(400).json({ message: 'Your payment is already under verification' });
    }

    // Paid events need a transaction reference
    if (event.isPaid && (!utr || !utr.trim())) {
      return res.status(400).json({ message: 'UTR / transaction ID is required' });
    }

    const payload = {
      phone:       (phone || '').trim(),
      college:     (college || '').trim(),
      expectation: (expectation || '').trim(),
      status:      event.isPaid ? 'pending' : 'active',
      amount:      event.isPaid ? event.price : 0,
      utr:         event.isPaid ? utr.trim() : '',
      rejectReason: '',
      approvedAt:  event.isPaid ? null : new Date(),
      screenshotUrl:      req.file ? req.file.path : '',
      screenshotPublicId: req.file ? req.file.filename : '',
    };

    if (registration) {
      // was rejected earlier -> this is a resubmission, clear the old screenshot
      if (registration.screenshotPublicId && req.file) {
        try { await cloudinary.uploader.destroy(registration.screenshotPublicId); }
        catch (e) { /* non-fatal */ }
      }
      Object.assign(registration, payload);
      await registration.save();
    } else {
      registration = await Registration.create({
        user: req.user._id,
        event: event._id,
        ...payload,
      });
    }

    // ── The reply the student sees ──
    const confirmed = registration.status === 'active';

    res.status(201).json({
      status: registration.status,
      message: confirmed
        ? event.confirmationMsg
        : 'Payment submitted. Your seat is confirmed once we verify it — the WhatsApp group link will appear here after approval.',
      // Only handed over on a confirmed registration
      whatsappLink: confirmed ? event.whatsappLink : '',
      sessions: confirmed
        ? event.sessions.map(s => ({
            title: s.title, startsAt: s.startsAt,
            durationMins: s.durationMins, joinUrl: s.joinUrl,
          }))
        : [],
    });
  })
);

// ── GET /api/events/my/registrations ─────────────────────
router.get('/my/registrations', protect, asyncHandler(async (req, res) => {
  const regs = await Registration.find({ user: req.user._id })
    .populate({
      path: 'event',
      select: 'title slug type thumbnail sessions whatsappLink isPaid price isCompleted',
    })
    .sort({ createdAt: -1 });

  // Hide the link on anything not yet approved
  res.json(regs.filter(r => r.event).map(r => {
    const e = r.event.toObject();
    const active = r.status === 'active';
    return {
      _id: r._id,
      status: r.status,
      rejectReason: r.rejectReason,
      event: {
        ...e,
        whatsappLink: active ? e.whatsappLink : '',
        sessions: shapeSessions(e.sessions, active),
      },
    };
  }));
}));

// ─────────────────────────────────────────────────────────
// ADMIN ROUTES
// ─────────────────────────────────────────────────────────

// ── GET /api/events/admin/all ────────────────────────────
router.get('/admin/all', protect, adminOnly, asyncHandler(async (req, res) => {
  const events = await LiveEvent.find()
    .populate('course', 'title slug')
    .sort({ createdAt: -1 });

  const counts = await Registration.aggregate([
    { $group: { _id: { event: '$event', status: '$status' }, n: { $sum: 1 } } },
  ]);

  const tally = {};
  counts.forEach(c => {
    const k = String(c._id.event);
    if (!tally[k]) tally[k] = { active: 0, pending: 0, rejected: 0 };
    tally[k][c._id.status] = c.n;
  });

  res.json(events.map(e => ({
    ...e.toObject(),
    counts: tally[String(e._id)] || { active: 0, pending: 0, rejected: 0 },
  })));
}));

// ── POST /api/events — create ────────────────────────────
router.post('/', protect, adminOnly, asyncHandler(async (req, res) => {
  const body = { ...req.body };

  if (body.slug) body.slug = body.slug.toLowerCase().trim();
  if (body.type === 'live-class' && body.course) {
    const course = await Course.findById(body.course);
    if (!course) return res.status(400).json({ message: 'Course not found' });
  }

  if (!body.recordingsCourse) body.recordingsCourse = null;
  delete body.meetSync;   // managed only through /:id/meet
  const event = await LiveEvent.create(body);
  await syncAllLessons(event);
  res.status(201).json(event);
}));

// ── PUT /api/events/:id — update ─────────────────────────
router.put('/:id', protect, adminOnly, asyncHandler(async (req, res) => {
  const event = await LiveEvent.findById(req.params.id);
  if (!event) return res.status(404).json({ message: 'Event not found' });

  const body = { ...req.body };
  if (body.slug) body.slug = body.slug.toLowerCase().trim();
  delete body._id;
  delete body.meetSync;   // managed only through /:id/meet, so a stale form can't undo it

  // Keep recording timestamps across full-form saves; stamp new/changed links.
  if (Array.isArray(body.sessions)) {
    const before = new Map(event.sessions.map(x => [String(x._id), x]));
    body.sessions = body.sessions.map(x => {
      const old = x._id ? before.get(String(x._id)) : null;
      const url = (x.recordingUrl || '').trim();
      let addedAt = old?.recordingAddedAt || null;
      if (!url) addedAt = null;
      else if (!old || old.recordingUrl !== url || !addedAt) addedAt = new Date();
      return {
        ...x,
        recordingUrl: url,
        recordingAddedAt: addedAt,
        publishedEpisode: x.publishedEpisode ?? old?.publishedEpisode ?? null,
        notesUrl: x.notesUrl ?? old?.notesUrl ?? '',   // whiteboard notes survive form saves
      };
    });
  }

  if (body.recordingsCourse === '') body.recordingsCourse = null;

  Object.assign(event, body);
  await event.save();
  await syncAllLessons(event);
  res.json(event);
}));

// ── PUT /api/events/:id/sessions/:sessionId/recording ──
// Quick "paste the recording after class" — touches only that one session.
// Body: { recordingUrl }  (empty string removes the recording)
router.put('/:id/sessions/:sessionId/recording', protect, adminOnly, asyncHandler(async (req, res) => {
  const url = String(req.body.recordingUrl || '').trim();
  if (url) {
    let ok = false;
    try { ok = new URL(url).protocol === 'https:'; } catch (e) { ok = false; }
    if (!ok) return res.status(400).json({ message: 'Paste a full https:// link (e.g. your YouTube unlisted link)' });
  }
  const event = await LiveEvent.findById(req.params.id);
  if (!event) return res.status(404).json({ message: 'Event not found' });
  const session = event.sessions.id(req.params.sessionId);
  if (!session) return res.status(404).json({ message: 'Session not found' });

  if (session.recordingUrl !== url) {
    session.recordingUrl = url;
    session.recordingAddedAt = url ? new Date() : null;
  }
  const lesson = await syncLesson(event, session);
  await event.save();
  if (lesson && await attachBoardNotes(event)) await event.save();
  res.json({
    message: url ? (lesson ? 'Recording saved — lesson updated in the course' : 'Recording saved') : 'Recording removed',
    session,
    lessonId: lesson?._id || null,
  });
}));

// ── DELETE /api/events/:id ───────────────────────────────
router.delete('/:id', protect, adminOnly, asyncHandler(async (req, res) => {
  const event = await LiveEvent.findById(req.params.id);
  if (!event) return res.status(404).json({ message: 'Event not found' });

  const regs = await Registration.find({ event: event._id });
  for (const r of regs) {
    if (r.screenshotPublicId) {
      try { await cloudinary.uploader.destroy(r.screenshotPublicId); } catch (e) {}
    }
  }
  await Registration.deleteMany({ event: event._id });
  await event.deleteOne();

  res.json({ message: 'Event and its registrations deleted' });
}));

// ── GET /api/events/:id/registrations — attendee list ────
router.get('/:id/registrations', protect, adminOnly, asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = { event: req.params.id };
  if (status && ['pending', 'active', 'rejected', 'refunded', 'cancelled'].includes(status)) filter.status = status;

  const regs = await Registration.find(filter)
    .populate('user', 'name email avatar')
    .populate('history.by', 'name')
    .sort({ createdAt: -1 });

  res.json(regs);
}));

// ── GET /api/events/admin/pending — global approval queue ─
router.get('/admin/pending', protect, adminOnly, asyncHandler(async (req, res) => {
  const pending = await Registration.find({ status: 'pending' })
    .populate('user', 'name email avatar')
    .populate('event', 'title slug type price')
    .sort({ updatedAt: 1 });   // oldest first — fair queue
  const { markDuplicateUtrs } = require('../utils/duplicateUtr');
  res.json(await markDuplicateUtrs(pending));
}));

// ── PUT /api/events/registrations/:id/approve ────────────
router.put('/registrations/:id/approve', protect, adminOnly, asyncHandler(async (req, res) => {
  const reg = await Registration.findById(req.params.id).populate('event', 'title whatsappLink');
  if (!reg) return res.status(404).json({ message: 'Registration not found' });
  if (reg.status !== 'pending') {
    return res.status(400).json({ message: `Already ${reg.status}` });
  }

  reg.status = 'active';
  reg.approvedAt = new Date();
  reg.rejectReason = '';
  await reg.save();
  meet.queueSync(reg.event._id);

  res.json({ message: 'Approved — WhatsApp link unlocked for this student', registration: reg });
}));

// ── PUT /api/events/registrations/:id/reject ─────────────
router.put('/registrations/:id/reject', protect, adminOnly, asyncHandler(async (req, res) => {
  const reg = await Registration.findById(req.params.id);
  if (!reg) return res.status(404).json({ message: 'Registration not found' });
  if (reg.status !== 'pending') {
    return res.status(400).json({ message: `Already ${reg.status}` });
  }

  reg.status = 'rejected';
  reg.rejectReason = (req.body.reason || 'Payment could not be verified').trim();
  await reg.save();

  res.json({ message: 'Rejected', registration: reg });
}));

// ── PUT /api/events/registrations/:id/attended ───────────
router.put('/registrations/:id/attended', protect, adminOnly, asyncHandler(async (req, res) => {
  const reg = await Registration.findById(req.params.id);
  if (!reg) return res.status(404).json({ message: 'Registration not found' });
  reg.attended = !reg.attended;
  await reg.save();
  res.json({ attended: reg.attended });
}));

// ── POST /api/events/:id/sessions/:sessionId/publish ─────
// Turn a finished live-class session into an episode inside its course.
router.post(
  '/:id/sessions/:sessionId/publish',
  protect, adminOnly,
  asyncHandler(async (req, res) => {
    const event = await LiveEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (!event.course) {
      return res.status(400).json({ message: 'Only a live class attached to a course can be published as an episode' });
    }

    const session = event.sessions.id(req.params.sessionId);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    if (session.publishedEpisode) {
      return res.status(400).json({ message: 'This session is already published as an episode' });
    }
    if (!session.recordingUrl) {
      return res.status(400).json({ message: 'Add the recording URL to this session first' });
    }

    // Next episode number within the course
    const last = await Episode.findOne({ course: event.course })
      .sort({ episodeNumber: -1 })
      .select('episodeNumber');
    const episodeNumber = (last?.episodeNumber || 0) + 1;

    const episode = await Episode.create({
      course:      event.course,
      episodeNumber,
      title:       req.body.title  || `Live — ${session.title}`,
      description: req.body.description
        || `Recording of the live problem-solving session held on ${new Date(session.startsAt).toLocaleDateString('en-IN')}.`,
      phase:       req.body.phase || 'Live Sessions',
      youtubeUrl:  session.recordingUrl,
      duration:    `${session.durationMins || 60} min`,
      isPublished: req.body.isPublished !== false,
      tags:        ['live', event.type],
    });

    session.publishedEpisode = episode._id;
    await event.save();

    res.status(201).json({ message: 'Recording published as an episode', episode });
  })
);

// ─────────────────────────────────────────────────────────
// SEAT CHANGES (admin): find, move to another account, cancel
// ─────────────────────────────────────────────────────────
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── GET /api/events/admin/find-registration?q= ──
// Across ALL programs, by student name/email, phone, UTR or Razorpay payment id.
// For "I paid but can't find my registration / forgot my email".
router.get('/admin/find-registration', protect, adminOnly, asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) return res.status(400).json({ message: 'Type at least 3 characters' });
  const rx = new RegExp(escapeRx(q), 'i');
  const digits = q.replace(/\D/g, '');
  const users = await User.find({ $or: [{ name: rx }, { email: rx }] }).select('_id').limit(50);
  const or = [{ user: { $in: users.map(u => u._id) } }, { utr: rx }];
  // Phone numbers are stored as typed ("+91 87805 28954"), so match the digits with anything between them
  if (digits.length >= 6) or.push({ phone: new RegExp(digits.slice(-10).split('').join('\\D*')) });
  else or.push({ phone: rx });
  const regs = await Registration.find({ $or: or })
    .populate('user', 'name email')
    .populate('event', 'title slug')
    .sort({ createdAt: -1 })
    .limit(50);
  res.json(regs.filter(r => r.event));
}));

// ── PUT /api/events/registrations/:id/transfer ──
// Move a seat to another email: the student lost access to the address they
// registered with, or registered with the wrong one. Body: { email, name?, note? }
// If nobody has signed in with that email yet, an account is created for it;
// the student just signs in with Google using that address.
router.put('/registrations/:id/transfer', protect, adminOnly, asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  if (!EMAIL_RX.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });

  const reg = await Registration.findById(req.params.id).populate('user', 'name email');
  if (!reg) return res.status(404).json({ message: 'Registration not found' });
  if (!['active', 'pending'].includes(reg.status)) {
    return res.status(400).json({ message: `This registration is ${reg.status}; only confirmed or pending seats can be moved` });
  }
  if (await RefundRequest.exists({ registration: reg._id, status: { $in: ['pending', 'approved'] } })) {
    return res.status(409).json({ message: 'This seat has an open refund request. Settle it in Refunds first.' });
  }
  const fromEmail = reg.user?.email || '';
  if (fromEmail.toLowerCase() === email) return res.status(400).json({ message: 'That is already the email on this registration' });

  let target = await User.findOne({ email });
  let created = false;
  if (!target) {
    const name = String(req.body.name || '').trim() || reg.user?.name || email.split('@')[0];
    target = await User.create({ name: name.slice(0, 120), email, role: 'student' });
    created = true;
  }

  const clash = await Registration.findOne({ user: target._id, event: reg.event });
  if (clash) {
    if (['active', 'pending'].includes(clash.status)) {
      return res.status(409).json({ message: `${email} already has a ${clash.status === 'active' ? 'confirmed' : 'pending'} seat in this program` });
    }
    await clash.deleteOne();   // an old rejected/refunded/cancelled attempt — the moved seat replaces it
  }

  reg.user = target._id;
  reg.history.push({
    action: 'transferred', from: fromEmail, to: email,
    note: String(req.body.note || '').trim().slice(0, 300), by: req.user._id,
  });
  await reg.save();
  meet.queueSync(reg.event);

  res.json({
    message: created
      ? `Seat moved to ${email}. They sign in with Google using that email and everything is there.`
      : `Seat moved to ${email}.`,
    createdAccount: created,
    registration: await reg.populate('user', 'name email'),
  });
}));

// ── PUT /api/events/registrations/:id/cancel ──
// Remove a confirmed seat. Body:
//   { reason, refund: false }                         → cancelled, no money back
//   { reason, refund: true, amount?, manual?, refundRef?, upiId? }
//       Razorpay: refunded through Razorpay now (manual: true if you already did it in the dashboard)
//       UPI:      recorded as approved in Refunds; send the money, then mark it sent there
router.put('/registrations/:id/cancel', protect, adminOnly, asyncHandler(async (req, res) => {
  const { payMethod } = require('../utils/refundWindow');
  const { settleRefund } = require('./refunds');

  const reg = await Registration.findById(req.params.id).populate('user', 'name email').populate('event', 'title');
  if (!reg) return res.status(404).json({ message: 'Registration not found' });
  if (reg.status !== 'active') {
    return res.status(400).json({ message: reg.status === 'pending' ? 'This payment isn’t confirmed yet. Use Reject instead.' : `This registration is already ${reg.status}` });
  }
  if (await RefundRequest.exists({ registration: reg._id, status: { $in: ['pending', 'approved'] } })) {
    return res.status(409).json({ message: 'The student already asked for a refund. Decide it in Refunds instead.' });
  }
  const reason = String(req.body.reason || '').trim().slice(0, 300);
  if (reason.length < 3) return res.status(400).json({ message: 'Write a short reason (kept in the seat history)' });

  let refund = null;
  if (req.body.refund) {
    const pm = payMethod(reg);
    if (!(reg.amount > 0) || !pm.paymentRef) return res.status(400).json({ message: 'Nothing was paid for this seat, so there is nothing to refund' });
    const upiId = String(req.body.upiId || '').trim().slice(0, 80);
    refund = new RefundRequest({
      user: reg.user._id, kind: 'event', event: reg.event._id, registration: reg._id, title: reg.event.title,
      type: 'admin', reason, amountPaid: reg.amount, method: pm.method, paymentRef: pm.paymentRef, upiId,
      window: { rule: 'admin', state: 'open', text: 'Refunded by the admin while cancelling the seat.' },
      eligible: true,
    });
    try {
      await settleRefund(refund, {
        amount: req.body.amount, manual: req.body.manual, refundRef: req.body.refundRef, removeAccess: true,
      });
    } catch (e) {
      if (e.status === 400) return res.status(400).json({ message: e.message });
      throw e;
    }
  }

  const fresh = await Registration.findById(reg._id);
  if (fresh.status === 'active') fresh.status = refund ? 'refunded' : 'cancelled';
  fresh.history.push({ action: 'cancelled', from: reg.user?.email || '', note: reason, by: req.user._id });
  await fresh.save();
  meet.queueSync(reg.event._id);

  res.json({
    message: !refund ? 'Seat cancelled. The student no longer has access.'
      : refund.status === 'refunded' ? `Seat cancelled and ₹${refund.refundAmount} refunded${refund.refundRef ? ` (${refund.refundRef})` : ''}.`
        : `Seat cancelled. Refund of ₹${refund.refundAmount} is recorded in Refunds: send it by UPI, then mark it sent there.`,
    status: fresh.status,
    refund: refund ? { refundId: refund._id, status: refund.status, amount: refund.refundAmount, refundRef: refund.refundRef } : null,
  });
}));

// ─────────────────────────────────────────────────────────
// MEET GUEST LIST (admin)
// ─────────────────────────────────────────────────────────
const meetView = async (event) => ({
  connected: meet.isConfigured(),
  enabled: Boolean(event.meetSync?.enabled),
  calendarEventId: event.meetSync?.calendarEventId || '',
  // Links on classes still to come: the meeting that matters now
  meetLinks: [...new Set(meet.currentSessions(event).map(s => s.joinUrl).filter(u => meet.meetCode(u)))],
  confirmed: await Registration.countDocuments({ event: event._id, status: 'active' }),
  guestsManaged: (event.meetSync?.managedEmails || []).length,
  lastSync: event.meetSync?.lastSync?.at ? event.meetSync.lastSync : null,
});

router.get('/:id/meet', protect, adminOnly, asyncHandler(async (req, res) => {
  const event = await LiveEvent.findById(req.params.id);
  if (!event) return res.status(404).json({ message: 'Event not found' });
  res.json(await meetView(event));
}));

// Body: { enabled?, calendarRef? }  calendarRef: event link or id; "" = find it from the Meet link
router.put('/:id/meet', protect, adminOnly, asyncHandler(async (req, res) => {
  const event = await LiveEvent.findById(req.params.id);
  if (!event) return res.status(404).json({ message: 'Event not found' });
  if (req.body.calendarRef !== undefined) {
    const raw = String(req.body.calendarRef || '').trim();
    const id = meet.parseEventRef(raw);
    if (raw && !id) return res.status(400).json({ message: 'That doesn’t look like a Google Calendar event link. Open the event in Google Calendar and copy the address from the browser, or leave it blank to find it from the Meet link.' });
    if (id !== event.meetSync.calendarEventId) event.meetSync.managedEmails = [];   // different meeting: start fresh
    event.meetSync.calendarEventId = id;
  }
  if (req.body.enabled !== undefined) event.meetSync.enabled = Boolean(req.body.enabled);
  await event.save();

  let sync = null;
  if (event.meetSync.enabled) {
    if (!meet.isConfigured()) {
      return res.status(400).json({ message: 'Saved, but Google Calendar isn’t connected on the server yet, so nothing was synced. See the setup steps.', ...(await meetView(event)) });
    }
    try { sync = await meet.syncEvent(event._id); }
    catch (e) { return res.status(400).json({ message: e.message, ...(await meetView(await LiveEvent.findById(event._id))) }); }
  }
  res.json({ message: sync ? sync.message : 'Meet guest list switched off. Guests already invited stay on the invite.', ...(await meetView(await LiveEvent.findById(event._id))) });
}));

router.post('/:id/meet/sync', protect, adminOnly, asyncHandler(async (req, res) => {
  const event = await LiveEvent.findById(req.params.id);
  if (!event) return res.status(404).json({ message: 'Event not found' });
  if (!event.meetSync?.enabled) return res.status(400).json({ message: 'Switch on the Meet guest list for this program first' });
  try {
    const r = await meet.syncEvent(event._id);
    res.json({ message: r.message, ...(await meetView(await LiveEvent.findById(event._id))) });
  } catch (e) {
    res.status(400).json({ message: e.message, ...(await meetView(await LiveEvent.findById(event._id))) });
  }
}));

// ── ADMIN: upload an event thumbnail image → returns Cloudinary URL ──
router.post('/upload-image', protect, adminOnly, uploadImage.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No image uploaded' });
  res.json({ url: req.file.path });
}));

module.exports = router;

