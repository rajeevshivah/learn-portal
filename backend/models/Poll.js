const mongoose = require('mongoose');

// A single-question poll shown on the student dashboard.
// Options hold their own vote tally; a separate voters array enforces one
// vote per user (and lets us prevent re-voting since votes are locked).
const optionSchema = new mongoose.Schema({
  text:  { type: String, required: true, trim: true, maxlength: 200 },
  votes: { type: Number, default: 0 },
}, { _id: true });

const pollSchema = new mongoose.Schema({
  question: { type: String, required: true, trim: true, maxlength: 300 },
  options:  {
    type: [optionSchema],
    validate: [arr => arr.length >= 2 && arr.length <= 4, 'A poll needs 2 to 4 options'],
  },
  // Only one poll is "active" and shown to students at a time. Admin toggles this.
  isActive: { type: Boolean, default: true },
  // Users who have already voted — enforces one locked vote each.
  voters: [{
    user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    optionId: { type: mongoose.Schema.Types.ObjectId },
  }],
}, { timestamps: true });

pollSchema.index({ isActive: 1, createdAt: -1 });

// Total votes across all options (handy for percentages).
pollSchema.virtual('totalVotes').get(function () {
  return this.options.reduce((sum, o) => sum + o.votes, 0);
});

pollSchema.set('toJSON', { virtuals: true });
pollSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Poll', pollSchema);
