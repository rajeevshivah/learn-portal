const mongoose = require('mongoose');

// A doubt thread. Started under a lesson (episode) or for the whole course
// (episode null). Replies live in the Reply model; counters here keep lists
// fast without aggregation.
const questionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },
  episode: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Episode',
    default: null,
  },
  text:       { type: String, required: true, trim: true, maxlength: 5000 },
  // Legacy single instructor answer. Still set when the instructor replies,
  // so older clients and the MCP keep working.
  answer:     { type: String, default: '', trim: true, maxlength: 5000 },
  isAnswered: { type: Boolean, default: false },   // instructor has replied
  answeredAt: { type: Date, default: null },

  upvotes:        [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  acceptedReply:  { type: mongoose.Schema.Types.ObjectId, ref: 'Reply', default: null },
  locked:         { type: Boolean, default: false },
  hidden:         { type: Boolean, default: false },
  replyCount:     { type: Number, default: 0 },    // visible top-level answers
  lastActivityAt: { type: Date, default: Date.now },
  lastReplyAt:    { type: Date, default: null },
  lastReplyBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  ownerSeenAt:    { type: Date, default: null },   // asker last opened the thread
  legacyMigrated: { type: Boolean, default: false },
}, { timestamps: true });

questionSchema.index({ episode: 1, createdAt: -1 });
questionSchema.index({ course: 1, createdAt: -1 });
questionSchema.index({ user: 1, lastReplyAt: -1 });
questionSchema.index({ isAnswered: 1 });

module.exports = mongoose.model('Question', questionSchema);
