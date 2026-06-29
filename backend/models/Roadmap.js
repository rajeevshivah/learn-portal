const mongoose = require('mongoose');

const roadmapSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  // Headline + subtext shown on the public funnel page
  description: {
    type: String,
    default: '',
  },
  pdfUrl: {
    type: String,
    default: '',
  },
  pdfPublicId: {
    type: String,
    default: '',
  },
  // OPTIONAL: link this roadmap to a course so the page can deep-link
  // "explore the full course". Null = pure standalone lead magnet.
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    default: null,
  },
  // How many times the public page has been viewed (funnel metric)
  views: {
    type: Number,
    default: 0,
  },
  // How many times the PDF download button was clicked
  downloads: {
    type: Number,
    default: 0,
  },
  isPublished: {
    type: Boolean,
    default: true,   // roadmaps are lead magnets — public by default
  },
}, { timestamps: true });

module.exports = mongoose.model('Roadmap', roadmapSchema);
