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
  // New programs start with "Meet link per class" switched on (when Google is connected).
  meetLinkPerClassForNew: { type: Boolean, default: true },

  // Sign-up with name + mobile + email + password (besides Google). Off = Google only.
  passwordSignup: { type: Boolean, default: true },

  // Tech Pass: personal tips in the tech feed. Free for paid students (freeForPaid),
  // otherwise bought for `price` ₹ for `days` days. enabled: false = free for everyone.
  techPass: {
    enabled:     { type: Boolean, default: true },
    price:       { type: Number, default: 99 },
    days:        { type: Number, default: 90 },
    freeForPaid: { type: Boolean, default: true },
    paidGraceDays: { type: Number, default: 0 },   // days after a program's last class that its students keep the tips
  },

  // Tech feed bookkeeping (utils/techFeed.js)
  techLastRefreshAt: { type: Date, default: null },
  techAi: {
    day:       { type: String, default: '' },   // YYYY-MM-DD
    articles:  { type: Number, default: 0 },    // articles tagged by AI that day
    lastError: { type: String, default: '' },
  },
}, { timestamps: true });

settingsSchema.statics.get = async function () {
  let doc = await this.findOne({ key: 'platform' });
  if (!doc) doc = await this.create({ key: 'platform' });
  return doc;
};

module.exports = mongoose.model('Settings', settingsSchema);
