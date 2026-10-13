const express      = require('express');
const crypto       = require('crypto');
const router       = express.Router();
const asyncHandler = require('express-async-handler');

const Payment      = require('../models/Payment');
const Course       = require('../models/Course');
const Enrollment   = require('../models/Enrollment');
const LiveEvent    = require('../models/LiveEvent');
const Registration = require('../models/Registration');
const { protect, adminOnly } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────
// Razorpay — automatic payments for paid courses and paid events.
// Uses the Razorpay REST API directly (no extra npm package).
//
// Env (Render):
//   RAZORPAY_KEY_ID          rzp_live_...
//   RAZORPAY_KEY_SECRET      the secret shown once in the Razorpay dashboard
//   RAZORPAY_WEBHOOK_SECRET  any strong string you also type into the webhook setup
// ─────────────────────────────────────────────────────────

const KEY_ID     = () => process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = () => process.env.RAZORPAY_KEY_SECRET || '';
const isEnabled  = () => Boolean(KEY_ID() && KEY_SECRET());

const RZP_API = 'https://api.razorpay.com/v1';

async function rzp(method, path, body) {
  const auth = Buffer.from(`${KEY_ID()}:${KEY_SECRET()}`).toString('base64');
  const res = await fetch(`${RZP_API}${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.description || `Razorpay error (${res.status})`;
    const err = new Error(msg);
    err.status = 502;
    throw err;
  }
  return data;
}

const safeEqual = (a, b) => {
  const A = Buffer.from(String(a || ''));
  const B = Buffer.from(String(b || ''));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};

// Same rule as routes/events.js
const isRegistrationOpen = (event) => {
  if (!event.isPublished || event.isCompleted) return false;
  const now = new Date();
  if (event.registrationClosesAt) return event.registrationClosesAt > now;
  const first = event.sessions?.reduce(
    (min, s) => (!min || s.startsAt < min ? s.startsAt : min), null
  );
  return first ? first > now : false;
};

// ─────────────────────────────────────────────────────────
// Unlock access. Safe to run more than once for the same payment
// (verify call and webhook can both arrive).
// ─────────────────────────────────────────────────────────
async function upsertWithRetry(Model, filter, update) {
  const opts = { upsert: true, new: true, setDefaultsOnInsert: true };
  try {
    return await Model.findOneAndUpdate(filter, update, opts);
  } catch (e) {
    if (e.code !== 11000) throw e;           // parallel insert race → just retry as update
    return Model.findOneAndUpdate(filter, update, opts);
  }
}

async function fulfill(payment, rzpPayment = {}) {
  const paymentId = rzpPayment.id || payment.paymentId;
  const ref = `RZP ${paymentId}`;

  if (payment.kind === 'course') {
    const course = await Course.findById(payment.course).select('accessDays');
    const existing = await Enrollment.findOne({ user: payment.user, course: payment.course });

    // Already unlocked by this same payment → nothing to do
    const alreadyThis = existing && existing.status === 'active' && existing.utr === ref;
    if (!alreadyThis) {
      const accessDays = course?.accessDays || 0;
      await upsertWithRetry(Enrollment, { user: payment.user, course: payment.course }, {
        $set: {
          status: 'active',
          amount: payment.amount,
          utr: ref,
          rejectReason: '',
          approvedAt: new Date(),
          expiresAt: accessDays > 0 ? new Date(Date.now() + accessDays * 864e5) : null,
        },
      });
    }
  } else {
    const existing = await Registration.findOne({ user: payment.user, event: payment.event });
    const alreadyThis = existing && existing.status === 'active' && existing.utr === ref;
    if (!alreadyThis) {
      await upsertWithRetry(Registration, { user: payment.user, event: payment.event }, {
        $set: {
          status: 'active',
          amount: payment.amount,
          utr: ref,
          rejectReason: '',
          approvedAt: new Date(),
          phone:       payment.form?.phone || existing?.phone || '',
          college:     payment.form?.college || existing?.college || '',
          expectation: payment.form?.expectation || existing?.expectation || '',
        },
      });
    }
  }

  if (payment.status !== 'paid') {
    payment.status = 'paid';
    payment.paymentId = paymentId;
    payment.paidAt = new Date();
    if (rzpPayment.method) payment.method = rzpPayment.method;
    if (typeof rzpPayment.international === 'boolean') payment.international = rzpPayment.international;
    payment.failReason = '';
    await payment.save();
  }
}

// If the account isn't on auto-capture, a payment arrives as 'authorized'
// and Razorpay refunds it after a few days unless we capture it.
async function ensureCaptured(rzpPayment) {
  if (rzpPayment.status === 'authorized') {
    return rzp('POST', `/payments/${rzpPayment.id}/capture`, {
      amount: rzpPayment.amount,
      currency: rzpPayment.currency,
    });
  }
  return rzpPayment;
}

// What the student sees after a successful payment
async function successReply(payment) {
  if (payment.kind === 'course') {
    const course = await Course.findById(payment.course).select('slug title');
    return {
      status: 'active', kind: 'course',
      slug: course?.slug, title: course?.title,
      message: 'Payment successful — your course is unlocked.',
    };
  }
  const event = await LiveEvent.findById(payment.event);
  return {
    status: 'active', kind: 'event',
    slug: event?.slug,
    message: event?.confirmationMsg || 'Payment successful — you are registered!',
    whatsappLink: event?.whatsappLink || '',
    sessions: (event?.sessions || []).map(s => ({
      title: s.title, startsAt: s.startsAt, durationMins: s.durationMins, joinUrl: s.joinUrl,
    })),
  };
}

// ─────────────────────────────────────────────────────────
// GET /api/rzp/config — is online payment switched on?
// ─────────────────────────────────────────────────────────
router.get('/config', (req, res) => {
  res.json({ enabled: isEnabled(), keyId: isEnabled() ? KEY_ID() : '' });
});

// ─────────────────────────────────────────────────────────
// POST /api/rzp/order — create a Razorpay order.
// Body: { kind: 'course'|'event', id, phone?, college?, expectation? }
// The amount is ALWAYS taken from the database, never from the browser.
// ─────────────────────────────────────────────────────────
router.post('/order', protect, asyncHandler(async (req, res) => {
  if (!isEnabled()) return res.status(503).json({ message: 'Online payment is not available right now' });

  const { kind, id } = req.body;
  let amount, title, form = {};

  if (kind === 'course') {
    const course = await Course.findById(id);
    if (!course || !course.isPublished || !course.isPaid || !(course.price > 0)) {
      return res.status(404).json({ message: 'Course not found' });
    }
    const existing = await Enrollment.findOne({ user: req.user._id, course: course._id });
    if (existing?.status === 'active' && !(existing.expiresAt && existing.expiresAt <= new Date())) {
      return res.status(400).json({ message: 'You already own this course' });
    }
    amount = course.price;
    title  = course.title;

  } else if (kind === 'event') {
    const event = await LiveEvent.findById(id);
    if (!event || !event.isPublished || !event.isPaid || !(event.price > 0)) {
      return res.status(404).json({ message: 'Event not found' });
    }
    if (!isRegistrationOpen(event)) {
      return res.status(400).json({ message: 'Registration is closed for this event' });
    }
    const existing = await Registration.findOne({ user: req.user._id, event: event._id });
    if (existing?.status === 'active') {
      return res.status(400).json({ message: 'You are already registered' });
    }
    if (event.seatLimit > 0) {
      const taken = await Registration.countDocuments({
        event: event._id, status: { $in: ['active', 'pending'] },
        user: { $ne: req.user._id },
      });
      if (taken >= event.seatLimit) return res.status(400).json({ message: 'All seats are full' });
    }
    const phone = String(req.body.phone || '').trim();
    if (!phone) return res.status(400).json({ message: 'WhatsApp number is required' });
    form = {
      phone,
      college:     String(req.body.college || '').trim().slice(0, 200),
      expectation: String(req.body.expectation || '').trim().slice(0, 1000),
    };
    amount = event.price;
    title  = event.title;

  } else {
    return res.status(400).json({ message: 'Invalid payment type' });
  }

  const order = await rzp('POST', '/orders', {
    amount: Math.round(amount * 100),        // paise
    currency: 'INR',
    receipt: `${kind}_${String(id).slice(-8)}_${Date.now().toString(36)}`.slice(0, 40),
    notes: { kind, refId: String(id), userId: String(req.user._id), email: req.user.email || '' },
  });

  await Payment.create({
    user: req.user._id,
    kind,
    course: kind === 'course' ? id : null,
    event:  kind === 'event'  ? id : null,
    amount,
    currency: 'INR',
    orderId: order.id,
    form,
  });

  res.status(201).json({
    keyId: KEY_ID(),
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    name: 'codeWithShivah',
    description: title.slice(0, 250),
    prefill: {
      name:    req.user.name || '',
      email:   req.user.email || '',
      contact: form.phone || '',
    },
  });
}));

// ─────────────────────────────────────────────────────────
// POST /api/rzp/verify — called by the browser right after checkout succeeds.
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
// ─────────────────────────────────────────────────────────
router.post('/verify', protect, asyncHandler(async (req, res) => {
  const {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
  } = req.body;
  if (!orderId || !paymentId || !signature) {
    return res.status(400).json({ message: 'Incomplete payment response' });
  }

  const expected = crypto.createHmac('sha256', KEY_SECRET())
    .update(`${orderId}|${paymentId}`).digest('hex');
  if (!safeEqual(expected, signature)) {
    return res.status(400).json({ message: 'Payment signature mismatch — contact support if money was deducted' });
  }

  const payment = await Payment.findOne({ orderId });
  if (!payment || String(payment.user) !== String(req.user._id)) {
    return res.status(404).json({ message: 'Payment record not found' });
  }

  let rzpPayment = await rzp('GET', `/payments/${paymentId}`);
  if (rzpPayment.order_id !== orderId) {
    return res.status(400).json({ message: 'Payment does not belong to this order' });
  }
  rzpPayment = await ensureCaptured(rzpPayment);

  await fulfill(payment, rzpPayment);
  res.json(await successReply(payment));
}));

// ─────────────────────────────────────────────────────────
// POST /api/rzp/webhook — Razorpay server → our server.
// Backup path: unlocks access even if the student closed the tab
// before /verify ran. server.js gives this route the RAW body.
// ─────────────────────────────────────────────────────────
router.post('/webhook', asyncHandler(async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ message: 'Webhook not configured' });

  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  if (!safeEqual(expected, req.headers['x-razorpay-signature'])) {
    return res.status(400).json({ message: 'Invalid signature' });
  }

  let evt;
  try { evt = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).end(); }

  const pay = evt?.payload?.payment?.entity;
  const orderId = evt?.payload?.order?.entity?.id || pay?.order_id;
  if (!orderId) return res.json({ ok: true });

  const payment = await Payment.findOne({ orderId });
  if (!payment) return res.json({ ok: true });   // not one of ours (e.g. MentorHub / payment link)

  try {
    if (evt.event === 'payment.failed') {
      if (payment.status !== 'paid') {
        payment.status = 'failed';
        payment.failReason = pay?.error_description || '';
        await payment.save();
      }
    } else if (['payment.authorized', 'payment.captured', 'order.paid'].includes(evt.event) && pay) {
      const captured = await ensureCaptured(pay);
      await fulfill(payment, captured);
    }
  } catch (e) {
    console.error('Razorpay webhook error:', e.message);
    return res.status(500).json({ message: 'Retry later' });   // Razorpay will retry
  }

  res.json({ ok: true });
}));

// ─────────────────────────────────────────────────────────
// GET /api/rzp/admin/payments — online payment log for the admin panel
// ─────────────────────────────────────────────────────────
router.get('/admin/payments', protect, adminOnly, asyncHandler(async (req, res) => {
  const filter = {};
  if (['created', 'paid', 'failed'].includes(req.query.status)) filter.status = req.query.status;
  const rows = await Payment.find(filter)
    .populate('user', 'name email')
    .populate('course', 'title')
    .populate('event', 'title')
    .sort({ createdAt: -1 })
    .limit(300);
  res.json(rows);
}));

module.exports = router;
