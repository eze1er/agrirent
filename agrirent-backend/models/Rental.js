const mongoose = require('mongoose');

const rentalSchema = new mongoose.Schema({
  machineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Machine', required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  renterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'active', 'completed', 'cancelled'], default: 'pending' },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  duration: { days: Number },
  pricing: {
    basePrice: Number,
    totalPrice: Number
  }
}, { timestamps: true });

module.exports = mongoose.model('Rental', rentalSchema);