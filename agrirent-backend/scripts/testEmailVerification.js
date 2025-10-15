require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function testVerification() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const email = process.argv[2];
  
  if (!email) {
    console.log('Usage: node scripts/testEmailVerification.js <email>');
    process.exit(1);
  }
  
  const user = await User.findOne({ email: email.toLowerCase() });
  
  if (!user) {
    console.log('❌ User not found');
    process.exit(1);
  }
  
  console.log('\n📧 Email Verification Status:');
  console.log('   Email:', user.email);
  console.log('   Role:', user.role);
  console.log('   Verified:', user.isEmailVerified ? '✅ YES' : '❌ NO');
  console.log('   Has Token:', !!user.emailVerificationToken);
  console.log('   Token Expires:', user.emailVerificationExpires ? new Date(user.emailVerificationExpires).toLocaleString() : 'N/A');
  
  if (!user.isEmailVerified) {
    console.log('\n⚠️  This user cannot add machines until email is verified');
  } else {
    console.log('\n✅ This user can add machines');
  }
  
  process.exit(0);
}

testVerification();