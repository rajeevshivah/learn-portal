const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiKey = require('../models/ApiKey');
const Settings = require('../models/Settings');

// "One device at a time" setting, cached so every request doesn't hit the DB.
let settingsCache = { at: 0, single: true };
async function singleDeviceOn() {
  if (Date.now() - settingsCache.at < 30_000) return settingsCache.single;
  try {
    const s = await Settings.get();
    settingsCache = { at: Date.now(), single: s.singleDeviceLogin !== false };
  } catch { settingsCache.at = Date.now(); }
  return settingsCache.single;
}
const forgetSettings = () => { settingsCache.at = 0; };

// Protect any route — must be logged in.
// Accepts either a normal login token (JWT) or an MCP access key ("lp_…").
const protect = async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized — no token' });
  }
  const token = header.slice(7).trim();

  try {
    if (token.startsWith('lp_')) {
      const digest = crypto.createHash('sha256').update(token).digest('hex');
      const key = await ApiKey.findOne({ digest, revokedAt: null, expiresAt: { $gt: new Date() } });
      if (!key) return res.status(401).json({ message: 'Access key is invalid, expired or revoked' });

      // Read-only keys may only read.
      const needs = ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? 'read' : 'write';
      if (!key.scopes.includes(needs)) {
        return res.status(403).json({ message: 'This access key is read-only' });
      }
      req.user = await User.findById(key.user).select('-__v');
      if (!req.user) return res.status(401).json({ message: 'Account for this key no longer exists' });
      req.apiKey = key;
      // Track usage without slowing the request down
      ApiKey.updateOne({ _id: key._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-__v +sessionId');
    if (!req.user) return res.status(401).json({ message: 'Account no longer exists' });

    // One device at a time: a student's token must carry the latest login's id.
    // Tokens from before this feature (no sid) keep working until the student
    // signs in again somewhere, which sets a session id.
    const current = req.user.sessionId || '';
    if (req.user.role !== 'admin' && current && decoded.sid !== current && await singleDeviceOn()) {
      return res.status(401).json({
        code: 'SESSION_REPLACED',
        message: 'You were signed out because your account was signed in on another device.',
      });
    }
    next();
  } catch {
    res.status(401).json({ message: 'Not authorized — invalid token' });
  }
};

// Admin only
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Admin access required' });
  }
};

// Block a route for access keys — e.g. creating more keys must need a real login.
const loginOnly = (req, res, next) => {
  if (req.apiKey) return res.status(403).json({ message: 'Sign in on the website to manage access keys' });
  next();
};

module.exports = { protect, adminOnly, loginOnly, forgetSettings };
