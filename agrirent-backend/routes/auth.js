const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const axios = require("axios");
const passport = require('passport');
require('../middleware/config/passport');

const User = require("../models/User");
const {
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require("../services/emailService");
const {
  sendVerificationSMS,
  generateVerificationCode,
} = require("../services/smsService");

const smsSendLocks = new Map();

// Validation helpers
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  return password && password.length >= 6;
};

const validatePhoneNumber = (phone) => {
  if (!phone) return true;
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  return phoneRegex.test(phone);
};

// ============================================
// DEBUG ROUTES (Remove in production!)
// ============================================

router.get("/debug/users", async (req, res) => {
  try {
    const users = await User.find({}).select("email firstName lastName role isEmailVerified");
    res.json({ success: true, count: users.length, users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/debug/reset-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email and new password are required",
      });
    }
    if (!validatePassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    user.password = newPassword;
    await user.save();
    res.json({
      success: true,
      message: "Password reset successfully",
      user: { email: user.email, firstName: user.firstName, lastName: user.lastName },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/debug/verify-me", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { isEmailVerified: true },
      { new: true }
    ).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({
      success: true,
      message: "Email verified successfully!",
      user: { email: user.email, firstName: user.firstName, isEmailVerified: user.isEmailVerified },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete("/debug/delete-user", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }
    const user = await User.findOneAndDelete({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({
      success: true,
      message: "User deleted successfully",
      deletedUser: { email: user.email, firstName: user.firstName },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/debug/check-phone", async (req, res) => {
  try {
    const { email } = req.query;
    const user = await User.findOne({ email: email.toLowerCase() }).select("firstName lastName email phone");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({
      success: true,
      user: {
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: user.phone || "NO PHONE NUMBER",
        hasPhone: !!user.phone,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/debug/update-phone", async (req, res) => {
  try {
    const { email, phone } = req.body;
    if (!email || !phone) {
      return res.status(400).json({ success: false, message: "Email and phone are required" });
    }
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { phone },
      { new: true }
    ).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({
      success: true,
      message: "Phone number updated successfully",
      user: { email: user.email, phone: user.phone },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// REGISTRATION
// ============================================

router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone, role } = req.body;

    console.log('📝 Registration attempt:', { firstName, lastName, email, hasPassword: !!password, phone, role });

    // Validation
    if (!firstName || !lastName || !email || !password || !phone) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, email, password, and phone number are required",
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ success: false, message: "Invalid email format" });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    if (!validatePhoneNumber(phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number format. Please use international format with country code (e.g., +12125551234)",
      });
    }

    const validRoles = ["renter", "owner", "both"];
    const userRole = role || "renter";
    if (!validRoles.includes(userRole)) {
      return res.status(400).json({ success: false, message: "Invalid role. Must be renter, owner, or both" });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User already exists with this email" });
    }

    // Generate SMS verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Create user - password will be hashed by User model pre-save hook
    const user = await User.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      password, // Plain password - model will hash it
      phone: phone.trim(),
      role: userRole,
      isPhoneVerified: false,
      phoneVerificationCode: verificationCode,
      phoneVerificationExpires: Date.now() + 10 * 60 * 1000,
      phoneVerificationAttempts: 1,
      mobileMoneyInfo: req.body.mobileMoneyInfo,
    });

    console.log('✅ User created:', user.email, 'Phone:', user.phone);

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
        phone: user.phone,
        role: user.role,
        isPhoneVerified: user.isPhoneVerified,
      },
      message: "Registration successful! Please verify your phone number.",
    });

  } catch (error) {
    console.error('❌ Registration error:', error);

    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "User already exists with this email" });
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }

    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// ============================================
// LOGIN
// ============================================

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 Login attempt for:', email);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user and select password field
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      console.log('❌ User not found:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Compare password
    const isPasswordCorrect = await user.comparePassword(password);

    if (!isPasswordCorrect) {
      console.log('❌ Password mismatch for:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check bypass mode
    const bypassVerification = process.env.BYPASS_PHONE_VERIFICATION === 'true';

    // Skip phone verification for admin OR if bypass mode is on
    if (user.role === 'admin' || bypassVerification) {
      console.log('✅ Login successful (verification bypassed):', email);

      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({
        success: true,
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isPhoneVerified: true,
        },
        requiresVerification: false,
      });
    }

    // Check if phone is verified (only when NOT bypassing)
    if (!user.isPhoneVerified) {
      console.log('⚠️  Phone not verified for:', email);
      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({
        success: true,
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isPhoneVerified: user.isPhoneVerified,
        },
        requiresVerification: true,
        message: 'Please verify your phone number to continue',
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
        phone: user.phone,
        role: user.role,
        isPhoneVerified: user.isPhoneVerified,
      },
      requiresVerification: false,
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// ============================================
// EMAIL VERIFICATION
// ============================================

router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
    console.log("📧 Resend verification request for:", email);

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      console.log("❌ User not found:", email);
      return res.status(404).json({ success: false, message: "No account found with this email" });
    }

    if (user.isEmailVerified) {
      console.log("✅ Email already verified for:", user.email);
      return res.json({ success: true, alreadyVerified: true, message: "Your email is already verified!" });
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");
    user.emailVerificationToken = verificationToken;
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();

    console.log("🔑 Verification token generated for:", user.email);

    try {
      await sendVerificationEmail(user, verificationToken);
      console.log("✅ Verification email sent to:", user.email);
    } catch (emailError) {
      console.error("❌ Failed to send verification email:", emailError);
      return res.status(500).json({ success: false, message: "Failed to send verification email. Please try again." });
    }

    res.json({ success: true, alreadyVerified: false, message: "Verification email sent! Please check your inbox." });
  } catch (error) {
    console.error("❌ Resend verification error:", error);
    res.status(500).json({ success: false, message: "Failed to resend verification email" });
  }
});

router.get("/verify-email/:token", async (req, res) => {
  try {
    const { token } = req.params;
    console.log("🔍 Email verification attempt with token:", token.substring(0, 10) + "...");

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      console.log("❌ Invalid or expired verification token");
      return res.redirect(`${process.env.FRONTEND_URL}/verify-email?verified=false&error=invalid_token`);
    }

    console.log("✅ Valid token found for user:", user.email);

    if (!user.isEmailVerified) {
      user.isEmailVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpires = undefined;
      await user.save();
      console.log("✅ User email marked as verified:", user.email);
    }

    const loginToken = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.redirect(
      `${process.env.FRONTEND_URL}/verify-email?verified=true&email=${encodeURIComponent(user.email)}&token=${loginToken}&userId=${user._id}`
    );
  } catch (error) {
    console.error("❌ Email verification error:", error);
    res.redirect(`${process.env.FRONTEND_URL}/verify-email?verified=false&error=server_error`);
  }
});

// ============================================
// PASSWORD RESET
// ============================================

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !validateEmail(email)) {
      return res.status(400).json({ success: false, message: "Valid email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.json({ success: true, message: "If an account exists, a reset link has been sent" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = Date.now() + 60 * 60 * 1000;
    await user.save();

    try {
      await sendPasswordResetEmail(user, resetToken);
    } catch (emailError) {
      console.error("Failed to send password reset email:", emailError);
    }

    res.json({ success: true, message: "If an account exists, a reset link has been sent" });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ success: false, message: "Failed to process request" });
  }
});

