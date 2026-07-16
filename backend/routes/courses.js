const express    = require('express');
const router     = express.Router();
const asyncHandler = require('express-async-handler');
const Course     = require('../models/Course');
const Episode    = require('../models/Episode');
const Enrollment = require('../models/Enrollment');
const { cloudinary, upload } = require('../config/cloudinary');
const { protect, adminOnly } = require('../middleware/auth');

const slugify = (str) =>
  str.toLowerCase().trim()
     .replace(/[^a-z0-9]+/g, '-')
     .replace(/^-+|-+$/g, '');

// ── PUBLIC: list published courses ───────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const courses = await Course.find({ isPublished: true })
    .select('-roadmapPublicId')
    .sort({ order: 1, createdAt: 1 });

  // episode counts so cards can show "18 lessons"
  const counts = await Episode.aggregate([
    { $match: { isPublished: true } },
    { $group: { _id: '$course', count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(counts.map(c => [String(c._id), c.count]));

  res.json(courses.map(c => ({
    ...c.toObject(),
    episodeCount: countMap[String(c._id)] || 0,
  })));
}));

// ── ADMIN: list ALL courses ──────────────────────────────
router.get('/all', protect, adminOnly, asyncHandler(async (req, res) => {
  const courses = await Course.find().sort({ order: 1, createdAt: 1 });
  res.json(courses);
}));

// ── Logged-in user: my enrollments (full objects) ────────
router.get('/my/enrollments', protect, asyncHandler(async (req, res) => {
  const enrollments = await Enrollment.find({ user: req.user._id })
    .populate('course', 'title slug thumbnail isPaid price level isPublished accessDays')
    .sort({ updatedAt: -1 });
  res.json(enrollments.filter(e => e.course)); // guard against deleted courses
}));

// ── PUBLIC: a course's roadmap ───────────────────────────
router.get('/:slug/roadmap', asyncHandler(async (req, res) => {
  const course = await Course.findOne({ slug: req.params.slug })
    .select('title slug description roadmapPdfUrl thumbnail');
  if (!course) return res.status(404).json({ message: 'Course not found' });
  if (!course.roadmapPdfUrl) {
    return res.status(404).json({ message: 'No roadmap available for this course yet' });
  }
  res.json({
    title: course.title,
    slug: course.slug,
    description: course.description,
    thumbnail: course.thumbnail,
    roadmapPdfUrl: course.roadmapPdfUrl,
  });
}));

// ── PUBLIC: single course by slug ────────────────────────
router.get('/:slug', asyncHandler(async (req, res) => {
  const course = await Course.findOne({ slug: req.params.slug, isPublished: true })
    .select('-roadmapPublicId');
  if (!course) return res.status(404).json({ message: 'Course not found' });
  res.json(course);
}));

// ── ADMIN: create course ─────────────────────────────────
router.post('/', protect, adminOnly, asyncHandler(async (req, res) => {
  const { title, description, thumbnail, phases, order, isPublished,
          isPaid, price, mrp, whatYouLearn, level, language, accessDays } = req.body;
  if (!title) return res.status(400).json({ message: 'Title is required' });

  let slug = slugify(title);
  let n = 1;
  while (await Course.findOne({ slug })) slug = `${slugify(title)}-${++n}`;

  const course = await Course.create({
    title,
    slug,
    description: description || '',
    thumbnail:   thumbnail || '',
    phases:      Array.isArray(phases) ? phases : [],
    order:       order || 0,
    isPublished: isPublished || false,
    isPaid:      Boolean(isPaid),
    price:       Number(price) || 0,
    mrp:         Number(mrp) || 0,
    whatYouLearn: Array.isArray(whatYouLearn) ? whatYouLearn : [],
    level:       level || 'Beginner',
    language:    language || 'Hinglish',
    accessDays:  Number(accessDays) || 0,
  });
  res.status(201).json(course);
}));

// ── ADMIN: update course ─────────────────────────────────
router.put('/:id', protect, adminOnly, asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) return res.status(404).json({ message: 'Course not found' });

  const fields = ['title', 'description', 'thumbnail', 'order', 'isPublished',
                  'isPaid', 'price', 'mrp', 'level', 'language', 'accessDays'];
  fields.forEach(f => { if (req.body[f] !== undefined) course[f] = req.body[f]; });
  if (Array.isArray(req.body.phases))       course.phases = req.body.phases;
  if (Array.isArray(req.body.whatYouLearn)) course.whatYouLearn = req.body.whatYouLearn;

  await course.save();
  res.json(course);
}));

// ── ADMIN: delete course ─────────────────────────────────
router.delete('/:id', protect, adminOnly, asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) return res.status(404).json({ message: 'Course not found' });

  const episodeCount = await Episode.countDocuments({ course: course._id });
  if (episodeCount > 0) {
    return res.status(400).json({
      message: `Cannot delete — course still has ${episodeCount} episode(s). Move or delete them first.`,
    });
  }
  await Enrollment.deleteMany({ course: course._id });
  await course.deleteOne();
  res.json({ message: 'Course deleted' });
}));

// ── ADMIN: upload/replace roadmap PDF ────────────────────
router.post('/:id/roadmap', protect, adminOnly, upload.single('file'), asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) return res.status(404).json({ message: 'Course not found' });
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  if (course.roadmapPublicId) {
    try { await cloudinary.uploader.destroy(course.roadmapPublicId, { resource_type: 'raw' }); } catch (e) {}
  }
  course.roadmapPdfUrl   = req.file.path;
  course.roadmapPublicId = req.file.filename;
  await course.save();
  res.status(201).json({ message: 'Roadmap uploaded', roadmapPdfUrl: course.roadmapPdfUrl });
}));

// ── ADMIN: remove roadmap PDF ────────────────────────────
router.delete('/:id/roadmap', protect, adminOnly, asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) return res.status(404).json({ message: 'Course not found' });
  if (course.roadmapPublicId) {
    try { await cloudinary.uploader.destroy(course.roadmapPublicId, { resource_type: 'raw' }); } catch (e) {}
  }
  course.roadmapPdfUrl = '';
  course.roadmapPublicId = '';
  await course.save();
  res.json({ message: 'Roadmap removed' });
}));

// ── Enroll: free courses only. Paid courses go via /api/payments ──
router.post('/:id/enroll', protect, asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course || !course.isPublished) {
    return res.status(404).json({ message: 'Course not found' });
  }

  if (course.isPaid) {
    // Signal to the frontend: redirect to the payment page
    return res.status(402).json({ requiresPayment: true, slug: course.slug });
  }

  try {
    await Enrollment.create({ user: req.user._id, course: course._id, status: 'active' });
  } catch (e) {
    if (e.code !== 11000) throw e;  // duplicate = already enrolled
  }
  res.status(201).json({ message: 'Enrolled', courseId: course._id });
}));

// ── Unenroll (free courses; paid enrollments stay) ───────
router.delete('/:id/enroll', protect, asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findOne({ user: req.user._id, course: req.params.id });
  if (enrollment && enrollment.status === 'active' && enrollment.amount > 0) {
    return res.status(400).json({ message: 'Purchased courses cannot be unenrolled' });
  }
  if (enrollment) await enrollment.deleteOne();
  res.json({ message: 'Unenrolled' });
}));

module.exports = router;
