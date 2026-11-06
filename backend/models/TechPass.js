const mongoose = require('mongoose');

// Paid (or gifted) access to the tech feed's personal tips, for students who
// don't already get it free through a paid program/course. One row per purchase;
// access lasts until the latest expiresAt.
const techPassSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  days:      { type: Number, required: true },
  amount:    { type: Number, default: 0 },            // ₹ paid (0 = gift)
  startsAt:  { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  source:    { type: String, enum: ['purchase', 'gift'], default: 'purchase' },
  paymentRef:{ type: String, default: '' },           // "RZP pay_…" for purchases
  note:      { type: String, default: '' },
  by:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },   // admin, for gifts
}, { timestamps: true });

techPassSchema.index({ user: 1, expiresAt: -1 });
techPassSchema.index({ paymentRef: 1 }, { unique: true, partialFilterExpression: { paymentRef: { $type: 'string', $gt: '' } } });

module.exports = mongoose.model('TechPass', techPassSchema);
