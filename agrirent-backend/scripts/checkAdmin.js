require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const checkAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📦 Connected to MongoDB');

    const admin = await User.findOne({ email: 'admin@agrirent.com' }).select('+password');
    
    if (!admin) {
      console.log('❌ Admin not found!');
    } else {
      console.log('✅ Admin found!');
      console.log('📧 Email:', admin.email);
      console.log('👤 Name:', admin.firstName, admin.lastName);
      console.log('🎭 Role:', admin.role);
      console.log('✉️  Email Verified:', admin.isEmailVerified);
      console.log('🔓 Active:', admin.isActive);
      console.log('🔑 Password Hash:', admin.password ? 'EXISTS' : 'MISSING');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

checkAdmin();
