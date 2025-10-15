require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function fixVerification() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const email = process.argv[2];
  
  if (!email) {
    console.log('Usage: node scripts/fixVerificationStatus.js <email>');
    console.log('\nOr to fix ALL users:');
    console.log('node scripts/fixVerificationStatus.js --all');
    process.exit(1);
  }
  
  if (email === '--all') {
    // Fix all non-admin users who are verified but shouldn't be
    const users = await User.find({ 
      role: { $ne: 'admin' },
      isEmailVerified: true,
      emailVerificationToken: { $exists: true } // Has token = wasn't properly verified
    });
    
    console.log(`\n📊 Found ${users.length} users to fix\n`);
    
    for (const user of users) {
      console.log(`Fixing: ${user.email}`);
      user.isEmailVerified = false;
      await user.save();
    }
    
    console.log('\n✅ All users fixed!\n');
  } else {
    // Fix specific user
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.log('❌ User not found');
      process.exit(1);
    }
    
    console.log('\n📊 Current Status:');
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Verified: ${user.isEmailVerified}`);
    console.log(`   Has Token: ${!!user.emailVerificationToken}`);
    
    if (user.role === 'admin') {
      console.log('\n⚠️  This is an admin user. Admins are auto-verified.');
      process.exit(0);
    }
    
    user.isEmailVerified = false;
    await user.save();
    
    console.log('\n✅ User verification status set to FALSE');
    console.log('   User must now verify their email\n');
  }
  
  process.exit(0);
}

fixVerification();