const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const passport = require('../middleware/config/passport');
const User = require('../models/User');
const { sendWelcomeEmail, sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');

// Validation helper
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  return password && password.length >= 6;
};

    const validatePhoneNumber = (phone) => {
  if (!phone) return true; // Phone is optional
  
  // E.164 format: +[country code][number]
  // Example: +12125551234 (US), +447911123456 (UK)
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  return phoneRegex.test(phone);
};

// ============================================
// DEBUG ROUTES (Remove in production!)
// ============================================

// Debug: List all users
router.get('/debug/users', async (req, res) => {
  try {
    const users = await User.find({}).select('email firstName lastName role isEmailVerified');
    res.json({ 
      success: true, 
      count: users.length,
      users 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Debug: Reset password (bypass token)
router.post('/debug/reset-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    
    if (!email || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and new password are required' 
      });
    }

    if (!validatePassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    user.password = newPassword;
    await user.save(); // This will auto-hash the password
    
    res.json({ 
      success: true, 
      message: 'Password reset successfully',
      user: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Debug: Verify email (bypass token)
router.post('/debug/verify-me', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email is required' 
      });
    }
    
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { isEmailVerified: true },
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'Email verified successfully!',
      user: {
        email: user.email,
        firstName: user.firstName,
        isEmailVerified: user.isEmailVerified
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Debug: Delete user
router.delete('/debug/delete-user', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email is required' 
      });
    }
    
    const user = await User.findOneAndDelete({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'User deleted successfully',
      deletedUser: {
        email: user.email,
        firstName: user.firstName
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// routes/auth.js - Add this debug route

router.get('/debug/check-phone', async (req, res) => {
  try {
    const { email } = req.query;
    
    const user = await User.findOne({ email: email.toLowerCase() })
      .select('firstName lastName email phone');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    res.json({ 
      success: true, 
      user: {
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: user.phone || 'NO PHONE NUMBER',
        hasPhone: !!user.phone
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add route to update phone number
router.post('/debug/update-phone', async (req, res) => {
  try {
    const { email, phone } = req.body;
    
    if (!email || !phone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and phone are required' 
      });
    }
    
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { phone },
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'Phone number updated successfully',
      user: {
        email: user.email,
        phone: user.phone
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// REGULAR AUTH ROUTES
// ============================================

// Traditional email/password registration
// Traditional email/password registration
// Traditional email/password registration
router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone, role } = req.body;

    console.log('📝 Registration attempt:', {
      firstName,
      lastName,
      email,
      hasPassword: !!password,
      phone,
      role
    });

    // Validation
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, email, and password are required'
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    if (phone && !validatePhoneNumber(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format. Please use international format with country code (e.g., +12125551234)'
      });
    }

    const validRoles = ['renter', 'owner', 'both'];
    const userRole = role || 'renter';
    if (!validRoles.includes(userRole)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be renter, owner, or both'
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // ✅ CRITICAL: Explicitly set isEmailVerified to false
    const user = await User.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      password,
      phone: phone?.trim(),
      role: userRole,
      isEmailVerified: false, // ← EXPLICITLY SET TO FALSE
      emailVerificationToken: verificationToken,
      emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000
    });

    console.log('✅ User created:', user.email, 'Verified:', user.isEmailVerified);

    // Send verification email only (NOT welcome email)
    sendVerificationEmail(user, verificationToken).catch(emailError => {
      console.error('❌ Verification email failed:', emailError);
    });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified // Should be false
      },
      message: 'Registration successful! Please check your email to verify your account.'
    });
  } catch (error) {
    console.error('❌ Registration error:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Traditional email/password login
// Traditional email/password login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      console.log('❌ User not found:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      console.log('❌ Password mismatch for:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // ✅ ADD THIS CHECK: If user is not verified
    if (!user.isEmailVerified) {
      console.log('⚠️ User not verified:', email);
      return res.json({
        success: true,
        token: jwt.sign(
          { id: user._id, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: '7d' }
        ),
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          isEmailVerified: user.isEmailVerified
        },
        requiresVerification: true, // ← NEW FLAG
        message: 'Please verify your email to continue'
      });
    }

    console.log('✅ Login successful:', email);
    
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified
      },
      requiresVerification: false // ← NEW FLAG
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.'
    });
  }
});

// Resend verification email
// Resend verification email - FIXED VERSION
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    console.log('📧 Resend verification request for:', email);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      console.log('❌ User not found:', email);
      return res.status(404).json({
        success: false,
        message: 'No account found with this email'
      });
    }

    console.log('📊 User verification status:', {
      email: user.email,
      isEmailVerified: user.isEmailVerified,
      hasToken: !!user.emailVerificationToken
    });

    // ✅ CRITICAL: Check verification status FIRST
    if (user.isEmailVerified) {
      console.log('✅ Email already verified for:', user.email);
      return res.json({
        success: true,
        alreadyVerified: true,
        message: 'Your email is already verified!'
      });
    }

    // Generate NEW verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken = verificationToken;
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    await user.save();

    console.log('🔑 New verification token generated for:', user.email);

    // Send verification email
    try {
      await sendVerificationEmail(user, verificationToken);
      console.log('✅ Verification email sent to:', user.email);
    } catch (emailError) {
      console.error('❌ Failed to send verification email:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email. Please try again.'
      });
    }

    res.json({
      success: true,
      alreadyVerified: false,
      message: 'Verification email sent! Please check your inbox.'
    });
  } catch (error) {
    console.error('❌ Resend verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend verification email'
    });
  }
});

