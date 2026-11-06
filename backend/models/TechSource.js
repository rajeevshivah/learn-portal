const mongoose = require('mongoose');

// Where the tech feed comes from. Admin can switch sources on/off or add RSS feeds.
const techSourceSchema = new mongoose.Schema({
  name:    { type: String, required: true, trim: true },
  type:    { type: String, enum: ['rss', 'hn', 'devto', 'devpost'], required: true },
  url:     { type: String, default: '' },        // feed URL for 'rss'
  kind:    { type: String, enum: ['news', 'event'], default: 'news' },
  // Optional: tracks every item from this source belongs to (e.g. an AI-only feed)
  tracks:  { type: [String], default: [] },
  maxItems:{ type: Number, default: 15 },        // newest N per refresh
  enabled: { type: Boolean, default: true },
  builtIn: { type: Boolean, default: false },
  lastRun: {
    at:    { type: Date, default: null },
    ok:    { type: Boolean, default: null },
    added: { type: Number, default: 0 },
    message: { type: String, default: '' },
  },
}, { timestamps: true });

module.exports = mongoose.model('TechSource', techSourceSchema);
