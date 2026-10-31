const mongoose = require('mongoose');

// A personal access key for AI assistants (Claude, GPT/Codex) via the MCP server.
// Only a SHA-256 digest is stored; the key itself is shown once at creation.
const apiKeySchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true, maxlength: 80 }, // e.g. "Claude on my laptop"
  prefix:     { type: String, required: true },                            // first chars, to recognise it in the list
  digest:     { type: String, required: true, unique: true, select: false },
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  scopes:     { type: [String], enum: ['read', 'write'], default: ['read'] },
  expiresAt:  { type: Date, required: true },
  revokedAt:  { type: Date, default: null },
  lastUsedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('ApiKey', apiKeySchema);
