const express    = require('express');
const router     = express.Router();
const asyncHandler = require('express-async-handler');
const User       = require('../models/User');
const Course     = require('../models/Course');
const Episode    = require('../models/Episode');
const Enrollment = require('../models/Enrollment');
const Progress   = require('../models/Progress');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/analytics/overview  (admin only)
router.get('/overview', protect, adminOnly, asyncHandler(async (req, res) => {
  const [totalStudents, totalCourses, totalEpisodes, totalEnrollments, pendingPayments] = await Promise.all([
    User.countDocuments({ role: 'student' }),
    Course.countDocuments(),
    Episode.countDocuments(),
    Enrollment.countDocuments({ status: 'active' }),
    Enrollment.countDocuments({ status: 'pending' }),
  ]);

  // ── Revenue ──
  const revenueAgg = await Enrollment.aggregate([
    { $match: { status: 'active', amount: { $gt: 0 } } },
    { $group: { _id: '$course', revenue: { $sum: '$amount' }, sales: { $sum: 1 } } },
  ]);
  const courseRevenue = revenueAgg.reduce((s, r) => s + r.revenue, 0);
  const courseSales   = revenueAgg.reduce((s, r) => s + r.sales, 0);

  // Webinar revenue: confirmed paid registrations (UPI-approved + Razorpay)
  const Registration = require('../models/Registration');
  const LiveEvent = require('../models/LiveEvent');
  const webinarAgg = await Registration.aggregate([
    { $match: { status: 'active', amount: { $gt: 0 } } },
    { $group: { _id: '$event', revenue: { $sum: '$amount' }, sales: { $sum: 1 } } },
  ]);
  const webinarRevenue = webinarAgg.reduce((s, r) => s + r.revenue, 0);
  const webinarSales   = webinarAgg.reduce((s, r) => s + r.sales, 0);
  const webinarMap = Object.fromEntries(webinarAgg.map(r => [String(r._id), r]));
  const eventDocs = await LiveEvent.find().select('title isPaid price').sort({ createdAt: -1 });
  const perEvent = eventDocs.map(e => ({
    id: e._id, title: e.title, isPaid: e.isPaid, price: e.price,
    revenue: webinarMap[String(e._id)]?.revenue || 0,
    sales: webinarMap[String(e._id)]?.sales || 0,
  }));

  const totalRevenue = courseRevenue + webinarRevenue;
  const totalSales   = courseSales + webinarSales;
  const revenueMap   = Object.fromEntries(revenueAgg.map(r => [String(r._id), r]));

  // ── Per-course enrollments / episodes / completions ──
  const [enrollAgg, epAgg, progAgg] = await Promise.all([
    Enrollment.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$course', count: { $sum: 1 } } },
    ]),
    Episode.aggregate([{ $group: { _id: '$course', count: { $sum: 1 } } }]),
    Progress.aggregate([{ $group: { _id: '$course', count: { $sum: 1 } } }]),
  ]);
  const enrollMap = Object.fromEntries(enrollAgg.map(e => [String(e._id), e.count]));
  const epMap     = Object.fromEntries(epAgg.map(e => [String(e._id), e.count]));
  const progMap   = Object.fromEntries(progAgg.map(e => [String(e._id), e.count]));

  const courses = await Course.find().sort({ order: 1, createdAt: 1 });
  const perCourse = courses.map(c => {
    const rev = revenueMap[String(c._id)];
    return {
      id: c._id,
      title: c.title,
      isPublished: c.isPublished,
      isPaid: c.isPaid,
      price: c.price,
      enrollments: enrollMap[String(c._id)] || 0,
      episodes: epMap[String(c._id)] || 0,
      completions: progMap[String(c._id)] || 0,
      revenue: rev ? rev.revenue : 0,
      sales:   rev ? rev.sales : 0,
    };
  });

  // ── Top episodes by views ──
  const topEpisodes = await Episode.find()
    .populate('course', 'title')
    .sort({ viewCount: -1 })
    .limit(10)
    .select('title episodeNumber viewCount course');

  // ── Recent signups ──
  const recentUsers = await User.find({ role: 'student' })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('name email avatar createdAt');

  res.json({
    totals: {
      students: totalStudents,
      courses: totalCourses,
      episodes: totalEpisodes,
      enrollments: totalEnrollments,
      pendingPayments,
      revenue: totalRevenue,
      sales: totalSales,
      courseRevenue, courseSales,
      webinarRevenue, webinarSales,
    },
    perCourse,
    perEvent,
    topEpisodes,
    recentUsers,
  });
}));

module.exports = router;
