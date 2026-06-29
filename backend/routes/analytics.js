const express    = require('express');
const router     = express.Router();
const User       = require('../models/User');
const Course     = require('../models/Course');
const Episode    = require('../models/Episode');
const Enrollment = require('../models/Enrollment');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/analytics/overview  (admin only)
// Returns headline numbers + per-course and per-episode breakdowns.
router.get('/overview', protect, adminOnly, async (req, res) => {
  try {
    // ── headline counts ──
    const [totalStudents, totalCourses, totalEpisodes, totalEnrollments] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      Course.countDocuments(),
      Episode.countDocuments(),
      Enrollment.countDocuments(),
    ]);

    // ── enrollments grouped by course ──
    const enrollAgg = await Enrollment.aggregate([
      { $group: { _id: '$course', count: { $sum: 1 } } },
    ]);
    const enrollMap = Object.fromEntries(enrollAgg.map(e => [String(e._id), e.count]));

    // ── episode counts grouped by course ──
    const epAgg = await Episode.aggregate([
      { $group: { _id: '$course', count: { $sum: 1 } } },
    ]);
    const epMap = Object.fromEntries(epAgg.map(e => [String(e._id), e.count]));

    // ── per-course table ──
    const courses = await Course.find().sort({ order: 1, createdAt: 1 });
    const perCourse = courses.map(c => ({
      id: c._id,
      title: c.title,
      isPublished: c.isPublished,
      enrollments: enrollMap[String(c._id)] || 0,
      episodes: epMap[String(c._id)] || 0,
    }));

    // ── most-downloaded episodes (top 10) ──
    const topEpisodes = await Episode.find()
      .sort({ downloadCount: -1 })
      .limit(10)
      .populate('course', 'title')
      .select('title episodeNumber downloadCount course');

    const topEpisodesClean = topEpisodes.map(e => ({
      id: e._id,
      title: e.title,
      episodeNumber: e.episodeNumber,
      course: e.course?.title || '—',
      downloads: e.downloadCount || 0,
    }));

    // ── new students over the last 30 days (daily) ──
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const signupsAgg = await User.aggregate([
      { $match: { role: 'student', createdAt: { $gte: since } } },
      { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        } },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      headline: { totalStudents, totalCourses, totalEpisodes, totalEnrollments },
      perCourse,
      topEpisodes: topEpisodesClean,
      signupsLast30: signupsAgg.map(s => ({ date: s._id, count: s.count })),
    });
  } catch (err) {
    console.error('analytics error', err);
    res.status(500).json({ message: 'Failed to load analytics' });
  }
});

module.exports = router;
