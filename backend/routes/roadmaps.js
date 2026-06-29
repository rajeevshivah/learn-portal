const express  = require('express');
const router   = express.Router();
const Roadmap  = require('../models/Roadmap');
const Course   = require('../models/Course');
const { cloudinary, upload } = require('../config/cloudinary');
const { protect, adminOnly } = require('../middleware/auth');

const slugify = (str) =>
  str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ── PUBLIC: the funnel page data for one roadmap ─────────
// Increments a view count. No login.
router.get('/public/:slug', async (req, res) => {
  const roadmap = await Roadmap.findOne({ slug: req.params.slug, isPublished: true })
    .populate('course', 'title slug isPublished');
  if (!roadmap) return res.status(404).json({ message: 'Roadmap not found' });

  await roadmap.updateOne({ $inc: { views: 1 } });

  res.json({
    title: roadmap.title,
    slug: roadmap.slug,
    description: roadmap.description,
    pdfUrl: roadmap.pdfUrl,
    // only expose the course link if that course is itself live
    course: roadmap.course && roadmap.course.isPublished
      ? { title: roadmap.course.title, slug: roadmap.course.slug }
      : null,
  });
});

// ── PUBLIC: count a download click (fire-and-forget) ─────
router.post('/public/:slug/download', async (req, res) => {
  await Roadmap.updateOne({ slug: req.params.slug }, { $inc: { downloads: 1 } });
  res.json({ ok: true });
});

// ── ADMIN: list all roadmaps ─────────────────────────────
router.get('/', protect, adminOnly, async (req, res) => {
  const roadmaps = await Roadmap.find().populate('course', 'title').sort({ createdAt: -1 });
  res.json(roadmaps);
});

// ── ADMIN: create roadmap ────────────────────────────────
router.post('/', protect, adminOnly, async (req, res) => {
  const { title, description, course } = req.body;
  if (!title) return res.status(400).json({ message: 'Title is required' });

  let slug = slugify(title);
  let n = 1;
  while (await Roadmap.findOne({ slug })) slug = `${slugify(title)}-${++n}`;

  const roadmap = await Roadmap.create({
    title,
    slug,
    description: description || '',
    course: course || null,
  });
  res.status(201).json(roadmap);
});

// ── ADMIN: update roadmap ────────────────────────────────
router.put('/:id', protect, adminOnly, async (req, res) => {
  const roadmap = await Roadmap.findById(req.params.id);
  if (!roadmap) return res.status(404).json({ message: 'Roadmap not found' });
  ['title', 'description', 'isPublished'].forEach(f => {
    if (req.body[f] !== undefined) roadmap[f] = req.body[f];
  });
  if (req.body.course !== undefined) roadmap.course = req.body.course || null;
  await roadmap.save();
  res.json(roadmap);
});

// ── ADMIN: upload/replace the roadmap PDF ────────────────
router.post('/:id/pdf', protect, adminOnly, upload.single('file'), async (req, res) => {
  const roadmap = await Roadmap.findById(req.params.id);
  if (!roadmap) return res.status(404).json({ message: 'Roadmap not found' });
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  if (roadmap.pdfPublicId) {
    try { await cloudinary.uploader.destroy(roadmap.pdfPublicId, { resource_type: 'raw' }); } catch (e) {}
  }
  roadmap.pdfUrl = req.file.path;
  roadmap.pdfPublicId = req.file.filename;
  await roadmap.save();
  res.status(201).json({ message: 'PDF uploaded', pdfUrl: roadmap.pdfUrl });
});

// ── ADMIN: delete roadmap ────────────────────────────────
router.delete('/:id', protect, adminOnly, async (req, res) => {
  const roadmap = await Roadmap.findById(req.params.id);
  if (!roadmap) return res.status(404).json({ message: 'Roadmap not found' });
  if (roadmap.pdfPublicId) {
    try { await cloudinary.uploader.destroy(roadmap.pdfPublicId, { resource_type: 'raw' }); } catch (e) {}
  }
  await roadmap.deleteOne();
  res.json({ message: 'Roadmap deleted' });
});

module.exports = router;
