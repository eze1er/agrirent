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
  
 // models/Rental.js

rejectionReason: {
  type: String,
  // Remove the required function, make it conditional in the route instead
  validate: {
    validator: function(value) {
      // Only validate if status is rejected
      if (this.status === 'rejected') {
        return value && value.length >= 10;
      }
      return true;
    },
    message: 'Rejection reason must be at least 10 characters'
  }
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