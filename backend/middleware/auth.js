const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect any route — must be logged in
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-__v');
      next();
    } catch {
      res.status(401).json({ message: 'Not authorized — invalid token' });
    }
  } else {
    res.status(401).json({ message: 'Not authorized — no token' });
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

module.exports = { protect, adminOnly };
