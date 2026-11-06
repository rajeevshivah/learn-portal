const mongoose = require('mongoose');

// Registration is to LiveEvent what Enrollment is to Course.
// Free event  -> status 'active' immediately, WhatsApp link shown at once.
// Paid event  -> 'pending' after UTR submission, then admin approves/rejects.
const registrationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LiveEvent',
    required: true,
  },

  status: {
    type: String,
    // refunded: access removed after a refund | cancelled: removed by admin, no refund
    enum: ['pending', 'active', 'rejected', 'refunded', 'cancelled'],
    default: 'active',
  },

  // ── Registration form answers ──
  // Collected even for free events so you know who is coming.
  phone:      { type: String, default: '', trim: true },
  college:    { type: String, default: '', trim: true },
  expectation:{ type: String, default: '', trim: true },  // "what do you want solved?"

  // ── Payment details (paid events only) ──
  amount:             { type: Number, default: 0 },
  utr:                { type: String, default: '', trim: true },
  screenshotUrl:      { type: String, default: '' },
  screenshotPublicId: { type: String, default: '' },
  rejectReason:       { type: String, default: '' },
  approvedAt:         { type: Date, default: null },

  attended: { type: Boolean, default: false },

  // Admin changes to this seat (moved to another account, cancelled), newest last.
  // Emails are stored as text so the trail survives even if an account is deleted.
  history: [{
    action: { type: String, enum: ['transferred', 'cancelled'], required: true },
    from:   { type: String, default: '' },     // email before
    to:     { type: String, default: '' },     // email after (transfers)
    note:   { type: String, default: '' },
    by:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    at:     { type: Date, default: Date.now },
    _id: false,
  }],
}, { timestamps: true });

// One registration per user per event
registrationSchema.index({ user: 1, event: 1 }, { unique: true });
registrationSchema.index({ event: 1, status: 1 });

module.exports = mongoose.model('Registration', registrationSchema);
