require('dotenv').config();
const mongoose = require('mongoose');
const Rental = require('./models/Rental');

async function fixConfirmations() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const rentals = await Rental.find({
    status: 'completed',
    'payment.status': 'held_in_escrow',
    $or: [
      { renterConfirmedCompletion: { $ne: true } },
      { ownerConfirmedCompletion: { $ne: true } }
    ]
  });
  
  console.log(`\n🔧 Found ${rentals.length} rentals needing confirmation fix\n`);
  
  for (const rental of rentals) {
    rental.renterConfirmedCompletion = true;
    rental.renterConfirmationNote = 'Auto-confirmed: rental completed before confirmation system was added';
    rental.renterConfirmedAt = new Date();
    
    rental.ownerConfirmedCompletion = true;
    rental.ownerConfirmationNote = 'Auto-confirmed: rental completed before confirmation system was added';
    rental.ownerConfirmedAt = new Date();
    
    await rental.save();
    console.log(`✅ Fixed rental ${rental._id}`);
  }
  
  console.log(`\n✅ All rentals fixed! They should now appear in admin escrow dashboard.\n`);
  process.exit(0);
}

fixConfirmations();