// Email verification endpoint
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;

    console.log('🔍 Email verification attempt with token:', token.substring(0, 10) + '...');

    // Find user with valid verification token
    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      console.log('❌ Invalid or expired verification token');
      // Redirect to frontend with error - DON'T include email to prevent loops
      return res.redirect(`${process.env.FRONTEND_URL}/verify-email?verified=false&error=invalid_token`);
    }

    console.log('✅ Valid token found for user:', user.email, 'Current verified status:', user.isEmailVerified);

    // ✅ CRITICAL: Only update if not already verified
    if (!user.isEmailVerified) {
      user.isEmailVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpires = undefined;
      await user.save();
      console.log('✅ User email marked as verified:', user.email);
    } else {
      console.log('ℹ️ Email already verified for:', user.email);
    }

    // ✅ CRITICAL: Generate a proper JWT token for immediate login
    const loginToken = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // ✅ CRITICAL: Redirect to dashboard with token for immediate access
    res.redirect(`${process.env.FRONTEND_URL}/verify-email?verified=true&email=${encodeURIComponent(user.email)}&token=${loginToken}&userId=${user._id}`);
  } catch (error) {
    console.error('❌ Email verification error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/verify-email?verified=false&error=server_error`);
  }
});
// Forgot password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Valid email is required'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.json({
        success: true,
        message: 'If an account exists, a reset link has been sent'
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = Date.now() + 60 * 60 * 1000;
    await user.save();

    try {
      await sendPasswordResetEmail(user, resetToken);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
    }

    res.json({
      success: true,
      message: 'If an account exists, a reset link has been sent'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process request'
    });
  }
});
// Reset password
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!validatePassword(password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
});
// Check email verification status
// router.get('/verification-status', protect, async (req, res) => {
//   try {
//     const user = await User.findById(req.user.id).select('email isEmailVerified role');
    
//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: 'User not found'
//       });
//     }

//     res.json({
//       success: true,
//       data: {
//         email: user.email,
//         isEmailVerified: user.isEmailVerified,
//         role: user.role
//       }
//     });
//   } catch (error) {
//     console.error('Error checking verification status:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to check verification status'
//     });
//   }
// });

// Google OAuth routes
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
  session: false
}));

router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${process.env.FRONTEND_URL}/?error=auth_failed`,
    session: false
  }),
  (req, res) => {
    try {
      if (!req.user) {
        return res.redirect(`${process.env.FRONTEND_URL}/?error=auth_failed`);
      }

      const token = jwt.sign(
        { id: req.user._id, role: req.user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.redirect(`${process.env.FRONTEND_URL}/?token=${token}`);
    } catch (error) {
      console.error('Google callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL}/?error=auth_failed`);
    }
  }
);

module.exports = router;