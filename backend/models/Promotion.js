const mongoose = require('mongoose');

/**
 * A Promotion is a call-to-action shown on roadmap funnel pages.
 * It points at EITHER a course OR a live event (never both), and it
 * targets EITHER every roadmap page (scope 'all') OR a chosen set of
 * roadmaps (scope 'selected' + roadmaps[]).
 *
 * Past webinars auto-hide: the public endpoint skips any event
 * promotion whose event has ended or been marked completed. Nothing
 * here needs a cron — it's filtered at read time.
 */
const promotionSchema = new mongoose.Schema({
  // What this promotion points at. Exactly one of course / event is set.
  kind: {
    type: String,
    enum: ['course', 'event'],
    required: true,
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    default: null,
  },
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LiveEvent',
    default: null,
  },

  // Optional copy overrides. If blank, the page falls back to the
  // course/event's own title + description and a sensible default CTA.
  headline:  { type: String, default: '' },   // e.g. "New: ML Bootcamp is live"
  subtext:   { type: String, default: '' },   // one line under the headline
  ctaLabel:  { type: String, default: '' },   // e.g. "Register now"

  // Where it shows.
  // 'all'      -> every roadmap funnel page
  // 'selected' -> only the roadmaps listed in `roadmaps`
  scope: {
    type: String,
    enum: ['all', 'selected'],
    default: 'all',
  },
  roadmaps: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Roadmap',
  }],

  isActive: { type: Boolean, default: true },
  order:    { type: Number, default: 0 },   // lower shows first
}, { timestamps: true });

// Enforce the "exactly one target" rule and match target to kind.
promotionSchema.pre('validate', function (next) {
  if (this.kind === 'course') {
    this.event = null;
    if (!this.course) return next(new Error('A course promotion must reference a course'));
  }
  if (this.kind === 'event') {
    this.course = null;
    if (!this.event) return next(new Error('An event promotion must reference an event'));
  }
  if (this.scope === 'selected' && (!this.roadmaps || this.roadmaps.length === 0)) {
    return next(new Error('Select at least one roadmap, or set scope to "all"'));
  }
  if (this.scope === 'all') this.roadmaps = [];
  next();
});

promotionSchema.index({ isActive: 1, scope: 1 });

module.exports = mongoose.model('Promotion', promotionSchema);
