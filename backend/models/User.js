const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  avatar: {
    type: String,
    default: '',
  },
  googleId: {
    type: String,
    default: '',
  },
  role: {
    type: String,
    enum: ['student', 'admin'],
    default: 'student',
  },
  // track which episodes they accessed
  accessedEpisodes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Episode',
  }],
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
