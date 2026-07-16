const express  = require('express');
const router   = express.Router();
const asyncHandler = require('express-async-handler');
const Episode  = require('../models/Episode');
const Course   = require('../models/Course');
const { cloudinary, upload } = require('../config/cloudinary');
const { protect, adminOnly } = require('../middleware/auth');
const { hasCourseAccess } = require('../middleware/access');

// ── ADMIN: all episodes (optionally ?course=) ────────────
router.get('/all', protect, adminOnly, asyncHandler(async (req, res) => {
  const filter = req.query.course ? { course: req.query.course } : {};
  const episodes = await Episode.find(filter)
    .populate('course', 'title slug')
    .sort({ episodeNumber: 1 });
  res.json(episodes);
}));

// ── Published episodes for a course, with access-aware locking ──
// Locked episodes are still listed (so students see what they'd unlock)
// but youtubeUrl and files are stripped.
router.get('/', protect, asyncHandler(async (req, res) => {
  const { course } = req.query;
  if (!course) return res.status(400).json({ message: 'course query param is required' });

  const courseDoc = await Course.findById(course);
  if (!courseDoc) return res.status(404).json({ message: 'Course not found' });

  const access = await hasCourseAccess(req.user, courseDoc);

  const episodes = await Episode.find({ course, isPublished: true })
    .select('-files.publicId')
    .sort({ episodeNumber: 1 });

  res.json(episodes.map(ep => {
    const unlocked = access || ep.isFreePreview;
    const obj = ep.toObject();
    if (!unlocked) {
      obj.youtubeUrl = '';
      obj.files = [];
    }
    obj.locked = !unlocked;
    return obj;
  }));
}));

// ── Single episode (access-enforced) ─────────────────────
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const episode = await Episode.findById(req.params.id)
    .select('-files.publicId')
    .populate('course', 'title slug isPaid price');
  if (!episode) return res.status(404).json({ message: 'Episode not found' });

  const isAdmin = req.user.role === 'admin';
  if (!episode.isPublished && !isAdmin) {
    return res.status(404).json({ message: 'Episode not found' });
  }

  const access = await hasCourseAccess(req.user, episode.course);
  if (!access && !episode.isFreePreview) {
    return res.status(403).json({
      message: 'Purchase this course to watch this episode',
      requiresPayment: true,
      courseSlug: episode.course.slug,
    });
  }

  await episode.updateOne({ $inc: { viewCount: 1 } });
  res.json(episode);
}));

// ── ADMIN: create episode ────────────────────────────────
router.post('/', protect, adminOnly, asyncHandler(async (req, res) => {
  const { course, episodeNumber, title, description, phase,
          youtubeUrl, duration, tags, isFreePreview } = req.body;

  if (!course) return res.status(400).json({ message: 'course is required' });
  const courseDoc = await Course.findById(course);
  if (!courseDoc) return res.status(400).json({ message: 'Course not found' });

  const exists = await Episode.findOne({ course, episodeNumber });
  if (exists) {
    return res.status(400).json({ message: `Episode ${episodeNumber} already exists in this course` });
  }

  const episode = await Episode.create({
    course, episodeNumber, title, description, phase, youtubeUrl, duration,
    isFreePreview: Boolean(isFreePreview),
    tags: tags ? tags.split(',').map(t => t.trim()) : [],
  });
  res.status(201).json(episode);
}));

// ── ADMIN: update episode ────────────────────────────────
router.put('/:id', protect, adminOnly, asyncHandler(async (req, res) => {
  const episode = await Episode.findById(req.params.id);
  if (!episode) return res.status(404).json({ message: 'Episode not found' });
  const fields = ['title', 'description', 'phase', 'youtubeUrl', 'duration',
                  'isPublished', 'isFreePreview', 'episodeNumber'];
  fields.forEach(f => { if (req.body[f] !== undefined) episode[f] = req.body[f]; });
  if (req.body.tags !== undefined) {
    episode.tags = String(req.body.tags).split(',').map(t => t.trim()).filter(Boolean);
  }
  await episode.save();
  res.json(episode);
}));

// ── ADMIN: upload file to episode ────────────────────────
router.post('/:episodeId/files', protect, adminOnly, upload.single('file'), asyncHandler(async (req, res) => {
  const episode = await Episode.findById(req.params.episodeId);
  if (!episode) return res.status(404).json({ message: 'Episode not found' });
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const { label, fileType } = req.body;
  episode.files.push({
    label:    label || req.file.originalname,
    url:      req.file.path,
    publicId: req.file.filename,
    fileType: fileType || 'pdf',
    size:     req.file.size ? `${(req.file.size / 1024 / 1024).toFixed(1)} MB` : '',
  });
  await episode.save();
  res.status(201).json({ message: 'File uploaded', files: episode.files });
}));

// ── ADMIN: delete file ───────────────────────────────────
router.delete('/:episodeId/files/:fileId', protect, adminOnly, asyncHandler(async (req, res) => {
  const episode = await Episode.findById(req.params.episodeId);
  if (!episode) return res.status(404).json({ message: 'Episode not found' });
  const file = episode.files.id(req.params.fileId);
  if (!file) return res.status(404).json({ message: 'File not found' });
  try { await cloudinary.uploader.destroy(file.publicId, { resource_type: 'raw' }); } catch (e) {}
  episode.files.pull(req.params.fileId);
  await episode.save();
  res.json({ message: 'File deleted' });
}));

// ── ADMIN: delete episode ────────────────────────────────
router.delete('/:id', protect, adminOnly, asyncHandler(async (req, res) => {
  const episode = await Episode.findById(req.params.id);
  if (!episode) return res.status(404).json({ message: 'Episode not found' });
  for (const file of episode.files) {
    try { await cloudinary.uploader.destroy(file.publicId, { resource_type: 'raw' }); } catch (e) {}
  }
  await episode.deleteOne();
  res.json({ message: 'Episode deleted' });
}));

module.exports = router;
