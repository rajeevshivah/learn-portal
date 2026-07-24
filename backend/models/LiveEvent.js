const mongoose = require('mongoose');

// One session = one day / one sitting of the event.
// A single-class event has exactly 1 session; a multi-day workshop has many.
const sessionSchema = new mongoose.Schema({
  title:     { type: String, required: true, trim: true },   // "Day 1 — Loops & Logic"
  startsAt:  { type: Date, required: true },
  durationMins: { type: Number, default: 60 },
  joinUrl:   { type: String, default: '' },   // Zoom / Meet / YouTube-live link
  // After the session ends you can attach the recording.
  recordingUrl: { type: String, default: '' },
  // If this session was pushed into the course as an episode, we store it here
  // so you can't accidentally publish the same recording twice.
  publishedEpisode: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Episode',
    default: null,
  },
}, { _id: true });

const liveEventSchema = new mongoose.Schema({
  // 'live-class'  -> attached to a course (doubt-solving, energy maintenance)
  // 'workshop'    -> standalone topic, no course required
  type: {
    type: String,
    enum: ['live-class', 'workshop'],
    required: true,
  },

  title:       { type: String, required: true, trim: true },
  slug:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, default: '' },
  thumbnail:   { type: String, default: '' },

  // Required for type 'live-class', ignored for 'workshop'.
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    default: null,
  },

  sessions: [sessionSchema],

  // ── Pricing ──
  isPaid: { type: Boolean, default: false },
  price:  { type: Number, default: 0 },   // INR — you said ₹50 / ₹100 as a seriousness filter
  mrp:    { type: Number, default: 0 },

  // ── The reply students get after registering ──
  // whatsappLink is revealed ONLY when their registration is 'active'
  // (free = instantly, paid = after you approve the payment).
  whatsappLink:    { type: String, default: '' },
  confirmationMsg: {
    type: String,
    default: 'You are registered! Join the WhatsApp group below for the joining link and reminders.',
  },

  // Optional cap. 0 = unlimited.
  seatLimit: { type: Number, default: 0 },

  // Registration closes automatically at this time. Null = open until event starts.
  registrationClosesAt: { type: Date, default: null },

  isPublished: { type: Boolean, default: false },
  // Manually mark an event finished so it drops out of "upcoming".
  isCompleted: { type: Boolean, default: false },
}, { timestamps: true });

// Virtual: when does the whole event begin / end?
liveEventSchema.virtual('startsAt').get(function () {
  if (!this.sessions?.length) return null;
  return this.sessions.reduce(
    (min, s) => (!min || s.startsAt < min ? s.startsAt : min),
    null
  );
});

liveEventSchema.virtual('endsAt').get(function () {
  if (!this.sessions?.length) return null;
  return this.sessions.reduce((max, s) => {
    const end = new Date(s.startsAt.getTime() + (s.durationMins || 60) * 60000);
    return !max || end > max ? end : max;
  }, null);
});

liveEventSchema.set('toJSON',   { virtuals: true });
liveEventSchema.set('toObject', { virtuals: true });

// A live-class must point at a course; a workshop must not.
liveEventSchema.pre('validate', function (next) {
  if (this.type === 'live-class' && !this.course) {
    return next(new Error('A live class must be attached to a course'));
  }
  if (this.type === 'workshop') this.course = null;
  if (!this.sessions || this.sessions.length === 0) {
    return next(new Error('At least one session is required'));
  }
  if (this.isPaid && (!this.price || this.price <= 0)) {
    return next(new Error('A paid event needs a price above 0'));
  }
  next();
});

liveEventSchema.index({ isPublished: 1, isCompleted: 1 });
liveEventSchema.index({ course: 1 });

module.exports = mongoose.model('LiveEvent', liveEventSchema);
