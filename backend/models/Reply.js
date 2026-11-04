const mongoose = require('mongoose');

// A reply in a doubt thread. Top-level replies are answers; a reply with a
// `parent` is a short comment under that answer (one level only).
const replySchema = new mongoose.Schema({
  question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  parent:   { type: mongoose.Schema.Types.ObjectId, ref: 'Reply', default: null },
  text:     { type: String, required: true, trim: true, maxlength: 5000 },
  isAdmin:  { type: Boolean, default: false },
  upvotes:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  hidden:   { type: Boolean, default: false },
  legacy:   { type: Boolean, default: false },   // copied from the old single-answer field
}, { timestamps: true });

replySchema.index({ question: 1, createdAt: 1 });
replySchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Reply', replySchema);
