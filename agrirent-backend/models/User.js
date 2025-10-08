const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, minlength: 6, select: false },
    
    // Email verification
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    
    // Password reset
    passwordResetToken: String,
    passwordResetExpires: Date,
    
    // Google OAuth fields
    googleId: { type: String, sparse: true, unique: true },
    avatar: { type: String },
    
    // Phone number for SMS notifications (E.164 format: +16472377070)
    phone: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          // E.164 format validation: +[country code][number]
          return !v || /^\+[1-9]\d{1,14}$/.test(v);
        },
        message: "Phone number must be in international format (e.g., +16472377070)",
      },
    },
    
    // User role
    role: {
      type: String,
      enum: ["owner", "renter", "both"],
      default: "renter",
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
    
    // Verification status
    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
    },
    
    // Active status
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  // Skip hashing if password not modified or if user signs up with Google
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);