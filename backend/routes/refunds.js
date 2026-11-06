const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const RefundRequest = require('../models/RefundRequest');
const Registration = require('../models/Registration');
const Enrollment = require('../models/Enrollment');
const LiveEvent = require('../models/LiveEvent');
const Course = require('../models/Course');
const { protect, adminOnly } = require('../middleware/auth');
const { liveWindow, courseWindow, issueWindow, payMethod, istFmt } = require('../utils/refundWindow');
const razorpay = require('./razorpay');

// ── Refunds ───────────────────────────────────────────────
// Students ask from their Refunds page (always there, listing every paid
// purchase and when its refund window is open). Admin approves, which can
// refund through Razorpay automatically, or marks a UPI refund as sent.

const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));
const OPEN = ['pending', 'approved'];
const UPI_RX = /^[\w.\-]{2,}@[a-zA-Z][\w.\-]*$/;

// Every paid purchase of a student, with its refund window right now
async function purchasesOf(userId, now = new Date()) {
  const [regs, enrs, requests] = await Promise.all([
    Registration.find({ user: userId, status: { $in: ['active', 'rejected', 'refunded', 'cancelled'] }, amount: { $gt: 0 } }),
    Enrollment.find({ user: userId, status: { $in: ['active', 'rejected', 'refunded'] }, amount: { $gt: 0 } }),
    RefundRequest.find({ user: userId }).sort({ createdAt: -1 }),
  ]);
  const events = await LiveEvent.find({ _id: { $in: regs.map(r => r.event) } }).select('title slug sessions');
  const courses = await Course.find({ _id: { $in: enrs.map(e => e.course) } }).select('title slug');
  const evById = new Map(events.map(e => [String(e._id), e]));
  const coById = new Map(courses.map(c => [String(c._id), c]));
  const openReq = (field, id) => requests.find(r => String(r[field]) === String(id) && OPEN.includes(r.status));

  const out = [];
  for (const r of regs) {
    const ev = evById.get(String(r.event)); if (!ev) continue;
    const pm = payMethod(r);
    if (!pm.paymentRef) continue;   // nothing was paid against it
    out.push({
      kind: 'event', id: r._id, title: ev.title, slug: ev.slug, status: r.status, amountPaid: r.amount,
      paidAt: r.createdAt, confirmedAt: r.approvedAt, ...pm,
      window: r.status === 'active' ? liveWindow(ev, r, now) : { rule: 'none', state: 'none' },
      issue: issueWindow(r, now),
      openRequest: openReq('registration', r._id)?._id || null,
    });
  }
  for (const e of enrs) {
    const co = coById.get(String(e.course)); if (!co) continue;
    const pm = payMethod(e);
    if (!pm.paymentRef) continue;
    out.push({
      kind: 'course', id: e._id, title: co.title, slug: co.slug, status: e.status, amountPaid: e.amount,
      paidAt: e.createdAt, confirmedAt: e.approvedAt, ...pm,
      window: e.status === 'active' ? courseWindow(e, now) : { rule: 'none', state: 'none' },
      issue: issueWindow(e, now),
      openRequest: openReq('enrollment', e._id)?._id || null,
    });
  }
  out.sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));
  return { purchases: out, requests };
}

const studentView = (r) => ({
  _id: r._id, kind: r.kind, title: r.title, type: r.type, reason: r.reason, amountPaid: r.amountPaid,
  method: r.method, upiId: r.upiId, status: r.status, refundAmount: r.refundAmount, refundRef: r.refundRef,
  adminNote: r.adminNote, eligible: r.eligible, window: r.window, createdAt: r.createdAt,
  decidedAt: r.decidedAt, refundedAt: r.refundedAt,
});

// ── Student: purchases + their requests ──
router.get('/mine', protect, asyncHandler(async (req, res) => {
  const { purchases, requests } = await purchasesOf(req.user._id);
  res.json({ now: new Date(), purchases, requests: requests.map(studentView) });
}));

