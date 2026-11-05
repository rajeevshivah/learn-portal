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
      obj.links = [];
    }
    obj.locked = !unlocked;
    return obj;
  }));
}));

// ── PUBLIC: lesson outline for a published course (logged-out visitors) ──
// Titles and structure only. Never returns video links or files.
router.get('/outline/:courseId', asyncHandler(async (req, res) => {
  const courseDoc = await Course.findOne({ _id: req.params.courseId, isPublished: true }).select('isPaid');
  if (!courseDoc) return res.status(404).json({ message: 'Course not found' });
  const episodes = await Episode.find({ course: courseDoc._id, isPublished: true })
    .select('episodeNumber title phase duration isFreePreview tags')
    .sort({ episodeNumber: 1 });
  res.json(episodes.map(ep => ({
    ...ep.toObject(), youtubeUrl: '', files: [], links: [],
    locked: courseDoc.isPaid && !ep.isFreePreview,
  })));
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

// ── Download a file with proper filename (access-enforced) ──
// Streams the file from Cloudinary through our server so the browser
// saves it as "Class-Notes.pdf" instead of a random Cloudinary id.
const https = require('https');

const EXT_BY_TYPE = { pdf: '.pdf', doc: '.docx', docx: '.docx', ppt: '.pptx',
                      pptx: '.pptx', txt: '.txt', zip: '.zip', code: '.zip' };

const buildFilename = (file) => {
  // Best source: the original uploaded name (new uploads store this)
  if (file.originalName) return file.originalName.replace(/[^\w.\- ()]/g, '_');
  // Fallback for old files: label + extension guessed from fileType or URL
  let ext = EXT_BY_TYPE[file.fileType] || '';
  if (!ext) {
    const m = String(file.url).match(/\.(pdf|docx?|pptx?|txt|zip)(\?|$)/i);
    if (m) ext = `.${m[1].toLowerCase()}`;
  }
  const base = String(file.label || 'download').replace(/[^\w.\- ()]/g, '_').trim() || 'download';
  return base.toLowerCase().endsWith(ext.toLowerCase()) ? base : base + (ext || '.pdf');
};

router.get('/:episodeId/files/:fileId/download', protect, asyncHandler(async (req, res) => {
  const episode = await Episode.findById(req.params.episodeId)
    .populate('course', 'isPaid slug');
  if (!episode) return res.status(404).json({ message: 'Episode not found' });

  const isAdmin = req.user.role === 'admin';
  if (!episode.isPublished && !isAdmin) {
    return res.status(404).json({ message: 'Episode not found' });
  }

  const access = await hasCourseAccess(req.user, episode.course);
  if (!access && !episode.isFreePreview) {
    return res.status(403).json({ message: 'Purchase this course to download resources' });
  }

  const file = episode.files.id(req.params.fileId);
  if (!file) return res.status(404).json({ message: 'File not found' });

  const filename = buildFilename(file);

  https.get(file.url, (upstream) => {
    if (upstream.statusCode !== 200) {
      res.status(502).json({ message: 'File is temporarily unavailable' });
      upstream.resume();
      return;
    }
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', upstream.headers['content-type'] || 'application/octet-stream');
    if (upstream.headers['content-length']) {
      res.setHeader('Content-Length', upstream.headers['content-length']);
    }
    upstream.pipe(res);
  }).on('error', () => {
    if (!res.headersSent) res.status(502).json({ message: 'Could not fetch file' });
  });
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
  const { label } = req.body;
  const ext = (req.file.originalname || '').split('.').pop().toLowerCase();
  episode.files.push({
    label:        (label || req.file.originalname).slice(0, 120),
    originalName: req.file.originalname || '',
    url:          req.file.path,
    publicId: req.file.filename,
    fileType: ext || req.body.fileType || 'pdf',
    size:     !req.file.size ? '' : req.file.size < 1024 * 1024
      ? `${Math.max(1, Math.round(req.file.size / 1024))} KB`
      : `${(req.file.size / 1024 / 1024).toFixed(1)} MB`,
  });
  await episode.save();
  res.status(201).json({ message: 'File uploaded', files: episode.files });
}));

// ── ADMIN: links (Colab notebook, GitHub repo, Drive folder…) ──
const linkKind = (url) => {
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (host === 'colab.research.google.com') return 'colab';
  if (host === 'github.com' || host === 'gist.github.com') return 'github';
  if (host === 'drive.google.com' || host === 'docs.google.com') return 'drive';
  if (host === 'kaggle.com') return 'kaggle';
  return 'link';
};
const LINK_LABEL = { colab: 'Class notebook', github: 'Class code', drive: 'Shared folder', kaggle: 'Kaggle notebook', link: 'Link' };

router.post('/:episodeId/links', protect, adminOnly, asyncHandler(async (req, res) => {
  const episode = await Episode.findById(req.params.episodeId);
  if (!episode) return res.status(404).json({ message: 'Episode not found' });
  const url = String(req.body.url || '').trim();
  let parsed;
  try { parsed = new URL(url); } catch { parsed = null; }
  if (!parsed || parsed.protocol !== 'https:') return res.status(400).json({ message: 'Paste the full link, starting with https://' });
  if (episode.links.length >= 20) return res.status(400).json({ message: 'A lesson can have up to 20 links' });
  const kind = linkKind(url);
  const label = String(req.body.label || '').trim().slice(0, 120) || LINK_LABEL[kind];
  episode.links.push({ label, url, kind });
  await episode.save();
  res.status(201).json({ message: 'Link added', links: episode.links });
}));

router.delete('/:episodeId/links/:linkId', protect, adminOnly, asyncHandler(async (req, res) => {
  const episode = await Episode.findById(req.params.episodeId);
  if (!episode) return res.status(404).json({ message: 'Episode not found' });
  if (!episode.links.id(req.params.linkId)) return res.status(404).json({ message: 'Link not found' });
  episode.links.pull(req.params.linkId);
  await episode.save();
  res.json({ message: 'Link removed', links: episode.links });
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
