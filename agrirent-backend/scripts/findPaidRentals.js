require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Machine = require('../models/Machine');
const Payment = require('../models/Payment');
const Rental = require('../models/Rental');

const findPaidRentals = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📦 Connected to MongoDB\n');

    // Find all rentals with payments
    const rentalsWithPayment = await Rental.find({
      'payment.status': { $exists: true, $ne: null }
    })
      .populate('renterId', 'firstName lastName email')
      .populate('ownerId', 'firstName lastName email')
      .populate('machineId', 'name')
      .sort({ createdAt: -1 });

    console.log('💰 RENTALS WITH PAYMENTS:');
    console.log('=========================\n');

    if (rentalsWithPayment.length === 0) {
      console.log('❌ No paid rentals found yet!\n');
      console.log('📝 To test the escrow flow:');
      console.log('1. Login to your app as a renter');
      console.log('2. Book a machine');
      console.log('3. Owner approves the rental');
      console.log('4. Renter pays for the rental');
      console.log('5. Run this script again\n');
    } else {
      rentalsWithPayment.forEach((rental, index) => {
        console.log(`${index + 1}. Rental ID: ${rental._id}`);
        console.log(`   Machine: ${rental.machineId?.name || 'N/A'}`);
        console.log(`   Renter: ${rental.renterId?.email}`);
        console.log(`   Owner: ${rental.ownerId?.email}`);
        console.log(`   Status: ${rental.status}`);
        console.log(`   Payment Status: ${rental.payment?.status}`);
        console.log(`   Amount: $${rental.pricing?.totalPrice}`);
        console.log(`   Test Command: node scripts/testEscrowFlow.js ${rental._id}`);
        console.log('');
      });
    }

    // Also check Payment collection
    const payments = await Payment.find()
      .populate('rentalId')
      .populate('userId', 'email')
      .populate('ownerId', 'email')
      .sort({ createdAt: -1 });

    if (payments.length > 0) {
      console.log('\n💳 PAYMENT RECORDS:');
      console.log('===================\n');
      
      payments.forEach((payment, index) => {
        console.log(`${index + 1}. Payment ID: ${payment._id}`);
        console.log(`   Rental ID: ${payment.rentalId?._id || 'N/A'}`);
        console.log(`   Amount: $${payment.amount}`);
        console.log(`   Escrow Status: ${payment.escrowStatus}`);
        console.log(`   Renter: ${payment.userId?.email}`);
        console.log(`   Owner: ${payment.ownerId?.email}`);
        console.log(`   Test Command: node scripts/testEscrowFlow.js ${payment.rentalId?._id}`);
        console.log('');
      });
    }

    if (rentalsWithPayment.length === 0 && payments.length === 0) {
      console.log('');
      console.log('🚀 QUICK TEST FLOW:');
      console.log('==================');
      console.log('1. Open your app: http://localhost:3000');
      console.log('2. Login as a renter');
      console.log('3. Browse machines and book one');
      console.log('4. Login as owner (or admin makes owner account)');
      console.log('5. Approve the rental request');
      console.log('6. Login back as renter');
      console.log('7. Go to "My Rentals" and click "Pay Now"');
      console.log('8. Complete payment (use test card: 4242 4242 4242 4242)');
      console.log('9. Run this script again to verify escrow!');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

findPaidRentals();
