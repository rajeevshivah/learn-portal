const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const User    = require('../models/User');
const bcrypt  = require('bcryptjs');
const asyncHandler = require('express-async-handler');
const { protect, adminOnly } = require('../middleware/auth');
const Settings = require('../models/Settings');
const mailer  = require('../utils/mailer');

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
    let user = await User.findOne({ email }).select('+password');

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

    res.json({ ...publicUser(user), token: generateToken(user._id, sid) });

  } catch (err) {
    console.error('Google auth error:', err.message);
    res.status(401).json({ message: 'Google authentication failed' });
  }
});

// ═══════════════ Email / mobile + password ═══════════════
// For students who struggle with Google sign-in on a shared or new phone.

const publicUser = (u) => ({
  _id: u._id, name: u.name, email: u.email, phone: u.phone || '', avatar: u.avatar, role: u.role,
  hasPassword: Boolean(u.password),
});
// Indian mobile: 10 digits, optional +91 / 0 in front
const normPhone = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  const ten = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 11 && d.startsWith('0') ? d.slice(1) : d;
  return /^[6-9]\d{9}$/.test(ten) ? ten : '';
};
const normEmail = (v) => String(v || '').trim().toLowerCase();
const okEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const maskEmail = (e) => { const [u, d] = e.split('@'); return `${u.slice(0, 2)}${'•'.repeat(Math.max(2, u.length - 2))}@${d}`; };
const newSid = () => crypto.randomBytes(16).toString('hex');
const hash = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

// Who is this? Accepts an email or a mobile number.
async function findByLogin(id, extraSelect = '') {
  const email = normEmail(id), phone = normPhone(id);
  if (okEmail(email)) return User.findOne({ email }).select(extraSelect);
  if (phone) return User.findOne({ phone }).select(extraSelect);
  return null;
}
async function passwordSignupOn() {
  try { return (await Settings.get()).passwordSignup !== false; } catch { return true; }
}

// Simple rate limit for guessing: per IP+login, 10 tries per 15 min
const attempts = new Map();
function tooMany(key) {
  const now = Date.now();
  const a = attempts.get(key) || { n: 0, at: now };
  if (now - a.at > 15 * 60e3) { a.n = 0; a.at = now; }
  a.n++; attempts.set(key, a);
  if (attempts.size > 5000) for (const [k, v] of attempts) if (now - v.at > 15 * 60e3) attempts.delete(k);
  return a.n > 10;
}

// ── GET /api/auth/options — what the login page should show ──
router.get('/options', asyncHandler(async (req, res) => {
  res.json({ google: Boolean(process.env.GOOGLE_CLIENT_ID), password: await passwordSignupOn(), mail: mailer.enabled() });
}));

