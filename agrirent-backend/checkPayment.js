const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Payment = mongoose.model('Payment', new mongoose.Schema({}, {strict: false}));
  const payment = await Payment.findOne({ rentalId: new mongoose.Types.ObjectId('69001aa262824fb1e41dd400') });
  console.log('Payment exists:', !!payment);
  console.log('Payment:', payment);
  process.exit(0);
});
