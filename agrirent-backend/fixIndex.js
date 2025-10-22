require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  await mongoose.connection.db.collection('rentals').dropIndex('transactionId_1');
  process.exit(0);
});
