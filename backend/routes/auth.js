const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User    = require('../models/User');
const { protect } = require('../middleware/auth');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Generate JWT
const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

// ── POST /api/auth/google ────────────────────────────────
// Frontend sends the Google credential token after user clicks "Sign in with Google"
router.post('/google', async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ message: 'Google credential required' });
  }

  try {
    // Verify the token with Google
    const ticket = await client.verifyIdToken({
      idToken:  credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const { sub: googleId, name, email, picture } = ticket.getPayload();

    // Find or create user
    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name,
        email,
        avatar:   picture,
        googleId,
        role: 'student',
      });
    } else {
      // Update google info if they previously registered another way
      if (!user.googleId) {
        user.googleId = googleId;
        user.avatar   = picture;
        await user.save();
      }
    }

    res.json({
      _id:   user._id,
      name:  user.name,
      email: user.email,
      avatar: user.avatar,
      role:  user.role,
      token: generateToken(user._id),
    });

  } catch (err) {
    console.error('Google auth error:', err.message);
    res.status(401).json({ message: 'Google authentication failed' });
  }
});

// ── GET /api/auth/me ─────────────────────────────────────
// Returns logged-in user data
router.get('/me', protect, async (req, res) => {
  res.json({
    _id:    req.user._id,
    name:   req.user.name,
    email:  req.user.email,
    avatar: req.user.avatar,
    role:   req.user.role,
  });
});

module.exports = router;
