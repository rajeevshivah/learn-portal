const express    = require('express');
const router     = express.Router();
const Course     = require('../models/Course');
const Episode    = require('../models/Episode');
const Enrollment = require('../models/Enrollment');
const { cloudinary, upload } = require('../config/cloudinary');
const { protect, adminOnly } = require('../middleware/auth');

// Helper: build a slug from a title
const slugify = (str) =>
  str.toLowerCase().trim()
     .replace(/[^a-z0-9]+/g, '-')
     .replace(/^-+|-+$/g, '');

// ── PUBLIC: list published courses ───────────────────────
// No login required so the courses page (and shared links) work for anyone.
router.get('/', async (req, res) => {
  const courses = await Course.find({ isPublished: true })
    .select('-roadmapPublicId')
    .sort({ order: 1, createdAt: 1 });
  res.json(courses);
});

// ── ADMIN: list ALL courses (incl. unpublished) ──────────
router.get('/all', protect, adminOnly, async (req, res) => {
  const courses = await Course.find().sort({ order: 1, createdAt: 1 });
  res.json(courses);
});

// ── Logged-in user: which courses am I enrolled in? ──────
// Returns an array of course IDs. Put BEFORE "/:slug" so it isn't
// captured as a slug param.
router.get('/my/enrollments', protect, async (req, res) => {
  const enrollments = await Enrollment.find({ user: req.user._id }).select('course');
  res.json(enrollments.map(e => e.course));
});

// ── PUBLIC: a course's roadmap (works even if course is draft) ──
// Lightweight endpoint for the shareable roadmap page. No login.
router.get('/:slug/roadmap', async (req, res) => {
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
});

// ── PUBLIC: single course by slug ────────────────────────
router.get('/:slug', async (req, res) => {
  const course = await Course.findOne({ slug: req.params.slug, isPublished: true })
    .select('-roadmapPublicId');
  if (!course) return res.status(404).json({ message: 'Course not found' });
  res.json(course);
});

// ── ADMIN: create course ─────────────────────────────────
router.post('/', protect, adminOnly, async (req, res) => {
  const { title, description, thumbnail, phases, order, isPublished } = req.body;
  if (!title) return res.status(400).json({ message: 'Title is required' });

  let slug = slugify(title);
  // ensure slug uniqueness
  let n = 1;
  while (await Course.findOne({ slug })) {
    slug = `${slugify(title)}-${++n}`;
  }

  const course = await Course.create({
    title,
    slug,
    description: description || '',
    thumbnail:   thumbnail || '',
    phases:      Array.isArray(phases) ? phases : [],
    order:       order || 0,
    isPublished: isPublished || false,
  });
  res.status(201).json(course);
});

// ── ADMIN: update course ─────────────────────────────────
router.put('/:id', protect, adminOnly, async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) return res.status(404).json({ message: 'Course not found' });

  const fields = ['title', 'description', 'thumbnail', 'order', 'isPublished'];
  fields.forEach(f => { if (req.body[f] !== undefined) course[f] = req.body[f]; });
  if (Array.isArray(req.body.phases)) course.phases = req.body.phases;

  await course.save();
  res.json(course);
});

// ── ADMIN: delete course ─────────────────────────────────
// Blocked if the course still has episodes, to avoid orphaning content.
router.delete('/:id', protect, adminOnly, async (req, res) => {
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
});

// ── ADMIN: upload/replace a course's public roadmap PDF ──
router.post('/:id/roadmap', protect, adminOnly, upload.single('file'), async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) return res.status(404).json({ message: 'Course not found' });
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  // remove the previous roadmap file from Cloudinary if one exists
  if (course.roadmapPublicId) {
    try { await cloudinary.uploader.destroy(course.roadmapPublicId, { resource_type: 'raw' }); } catch (e) {}
  }

  course.roadmapPdfUrl  = req.file.path;
  course.roadmapPublicId = req.file.filename;
  await course.save();
  res.status(201).json({ message: 'Roadmap uploaded', roadmapPdfUrl: course.roadmapPdfUrl });
});

// ── ADMIN: remove a course's roadmap PDF ─────────────────
router.delete('/:id/roadmap', protect, adminOnly, async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) return res.status(404).json({ message: 'Course not found' });
  if (course.roadmapPublicId) {
    try { await cloudinary.uploader.destroy(course.roadmapPublicId, { resource_type: 'raw' }); } catch (e) {}
  }
  course.roadmapPdfUrl = '';
  course.roadmapPublicId = '';
  await course.save();
  res.json({ message: 'Roadmap removed' });
});

// ── Logged-in user: enroll (join) a course ───────────────
router.post('/:id/enroll', protect, async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course || !course.isPublished) {
    return res.status(404).json({ message: 'Course not found' });
  }
  try {
    await Enrollment.create({ user: req.user._id, course: course._id });
  } catch (e) {
    // duplicate key = already enrolled; treat as success (idempotent)
    if (e.code !== 11000) throw e;
  }
  res.status(201).json({ message: 'Enrolled', courseId: course._id });
});

// ── Logged-in user: unenroll (leave) a course ────────────
router.delete('/:id/enroll', protect, async (req, res) => {
  await Enrollment.deleteOne({ user: req.user._id, course: req.params.id });
  res.json({ message: 'Unenrolled' });
});

module.exports = router;
