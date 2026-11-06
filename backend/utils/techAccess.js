// Who gets the tech feed's personal tips ("Why it matters / Try this"):
//   • admins
//   • students with a paid live program that's running (or ended < 30 days ago)
//     or a paid course they still have access to          → 'included'
//   • students with an unexpired Tech Pass                 → 'pass'
//   • everyone, when the pass is switched off in settings  → 'free'
// Everyone else sees headlines and hackathons, with the tips locked.
const Settings     = require('../models/Settings');
const Registration = require('../models/Registration');
const Enrollment   = require('../models/Enrollment');
const TechPass     = require('../models/TechPass');

const passSettings = (s) => ({
  enabled: s.techPass?.enabled !== false,
  price: s.techPass?.price ?? 99,
  days: s.techPass?.days ?? 90,
  freeForPaid: s.techPass?.freeForPaid !== false,
  paidGraceDays: s.techPass?.paidGraceDays ?? 0,
});
const fmtD = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

// A paid program counts until its last class ends (+ grace days), whether or not
// it has been marked completed. Never for life.
async function paidStudentReason(userId, graceDays = 0) {
  const now = Date.now();
  const regs = await Registration.find({ user: userId, status: 'active', amount: { $gt: 0 } })
    .populate('event', 'title isCompleted sessions.startsAt sessions.durationMins');
  for (const r of regs) {
    const e = r.event;
    if (!e) continue;
    const last = (e.sessions || []).reduce((m, s) => Math.max(m, new Date(s.startsAt).getTime() + (s.durationMins || 60) * 60000), 0);
    if (!last) { if (!e.isCompleted) return `Included with ${e.title}`; continue; }   // classes not scheduled yet
    const until = last + graceDays * 864e5;
    if (until > now) return `Included with ${e.title} till ${fmtD(until)}`;
  }
  const enr = await Enrollment.findOne({ user: userId, status: 'active', amount: { $gt: 0 }, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] })
    .populate('course', 'title');
  if (enr) return `Included with ${enr.course?.title || 'your course'}${enr.expiresAt ? ` till ${fmtD(enr.expiresAt)}` : ''}`;
  return '';
}

async function techAccess(user) {
  const s = await Settings.get();
  const pass = passSettings(s);
  if (user.role === 'admin') return { full: true, reason: 'admin', label: 'Admin', pass };
  if (!pass.enabled) return { full: true, reason: 'free', label: 'Free for everyone', pass };
  if (pass.freeForPaid) {
    const label = await paidStudentReason(user._id, pass.paidGraceDays);
    if (label) return { full: true, reason: 'included', label, pass };
  }
  const latest = await TechPass.findOne({ user: user._id, expiresAt: { $gt: new Date() } }).sort({ expiresAt: -1 });
  if (latest) return { full: true, reason: 'pass', label: `Tech Pass till ${latest.expiresAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}`, passUntil: latest.expiresAt, pass };
  return { full: false, reason: 'none', label: '', pass };
}

// Add days on top of any pass still running.
async function grantPass(userId, { days, amount = 0, source = 'purchase', paymentRef = '', note = '', by = null }) {
  if (paymentRef && await TechPass.exists({ paymentRef })) return null;   // already granted for this payment
  const latest = await TechPass.findOne({ user: userId, expiresAt: { $gt: new Date() } }).sort({ expiresAt: -1 });
  const startsAt = latest ? latest.expiresAt : new Date();
  const expiresAt = new Date(startsAt.getTime() + days * 864e5);
  try {
    return await TechPass.create({ user: userId, days, amount, startsAt, expiresAt, source, paymentRef, note, by });
  } catch (e) {
    if (e.code === 11000) return null;   // webhook and browser confirmed at the same time
    throw e;
  }
}

module.exports = { techAccess, grantPass, passSettings };
