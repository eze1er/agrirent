// backend/middleware/auth.js - FIXED VERSION
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
      
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }
      
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token failed'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// ============== PROTECT MIDDLEWARE ==============
// Verifies JWT token and attaches user to request
exports.protect = async (req, res, next) => {
  try {
    let token;
    
    // Check if authorization header exists and starts with Bearer
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    // If no token found, return unauthorized
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Not authorized - No token provided' 
      });
    }
    
    // ✅ ADDED: Validate token format before verification
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token format' 
      });
    }
    
    // ✅ ADDED: Check if token is empty or too short
    if (token.length < 10) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from token
    req.user = await User.findById(decoded.id).select('-password');
    
    // Check if user exists
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    // Check if user is active (optional - add if you have isActive field)
    // ✅ FIXED: Added safe check for isActive field
    if (req.user.isActive === false) {
      return res.status(401).json({ 
        success: false, 
        message: 'Account has been deactivated' 
      });
    }
    
    next();
  } catch (error) {
    console.error('Auth error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      // ✅ IMPROVED: More specific error messages
      if (error.message.includes('malformed')) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid token format - please log in again' 
        });
      }
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired - please log in again' 
      });
    }
    
    return res.status(401).json({ 
      success: false, 
      message: 'Not authorized' 
    });
  }
};

// ============== AUTHORIZE MIDDLEWARE ==============
// Restricts access to specific user roles
// Usage: protect, authorize('admin'), or authorize('admin', 'owner')
exports.authorize = (...roles) => {
  return (req, res, next) => {
    // Check if user exists (should be set by protect middleware)
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized - User not authenticated'
      });
    }
    
    // Check if user's role is in the allowed roles
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied - This route is restricted to ${roles.join(', ')} only`
      });
    }
    
    next();
  };
};

// ============== OPTIONAL: CHECK OWNERSHIP MIDDLEWARE ==============
// Verifies that the user owns the resource
// Usage: protect, checkOwnership('ownerId')
exports.checkOwnership = (ownerField = 'userId') => {
  return async (req, res, next) => {
    try {
      // Get the model name from the route (e.g., 'rental', 'machine')
      const modelName = req.baseUrl.split('/').pop();
      
      // ✅ FIXED: Added safe model loading with error handling
      let Model;
      try {
        Model = require(`../models/${modelName.charAt(0).toUpperCase() + modelName.slice(1)}`);
      } catch (modelError) {
        console.error('Model loading error:', modelError);
        return res.status(500).json({
          success: false,
          message: 'Server error - Invalid resource type'
        });
      }
      
      // Find the resource
      const resource = await Model.findById(req.params.id);
      
      if (!resource) {
        return res.status(404).json({
          success: false,
          message: 'Resource not found'
        });
      }
      
      // Check if user owns the resource
      const ownerId = resource[ownerField]?.toString() || resource[ownerField];
      
      if (ownerId !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access this resource'
        });
      }
      
      // Attach resource to request for later use
      req.resource = resource;
      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error during authorization check'
      });
    }
  };
};

// ============== OPTIONAL: CHECK EMAIL VERIFICATION ==============
// Ensures user has verified their email
// Usage: protect, requireEmailVerification
exports.requireEmailVerification = (req, res, next) => {
  // ✅ FIXED: Added safe check for isEmailVerified field
  if (!req.user.isEmailVerified) {
    return res.status(403).json({
      success: false,
      message: 'Please verify your email address to access this feature',
      requiresVerification: true // ✅ ADDED: Flag for frontend handling
    });
  }
  next();
};

// ============== OPTIONAL: RATE LIMITING BY USER ==============
// Simple in-memory rate limiter (use Redis in production)
const userRequestCount = new Map();

exports.rateLimitByUser = (maxRequests = 100, windowMs = 60000) => {
  return (req, res, next) => {
    if (!req.user) {
      return next();
    }
    
    const userId = req.user.id;
    const now = Date.now();
    
    if (!userRequestCount.has(userId)) {
      userRequestCount.set(userId, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    const userData = userRequestCount.get(userId);
    
    if (now > userData.resetTime) {
      userData.count = 1;
      userData.resetTime = now + windowMs;
      return next();
    }
    
    if (userData.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.'
      });
    }
    
    userData.count++;
    next();
  };
};

// ============== ADMIN CHECK HELPER ==============
// Quick helper to check if user is admin
exports.isAdmin = (req) => {
  return req.user && req.user.role === 'admin';
};

// ============== OWNER CHECK HELPER ==============
// Quick helper to check if user is owner or both
exports.isOwner = (req) => {
  return req.user && (req.user.role === 'owner' || req.user.role === 'both');
};

// ============== RENTER CHECK HELPER ==============
// Quick helper to check if user is renter or both
exports.isRenter = (req) => {
  return req.user && (req.user.role === 'renter' || req.user.role === 'both');
};

// ✅ ADDED: Simple token validation utility
exports.validateTokenFormat = (token) => {
  if (!token || typeof token !== 'string') return false;
  
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  
  try {
    // Check if parts are valid base64
    parts.forEach(part => {
      Buffer.from(part, 'base64').toString('utf8');
    });
    return true;
  } catch (e) {
    return false;
  }
};