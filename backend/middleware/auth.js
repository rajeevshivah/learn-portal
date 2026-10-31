const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiKey = require('../models/ApiKey');

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
    req.user = await User.findById(decoded.id).select('-__v');
    if (!req.user) return res.status(401).json({ message: 'Account no longer exists' });
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

module.exports = { protect, adminOnly, loginOnly };
