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
  // Mobile number, digits only (10 digits, India). Students can sign in with it.
  phone: {
    type: String,
    default: '',
    trim: true,
    index: true,
  },
  // Set when the student signed up with the form (bcrypt hash). Google-only accounts have none.
  password: {
    type: String,
    default: '',
    select: false,
  },
  // Forgot-password code (hash), valid for a short while
  reset: {
    type: { hash: String, expiresAt: Date, tries: Number },
    default: null,
    select: false,
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
  // Id of the login that is currently allowed. A new Google sign-in replaces it,
  // which signs out the previous device (when "one device at a time" is on).
  sessionId: {
    type: String,
    default: '',
    select: false,
  },
  // Tech feed: the career goals this student follows (ids from utils/techTracks.js),
  // plus anything they typed themselves ("Salesforce developer").
  techGoal: {
    tracks:  { type: [String], default: [] },
    custom:  { type: String, default: '' },
    keywords:{ type: [String], default: [] },   // words for matching their own goal
    setAt:   { type: Date, default: null },
    // Optional, for "near you" events. Typed by the student or filled from their location.
    city:    { type: String, default: '' },
    state:   { type: String, default: '' },
  },
  // track which episodes they accessed
  accessedEpisodes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Episode',
  }],
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
