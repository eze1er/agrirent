require('dotenv').config();
const mongoose = require('mongoose');

// Import models in correct order
const User = require('../models/User');
const Machine = require('../models/Machine');
const Rental = require('../models/Rental');

const listRentals = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📦 Connected to MongoDB\n');

    const rentals = await Rental.find()
      .populate('renterId', 'firstName lastName email')
      .populate('ownerId', 'firstName lastName email')
      .populate('machineId', 'name')
      .sort({ createdAt: -1 })
      .limit(10);

    if (rentals.length === 0) {
      console.log('❌ No rentals found in database');
      console.log('\nCreate a test rental first:');
      console.log('1. Login to your app');
      console.log('2. Book a machine');
      console.log('3. Run this script again');
      process.exit(0);
    }

    console.log('📋 RECENT RENTALS:');
    console.log('==================\n');

    rentals.forEach((rental, index) => {
      console.log(`${index + 1}. Rental ID: ${rental._id}`);
      console.log(`   Machine: ${rental.machineId?.name || 'N/A'}`);
      console.log(`   Renter: ${rental.renterId?.email || 'N/A'}`);
      console.log(`   Owner: ${rental.ownerId?.email || 'N/A'}`);
      console.log(`   Status: ${rental.status}`);
      console.log(`   Payment: ${rental.payment?.status || 'No payment'}`);
      console.log(`   Amount: $${rental.pricing?.totalPrice || 0}`);
      console.log(`   Created: ${rental.createdAt?.toLocaleDateString()}`);
      console.log('');
    });

    console.log('📝 To test escrow flow, copy a Rental ID and run:');
    console.log(`node scripts/testEscrowFlow.js RENTAL_ID`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

listRentals();
