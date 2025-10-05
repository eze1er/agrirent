const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const passport = require('../middleware/config/passport');
const User = require('../models/User');
const { sendWelcomeEmail, sendVerificationEmail } = require('../services/emailService');

// Traditional email/password registration
router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password, phoneNumber, role } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }
    
    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    const user = await User.create({ 
      firstName, 
      lastName, 
      email, 
      password, 
      phoneNumber, 
      role: role || 'renter',
      emailVerificationToken: verificationToken,
      emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    });
    
    // Send emails (don't fail registration if emails fail)
    try {
      await sendVerificationEmail(user, verificationToken);
      await sendWelcomeEmail(user);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
    }
    
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
      },
      message: 'Registration successful! Please check your email to verify your account.'
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
    
    // Require email verification only for owners
    if ((user.role === 'owner' || user.role === 'both') && !user.isEmailVerified) {
      return res.status(403).json({ 
        success: false, 
        message: 'Owners must verify their email before listing equipment. Please check your inbox.',
        needsVerification: true,
        email: user.email
      });
    }
    
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      success: true,
      token,
      user: { 
        id: user._id, 
        firstName: user.firstName, 
        email: user.email, 
        role: user.role,
        isEmailVerified: user.isEmailVerified
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
// Email verification endpoint
router.get('/verify-email/:token', async (req, res) => {
  try {
    const user = await User.findOne({
      emailVerificationToken: req.params.token,
      emailVerificationExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid or expired verification token' 
      });
    }
    
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();
    
    res.json({ 
      success: true, 
      message: 'Email verified successfully!' 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    if (user.isEmailVerified) {
      return res.json({ success: true, message: 'Email already verified' });
    }
    
    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken = verificationToken;
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();
    
    await sendVerificationEmail(user, verificationToken);
    
    res.json({ 
      success: true, 
      message: 'Verification email sent successfully' 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// GOOGLE OAUTH ROUTES
// ============================================

router.get('/google', (req, res, next) => {
  console.log('Google route hit, strategies:', Object.keys(passport._strategies));
  next();
}, passport.authenticate('google', { 
  scope: ['profile', 'email'] 
}));

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