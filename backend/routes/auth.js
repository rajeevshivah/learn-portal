const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const User    = require('../models/User');
const { protect } = require('../middleware/auth');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Generate JWT
// sid = this login's session id. With "one device at a time" on, only the
// newest sid is accepted for a student (see middleware/auth.js).
const generateToken = (id, sid) =>
  jwt.sign({ id, sid }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

// ── POST /api/auth/google ────────────────────────────────
// Frontend sends the Google credential token after user clicks "Sign in with Google"
router.post('/google', async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ message: 'Google credential required' });
  }

  try {
    // Verify the token with Google
    const ticket = await client.verifyIdToken({
      idToken:  credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const { sub: googleId, name, email, picture } = ticket.getPayload();

    // Find or create user
    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name,
        email,
        avatar:   picture,
        googleId,
        role: 'student',
      });
    } else {
      // Keep Google info fresh on every login (photo changes, first-time link, etc.)
      let changed = false;
      if (!user.googleId)                { user.googleId = googleId; changed = true; }
      if (picture && user.avatar !== picture) { user.avatar = picture; changed = true; }
      if (changed) await user.save();
    }

    // New login → new session id; any older device's token stops working.
    const sid = crypto.randomBytes(16).toString('hex');
    await User.updateOne({ _id: user._id }, { $set: { sessionId: sid } });

    res.json({
      _id:   user._id,
      name:  user.name,
      email: user.email,
      avatar: user.avatar,
      role:  user.role,
      token: generateToken(user._id, sid),
    });

  } catch (err) {
    console.error('Google auth error:', err.message);
    res.status(401).json({ message: 'Google authentication failed' });
  }
});

// ── GET /api/auth/me ─────────────────────────────────────
// Returns logged-in user data
router.get('/me', protect, async (req, res) => {
  res.json({
    _id:    req.user._id,
    name:   req.user.name,
    email:  req.user.email,
    avatar: req.user.avatar,
    role:   req.user.role,
  });
});


// ── GET /api/auth/users  (admin) — student directory ─────
const asyncHandler = require('express-async-handler');
const Enrollment = require('../models/Enrollment');
const { adminOnly } = require('../middleware/auth');

router.get('/users', protect, adminOnly, asyncHandler(async (req, res) => {
  const { search } = req.query;
  const filter = {};
  if (search && search.trim()) {
    const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const users = await User.find(filter)
    .select('name email avatar role createdAt')
    .sort({ createdAt: -1 })
    .limit(100);

  const ids = users.map(u => u._id);
  const enrollments = await Enrollment.find({ user: { $in: ids } })
    .populate('course', 'title')
    .select('user course status amount updatedAt');

  const Registration = require('../models/Registration');
  const regs = await Registration.find({ user: { $in: ids } })
    .populate('event', 'title')
    .select('user event status amount utr phone createdAt');
  const regsByUser = {};
  regs.forEach(r => {
    if (!r.event) return;
    const k = String(r.user);
    (regsByUser[k] = regsByUser[k] || []).push({
      registrationId: r._id, event: r.event.title, status: r.status, amount: r.amount,
      paymentRef: r.utr, phone: r.phone, registeredAt: r.createdAt,
    });
  });

  const byUser = {};
  enrollments.forEach(e => {
    const k = String(e.user);
    if (!byUser[k]) byUser[k] = [];
    if (e.course) byUser[k].push({
      title: e.course.title, status: e.status, amount: e.amount, updatedAt: e.updatedAt,
    });
  });

  res.json(users.map(u => ({
    ...u.toObject(),
    enrollments: byUser[String(u._id)] || [],
    registrations: regsByUser[String(u._id)] || [],
  })));
}));

// ── PUT /api/auth/users/:id/sign-out  (admin) — end every session of a student ──
router.put('/users/:id/sign-out', protect, adminOnly, asyncHandler(async (req, res) => {
  const u = await User.findById(req.params.id).select('email');
  if (!u) return res.status(404).json({ message: 'Student not found' });
  await User.updateOne({ _id: u._id }, { $set: { sessionId: crypto.randomBytes(16).toString('hex') } });
  res.json({ message: `${u.email} is signed out on every device. They can sign in again with Google.` });
}));

module.exports = router;

