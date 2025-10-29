require('dotenv').config();
const mongoose = require('mongoose');
const Rental = require('./models/Rental');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const rentals = await Rental.find({
    'payment.status': 'held_in_escrow'
  });
  
  console.log(`\n📊 RENTALS IN ESCROW: ${rentals.length}\n`);
  
  rentals.forEach((r, i) => {
    console.log(`${i + 1}. ${r._id}`);
    console.log(`   Renter Confirmed: ${r.renterConfirmedCompletion ? '✅ YES' : '❌ NO'}`);
    console.log(`   Owner Confirmed: ${r.ownerConfirmedCompletion ? '✅ YES' : '❌ NO'}`);
    console.log(`   BOTH: ${r.renterConfirmedCompletion && r.ownerConfirmedCompletion ? '✅ READY' : '⏳ WAITING'}\n`);
  });
  
  process.exit(0);
}

check();
