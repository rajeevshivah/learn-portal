const mongoose = require('mongoose');

// One rating per student per class (sessionId), plus one overall program review
// per student per event (sessionId = null). Editable: re-submitting updates it.
const feedbackSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  event:     { type: mongoose.Schema.Types.ObjectId, ref: 'LiveEvent', required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, default: null }, // null = whole-program review
  rating:    { type: Number, required: true, min: 1, max: 5 },
  comment:   { type: String, default: '', trim: true, maxlength: 600 },

  // Testimonials: shown publicly ONLY if the student allowed it AND the admin featured it.
  consentToFeature: { type: Boolean, default: false },
  featured:         { type: Boolean, default: false },
  featuredAt:       { type: Date, default: null },
  hidden:           { type: Boolean, default: false }, // admin can hide abusive/irrelevant comments
}, { timestamps: true });

feedbackSchema.index({ user: 1, event: 1, sessionId: 1 }, { unique: true });
feedbackSchema.index({ event: 1, sessionId: 1 });
feedbackSchema.index({ featured: 1, featuredAt: -1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
