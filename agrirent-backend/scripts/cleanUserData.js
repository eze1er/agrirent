require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function cleanUserData() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  console.log('\n🧹 Cleaning user data...\n');
  
  // 1. Find all duplicate emails
  const duplicates = await User.aggregate([
    {
      $group: {
        _id: '$email',
        count: { $sum: 1 },
        ids: { $push: '$_id' }
      }
    },
    {
      $match: {
        count: { $gt: 1 }
      }
    }
  ]);
  
  console.log(`📊 Found ${duplicates.length} duplicate email(s)\n`);
  
  // 2. For each duplicate, keep the newest and delete the rest
  for (const dup of duplicates) {
    const users = await User.find({ email: dup._id }).sort({ createdAt: -1 });
    const toKeep = users[0];
    const toDelete = users.slice(1);
    
    console.log(`Email: ${dup._id}`);
    console.log(`  Keeping: ${toKeep._id} (${toKeep.createdAt})`);
    console.log(`  Deleting: ${toDelete.length} older copies`);
    
    for (const user of toDelete) {
      await User.deleteOne({ _id: user._id });
    }
    console.log('');
  }
  
  // 3. Set all non-admin users without verification token to unverified
  const usersWithoutToken = await User.updateMany(
    {
      role: { $ne: 'admin' },
      emailVerificationToken: { $exists: false },
      isEmailVerified: true
    },
    {
      $set: { isEmailVerified: false }
    }
  );
  
  console.log(`✅ Set ${usersWithoutToken.modifiedCount} users to unverified (no token)\n`);
  
  // 4. Show final summary
  const allUsers = await User.find({}).select('email role isEmailVerified createdAt');
  console.log('📋 Final User List:\n');
  allUsers.forEach(user => {
    console.log(`   ${user.email} - ${user.role} - Verified: ${user.isEmailVerified ? '✅' : '❌'}`);
  });
  
  console.log('\n✅ Database cleaned!\n');
  process.exit(0);
}

cleanUserData();