router.post("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!validatePassword(password)) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid or expired reset token" });
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ success: false, message: "Failed to reset password" });
  }
});

// ============================================
// SMS VERIFICATION
// ============================================

router.post("/send-sms-verification", async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`📱 [${requestId}] SMS REQUEST STARTED - Email:`, req.body.email, 'Phone:', req.body.phone);

  try {
    const { email, phone } = req.body;

    if (!phone) {
      console.log(`❌ [${requestId}] No phone provided`);
      return res.status(400).json({ success: false, message: "Phone number is required" });
    }

    const lockKey = phone;
    if (smsSendLocks.has(lockKey)) {
      console.log(`⛔ [${requestId}] BLOCKED - Lock exists!`);
      return res.json({ success: true, message: "Verification code is being sent. Please wait...", expiresIn: "10 minutes" });
    }

    smsSendLocks.set(lockKey, true);
    setTimeout(() => smsSendLocks.delete(lockKey), 5000);

    console.log(`🔍 [${requestId}] Finding user...`);
    const user = await User.findOne({
      $or: [{ email: email?.toLowerCase() }, { phone }],
    });

    if (!user) {
      console.log(`❌ [${requestId}] User not found`);
      smsSendLocks.delete(lockKey);
      return res.status(404).json({ success: false, message: "User not found" });
    }

    console.log(`✅ [${requestId}] User found:`, user.email, 'Verified?', user.isPhoneVerified);

    if (user.isPhoneVerified) {
      console.log(`✅ [${requestId}] Already verified - skipping`);
      smsSendLocks.delete(lockKey);
      return res.json({ success: true, alreadyVerified: true, message: "Phone number is already verified" });
    }

    const hasValidCode = user.phoneVerificationCode && user.phoneVerificationExpires && user.phoneVerificationExpires > Date.now();

    let code;
    if (hasValidCode) {
      console.log(`♻️ [${requestId}] REUSING existing code`);
      code = user.phoneVerificationCode;
    } else {
      console.log(`🆕 [${requestId}] GENERATING new code`);

      if (user.phoneVerificationAttempts >= 5) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if ((user.phoneVerificationExpires || new Date(0)) > oneHourAgo) {
          console.log(`⛔ [${requestId}] Rate limit exceeded`);
          smsSendLocks.delete(lockKey);
          return res.status(429).json({ success: false, message: "Too many verification attempts. Please try again later." });
        }
        user.phoneVerificationAttempts = 0;
      }

      code = generateVerificationCode();
      user.phoneVerificationCode = code;
      user.phoneVerificationExpires = Date.now() + 10 * 60 * 1000;
      user.phoneVerificationAttempts += 1;
      await user.save();
    }

    console.log(`📤 [${requestId}] Attempting to send SMS to:`, user.phone);

    try {
      await sendVerificationSMS(user.phone, code, user.firstName);
      console.log(`✅ [${requestId}] SMS SENT SUCCESSFULLY!`);
      res.json({ success: true, message: "Verification code sent to your phone", expiresIn: "10 minutes" });
    } catch (smsError) {
      console.error(`❌ [${requestId}] SMS send failed:`, smsError.message);
      smsSendLocks.delete(lockKey);
      return res.status(500).json({ success: false, message: "Failed to send SMS. Please check your phone number." });
    }
  } catch (error) {
    console.error(`❌ [${requestId}] ERROR:`, error);
    if (req.body.phone) smsSendLocks.delete(req.body.phone);
    res.status(500).json({ success: false, message: "Failed to send verification code" });
  }
});

