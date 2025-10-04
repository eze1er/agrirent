const mongoose = require('mongoose');

const machineSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  category: { type: String, enum: ['tractor', 'harvester', 'planter', 'sprayer', 'cultivator', 'other'], required: true },
  brand: String,
  year: Number,
  description: String,
  specifications: { horsepower: Number },
  images: [String],
  pricePerDay: { type: Number, required: true },
  pricePerHour: Number,
  availability: { type: String, enum: ['available', 'rented', 'maintenance'], default: 'available' },
  location: {
    type: { type: String, default: 'Point' },
    coordinates: { type: [Number], required: true }
  },
  address: { city: String, state: String },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Machine', machineSchema);