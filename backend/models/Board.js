const mongoose = require('mongoose');

// A teaching whiteboard. Usually one per class (event + session), but can be
// standalone. Pages live in BoardPage so a long class never hits the 16 MB
// document limit.
const boardSchema = new mongoose.Schema({
  title:   { type: String, required: true, trim: true, maxlength: 160 },
  event:   { type: mongoose.Schema.Types.ObjectId, ref: 'LiveEvent', default: null },
  session: { type: mongoose.Schema.Types.ObjectId, default: null },   // LiveEvent.sessions._id
  pageOrder: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BoardPage' }],
  // Last published notes PDF
  notes: {
    url:         { type: String, default: '' },
    publicId:    { type: String, default: '' },
    pages:       { type: Number, default: 0 },
    size:        { type: String, default: '' },
    publishedAt: { type: Date, default: null },
  },
}, { timestamps: true });

boardSchema.index({ event: 1, session: 1 });
boardSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('Board', boardSchema);