// ── POST /api/auth/register { name, phone, email, password } ──
router.post('/register', asyncHandler(async (req, res) => {
  if (!await passwordSignupOn()) return res.status(403).json({ message: 'Sign-up with a password is switched off. Please sign in with Google.' });
  const name = String(req.body.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const email = normEmail(req.body.email);
  const phone = normPhone(req.body.phone);
  const password = String(req.body.password || '');
  if (name.length < 2) return res.status(400).json({ field: 'name', message: 'Please enter your name' });
  if (!phone) return res.status(400).json({ field: 'phone', message: 'Enter a 10-digit mobile number' });
  if (!okEmail(email)) return res.status(400).json({ field: 'email', message: 'Enter a valid email address' });
  if (password.length < 6) return res.status(400).json({ field: 'password', message: 'Password needs at least 6 characters' });

  const byEmail = await User.findOne({ email }).select('+password');
  if (byEmail) {
    return res.status(409).json({ field: 'email', code: byEmail.password ? 'HAS_ACCOUNT' : 'GOOGLE_ACCOUNT',
      message: byEmail.password
        ? 'You already have an account with this email. Sign in instead.'
        : 'This email already signed in with Google. Use the Google button, or tap “Forgot password” to set a password for it.' });
  }
  if (await User.findOne({ phone })) {
    return res.status(409).json({ field: 'phone', message: 'This mobile number is already on an account. Sign in, or use Forgot password.' });
  }

  const user = await User.create({ name, email, phone, password: await bcrypt.hash(password, 10), role: 'student', sessionId: newSid() });
  const fresh = await User.findById(user._id).select('+sessionId');
  // Mail the same details they see on screen; don't make them wait for it
  mailer.welcome({ name, email, phone, password }).catch(() => {});
  res.status(201).json({ ...publicUser({ ...fresh.toObject(), password: 'set' }), token: generateToken(user._id, fresh.sessionId), mailed: mailer.enabled() });
}));

// ── POST /api/auth/login { id (email or mobile), password } ──
router.post('/login', asyncHandler(async (req, res) => {
  const id = String(req.body.id || '').trim(), password = String(req.body.password || '');
  if (!id || !password) return res.status(400).json({ message: 'Enter your email or mobile, and your password' });
  if (tooMany(`${req.ip}|${id.toLowerCase()}`)) return res.status(429).json({ message: 'Too many tries. Wait 15 minutes, or use Forgot password.' });
  const user = await findByLogin(id, '+password');
  if (!user) return res.status(401).json({ message: 'No account with this email or mobile. Check it, or sign up below.' });
  if (!user.password) return res.status(401).json({ code: 'GOOGLE_ACCOUNT', message: 'This account uses Google sign-in. Use the Google button, or tap “Forgot password” to set a password.' });
  if (!await bcrypt.compare(password, user.password)) return res.status(401).json({ message: 'Wrong password. Try again, or tap “Forgot password”.' });
  const sid = newSid();
  await User.updateOne({ _id: user._id }, { $set: { sessionId: sid } });
  res.json({ ...publicUser(user), token: generateToken(user._id, sid) });
}));

// ── POST /api/auth/forgot { id } — email a 6-digit code ──
router.post('/forgot', asyncHandler(async (req, res) => {
  const id = String(req.body.id || '').trim();
  if (!id) return res.status(400).json({ message: 'Enter your email or mobile number' });
  if (tooMany(`forgot|${req.ip}`)) return res.status(429).json({ message: 'Too many tries. Wait 15 minutes.' });
  const user = await findByLogin(id);
  // Same answer whether or not the account exists, so emails can't be probed
  const generic = { message: 'If an account exists for that, we’ve emailed a 6-digit code to it.' };
  if (!user) return res.json({ ...generic, to: '' });
  if (!mailer.enabled()) {
    return res.status(503).json({ code: 'MAIL_OFF', message: 'Password reset by email isn’t available right now. Message Rajeev sir on WhatsApp and he’ll reset it for you.' });
  }
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  await User.updateOne({ _id: user._id }, { $set: { reset: { hash: hash(code), expiresAt: new Date(Date.now() + 15 * 60e3), tries: 0 } } });
  const r = await mailer.resetCode({ name: user.name, email: user.email, code });
  if (!r.sent) return res.status(503).json({ code: 'MAIL_OFF', message: 'Couldn’t send the email right now. Message Rajeev sir on WhatsApp and he’ll reset it for you.' });
  res.json({ ...generic, to: maskEmail(user.email) });
}));

// ── POST /api/auth/reset { id, code, password } — set the new password and sign in ──
router.post('/reset', asyncHandler(async (req, res) => {
  const id = String(req.body.id || '').trim(), code = String(req.body.code || '').replace(/\D/g, ''), password = String(req.body.password || '');
  if (password.length < 6) return res.status(400).json({ field: 'password', message: 'Password needs at least 6 characters' });
  const user = await findByLogin(id, '+reset');
  const r = user?.reset;
  if (!user || !r || !r.hash || r.expiresAt < Date.now()) return res.status(400).json({ message: 'That code has expired. Ask for a new one.' });
  if (r.tries >= 5) return res.status(400).json({ message: 'Too many wrong codes. Ask for a new one.' });
  if (hash(code) !== r.hash) {
    await User.updateOne({ _id: user._id }, { $inc: { 'reset.tries': 1 } });
    return res.status(400).json({ message: 'That code isn’t right. Check the email and try again.' });
  }
  const sid = newSid();
  await User.updateOne({ _id: user._id }, { $set: { password: await bcrypt.hash(password, 10), sessionId: sid, reset: null } });
  res.json({ ...publicUser({ ...user.toObject(), password: 'set' }), token: generateToken(user._id, sid), message: 'Password changed. You’re signed in.' });
}));

// ── POST /api/auth/password { current?, next } — change (or set) password while signed in ──
router.post('/password', protect, asyncHandler(async (req, res) => {
  if (req.apiKey) return res.status(403).json({ message: 'Sign in on the website to change your password' });
  const next = String(req.body.next || '');
  if (next.length < 6) return res.status(400).json({ message: 'Password needs at least 6 characters' });
  const user = await User.findById(req.user._id).select('+password');
  if (user.password && !await bcrypt.compare(String(req.body.current || ''), user.password)) return res.status(400).json({ message: 'Current password is wrong' });
  const phone = req.body.phone !== undefined ? normPhone(req.body.phone) : undefined;
  if (req.body.phone !== undefined && !phone) return res.status(400).json({ message: 'Enter a 10-digit mobile number' });
  if (phone && await User.findOne({ phone, _id: { $ne: user._id } })) return res.status(409).json({ message: 'This mobile number is on another account' });
  const set = { password: await bcrypt.hash(next, 10) };
  if (phone) set.phone = phone;
  await User.updateOne({ _id: user._id }, { $set: set });
  res.json({ message: user.password ? 'Password changed' : 'Password set. You can now sign in with your email or mobile too.' });
}));

// ── GET /api/auth/me ─────────────────────────────────────
// Returns logged-in user data
router.get('/me', protect, async (req, res) => {
  const u = await User.findById(req.user._id).select('+password');
  res.json(publicUser(u));
});


// ── GET /api/auth/users  (admin) — student directory ─────
const Enrollment = require('../models/Enrollment');

router.get('/users', protect, adminOnly, asyncHandler(async (req, res) => {
  const { search } = req.query;
  const filter = {};
  if (search && search.trim()) {
    const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
    const digits = search.replace(/\D/g, '');
    if (digits.length >= 4) filter.$or.push({ phone: new RegExp(digits) });
  }
  const users = await User.find(filter)
    .select('name email phone avatar role createdAt password')
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
    ...u.toObject(), password: undefined, hasPassword: Boolean(u.password),
    enrollments: byUser[String(u._id)] || [],
    registrations: regsByUser[String(u._id)] || [],
  })));
}));