// ── Student: ask for a refund ──
router.post('/', protect, asyncHandler(async (req, res) => {
  const { kind, id, type, reason = '', upiId = '' } = req.body;
  if (!['event', 'course'].includes(kind) || !isId(id)) return res.status(400).json({ message: 'Pick what you want refunded' });
  if (!['guarantee', 'payment_issue'].includes(type)) return res.status(400).json({ message: 'Pick a reason type' });

  const now = new Date();
  const { purchases } = await purchasesOf(req.user._id, now);
  const p = purchases.find(x => x.kind === kind && String(x.id) === String(id));
  if (!p) return res.status(404).json({ message: 'We couldn’t find this purchase on your account' });
  if (p.openRequest) return res.status(409).json({ message: 'You already have a refund request open for this. We’ll reply within 2 working days.' });

  const text = String(reason).trim().slice(0, 1500);
  let window, eligible;
  if (type === 'guarantee') {
    if (p.status !== 'active') return res.status(400).json({ message: 'This purchase is not active, so there’s nothing to refund under the guarantee' });
    window = p.window;
    if (window.state !== 'open') {
      const msg = window.rule === 'single' ? 'Single-class workshops are final once you register. If there was a payment problem, choose that option instead.'
        : window.state === 'early' ? `Your refund window opens on ${istFmt(window.opensAt)}, when the class ends.`
          : `Your refund window closed on ${istFmt(window.closesAt)}. If there was a payment problem, choose that option instead.`;
      return res.status(400).json({ message: msg });
    }
    eligible = true;
  } else {
    if (text.length < 10) return res.status(400).json({ message: 'Tell us what went wrong with the payment' });
    window = { rule: 'issue', ...p.issue, text: 'Payment problems can be reported within 30 days of paying.' };
    if (window.state !== 'open') return res.status(400).json({ message: `Payment problems can be reported within 30 days of paying. This one was paid on ${istFmt(p.paidAt)}.` });
    eligible = true;   // admin checks the facts
  }

  const upi = String(upiId).trim();
  if (p.method === 'upi' && !UPI_RX.test(upi)) {
    return res.status(400).json({ message: 'Enter the UPI ID you paid from (like name@okaxis). The refund goes there.' });
  }

  const doc = await RefundRequest.create({
    user: req.user._id, kind, title: p.title,
    event: kind === 'event' ? (await Registration.findById(id).select('event')).event : null,
    course: kind === 'course' ? (await Enrollment.findById(id).select('course')).course : null,
    registration: kind === 'event' ? id : null,
    enrollment: kind === 'course' ? id : null,
    type, reason: text, amountPaid: p.amountPaid, method: p.method, paymentRef: p.paymentRef,
    upiId: p.method === 'upi' ? upi : '',
    window: { rule: window.rule, state: window.state, opensAt: window.opensAt, closesAt: window.closesAt, text: window.text || '' },
    eligible,
  });
  res.status(201).json(studentView(doc));
}));

// ── Student: withdraw a pending request ──
router.delete('/:id', protect, asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ message: 'Request not found' });
  const r = await RefundRequest.findOne({ _id: req.params.id, user: req.user._id });
  if (!r) return res.status(404).json({ message: 'Request not found' });
  if (r.status !== 'pending') return res.status(400).json({ message: 'This request has already been handled' });
  await r.deleteOne();
  res.json({ message: 'Request withdrawn' });
}));

// ═══ ADMIN ═══
const adminView = (r) => {
  const sinceOpen = r.window?.opensAt ? new Date(r.createdAt) - new Date(r.window.opensAt) : null;
  const leftAtSubmit = r.window?.closesAt ? new Date(r.window.closesAt) - new Date(r.createdAt) : null;
  return {
    ...studentView(r),
    user: r.user ? { _id: r.user._id, name: r.user.name, email: r.user.email } : null,
    paymentRef: r.paymentRef, accessRemoved: r.accessRemoved,
    msAfterOpen: sinceOpen, msLeftAtSubmit: leftAtSubmit,
    canAutoRefund: r.method === 'razorpay' && /^pay_/.test(r.paymentRef) && razorpay.isEnabled(),
  };
};

router.get('/admin', protect, adminOnly, asyncHandler(async (req, res) => {
  const { status = 'open' } = req.query;
  const filter = status === 'open' ? { status: { $in: OPEN } } : status === 'all' ? {} : { status };
  const list = await RefundRequest.find(filter).populate('user', 'name email').sort({ createdAt: status === 'open' ? 1 : -1 }).limit(300);
  res.json(list.map(adminView));
}));

