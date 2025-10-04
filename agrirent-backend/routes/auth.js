const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const passport = require('../middleware/config/passport'); // Import configured passport
const User = require('../models/User');

// Traditional email/password registration
router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password, phoneNumber, role } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }
    const user = await User.create({ 
      firstName, 
      lastName, 
      email, 
      password, 
      phoneNumber, 
      role: role || 'renter' 
    });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({
      success: true,
      token,
      user: { 
        id: user._id, 
        firstName: user.firstName, 
        lastName: user.lastName, 
        email: user.email, 
        role: user.role 
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Traditional email/password login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      success: true,
      token,
      user: { 
        id: user._id, 
        firstName: user.firstName, 
        email: user.email, 
        role: user.role 
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// GOOGLE OAUTH ROUTES
// ============================================

// Initiate Google OAuth
router.get('/google', (req, res, next) => {
  console.log('Google route hit, strategies:', Object.keys(passport._strategies));
  next();
}, passport.authenticate('google', { 
  scope: ['profile', 'email'] 
}));

// Google OAuth callback
router.get('/google/callback',
  passport.authenticate('google', { 
    failureRedirect: 'http://localhost:5173/?error=auth_failed',
    session: false 
  }),
  (req, res) => {
    console.log('Google callback successful for user:', req.user?.email);
    const token = jwt.sign(
      { id: req.user._id }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' }
    );
    
    res.redirect(`http://localhost:5173/?token=${token}`);
  }
);

module.exports = router;