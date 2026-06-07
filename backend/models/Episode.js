const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  label:       { type: String, required: true },   // e.g. "Class Notes", "Practice Tasks"
  url:         { type: String, required: true },   // Cloudinary URL
  publicId:    { type: String, required: true },   // Cloudinary public_id (for deletion)
  fileType:    { type: String, default: 'pdf' },   // pdf | docx | pptx | zip
  size:        { type: String, default: '' },       // e.g. "2.4 MB"
}, { _id: true });

const episodeSchema = new mongoose.Schema({
  episodeNumber: {
    type: Number,
    required: true,
    unique: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  phase: {
    type: String,
    default: 'Phase 1 — Python Basics',
  },
  youtubeUrl: {
    type: String,
    default: '',
  },
  duration: {
    type: String,
    default: '',   // e.g. "18 min"
  },
  files: [fileSchema],   // all downloadable files for this episode
  isPublished: {
    type: Boolean,
    default: false,   // admin controls visibility
  },
  downloadCount: {
    type: Number,
    default: 0,
  },
  tags: [String],   // e.g. ["python", "basics", "variables"]
}, { timestamps: true });

module.exports = mongoose.model('Episode', episodeSchema);