const removeAccess = async (r) => {
  if (r.registration) await Registration.updateOne({ _id: r.registration, status: 'active' }, { $set: { status: 'refunded' } });
  if (r.enrollment) await Enrollment.updateOne({ _id: r.enrollment, status: 'active' }, { $set: { status: 'refunded' } });
  r.accessRemoved = true;
};

const loadReq = async (req, res) => {
  if (!isId(req.params.id)) { res.status(404).json({ message: 'Request not found' }); return null; }
  const r = await RefundRequest.findById(req.params.id).populate('user', 'name email');
  if (!r) { res.status(404).json({ message: 'Request not found' }); return null; }
  return r;
};

// Settle an agreed refund. Razorpay payments are refunded through Razorpay
// right away (unless manual: true, i.e. you already did it in the dashboard).
// UPI ones become "approved" until you send the money. Throws { status } on a
// problem, before anything is saved. Shared by request approval and by
// cancelling a registration from the admin panel.
async function settleRefund(r, { amount, manual, refundRef, removeAccess: revoke }) {
  amount = Math.round(Number(amount ?? r.amountPaid));
  if (!(amount > 0) || amount > r.amountPaid) {
    const e = new Error(`Amount must be between ₹1 and ₹${r.amountPaid}`); e.status = 400; throw e;
  }
  r.refundAmount = amount;
  r.decidedAt = new Date();
  if (r.method === 'razorpay' && !manual) {
    if (!razorpay.isEnabled() || !/^pay_/.test(r.paymentRef)) {
      const e = new Error('Online refund isn’t available for this payment. Refund it from the Razorpay dashboard, then use “Mark refunded”.'); e.status = 400; throw e;
    }
    // Razorpay amounts are in paise. Throws on failure, so nothing is saved.
    const rf = await razorpay.rzp('POST', `/payments/${r.paymentRef}/refund`, {
      amount: amount * 100, speed: 'normal', notes: { reason: `Refund ${r._id}` },
    });
    r.status = 'refunded';
    r.refundRef = rf.id || '';
    r.refundedAt = new Date();
  } else if (manual) {
    r.status = 'refunded';
    r.refundRef = String(refundRef || '').trim().slice(0, 80);
    r.refundedAt = new Date();
  } else {
    r.status = 'approved';   // UPI: send the money, then mark it paid
  }
  if (revoke) await removeAccess(r);
  await r.save();
  return r;
}

router.put('/:id/approve', protect, adminOnly, asyncHandler(async (req, res) => {
  const r = await loadReq(req, res); if (!r) return;
  if (r.status !== 'pending') return res.status(400).json({ message: `Already ${r.status}` });
  try {
    await settleRefund(r, {
      amount: req.body.amount, manual: req.body.manual, refundRef: req.body.refundRef,
      removeAccess: req.body.removeAccess ?? (r.type === 'guarantee'),
    });
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ message: e.message });
    throw e;
  }
  res.json(adminView(r));
}));

// UPI refund sent
router.put('/:id/paid', protect, adminOnly, asyncHandler(async (req, res) => {
  const r = await loadReq(req, res); if (!r) return;
  if (r.status !== 'approved') return res.status(400).json({ message: 'Approve the request first' });
  r.status = 'refunded';
  r.refundRef = String(req.body.refundRef || '').trim().slice(0, 80);
  r.refundedAt = new Date();
  await r.save();
  res.json(adminView(r));
}));

router.put('/:id/reject', protect, adminOnly, asyncHandler(async (req, res) => {
  const r = await loadReq(req, res); if (!r) return;
  if (r.status !== 'pending') return res.status(400).json({ message: `Already ${r.status}` });
  const note = String(req.body.reason || '').trim();
  if (!note) return res.status(400).json({ message: 'Write a short reason. The student sees it.' });
  r.status = 'rejected';
  r.adminNote = note.slice(0, 600);
  r.decidedAt = new Date();
  await r.save();
  res.json(adminView(r));
}));

module.exports = router;
module.exports.purchasesOf = purchasesOf;
module.exports.settleRefund = settleRefund;
module.exports.adminView = adminView;
