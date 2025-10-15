const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// Get current user with fresh verification status
router.get('/me', async (req, res) => {
  try {
    // Extract token from header
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user with fresh data from database
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    console.log('📊 User /me endpoint - Verification status:', {
      email: user.email,
      isEmailVerified: user.isEmailVerified,
      role: user.role
    });

    res.json({
      success: true,
      data: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        phone: user.phone,
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

// ✅ ADD THIS NEW ENDPOINT
router.get('/verification-status', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('email isEmailVerified role');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    console.log('✅ Verification status check:', {
      email: user.email,
      isVerified: user.isEmailVerified,
      role: user.role
    });

    res.json({
      success: true,
      data: {
        email: user.email,
        isEmailVerified: user.isEmailVerified,
        role: user.role
      }
    });
  } catch (error) {
    console.error('❌ Error checking verification status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check verification status'
    });
  }
});

module.exports = router;