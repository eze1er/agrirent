require('dotenv').config();
const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const Rental = require('../models/Rental');
const User = require('../models/User');

async function releasePayment() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const paymentId = process.argv[2];
  
  if (!paymentId) {
    console.log('❌ Usage: node scripts/adminReleasePayment.js <paymentId>');
    console.log('\nPayments waiting for release:');
    
    const pending = await Payment.find({ 
      escrowStatus: 'held',
      'confirmations.renterConfirmed': true,
      'confirmations.adminVerified': { $ne: true }
    })
    .populate('rentalId', 'machineId')
    .populate('ownerId', 'firstName lastName email');
    
    pending.forEach(p => {
      console.log(`\n   Payment ID: ${p._id}`);
      console.log(`   Rental ID: ${p.rentalId._id}`);
      console.log(`   Amount: $${p.amount}`);
      console.log(`   Owner: ${p.ownerId.email}`);
    });
    
    process.exit(1);
  }
  
  // Find admin user
  const admin = await User.findOne({ role: 'admin' });
  if (!admin) {
    console.log('❌ No admin user found. Run: node scripts/createAdmin.js');
    process.exit(1);
  }
  
  const payment = await Payment.findById(paymentId)
    .populate('userId', 'firstName lastName email')
    .populate('ownerId', 'firstName lastName email')
    .populate('rentalId');
  
  if (!payment) {
    console.log('❌ Payment not found');
    process.exit(1);
  }
  
  if (payment.escrowStatus !== 'held') {
    console.log(`❌ Payment is not in escrow (current status: ${payment.escrowStatus})`);
    process.exit(1);
  }
  
  if (!payment.confirmations?.renterConfirmed) {
    console.log('❌ Renter has not confirmed completion yet');
    process.exit(1);
  }
  
  console.log('\n💰 Releasing payment...');
  console.log(`   Payment ID: ${payment._id}`);
  console.log(`   Amount: $${payment.amount}`);
  console.log(`   To: ${payment.ownerId.email}`);
  
  // Release payment
  payment.escrowStatus = 'released';
  payment.status = 'completed';
  payment.confirmations.adminVerified = true;
  payment.confirmations.adminVerifiedAt = new Date();
  payment.confirmations.adminVerifiedBy = admin._id;
  payment.confirmations.adminNote = 'Released via admin script';
  payment.escrowTimeline = payment.escrowTimeline || {};
  payment.escrowTimeline.releasedAt = new Date();
  await payment.save();
  
  // Update rental
  await Rental.findByIdAndUpdate(payment.rentalId, {
    'payment.status': 'completed',
    'paymentInfo.status': 'released'
  });
  
  console.log('✅ Payment released successfully!');
  console.log(`   Owner ${payment.ownerId.email} will receive $${payment.amount}`);
  console.log(`   Released by: ${admin.email}`);
  
  process.exit(0);
}

releasePayment();