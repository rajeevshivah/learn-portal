const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  label:       { type: String, required: true },   // e.g. "Class Notes", "Practice Tasks"
  url:         { type: String, required: true },   // Cloudinary URL
  publicId:    { type: String, required: true },   // Cloudinary public_id (for deletion)
  fileType:    { type: String, default: 'pdf' },   // pdf | docx | pptx | zip
  size:        { type: String, default: '' },       // e.g. "2.4 MB"
}, { _id: true });

const episodeSchema = new mongoose.Schema({
  // NEW: every episode belongs to exactly one course
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },
  episodeNumber: {
    type: Number,
    required: true,
    // NOTE: no longer globally unique — uniqueness is per-course via the
    // compound index defined below.
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
  // Free preview: watchable without purchase even in a paid course
  isFreePreview: {
    type: Boolean,
    default: false,
  },
  viewCount: {
    type: Number,
    default: 0,
  },
  tags: [String],   // e.g. ["python", "basics", "variables"]
}, { timestamps: true });

// episodeNumber must be unique WITHIN a course, not globally
episodeSchema.index({ course: 1, episodeNumber: 1 }, { unique: true });

module.exports = mongoose.model('Episode', episodeSchema);
