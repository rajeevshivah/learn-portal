const Enrollment = require('../models/Enrollment');

// An active enrollment counts only if it hasn't expired (expiresAt null = lifetime)
const activeEnrollmentFilter = (userId, courseId) => ({
  user: userId,
  course: courseId,
  status: 'active',
  $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
});

// Does this user have full access to this course?
// admin -> yes | free course -> yes | paid -> needs an ACTIVE, non-expired enrollment
const hasCourseAccess = async (user, course) => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!course.isPaid) return true;
  const active = await Enrollment.exists(activeEnrollmentFilter(user._id, course._id));
  return Boolean(active);
};

module.exports = { hasCourseAccess, activeEnrollmentFilter };
