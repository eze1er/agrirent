require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Machine = require('../models/Machine');
const Payment = require('../models/Payment');
const Rental = require('../models/Rental');

const checkStatus = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📦 Connected to MongoDB\n');

    const rentalId = process.argv[2] || '68e5e7fee0e75f0b92f2947c';

    const rental = await Rental.findById(rentalId)
      .populate('renterId', 'firstName lastName email')
      .populate('ownerId', 'firstName lastName email')
      .populate('machineId', 'name');

    const payment = await Payment.findOne({ rentalId });

    console.log('📊 RENTAL STATUS:');
    console.log('=================');
    if (rental) {
      console.log('✅ Rental found');
      console.log('ID:', rental._id);
      console.log('Machine:', rental.machineId?.name || 'N/A');
      console.log('Renter:', rental.renterId?.email || 'N/A');
      console.log('Owner:', rental.ownerId?.email || 'N/A');
      console.log('Status:', rental.status);
      console.log('Amount:', `$${rental.pricing?.totalPrice || 0}`);
      console.log('\nPayment Info in Rental:');
      console.log('  Status:', rental.payment?.status || 'No payment');
      console.log('  Method:', rental.payment?.method || 'N/A');
      console.log('  Transaction ID:', rental.payment?.transactionId || 'N/A');
      console.log('  Amount:', rental.payment?.amount || 'N/A');
    } else {
      console.log('❌ Rental not found');
    }

    console.log('\n💳 PAYMENT RECORD:');
    console.log('==================');
    if (payment) {
      console.log('✅ Payment record found');
      console.log('Payment ID:', payment._id);
      console.log('Transaction ID:', payment.transactionId || 'N/A');
      console.log('Escrow Status:', payment.escrowStatus);
      console.log('Payment Status:', payment.status);
      console.log('Amount:', `$${payment.amount}`);
      console.log('Method:', payment.method);
      console.log('Created:', payment.createdAt);
    } else {
      console.log('❌ No payment record found');
      console.log('\n📝 This rental has not been paid for yet.');
    }

    console.log('\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

checkStatus();