router.post("/verify-sms-code", async (req, res) => {
  try {
    const { email, phone, code } = req.body;
    console.log("🔍 SMS code verification attempt:", { email, phone, code });

    if (!code) {
      return res.status(400).json({ success: false, message: "Verification code is required" });
    }

    const user = await User.findOne({
      $or: [{ email: email?.toLowerCase() }, { phone }],
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.isPhoneVerified) {
      return res.json({ success: true, alreadyVerified: true, message: "Phone number is already verified" });
    }

    if (!user.phoneVerificationCode) {
      return res.status(400).json({ success: false, message: "No verification code found. Please request a new one." });
    }

    if (user.phoneVerificationExpires < Date.now()) {
      return res.status(400).json({ success: false, message: "Verification code expired. Please request a new one." });
    }

    if (user.phoneVerificationCode !== code.trim()) {
      console.log("❌ Invalid code. Expected:", user.phoneVerificationCode, "Got:", code);
      return res.status(400).json({ success: false, message: "Invalid verification code" });
    }

    user.isPhoneVerified = true;
    user.phoneVerificationCode = undefined;
    user.phoneVerificationExpires = undefined;
    user.phoneVerificationAttempts = 0;
    await user.save();

    console.log("✅ Phone verified for:", user.email);

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      message: "Phone number verified successfully!",
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isPhoneVerified: user.isPhoneVerified,
      },
    });
  } catch (error) {
    console.error("❌ Verify SMS code error:", error);
    res.status(500).json({ success: false, message: "Failed to verify code" });
  }
});

// ============================================
// GOOGLE OAUTH
// ============================================

router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);

router.get('/google/callback', async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({ success: false, message: 'No auth code provided' });
    }

    // Note: You need oauth2Client configured - this depends on your passport config
    // For now, assuming it's available from passport middleware
    const response = await axios.get(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${code}` } }
    ).catch(() => {
      throw new Error('Failed to get Google user info');
    });

    const { email, name, picture } = response.data;
    console.log('📥 Google callback received for email:', email);

    let user = await User.findOne({ email });

    if (!user) {
      console.log('❌ User not registered:', email);
      return res.redirect(
        `http://localhost:5173?error=user_not_found&email=${encodeURIComponent(email)}`
      );
    }

    if (!user.googleId) {
      user.googleId = response.data.id;
      user.avatar = picture || user.avatar;
      await user.save();
      console.log('✅ Linked Google account to existing user:', email);
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('✅ JWT token generated for:', email);

    const userData = encodeURIComponent(
      JSON.stringify({
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
      })
    );

    res.redirect(
      `http://localhost:5173?token=${token}&user=${userData}`
    );

  } catch (error) {
    console.error('❌ Google callback error:', error.message);
    res.redirect('http://localhost:5173?error=auth_failed');
  }
});

module.exports = router;