const mongoose = require('mongoose');

const machineSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { 
    type: String, 
    required: true,
    enum: ['tractor', 'harvester', 'planter', 'sprayer', 'cultivator']
  },
  brand: { type: String, required: true },
  model: String,
  year: { type: Number, required: true },
  
  // Pricing options
  pricingType: {
    type: String,
    enum: ['daily', 'per_hectare', 'both'],
    default: 'daily'
  },
  pricePerDay: {
    type: Number,
    required: function() { 
      return this.pricingType === 'daily' || this.pricingType === 'both'; 
    }
  },
  pricePerHectare: {
    type: Number,
    required: function() { 
      return this.pricingType === 'per_hectare' || this.pricingType === 'both'; 
    }
  },
  minimumHectares: {
    type: Number,
    default: 1
  },
  
  description: String,
  
  specifications: {
    horsepower: Number,
    weight: Number,
    fuelType: String,
    capacity: String
  },
  
  images: [String],
  
  ownerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  location: {
    type: { type: String, default: 'Point' },
    coordinates: [Number]
  },
  
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: { type: String, default: 'Canada' }
  },
  
  availability: {
    type: String,
    enum: ['available', 'rented', 'maintenance'],
    default: 'available'
  },
  
  isActive: { type: Boolean, default: true },
  
  rating: {
    average: { type: Number, default: 0 },
    count: { type: Number, default: 0 }
  }
}, { timestamps: true });

// Index for geospatial queries
machineSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Machine', machineSchema);