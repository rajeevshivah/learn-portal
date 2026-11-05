// When can a purchase be refunded? One place for the rule, used by the
// student's Refunds page, the request endpoint and the admin view.
//
//   Live program (2+ classes): 24 h from the scheduled end of the first class
//     held after the seat was confirmed (normally Class 1).
//   Single-class workshop: final once registered.
//   Seat confirmed after the last class, or a recorded course: 72 h from the
//     moment access unlocked (online payment time / UPI approval time).
//   Payment problems (double charge, wrong amount, rejected UPI): 30 days.

const H = 3600 * 1000;
const LIVE_HOURS = 24;
const COURSE_HOURS = 72;
const ISSUE_DAYS = 30;

const endOf = (s) => new Date(new Date(s.startsAt).getTime() + (s.durationMins || 60) * 60000);
const istFmt = (d) => new Date(d).toLocaleString('en-IN', {
  timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
});

function state(opensAt, closesAt, now) {
  if (now < opensAt) return 'early';
  if (now > closesAt) return 'closed';
  return 'open';
}

// reg: Registration, event: LiveEvent (with sessions)
function liveWindow(event, reg, now = new Date()) {
  const confirmedAt = reg.approvedAt || reg.createdAt;
  const ss = [...(event.sessions || [])].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  if (ss.length < 2) {
    return { rule: 'single', state: 'none', confirmedAt, text: 'Single-class workshops are final once you register.' };
  }
  const idx = ss.findIndex(s => new Date(s.startsAt) >= new Date(confirmedAt));
  if (idx < 0) {
    // Joined after the last class: they bought the recordings
    const opensAt = new Date(confirmedAt), closesAt = new Date(opensAt.getTime() + COURSE_HOURS * H);
    return { rule: 'recordings', state: state(opensAt, closesAt, now), opensAt, closesAt, confirmedAt,
      text: `You joined after the last class, so the 72-hour rule applies from ${istFmt(opensAt)}.` };
  }
  const opensAt = endOf(ss[idx]), closesAt = new Date(opensAt.getTime() + LIVE_HOURS * H);
  return { rule: 'live', classNumber: idx + 1, state: state(opensAt, closesAt, now), opensAt, closesAt, confirmedAt,
    text: `Opens when Class ${idx + 1} ends (${istFmt(opensAt)}) and closes 24 hours later (${istFmt(closesAt)}).` };
}

function courseWindow(enr, now = new Date()) {
  const opensAt = new Date(enr.approvedAt || enr.createdAt);
  const closesAt = new Date(opensAt.getTime() + COURSE_HOURS * H);
  return { rule: 'course', state: state(opensAt, closesAt, now), opensAt, closesAt, confirmedAt: opensAt,
    text: `72 hours from when your course unlocked (${istFmt(opensAt)}), until ${istFmt(closesAt)}.` };
}

function issueWindow(doc, now = new Date()) {
  const opensAt = new Date(doc.createdAt);
  const closesAt = new Date(opensAt.getTime() + ISSUE_DAYS * 24 * H);
  return { state: state(opensAt, closesAt, now), opensAt, closesAt };
}

// How the student paid, from the stored reference
function payMethod(doc) {
  const utr = String(doc.utr || '');
  if (utr.startsWith('RZP ')) return { method: 'razorpay', paymentRef: utr.slice(4).trim() };
  return { method: 'upi', paymentRef: utr };
}

module.exports = { liveWindow, courseWindow, issueWindow, payMethod, istFmt, LIVE_HOURS, COURSE_HOURS, ISSUE_DAYS };
