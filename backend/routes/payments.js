const express    = require('express');
const router     = express.Router();
const asyncHandler = require('express-async-handler');
const Enrollment = require('../models/Enrollment');
const Course     = require('../models/Course');
const Settings   = require('../models/Settings');
const { cloudinary, uploadImage } = require('../config/cloudinary');
const { protect, adminOnly } = require('../middleware/auth');

// ── Payment info for a course (UPI id + amount) ──────────
router.get('/info/:slug', protect, asyncHandler(async (req, res) => {
  const course = await Course.findOne({ slug: req.params.slug, isPublished: true })
    .select('title slug price mrp isPaid thumbnail');
  if (!course || !course.isPaid) {
    return res.status(404).json({ message: 'Course not found' });
  }
  const settings = await Settings.get();
  if (!settings.upiId) {
    return res.status(503).json({ message: 'Payments are not configured yet. Please contact support.' });
  }

  // existing enrollment state, so the page can show pending/rejected/active
  const existing = await Enrollment.findOne({ user: req.user._id, course: course._id })
    .select('status rejectReason utr expiresAt');
  const isExpired = existing && existing.status === 'active'
    && existing.expiresAt && existing.expiresAt <= new Date();

  res.json({
    course: {
      id: course._id, title: course.title, slug: course.slug,
      price: course.price, mrp: course.mrp, thumbnail: course.thumbnail,
    },
    upiId:   settings.upiId,
    upiName: settings.upiName,
    note:    settings.paymentNote,
    existing: existing ? {
      status: isExpired ? 'expired' : existing.status,
      rejectReason: existing.rejectReason,
      utr: existing.utr,
      expiresAt: existing.expiresAt,
    } : null,
  });
}));

// ── Student submits payment proof (UTR + optional screenshot) ──
router.post('/submit', protect, uploadImage.single('screenshot'), asyncHandler(async (req, res) => {
  const { courseId, utr } = req.body;
  if (!courseId || !utr || !utr.trim()) {
    return res.status(400).json({ message: 'Course and UTR / transaction ID are required' });
  }

  const course = await Course.findById(courseId);
  if (!course || !course.isPublished || !course.isPaid) {
    return res.status(404).json({ message: 'Course not found' });
  }

  let enrollment = await Enrollment.findOne({ user: req.user._id, course: course._id });

  if (enrollment && enrollment.status === 'active') {
    const expired = enrollment.expiresAt && enrollment.expiresAt <= new Date();
    if (!expired) {
      return res.status(400).json({ message: 'You already own this course' });
    }
    // expired -> fall through: this becomes a renewal submission
  }
  if (enrollment && enrollment.status === 'pending') {
    return res.status(400).json({ message: 'Your payment is already under verification' });
  }

  const payload = {
    status: 'pending',
    amount: course.price,
    utr: utr.trim(),
    rejectReason: '',
    screenshotUrl:      req.file ? req.file.path : '',
    screenshotPublicId: req.file ? req.file.filename : '',
  };

  if (enrollment) {
    // rejected earlier -> resubmission: clean old screenshot
    if (enrollment.screenshotPublicId && req.file) {
      try { await cloudinary.uploader.destroy(enrollment.screenshotPublicId); } catch (e) {}
    }
    Object.assign(enrollment, payload);
    await enrollment.save();
  } else {
    enrollment = await Enrollment.create({
      user: req.user._id,
      course: course._id,
      ...payload,
    });
  }

  res.status(201).json({
    message: 'Payment submitted. Access will be unlocked after verification.',
    status: enrollment.status,
  });
}));

// ── ADMIN: pending payments queue ────────────────────────
router.get('/pending', protect, adminOnly, asyncHandler(async (req, res) => {
  const pending = await Enrollment.find({ status: 'pending' })
    .populate('user', 'name email avatar')
    .populate('course', 'title slug price')
    .sort({ updatedAt: 1 });   // oldest first — fair queue
  res.json(pending);
}));

// ── ADMIN: payment history (all paid enrollments) ────────
router.get('/all', protect, adminOnly, asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = { amount: { $gt: 0 } };
  if (status && ['pending', 'active', 'rejected'].includes(status)) filter.status = status;
  const payments = await Enrollment.find(filter)
    .populate('user', 'name email')
    .populate('course', 'title')
    .sort({ updatedAt: -1 })
    .limit(200);
  res.json(payments);
}));

// ── ADMIN: approve ───────────────────────────────────────
router.put('/:id/approve', protect, adminOnly, asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findById(req.params.id)
    .populate('user', 'name email')
    .populate('course', 'title accessDays');
  if (!enrollment) return res.status(404).json({ message: 'Payment not found' });
  if (enrollment.status !== 'pending') {
    return res.status(400).json({ message: `Already ${enrollment.status}` });
  }
  enrollment.status = 'active';
  enrollment.approvedAt = new Date();
  const accessDays = enrollment.course?.accessDays || 0;
  enrollment.expiresAt = accessDays > 0
    ? new Date(Date.now() + accessDays * 24 * 60 * 60 * 1000)
    : null;
  await enrollment.save();
  res.json({ message: 'Approved — access unlocked', enrollment });
}));

// ── ADMIN: reject ────────────────────────────────────────
router.put('/:id/reject', protect, adminOnly, asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findById(req.params.id);
  if (!enrollment) return res.status(404).json({ message: 'Payment not found' });
  if (enrollment.status !== 'pending') {
    return res.status(400).json({ message: `Already ${enrollment.status}` });
  }
  enrollment.status = 'rejected';
  enrollment.rejectReason = (req.body.reason || 'Payment could not be verified').trim();
  await enrollment.save();
  res.json({ message: 'Rejected', enrollment });
}));

module.exports = router;
