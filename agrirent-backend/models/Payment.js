// backend/models/Payment.js - UPDATED WITH ESCROW
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  rentalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Rental',
    required: true,
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  currency: {
    type: String,
    required: true,
    default: 'USD',
    uppercase: true,
  },
  method: {
    type: String,
    required: true,
    enum: ['stripe', 'paypal', 'orange', 'mtn', 'moov', 'other'],
  },
  
  // ESCROW STATUS FLOW
  escrowStatus: {
    type: String,
    required: true,
    enum: [
      'pending',           // Payment initiated but not completed
      'held',              // Payment received and held in AgriRent account
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
    enum: ['pending', 'processing', 'completed', 'finished', 'failed', 'refunded', 'cancelled'],
    default: 'pending',
  },
  
  transactionId: {
    type: String,
    required: true,
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
  
  // CONFIRMATION TRACKING
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
  
  // DISPUTE MANAGEMENT
  dispute: {
    isDisputed: {
      type: Boolean,
      default: false,
    },
    openedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    openedAt: Date,
    reason: String,
    status: {
      type: String,
      enum: ['open', 'under_review', 'resolved', 'cancelled'],
    },
    resolution: String,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    resolvedAt: Date,
    outcome: {
      type: String,
      enum: ['release_to_owner', 'refund_to_renter', 'partial_refund', 'split'],
    },
    refundAmount: Number,
    releaseAmount: Number,
  },
  
  // PLATFORM FEES
  platformFee: {
    percentage: {
      type: Number,
      default: 10, // 10% platform fee
    },
    amount: Number,
    deductedAt: Date,
  },
  
  // PAYOUT TO OWNER
  payout: {
    amount: Number,              // Amount paid to owner (after fees)
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'finished'],
      default: 'pending',
    },
    payoutMethod: String,
    payoutTransactionId: String,
    payoutAt: Date,
    failureReason: String,
  },
  
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  
  refund: {
    amount: Number,
    reason: String,
    refundedAt: Date,
    refundId: String,
  },
  
  completedAt: Date,
  failureReason: String,
  
  // AUTO-RELEASE SETTINGS
  autoRelease: {
    enabled: {
      type: Boolean,
      default: true,
    },
    daysAfterCompletion: {
      type: Number,
      default: 3, // Auto-release after 3 days if no dispute
    },
    scheduledReleaseDate: Date,
  },
  
}, {
  timestamps: true,
});

// Indexes
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ ownerId: 1, createdAt: -1 });
paymentSchema.index({ rentalId: 1 });
paymentSchema.index({ escrowStatus: 1 });
paymentSchema.index({ 'autoRelease.scheduledReleaseDate': 1 });

// Virtuals
paymentSchema.virtual('isHeldInEscrow').get(function() {
  return this.escrowStatus === 'held';
});

paymentSchema.virtual('canBeReleased').get(function() {
  return this.escrowStatus === 'held' && 
         this.confirmations.renterConfirmed && 
         !this.dispute.isDisputed;
});

paymentSchema.virtual('netAmountToOwner').get(function() {
  if (!this.amount || !this.platformFee.percentage) return 0;
  const feeAmount = (this.amount * this.platformFee.percentage) / 100;
  return this.amount - feeAmount;
});

// Methods
paymentSchema.methods.markAsHeldInEscrow = async function() {
  this.escrowStatus = 'held';
  this.escrowTimeline.heldAt = new Date();
  this.status = 'completed';
  
  // Calculate platform fee
  this.platformFee.amount = (this.amount * this.platformFee.percentage) / 100;
  
  // Set auto-release date
  if (this.autoRelease.enabled) {
    const releaseDate = new Date();
    releaseDate.setDate(releaseDate.getDate() + this.autoRelease.daysAfterCompletion);
    this.autoRelease.scheduledReleaseDate = releaseDate;
  }
  
  return await this.save();
};

paymentSchema.methods.confirmByRenter = async function(note) {
  this.confirmations.renterConfirmed = true;
  this.confirmations.renterConfirmedAt = new Date();
  this.confirmations.renterConfirmationNote = note;
  this.escrowTimeline.renterConfirmedAt = new Date();
  
  return await this.save();
};

paymentSchema.methods.verifyByAdmin = async function(adminId, note) {
  this.confirmations.adminVerified = true;
  this.confirmations.adminVerifiedAt = new Date();
  this.confirmations.adminVerifiedBy = adminId;
  this.confirmations.adminNote = note;
  this.escrowTimeline.adminVerifiedAt = new Date();
  
  return await this.save();
};

paymentSchema.methods.releaseToOwner = async function() {
  this.escrowStatus = 'released';
  this.escrowTimeline.releasedAt = new Date();
  
  // Calculate payout amount (after platform fee)
  this.payout.amount = this.netAmountToOwner;
  this.payout.status = 'pending';
  
  return await this.save();
};

paymentSchema.methods.openDispute = async function(userId, reason) {
  this.escrowStatus = 'disputed';
  this.dispute.isDisputed = true;
  this.dispute.openedBy = userId;
  this.dispute.openedAt = new Date();
  this.dispute.reason = reason;
  this.dispute.status = 'open';
  this.escrowTimeline.disputedAt = new Date();
  
  return await this.save();
};

paymentSchema.methods.resolveDispute = async function(adminId, outcome, resolution) {
  this.dispute.status = 'resolved';
  this.dispute.resolvedBy = adminId;
  this.dispute.resolvedAt = new Date();
  this.dispute.outcome = outcome;
  this.dispute.resolution = resolution;
  this.escrowTimeline.resolvedAt = new Date();
  
  // Handle different outcomes
  switch (outcome) {
    case 'release_to_owner':
      this.escrowStatus = 'released';
      this.payout.amount = this.netAmountToOwner;
      break;
    case 'refund_to_renter':
      this.escrowStatus = 'refunded';
      this.refund.amount = this.amount;
      break;
    case 'partial_refund':
      this.escrowStatus = 'refunded';
      this.refund.amount = this.dispute.refundAmount;
      this.payout.amount = this.dispute.releaseAmount;
      break;
    case 'split':
      this.escrowStatus = 'refunded';
      this.refund.amount = this.dispute.refundAmount;
      this.payout.amount = this.dispute.releaseAmount;
      break;
  }
  
  return await this.save();
};

// Static methods
paymentSchema.statics.getEscrowBalance = async function() {
  const result = await this.aggregate([
    { $match: { escrowStatus: 'held' } },
    {
      $group: {
        _id: null,
        totalHeld: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);
  
  return result[0] || { totalHeld: 0, count: 0 };
};

paymentSchema.statics.getPendingReleases = async function() {
  const now = new Date();
  return await this.find({
    escrowStatus: 'held',
    'autoRelease.enabled': true,
    'autoRelease.scheduledReleaseDate': { $lte: now },
    'dispute.isDisputed': false,
  });
};

paymentSchema.statics.getOwnerEarnings = async function(ownerId) {
  const result = await this.aggregate([
    { $match: { ownerId: mongoose.Types.ObjectId(ownerId), escrowStatus: 'released' } },
    {
      $group: {
        _id: null,
        totalEarnings: { $sum: '$payout.amount' },
        totalPayouts: { $sum: 1 },
      },
    },
  ]);
  
  return result[0] || { totalEarnings: 0, totalPayouts: 0 };
};

module.exports = mongoose.model('Payment', paymentSchema);