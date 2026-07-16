const mongoose = require('mongoose');

// Single-document collection for platform settings (managed from Admin panel)
const settingsSchema = new mongoose.Schema({
  key:     { type: String, default: 'platform', unique: true },
  upiId:   { type: String, default: '', trim: true },   // e.g. rajeev@okaxis
  upiName: { type: String, default: 'codeWithShivah', trim: true },
  paymentNote: {
    type: String,
    default: 'After paying, submit the UTR / transaction ID below. Access is unlocked after verification (usually within a few hours).',
  },
}, { timestamps: true });

settingsSchema.statics.get = async function () {
  let doc = await this.findOne({ key: 'platform' });
  if (!doc) doc = await this.create({ key: 'platform' });
  return doc;
};

module.exports = mongoose.model('Settings', settingsSchema);
