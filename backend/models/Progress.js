const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },
  episode: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Episode',
    required: true,
  },
  completedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// One completion record per user per episode
progressSchema.index({ user: 1, episode: 1 }, { unique: true });
progressSchema.index({ user: 1, course: 1 });

module.exports = mongoose.model('Progress', progressSchema);
