const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  label:       { type: String, required: true },   // e.g. "Class Notes", "Practice Tasks"
  originalName:{ type: String, default: '' },      // original uploaded filename incl. extension
  url:         { type: String, required: true },   // Cloudinary URL
  publicId:    { type: String, required: true },   // Cloudinary public_id (for deletion)
  fileType:    { type: String, default: 'pdf' },   // file extension: pdf, ipynb, py, csv, zip…
  size:        { type: String, default: '' },       // e.g. "2.4 MB"
  board:       { type: mongoose.Schema.Types.ObjectId, ref: 'Board', default: null },  // set when the file is a whiteboard's notes
}, { _id: true });

// A link shown with the lesson: a Colab notebook, GitHub repo, Drive folder…
const linkSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true, maxlength: 120 },
  url:   { type: String, required: true, trim: true, maxlength: 1000 },
  kind:  { type: String, enum: ['colab', 'github', 'drive', 'kaggle', 'link'], default: 'link' },
}, { _id: true, timestamps: true });

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
  links: [linkSchema],   // Colab / GitHub / Drive links for this episode
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
