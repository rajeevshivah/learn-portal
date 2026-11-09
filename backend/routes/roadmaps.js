const express  = require('express');
const router   = express.Router();
const Roadmap  = require('../models/Roadmap');
const Course   = require('../models/Course');
const { cloudinary, upload } = require('../config/cloudinary');
const { protect, adminOnly } = require('../middleware/auth');
const Episode  = require('../models/Episode');

// Can the public actually fetch this file? Cloudinary blocks PDF/ZIP delivery on free
// accounts unless "Allow delivery of PDF and ZIP files" is on (Settings → Security),
// and then answers 401. Old uploads without a .pdf extension slipped past that check.
const CLOUDINARY_HINT = 'Cloudinary is blocking PDF downloads. Fix once: cloudinary.com → Settings → Security → turn on "Allow delivery of PDF and ZIP files" (or "PDF and ZIP files delivery") → Save. Existing files start working at once.';
async function deliverable(url) {
  if (!url) return 'missing';
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(8000) });
    return r.ok ? 'ok' : r.status === 401 ? 'blocked' : `http ${r.status}`;
  } catch { return 'unreachable'; }
}

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
  const delivery = await deliverable(roadmap.pdfUrl);
  res.status(201).json({
    message: delivery === 'ok' ? 'PDF uploaded and downloadable.' : delivery === 'blocked' ? `PDF uploaded, but students can’t download it yet. ${CLOUDINARY_HINT}` : `PDF uploaded, but the file check returned "${delivery}". Open the public page and try the download.`,
    pdfUrl: roadmap.pdfUrl, delivery,
  });
});

// ── ADMIN: check every public file (roadmap PDFs + lesson files) is downloadable ──
router.get('/check-files', protect, adminOnly, async (req, res) => {
  const roadmaps = await Roadmap.find().select('title slug pdfUrl');
  const episodes = await Episode.find({ 'files.0': { $exists: true } }).select('title episodeNumber files course').populate('course', 'title');
  const items = [
    ...roadmaps.map(r => ({ kind: 'roadmap', title: r.title, url: r.pdfUrl, where: `Roadmap “${r.title}”` })),
    ...episodes.flatMap(e => (e.files || []).map(f => ({ kind: 'lesson', title: f.label, url: f.url, where: `${e.course?.title || 'Course'} · Lesson ${e.episodeNumber} · ${f.label}` }))),
  ];
  const results = [];
  for (let i = 0; i < items.length; i += 6) {
    const batch = items.slice(i, i + 6);
    const statuses = await Promise.all(batch.map(it => deliverable(it.url)));
    batch.forEach((it, j) => results.push({ ...it, status: statuses[j] }));
  }
  const blocked = results.filter(r => r.status === 'blocked');
  const broken = results.filter(r => r.status !== 'ok');
  res.json({
    checked: results.length, ok: results.length - broken.length, blocked: blocked.length, broken: broken.length,
    hint: blocked.length ? CLOUDINARY_HINT : '',
    problems: broken,
  });
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
