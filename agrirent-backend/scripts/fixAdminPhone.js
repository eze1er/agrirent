require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const fixAdminPhone = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find admin user
    const admin = await User.findOne({ email: 'admin@agrirent.com' });
    
    if (!admin) {
      console.log('❌ Admin not found');
      process.exit(1);
    }

    console.log('📋 Current admin phone:', admin.phone);

    // Update to a REAL phone number (your verified number)
    admin.phone = '+16472377070'; // ✅ Use YOUR verified phone number here
    admin.isPhoneVerified = true; // Skip verification for admin
    admin.phoneVerificationCode = undefined;
    admin.phoneVerificationExpires = undefined;
    await admin.save();

    console.log('✅ Admin phone updated to:', admin.phone);
    console.log('✅ Admin verification bypassed');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

fixAdminPhone();