require('dotenv').config();
const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const Rental = require('../models/Rental');

async function confirmCompletion() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const rentalId = process.argv[2];
  
  if (!rentalId) {
    console.log('❌ Usage: node scripts/confirmCompletion.js <rentalId>');
    console.log('\nRentals waiting for confirmation:');
    
    const waiting = await Rental.find({ 
      status: 'completed',
      renterConfirmedCompletion: false 
    }).select('_id machineId');
    
    waiting.forEach(r => console.log(`   ${r._id}`));
    process.exit(1);
  }
  
  const rental = await Rental.findById(rentalId);
  const payment = await Payment.findOne({ rentalId });
  
  if (!rental || !payment) {
    console.log('❌ Rental or payment not found');
    process.exit(1);
  }
  
  console.log('\n✅ Confirming completion...');
  
  // Update payment
  payment.confirmations.renterConfirmed = true;
  payment.confirmations.renterConfirmedAt = new Date();
  payment.confirmations.renterConfirmationNote = 'Confirmed via script';
  await payment.save();
  
  // Update rental
  rental.renterConfirmedCompletion = true;
  rental.renterConfirmedAt = new Date();
  await rental.save();
  
  console.log('✅ Rental confirmed!');
  console.log(`   Rental ID: ${rental._id}`);
  console.log(`   Payment Status: ${payment.escrowStatus}`);
  console.log('   ⏳ Now waiting for admin to release payment');
  
  process.exit(0);
}

confirmCompletion();