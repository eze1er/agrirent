require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const createAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📦 Connected to MongoDB');

    const email = 'admin@agrirent.com';
    const password = 'Admin123!';

    // Delete existing admin
    const deleted = await User.deleteOne({ email });
    if (deleted.deletedCount > 0) {
      console.log('🗑️  Deleted old admin');
    }

    // Create new admin (password will be auto-hashed by User model)
    const admin = await User.create({
      firstName: 'Admin',
      lastName: 'AgriRent',
      email: email,
      password: password, // ✅ Plain password - model will hash it
      phone: '+1234567890',
      role: 'admin',
      isEmailVerified: true,
      isActive: true
    });

    console.log('✅ Admin created successfully!');
    console.log('📧 Email:', admin.email);
    console.log('🔑 Password:', password);
    console.log('👤 Role:', admin.role);
    console.log('\n🔐 You can now login with these credentials');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

createAdmin();
