const mongoose = require('mongoose');

// One document per Razorpay order.
// Created when the student clicks "Pay", marked 'paid' once Razorpay confirms.
// The actual access still lives on Enrollment (courses) / Registration (events) —
// this is the receipt + audit trail.
const paymentSchema = new mongoose.Schema({
  user:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind:  { type: String, enum: ['course', 'event'], required: true },
  course:{ type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveEvent', default: null },

  amount:   { type: Number, required: true },        // rupees (what the student was charged)
  currency: { type: String, default: 'INR' },

  orderId:   { type: String, required: true, unique: true },  // order_xxx
  paymentId: { type: String, default: '' },                   // pay_xxx
  status:    { type: String, enum: ['created', 'paid', 'failed'], default: 'created' },
  method:    { type: String, default: '' },                   // upi / card / netbanking / wallet
  international: { type: Boolean, default: false },
  paidAt:    { type: Date, default: null },
  failReason:{ type: String, default: '' },

  // Event registration form answers, carried until the payment is confirmed
  form: {
    phone:       { type: String, default: '' },
    college:     { type: String, default: '' },
    expectation: { type: String, default: '' },
  },
}, { timestamps: true });

paymentSchema.index({ user: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
