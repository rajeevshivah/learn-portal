const mongoose = require('mongoose');

// Single-document collection for platform settings (managed from Admin panel)
const settingsSchema = new mongoose.Schema({
  key:     { type: String, default: 'platform', unique: true },
  upiId:   { type: String, default: '', trim: true },   // e.g. rajeev@okaxis
  upiName: { type: String, default: 'codeWithShivah', trim: true },
  paymentQrUrl: { type: String, default: '' },   // uploaded PhonePe/GPay QR image; overrides the generated QR when set
  paymentNote: {
    type: String,
    default: 'After paying, submit the UTR / transaction ID below. Access is unlocked after verification (usually within a few hours).',
  },
  // Students stay signed in on one device at a time: a new sign-in signs out the
  // old one, so a shared Google login can't be used side by side. Admins exempt.
  singleDeviceLogin: { type: Boolean, default: true },
}, { timestamps: true });

settingsSchema.statics.get = async function () {
  let doc = await this.findOne({ key: 'platform' });
  if (!doc) doc = await this.create({ key: 'platform' });
  return doc;
};

module.exports = mongoose.model('Settings', settingsSchema);
