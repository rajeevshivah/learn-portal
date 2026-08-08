const mongoose = require('mongoose');

// A free-text topic suggestion from a student. Collected privately — only
// admins read these. Not tied to any poll; the dashboard box is always on.
const suggestionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  text:     { type: String, required: true, trim: true, maxlength: 500 },
  // Admin can mark ones they've actioned/read to keep the list tidy.
  reviewed: { type: Boolean, default: false },
}, { timestamps: true });

suggestionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Suggestion', suggestionSchema);
