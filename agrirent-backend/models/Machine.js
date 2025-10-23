const mongoose = require('mongoose');

const machineSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { 
    type: String, 
    required: true,
    enum: ['tractor', 'harvester', 'planter', 'sprayer', 'cultivator', 'excavator', 'desherbeuse']
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
    coordinates: [Number] // [longitude, latitude]
  },
  
address: {
  province: String,      // e.g., "Kinshasa", "Haut-Katanga"
  city: String,          // e.g., "Lubumbashi", "Goma"
  commune: String,       // e.g., "Limete", "Kampemba"
  quartier: String,      // e.g., "Kingabwa", "Kenya"
  avenue: String,
  number: String,
},
  
availability: {
  type: String,
  enum: ['available', 'pending', 'rented', 'maintenance', 'unavailable'],
  default: 'available'
},
  
  isActive: { type: Boolean, default: true },
  
  // ✅ RATING SYSTEM
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
      set: function(value) {
        // Round to 1 decimal place (e.g., 4.33 → 4.3)
        return Math.round(value * 10) / 10;
      }
    },
    count: {
      type: Number,
      default: 0,
      min: 0
    }
  }
}, { timestamps: true });

// 🌍 Geospatial index for location-based queries (optional but recommended)
machineSchema.index({ location: '2dsphere' });

// ✅ INSTANCE METHODS

// Add a new rating (when a review is submitted)
machineSchema.methods.updateRating = async function(newRating) {
  if (newRating < 1 || newRating > 5) {
    throw new Error('Rating must be between 1 and 5');
  }
  const currentTotal = this.rating.average * this.rating.count;
  this.rating.count += 1;
  this.rating.average = (currentTotal + newRating) / this.rating.count;
  return this.save();
};

// Update an existing rating (when a review is edited)
machineSchema.methods.updateExistingRating = async function(oldRating, newRating) {
  if (oldRating < 1 || oldRating > 5 || newRating < 1 || newRating > 5) {
    throw new Error('Ratings must be between 1 and 5');
  }
  const currentTotal = this.rating.average * this.rating.count;
  this.rating.average = (currentTotal - oldRating + newRating) / this.rating.count;
  return this.save();
};

// Remove a rating (if review is deleted — optional)
machineSchema.methods.removeRating = async function(ratingToRemove) {
  if (this.rating.count <= 1) {
    this.rating.average = 0;
    this.rating.count = 0;
  } else {
    const currentTotal = this.rating.average * this.rating.count;
    this.rating.average = (currentTotal - ratingToRemove) / (this.rating.count - 1);
    this.rating.count -= 1;
  }
  return this.save();
};

// ✅ STATIC METHODS

// Find all active and available machines
machineSchema.statics.findAvailable = function() {
  return this.find({ 
    availability: 'available', 
    isActive: true 
  });
};

// Find machines by category (case-insensitive)
machineSchema.statics.findByCategory = function(category) {
  return this.find({ 
    category: category.toLowerCase(),
    availability: 'available',
    isActive: true 
  });
};

// ✅ VIRTUALS

// Display name helper
machineSchema.virtual('displayName').get(function() {
  return `${this.brand} ${this.model || this.name} (${this.year})`;
});

// Check if machine has any reviews
machineSchema.virtual('hasRatings').get(function() {
  return this.rating.count > 0;
});

// Ensure virtuals are serialized in JSON
machineSchema.set('toJSON', { virtuals: true });
machineSchema.set('toObject', { virtuals: true });

// ✅ MIDDLEWARE

// Pre-save: enforce rating bounds (safety net)
machineSchema.pre('save', function(next) {
  if (this.rating.average < 0) this.rating.average = 0;
  if (this.rating.average > 5) this.rating.average = 5;
  if (this.rating.count < 0) this.rating.count = 0;
  next();
});

module.exports = mongoose.model('Machine', machineSchema);