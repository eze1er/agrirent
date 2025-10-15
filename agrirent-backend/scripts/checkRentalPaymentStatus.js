require('dotenv').config();
const mongoose = require('mongoose');
const Rental = require('../models/Rental');
const Payment = require('../models/Payment');
const User = require('../models/User');  // ← Add this
const Machine = require('../models/Machine');  // ← Add this

async function checkStatus() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  console.log('\n📊 RENTAL & PAYMENT STATUS CHECK\n');
  console.log('='.repeat(60));
  
  // Get all rentals with their payments
  const rentals = await Rental.find()
    .populate('renterId', 'firstName lastName email')
    .populate('ownerId', 'firstName lastName email')
    .populate('machineId', 'name')
    .sort({ createdAt: -1 })
    .limit(10);
  
  for (const rental of rentals) {
    const payment = await Payment.findOne({ rentalId: rental._id });
    
    console.log(`\n🔹 Rental ID: ${rental._id}`);
    console.log(`   Machine: ${rental.machineId?.name || 'N/A'}`);
    console.log(`   Renter: ${rental.renterId?.email || 'N/A'}`);
    console.log(`   Owner: ${rental.ownerId?.email || 'N/A'}`);
    console.log(`   📍 Rental Status: ${rental.status}`);
    
    if (payment) {
      console.log(`   💰 Payment Status: ${payment.status}`);
      console.log(`   🏦 Escrow Status: ${payment.escrowStatus}`);
      console.log(`   ✅ Renter Confirmed: ${payment.confirmations?.renterConfirmed || false}`);
      
      // Check if ready to complete
      if (rental.status === 'active' && payment.escrowStatus === 'held') {
        console.log(`   ✨ STATUS: Ready for owner to mark complete!`);
      } else if (rental.status === 'completed' && !payment.confirmations?.renterConfirmed) {
        console.log(`   ⏳ STATUS: Waiting for renter confirmation`);
      } else if (payment.confirmations?.renterConfirmed && !payment.confirmations?.adminVerified) {
        console.log(`   🔐 STATUS: Waiting for admin release`);
      }
    } else {
      console.log(`   ❌ No payment found`);
    }
    console.log('-'.repeat(60));
  }
  
  // Summary stats
  const stats = await Rental.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  
  console.log('\n📈 RENTAL STATUS SUMMARY:');
  stats.forEach(stat => {
    console.log(`   ${stat._id}: ${stat.count}`);
  });
  
  const paymentStats = await Payment.aggregate([
    {
      $group: {
        _id: '$escrowStatus',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    }
  ]);
  
  console.log('\n💵 PAYMENT STATUS SUMMARY:');
  paymentStats.forEach(stat => {
    console.log(`   ${stat._id}: ${stat.count} rentals ($${stat.totalAmount.toFixed(2)})`);
  });
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  process.exit(0);
}

checkStatus();