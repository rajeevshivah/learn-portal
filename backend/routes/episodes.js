const express  = require('express');
const router   = express.Router();
const Episode  = require('../models/Episode');
const { cloudinary, upload } = require('../config/cloudinary');
const { protect, adminOnly } = require('../middleware/auth');

// ADMIN ONLY — all episodes including unpublished
router.get('/all', protect, adminOnly, async (req, res) => {
  const episodes = await Episode.find().sort({ episodeNumber: 1 });
  res.json(episodes);
});

// GET /api/episodes — published only
router.get('/', protect, async (req, res) => {
  const episodes = await Episode.find({ isPublished: true })
    .select('-files.publicId')
    .sort({ episodeNumber: 1 });
  res.json(episodes);
});

// GET /api/episodes/:id
router.get('/:id', protect, async (req, res) => {
  const episode = await Episode.findById(req.params.id).select('-files.publicId');
  if (!episode || !episode.isPublished) {
    return res.status(404).json({ message: 'Episode not found' });
  }
  await episode.updateOne({ $inc: { downloadCount: 1 } });
  res.json(episode);
});

// POST /api/episodes — create
router.post('/', protect, adminOnly, async (req, res) => {
  const { episodeNumber, title, description, phase, youtubeUrl, duration, tags } = req.body;
  const exists = await Episode.findOne({ episodeNumber });
  if (exists) return res.status(400).json({ message: `Episode ${episodeNumber} already exists` });
  const episode = await Episode.create({
    episodeNumber, title, description, phase, youtubeUrl, duration,
    tags: tags ? tags.split(',').map(t => t.trim()) : [],
  });
  res.status(201).json(episode);
});

// PUT /api/episodes/:id — update
router.put('/:id', protect, adminOnly, async (req, res) => {
  const episode = await Episode.findById(req.params.id);
  if (!episode) return res.status(404).json({ message: 'Episode not found' });
  const fields = ['title', 'description', 'phase', 'youtubeUrl', 'duration', 'isPublished'];
  fields.forEach(f => { if (req.body[f] !== undefined) episode[f] = req.body[f]; });
  if (req.body.tags) episode.tags = req.body.tags.split(',').map(t => t.trim());
  await episode.save();
  res.json(episode);
});

// POST /api/episodes/:episodeId/files — upload file
router.post('/:episodeId/files', protect, adminOnly, upload.single('file'), async (req, res) => {
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
});

// DELETE /api/episodes/:episodeId/files/:fileId
router.delete('/:episodeId/files/:fileId', protect, adminOnly, async (req, res) => {
  const episode = await Episode.findById(req.params.episodeId);
  if (!episode) return res.status(404).json({ message: 'Episode not found' });
  const file = episode.files.id(req.params.fileId);
  if (!file) return res.status(404).json({ message: 'File not found' });
  try { await cloudinary.uploader.destroy(file.publicId, { resource_type: 'raw' }); } catch (e) {}
  episode.files.pull(req.params.fileId);
  await episode.save();
  res.json({ message: 'File deleted' });
});

// DELETE /api/episodes/:id
router.delete('/:id', protect, adminOnly, async (req, res) => {
  const episode = await Episode.findById(req.params.id);
  if (!episode) return res.status(404).json({ message: 'Episode not found' });
  for (const file of episode.files) {
    try { await cloudinary.uploader.destroy(file.publicId, { resource_type: 'raw' }); } catch (e) {}
  }
  await episode.deleteOne();
  res.json({ message: 'Episode deleted' });
});

module.exports = router;