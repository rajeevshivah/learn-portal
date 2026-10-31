const Enrollment = require('../models/Enrollment');

// An active enrollment counts only if it hasn't expired (expiresAt null = lifetime)
const activeEnrollmentFilter = (userId, courseId) => ({
  user: userId,
  course: courseId,
  status: 'active',
  $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
});

// Courses this user gets FREE because they hold a confirmed registration for a
// live event whose recordings go to that course. Returns [{ course, event }].
// Computed live from registrations, so a rejected/refunded registration
// automatically loses the course too — nothing to keep in sync.
const linkedCourseGrants = async (userId, courseId = null) => {
  const LiveEvent = require('../models/LiveEvent');
  const Registration = require('../models/Registration');
  const regs = await Registration.find({ user: userId, status: 'active' }).select('event');
  if (!regs.length) return [];
  const filter = { _id: { $in: regs.map(r => r.event) }, recordingsCourse: courseId || { $ne: null } };
  const events = await LiveEvent.find(filter).select('title slug recordingsCourse');
  return events.map(e => ({ course: e.recordingsCourse, event: e }));
};

// Does this user have full access to this course?
// admin -> yes | free course -> yes | paid -> ACTIVE non-expired enrollment
// OR a confirmed registration for a live event linked to this course.
const hasCourseAccess = async (user, course) => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!course.isPaid) return true;
  const active = await Enrollment.exists(activeEnrollmentFilter(user._id, course._id));
  if (active) return true;
  return (await linkedCourseGrants(user._id, course._id)).length > 0;
};

module.exports = { hasCourseAccess, activeEnrollmentFilter, linkedCourseGrants };
