const mongoose = require('mongoose');

// One item in the tech feed: a news article, or a hackathon / tech event.
const insightSchema = new mongoose.Schema({
  track: { type: String, required: true },
  why:   { type: String, default: '' },   // why it matters for someone on this track
  todo:  { type: String, default: '' },   // one concrete next step
}, { _id: false });

const techItemSchema = new mongoose.Schema({
  kind:    { type: String, enum: ['news', 'event'], required: true },
  title:   { type: String, required: true, trim: true },
  url:     { type: String, required: true, trim: true },
  source:  { type: String, default: '' },        // "TechCrunch", "Devpost", "Added by Rajeev sir"…
  sourceId:{ type: mongoose.Schema.Types.ObjectId, ref: 'TechSource', default: null },
  summary: { type: String, default: '' },        // 1–2 lines
  imageUrl:{ type: String, default: '' },
  imgTried:{ type: Boolean, default: false },    // looked for the article's preview image
  lang:    { type: String, default: 'en' },      // 'en' | 'hi' | 'other' (other = never shown)
  kicker:  { type: String, default: '' },        // AI label for the card: release, hiring, funding…
  stat:    { type: String, default: '' },        // AI: the key number/fact, e.g. "₹500 crore", "3x faster"
  publishedAt: { type: Date, default: Date.now },

  tracks:     { type: [String], default: [] },   // career goals it's relevant to; 'general' = everyone
  importance: { type: Number, default: 2, min: 1, max: 5 },
  insights:   { type: [insightSchema], default: [] },
  aiDone:     { type: Boolean, default: false }, // tagged + advice written by AI
  aiTries:    { type: Number, default: 0 },

  // Events
  startsAt: { type: Date, default: null },
  endsAt:   { type: Date, default: null },
  deadline: { type: Date, default: null },      // registration / submission deadline
  mode:     { type: String, enum: ['online', 'in-person', 'hybrid', ''], default: '' },
  location: { type: String, default: '' },
  prize:    { type: String, default: '' },
  organizer:{ type: String, default: '' },

  manual: { type: Boolean, default: false },     // added by an admin
  pinned: { type: Boolean, default: false },     // shown at the top for everyone
  hidden: { type: Boolean, default: false },     // removed from students' feed
}, { timestamps: true });

techItemSchema.index({ url: 1 }, { unique: true });
techItemSchema.index({ kind: 1, hidden: 1, publishedAt: -1 });
techItemSchema.index({ kind: 1, hidden: 1, deadline: 1 });

module.exports = mongoose.model('TechItem', techItemSchema);
