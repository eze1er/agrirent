const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  // Basic Info
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId;
    },
    minlength: [6, 'Password must be at least 6 characters'],
    select: false,
  },
  
  // Phone (REQUIRED for verification)
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    validate: {
      validator: function (v) {
        return !v || /^\+[1-9]\d{1,14}$/.test(v);
      },
      message: "Phone number must be in international format (e.g., +16472377070)",
    },
  },
  
  // Role
  role: {
    type: String,
    enum: ['renter', 'owner', 'both', 'admin'],
    default: 'renter',
  },
  
  // ✅ ONLY Phone Verification (no email verification)
  isPhoneVerified: {
    type: Boolean,
    default: false,
  },
  phoneVerificationCode: {
    type: String,
  },
  phoneVerificationExpires: {
    type: Date,
  },
  phoneVerificationAttempts: {
    type: Number,
    default: 0,
  },
  
  // Password Reset (still use email for password reset)
  passwordResetToken: String,
  passwordResetExpires: Date,
  
  // Google OAuth
  googleId: { 
    type: String, 
    sparse: true, 
    unique: true 
  },
  avatar: { 
    type: String 
  },
  
  // Profile
  profileImage: String,
  
  // Address
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
  },
  
  // Rating system
  rating: {
    average: { type: Number, default: 0 },
    count: { type: Number, default: 0 },
  },
  
  // Verification status (for document verification, NOT phone)
  verificationStatus: {
    type: String,
    enum: ["pending", "verified", "rejected"],
    default: "pending",
  },
  
  // Active status
  isActive: { 
    type: Boolean, 
    default: true 
  },
}, 
{ timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  
  try {
    this.password = await bcrypt.hash(this.password, 12);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);