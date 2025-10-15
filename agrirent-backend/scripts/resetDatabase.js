require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');

// Import all models
const User = require('../models/User');
const Machine = require('../models/Machine');
const Rental = require('../models/Rental');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function resetDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    console.log('\n⚠️  DATABASE RESET WARNING ⚠️\n');
    console.log('This will DELETE ALL DATA from your database:');
    console.log('   - All Users (except admin if you choose to keep)');
    console.log('   - All Machines');
    console.log('   - All Rentals');
    console.log('   - All Payments');
    console.log('   - All Notifications');
    console.log('\n🔴 THIS ACTION CANNOT BE UNDONE! 🔴\n');
    
    rl.question('Type "DELETE ALL DATA" to confirm: ', async (answer) => {
      if (answer !== 'DELETE ALL DATA') {
        console.log('\n❌ Reset cancelled. No data was deleted.');
        rl.close();
        process.exit(0);
      }
      
      rl.question('\nKeep admin user? (y/n): ', async (keepAdmin) => {
        console.log('\n🗑️  Deleting data...\n');
        
        try {
          // Delete collections
          const notificationsDeleted = await Notification.deleteMany({});
          console.log(`✅ Deleted ${notificationsDeleted.deletedCount} notifications`);
          
          const paymentsDeleted = await Payment.deleteMany({});
          console.log(`✅ Deleted ${paymentsDeleted.deletedCount} payments`);
          
          const rentalsDeleted = await Rental.deleteMany({});
          console.log(`✅ Deleted ${rentalsDeleted.deletedCount} rentals`);
          
          const machinesDeleted = await Machine.deleteMany({});
          console.log(`✅ Deleted ${machinesDeleted.deletedCount} machines`);
          
          if (keepAdmin.toLowerCase() === 'y') {
            const usersDeleted = await User.deleteMany({ role: { $ne: 'admin' } });
            console.log(`✅ Deleted ${usersDeleted.deletedCount} users (kept admin)`);
            
            const adminCount = await User.countDocuments({ role: 'admin' });
            console.log(`ℹ️  ${adminCount} admin user(s) preserved`);
          } else {
            const usersDeleted = await User.deleteMany({});
            console.log(`✅ Deleted ${usersDeleted.deletedCount} users (including admin)`);
          }
          
          console.log('\n🎉 Database reset complete!\n');
          
          if (keepAdmin.toLowerCase() !== 'y') {
            console.log('💡 To create a new admin user, run:');
            console.log('   node scripts/createAdmin.js\n');
          }
          
        } catch (error) {
          console.error('\n❌ Error during reset:', error.message);
        } finally {
          rl.close();
          process.exit(0);
        }
      });
    });
    
  } catch (error) {
    console.error('❌ Connection error:', error.message);
    rl.close();
    process.exit(1);
  }
}

resetDatabase();
