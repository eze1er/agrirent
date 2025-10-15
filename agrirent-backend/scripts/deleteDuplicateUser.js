require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function deleteDuplicates() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const email = 'papaezechiel@gmail.com';
  
  // Find all users with this email
  const users = await User.find({ email: email.toLowerCase() });
  
  console.log(`\n📊 Found ${users.length} user(s) with email: ${email}\n`);
  
  users.forEach((user, index) => {
    console.log(`User ${index + 1}:`);
    console.log(`   ID: ${user._id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Verified: ${user.isEmailVerified}`);
    console.log(`   Created: ${user.createdAt}`);
    console.log(`   Has Token: ${!!user.emailVerificationToken}`);
    console.log('');
  });
  
  if (users.length > 1) {
    console.log('⚠️  DUPLICATE USERS FOUND!\n');
    
    // Delete all but keep the most recent unverified one
    const sortedUsers = users.sort((a, b) => b.createdAt - a.createdAt);
    const toKeep = sortedUsers[0]; // Keep newest
    const toDelete = sortedUsers.slice(1);
    
    console.log(`✅ Keeping: ${toKeep._id} (Created: ${toKeep.createdAt})`);
    console.log(`❌ Deleting: ${toDelete.length} older user(s)\n`);
    
    for (const user of toDelete) {
      await User.deleteOne({ _id: user._id });
      console.log(`   Deleted: ${user._id}`);
    }
    
    console.log('\n✅ Duplicates removed!\n');
  } else {
    console.log('✅ No duplicates found\n');
  }
  
  process.exit(0);
}

deleteDuplicates();