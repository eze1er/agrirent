// ✅ /agrirent-backend/models/Rental.js - FINAL VERSION WITH ESCROW
const mongoose = require('mongoose');

const rentalSchema = new mongoose.Schema({
  machineId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Machine', 
    required: true 
  },
  renterId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  ownerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
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
    enum: [
      'pending',      // Awaiting owner approval
      'approved',     // Approved, waiting for payment
      'rejected',     // Owner rejected
      'active',       // Payment received, service in progress
      'completed',    // Service completed by owner
      'disputed',     // Under dispute
      'cancelled'     // Cancelled
    ],
    default: 'pending'
  },
  
  rejectionReason: {
    type: String,
    validate: {
      validator: function(value) {
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
  },

  // ============== PAYMENT & ESCROW FIELDS ==============
 // ESCROW STATUS FLOW
  escrowStatus: {
    type: String,
    required: true,
    enum: [
      'pending',           // Payment initiated but not completed
      'held', 
      'approved',             // Payment received and held in AgriRent account
      'released',          // Released to owner after renter confirmation
      'disputed',          // Under dispute resolution
      'refunded',          // Refunded to renter
      'cancelled'          // Cancelled before payment
    ],
    default: 'pending',
  },
  
  status: {
    type: String,
    required: true,
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded', 'approved', 'cancelled'],
    default: 'pending',
  },
  
  transactionId: {
    type: String,
    required: false,
    unique: true,
  },
  
  // ESCROW TIMELINE
  escrowTimeline: {
    paidAt: Date,              // When renter paid
    heldAt: Date,              // When funds moved to escrow
    renterConfirmedAt: Date,   // When renter confirmed job done
    adminVerifiedAt: Date,     // When admin verified (optional)
    releasedAt: Date,          // When released to owner
    disputedAt: Date,          // If disputed
    resolvedAt: Date,          // When dispute resolved
  },

  // ============== COMPLETION CONFIRMATION ==============
  confirmations: {
    renterConfirmed: {
      type: Boolean,
      default: false,
    },
    renterConfirmedAt: Date,
    renterConfirmationNote: String,
    
    adminVerified: {
      type: Boolean,
      default: false,
    },
    adminVerifiedAt: Date,
    adminVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    adminNote: String,
  },

  // ============== REVIEW SYSTEM ==============
  review: {
    rating: {
      type: Number,
      min: 1,
      max: 5,
      validate: {
        validator: function(value) {
          if (this.review?.comment || this.review?.rating) {
            return value >= 1 && value <= 5;
          }
          return true;
        },
        message: 'Rating must be between 1 and 5'
      }
    },
    comment: {
      type: String,
      maxlength: 500
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  isReviewed: {
    type: Boolean,
    default: false
  },

  // ============== TIMESTAMPS ==============
  completedAt: Date,  // When owner marked as completed
  cancelledAt: Date,
  
}, { timestamps: true });

// ============== INDEXES ==============
rentalSchema.index({ renterId: 1, createdAt: -1 });
rentalSchema.index({ ownerId: 1, createdAt: -1 });
rentalSchema.index({ machineId: 1 });
rentalSchema.index({ status: 1 });
rentalSchema.index({ 'payment.status': 1 });

// ============== VIRTUALS ==============
rentalSchema.virtual('isPaymentSecured').get(function() {
  return this.payment?.status === 'held_in_escrow';
});

rentalSchema.virtual('canBeReviewed').get(function() {
  return this.status === 'completed' && 
         this.payment?.status === 'completed' && 
         !this.isReviewed;
});

rentalSchema.virtual('isPendingRenterConfirmation').get(function() {
  return this.status === 'completed' && 
         this.payment?.status === 'held_in_escrow' && 
         !this.renterConfirmedCompletion;
});

// ============== METHODS ==============

// Mark rental as completed (owner)
rentalSchema.methods.markCompleted = async function() {
  this.status = 'completed';
  this.completedAt = new Date();
  return await this.save();
};

// Confirm completion (renter)
rentalSchema.methods.confirmCompletion = async function(note) {
  this.renterConfirmedCompletion = true;
  this.renterConfirmedAt = new Date();
  this.renterConfirmationNote = note;
  return await this.save();
};

// Add review
rentalSchema.methods.addReview = async function(rating, comment) {
  if (this.status !== 'completed') {
    throw new Error('Cannot review incomplete rental');
  }
  
  if (this.payment?.status !== 'completed') {
    throw new Error('Cannot review until payment is completed');
  }

  this.review = {
    rating,
    comment,
    createdAt: new Date()
  };
  this.isReviewed = true;
  
  return await this.save();
};

// Update review
rentalSchema.methods.updateReview = async function(rating, comment) {
  if (!this.isReviewed) {
    throw new Error('No existing review to update');
  }

  this.review.rating = rating;
  this.review.comment = comment;
  
  return await this.save();
};

// Cancel rental
rentalSchema.methods.cancel = async function() {
  if (['completed', 'cancelled'].includes(this.status)) {
    throw new Error('Cannot cancel completed or already cancelled rental');
  }

  this.status = 'cancelled';
  this.cancelledAt = new Date();
  return await this.save();
};

// ============== STATIC METHODS ==============

// Get active rentals for a machine
rentalSchema.statics.getActiveRentalsForMachine = async function(machineId) {
  return await this.find({
    machineId,
    status: { $in: ['approved', 'active', 'completed'] }
  }).sort({ startDate: 1 });
};

// Get rentals needing confirmation
rentalSchema.statics.getPendingConfirmations = async function(renterId) {
  return await this.find({
    renterId,
    status: 'completed',
    'payment.status': 'held_in_escrow',
    renterConfirmedCompletion: false
  }).populate('machineId ownerId');
};

// Get owner's completed rentals
rentalSchema.statics.getOwnerCompletedRentals = async function(ownerId) {
  return await this.find({
    ownerId,
    status: 'completed',
    'payment.status': 'completed'
  }).populate('machineId renterId');
};

// Get rental statistics
rentalSchema.statics.getRentalStats = async function(userId) {
  const stats = await this.aggregate([
    {
      $match: {
        $or: [
          { renterId: mongoose.Types.ObjectId(userId) },
          { ownerId: mongoose.Types.ObjectId(userId) }
        ]
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalRevenue: { $sum: '$pricing.totalPrice' }
      }
    }
  ]);

  return stats;
};

// ============== MIDDLEWARE ==============

// Pre-save validation
rentalSchema.pre('save', function(next) {
  // Ensure dates are valid for daily rentals
  if (this.rentalType === 'daily') {
    if (this.endDate <= this.startDate) {
      return next(new Error('End date must be after start date'));
    }
  }

  // Ensure hectares is positive for per-hectare rentals
  if (this.rentalType === 'per_hectare' && this.hectares <= 0) {
    return next(new Error('Hectares must be greater than 0'));
  }

  // Auto-set completedAt when status changes to completed
  if (this.isModified('status') && this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }

  next();
});

// Post-save hook to update machine rating when review is added/updated
rentalSchema.post('save', async function(doc, next) {
  if (doc.isReviewed && doc.review?.rating) {
    try {
      const Machine = mongoose.model('Machine');
      const machine = await Machine.findById(doc.machineId);
      
      if (machine) {
        // Get all reviews for this machine
        const Rental = mongoose.model('Rental');
        const reviews = await Rental.find({
          machineId: doc.machineId,
          isReviewed: true,
          'review.rating': { $exists: true }
        });

        if (reviews.length > 0) {
          const totalRating = reviews.reduce((sum, r) => sum + r.review.rating, 0);
          const averageRating = totalRating / reviews.length;

          machine.rating = {
            average: Math.round(averageRating * 10) / 10, // Round to 1 decimal
            count: reviews.length
          };

          await machine.save();
        }
      }
    } catch (error) {
      console.error('Error updating machine rating:', error);
    }
  }
  next();
});

module.exports = mongoose.model('Rental', rentalSchema);