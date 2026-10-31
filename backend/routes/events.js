const express      = require('express');
const router       = express.Router();
const asyncHandler = require('express-async-handler');
const LiveEvent    = require('../models/LiveEvent');
const Registration = require('../models/Registration');
const Course       = require('../models/Course');
const Episode      = require('../models/Episode');
const Settings     = require('../models/Settings');
const { cloudinary, uploadImage } = require('../config/cloudinary');
const { protect, adminOnly } = require('../middleware/auth');

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

// Session list for a student: join + recording links only for confirmed
// registrations. Everyone else just learns whether a recording exists.
const shapeSessions = (sessions, active) => (sessions || []).map(s => ({
  ...s,
  joinUrl:      active ? s.joinUrl : '',
  recordingUrl: active ? s.recordingUrl : '',
  hasRecording: Boolean(s.recordingUrl),
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
  let touched = false;
  for (const session of event.sessions) {
    if (!session.recordingUrl && !session.publishedEpisode) continue;
    const before = String(session.publishedEpisode || '');
    await syncLesson(event, session);
    if (String(session.publishedEpisode || '') !== before) touched = true;
  }
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

  let shaped = events.map(e => shapeEvent(e, byEvt[String(e._id)]));

  // Upcoming events sort by their real start time (a virtual, so done in JS)
  if (scope === 'upcoming') {
    shaped.sort((a, b) => new Date(a.startsAt || 0) - new Date(b.startsAt || 0));
  }

  res.json(shaped);
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
  if (status && ['pending', 'active', 'rejected'].includes(status)) filter.status = status;

  const regs = await Registration.find(filter)
    .populate('user', 'name email avatar')
    .sort({ createdAt: -1 });

  res.json(regs);
}));

// ── GET /api/events/admin/pending — global approval queue ─
router.get('/admin/pending', protect, adminOnly, asyncHandler(async (req, res) => {
  const pending = await Registration.find({ status: 'pending' })
    .populate('user', 'name email avatar')
    .populate('event', 'title slug type price')
    .sort({ updatedAt: 1 });   // oldest first — fair queue
  res.json(pending);
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

// ── ADMIN: upload an event thumbnail image → returns Cloudinary URL ──
router.post('/upload-image', protect, adminOnly, uploadImage.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No image uploaded' });
  res.json({ url: req.file.path });
}));

module.exports = router;