// ── PUT /api/auth/users/:id/sign-out  (admin) — end every session of a student ──
router.put('/users/:id/sign-out', protect, adminOnly, asyncHandler(async (req, res) => {
  const u = await User.findById(req.params.id).select('email');
  if (!u) return res.status(404).json({ message: 'Student not found' });
  await User.updateOne({ _id: u._id }, { $set: { sessionId: crypto.randomBytes(16).toString('hex') } });
  res.json({ message: `${u.email} is signed out on every device. They can sign in again.` });
}));

// ── PUT /api/auth/users/:id/password (admin) — set a new password for a student ──
// { password? } Without one, a simple 6-digit one is generated. Returned in clear so
// the admin can read it out on the phone; the student is signed out everywhere.
router.put('/users/:id/password', protect, adminOnly, asyncHandler(async (req, res) => {
  const u = await User.findById(req.params.id).select('name email phone');
  if (!u) return res.status(404).json({ message: 'Student not found' });
  const password = req.body.password ? String(req.body.password) : String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  if (password.length < 6) return res.status(400).json({ message: 'Password needs at least 6 characters' });
  const phone = req.body.phone !== undefined ? normPhone(req.body.phone) : undefined;
  if (req.body.phone !== undefined && !phone) return res.status(400).json({ message: 'Enter a 10-digit mobile number' });
  if (phone && await User.findOne({ phone, _id: { $ne: u._id } })) return res.status(409).json({ message: 'This mobile number is on another account' });
  const set = { password: await bcrypt.hash(password, 10), sessionId: newSid(), reset: null };
  if (phone) set.phone = phone;
  await User.updateOne({ _id: u._id }, { $set: set });
  const mailed = req.body.email !== false && (await mailer.welcome({ name: u.name, email: u.email, phone: phone || u.phone || '—', password })).sent;
  res.json({ password, mailed, message: `New password for ${u.name}: ${password}. They can sign in with ${u.email}${(phone || u.phone) ? ` or ${phone || u.phone}` : ''}.${mailed ? ' Emailed to them too.' : ''}` });
}));

// ── POST /api/auth/users (admin) — create a student account (e.g. over the phone) ──
router.post('/users', protect, adminOnly, asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  const email = normEmail(req.body.email), phone = normPhone(req.body.phone);
  if (name.length < 2 || !okEmail(email)) return res.status(400).json({ message: 'Name and a valid email are needed' });
  if (req.body.phone && !phone) return res.status(400).json({ message: 'Enter a 10-digit mobile number' });
  if (await User.findOne({ email })) return res.status(409).json({ message: 'An account with this email already exists' });
  if (phone && await User.findOne({ phone })) return res.status(409).json({ message: 'This mobile number is on another account' });
  const password = req.body.password ? String(req.body.password) : String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  if (password.length < 6) return res.status(400).json({ message: 'Password needs at least 6 characters' });
  const u = await User.create({ name, email, phone, password: await bcrypt.hash(password, 10), role: 'student' });
  const mailed = req.body.email !== false && (await mailer.welcome({ name, email, phone: phone || '—', password })).sent;
  res.status(201).json({ userId: u._id, name, email, phone, password, mailed, message: `Account made for ${name}. Login: ${email}${phone ? ` or ${phone}` : ''}, password ${password}.${mailed ? ' Emailed to them.' : ''}` });
}));

module.exports = router;

