const mongoose = require('mongoose');

// One whiteboard page. `strokes` is drawn data from the board app:
// { t: 'pen'|'hl'|'line'|'arrow'|'rect'|'ellipse'|'text', c: colour, s: size,
//   p: [x, y, pressure, ...] in a 1600x900 page, text/x/y for text }.
const boardPageSchema = new mongoose.Schema({
  board:   { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true },
  bg:      { type: String, enum: ['dark', 'light'], default: 'dark' },
  pattern: { type: String, enum: ['plain', 'grid', 'lines', 'dots'], default: 'plain' },
  strokes: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true, minimize: false });

boardPageSchema.index({ board: 1 });

module.exports = mongoose.model('BoardPage', boardPageSchema);
