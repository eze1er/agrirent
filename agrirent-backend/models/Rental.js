const mongoose = require('mongoose');

const rentalSchema = new mongoose.Schema({
  machineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Machine', required: true },
  renterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  rentalType: {
    type: String,
    enum: ['daily', 'per_hectare'],
    required: true
  },
  
  // For daily rentals
  startDate: {
    type: Date,
    required: function() { return this.rentalType === 'daily'; }
  },
  endDate: {
    type: Date,
    required: function() { return this.rentalType === 'daily'; }
  },
  
  // For per-hectare rentals
  hectares: {
    type: Number,
    required: function() { return this.rentalType === 'per_hectare'; }
  },
  workDate: {
    type: Date,
    required: function() { return this.rentalType === 'per_hectare'; }
  },
  fieldLocation: {
    type: String,
    required: function() { return this.rentalType === 'per_hectare'; }
  },
  
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'active', 'completed', 'cancelled'],
    default: 'pending'
  },
  
  pricing: {
    pricePerDay: Number,
    pricePerHectare: Number,
    numberOfDays: Number,
    numberOfHectares: Number,
    subtotal: { type: Number, required: true },
    serviceFee: { type: Number, required: true },
    totalPrice: { type: Number, required: true }
  }
}, { timestamps: true });

module.exports = mongoose.model('Rental', rentalSchema);