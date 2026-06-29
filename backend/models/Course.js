const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  thumbnail: {
    type: String,
    default: '',
  },
  // Public roadmap PDF (Phase 2 will let admin upload this; field added now)
  roadmapPdfUrl: {
    type: String,
    default: '',
  },
  roadmapPublicId: {
    type: String,
    default: '',
  },
  // Ordered list of phase labels for this course, e.g.
  // ["Phase 1 — Python Basics", "Phase 2 — OOP", ...]
  phases: {
    type: [String],
    default: [],
  },
  order: {
    type: Number,
    default: 0,   // controls display order on the courses page
  },
  isPublished: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

module.exports = mongoose.model('Course', courseSchema);
