const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
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
  text:       { type: String, required: true, trim: true, maxlength: 2000 },
  answer:     { type: String, default: '', trim: true, maxlength: 5000 },
  isAnswered: { type: Boolean, default: false },
  answeredAt: { type: Date, default: null },
}, { timestamps: true });

questionSchema.index({ episode: 1, createdAt: -1 });
questionSchema.index({ isAnswered: 1 });

module.exports = mongoose.model('Question', questionSchema);
