const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  slug:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, default: '' },
  thumbnail:   { type: String, default: '' },

  // ── Pricing ──
  isPaid: { type: Boolean, default: false },
  price:  { type: Number, default: 0 },        // in INR
  mrp:    { type: Number, default: 0 },        // optional strike-through price
  accessDays: { type: Number, default: 0 },    // 0 = lifetime access

  // ── Sales-page content ──
  whatYouLearn: { type: [String], default: [] },  // bullet points
  level:    { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'], default: 'Beginner' },
  language: { type: String, default: 'Hinglish' },

  // Public roadmap PDF (lead magnet)
  roadmapPdfUrl:   { type: String, default: '' },
  roadmapPublicId: { type: String, default: '' },

  // Ordered phase labels, e.g. ["Phase 1 — Basics", "Phase 2 — OOP"]
  phases: { type: [String], default: [] },

  order:       { type: Number, default: 0 },
  isPublished: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Course', courseSchema);
