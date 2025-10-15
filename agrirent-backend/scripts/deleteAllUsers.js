require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function deleteAllUsers() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const count = await User.countDocuments();
  
  console.log(`\n⚠️  WARNING: This will delete ALL ${count} users!\n`);
  
  rl.question('Type "DELETE ALL USERS" to confirm: ', async (answer) => {
    if (answer === 'DELETE ALL USERS') {
      const result = await User.deleteMany({});
      console.log(`\n✅ Deleted ${result.deletedCount} users\n`);
    } else {
      console.log('\n❌ Cancelled\n');
    }
    rl.close();
    process.exit(0);
  });
}

deleteAllUsers();