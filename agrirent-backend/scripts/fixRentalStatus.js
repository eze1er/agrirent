require('dotenv').config();
const mongoose = require('mongoose');
const Rental = require('../models/Rental');
const Payment = require('../models/Payment');

async function fixRentalStatus() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  // Find all approved rentals with held payments
  const rentals = await Rental.find({ status: 'approved' });
  
  for (const rental of rentals) {
    const payment = await Payment.findOne({ 
      rentalId: rental._id,
      escrowStatus: 'held'
    });
    
    if (payment) {
      console.log(`✅ Fixing rental ${rental._id} - setting to 'active'`);
      rental.status = 'active';
      await rental.save();
    }
  }
  
  console.log('✅ All rentals fixed!');
  process.exit(0);
}

fixRentalStatus();