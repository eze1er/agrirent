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
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    // Google OAuth fields
    googleId: { type: String, sparse: true, unique: true },
    avatar: { type: String },
    isEmailVerified: { type: Boolean, default: false },

    phoneNumber: { type: String },
    role: {
      type: String,
      enum: ["owner", "renter", "both"],
      default: "renter",
    },
    profileImage: String,
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String,
    },
    rating: {
      average: { type: Number, default: 0 },
      count: { type: Number, default: 0 },
    },
    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
    },
    phone: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          // E.164 format: +[country code][number]
          return !v || /^\+[1-9]\d{1,14}$/.test(v);
        },
        message:
          "Phone number must be in international format (e.g., +12345678901)",
      },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  // Skip hashing if password not modified or if user signs up with Google
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
