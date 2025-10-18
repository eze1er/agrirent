const User = require('../models/User');

const requireVerification = async (req, res, next) => {
  try {
    // ✅ CHECK BYPASS MODE FIRST
    const bypassMode = process.env.BYPASS_PHONE_VERIFICATION === 'true';
    
    if (bypassMode) {
      console.log('🔓 Bypass mode enabled - skipping verification check');
      return next();
    }

    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // ✅ Check phone verification (not email)
    if (!user.isPhoneVerified) {
      return res.status(403).json({
        success: false,
        message: 'Phone verification required',
        requiresVerification: true
      });
    }

    next();
  } catch (error) {
    console.error('Verification middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = requireVerification;