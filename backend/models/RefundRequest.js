const mongoose = require('mongoose');

// A student's refund request, made from the Refunds page in their account.
// The request time (createdAt) is what the refund policy goes by. The
// eligibility the server worked out at that moment is stored with it, so the
// admin decides on facts, not on timestamps in an inbox.
const refundRequestSchema = new mongoose.Schema({
  user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind:         { type: String, enum: ['event', 'course'], required: true },
  event:        { type: mongoose.Schema.Types.ObjectId, ref: 'LiveEvent', default: null },
  course:       { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
  registration: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', default: null },
  enrollment:   { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', default: null },
  title:        { type: String, default: '' },   // program/course name at the time

  type:   { type: String, enum: ['guarantee', 'payment_issue'], required: true },
  reason: { type: String, default: '', trim: true, maxlength: 1500 },

  amountPaid: { type: Number, default: 0 },
  method:     { type: String, enum: ['razorpay', 'upi'], required: true },
  paymentRef: { type: String, default: '' },               // pay_xxx or UTR
  upiId:      { type: String, default: '', trim: true },   // where a UPI refund goes

  // Eligibility at the moment of the request
  window: {
    rule:     { type: String, default: '' },     // live | recordings | course | single | issue
    state:    { type: String, default: '' },     // open | early | closed | none
    opensAt:  { type: Date, default: null },
    closesAt: { type: Date, default: null },
    text:     { type: String, default: '' },
  },
  eligible: { type: Boolean, default: false },

  status: { type: String, enum: ['pending', 'approved', 'refunded', 'rejected'], default: 'pending' },
  // approved = agreed, money still to be sent (UPI) | refunded = money sent
  refundAmount:   { type: Number, default: 0 },
  refundRef:      { type: String, default: '' },   // Razorpay rfnd_xxx or UPI transfer UTR
  adminNote:      { type: String, default: '' },   // shown to the student when declined
  accessRemoved:  { type: Boolean, default: false },
  decidedAt:      { type: Date, default: null },
  refundedAt:     { type: Date, default: null },
}, { timestamps: true });

refundRequestSchema.index({ status: 1, createdAt: 1 });
refundRequestSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('RefundRequest', refundRequestSchema);
