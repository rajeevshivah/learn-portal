const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema({
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
  // Free course enroll => 'active' immediately.
  // Paid course => 'pending' after UTR submission, then admin approves/rejects.
  status: {
    type: String,
    enum: ['pending', 'active', 'rejected'],
    default: 'active',
  },
  // Payment details (paid courses only)
  amount:            { type: Number, default: 0 },
  utr:               { type: String, default: '', trim: true },
  screenshotUrl:     { type: String, default: '' },
  screenshotPublicId:{ type: String, default: '' },
  rejectReason:      { type: String, default: '' },
  approvedAt:        { type: Date, default: null },
  // null = lifetime. Set on approval when course.accessDays > 0.
  expiresAt:         { type: Date, default: null },
}, { timestamps: true });

// A user can have only one enrollment record per course
enrollmentSchema.index({ user: 1, course: 1 }, { unique: true });

module.exports = mongoose.model('Enrollment', enrollmentSchema);
