const mongoose = require("mongoose");

const rentalSchema = new mongoose.Schema(
  {
    // ============================================
    // CORE RENTAL INFO
    // ============================================
    machineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Machine",
      required: true,
    },

    renterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rentalType: {
      type: String,
      enum: ["daily", "per_hectare"],
      default: "daily",
    },
    startDate: {
      type: Date,
      required: false,
    },

    endDate: {
      type: Date,
      required: false,
    },

    fieldLocation: {
      type: String,
      trim: true,
    },
    // ============================================
    // STATUS (Complete workflow)
    // ============================================
    status: {
      type: String,
      enum: [
        "booking", // Deprecated - use 'pending'
        "pending", // Waiting for owner approval ⏳
        "approved", // Owner approved, waiting for payment 💳
        "rejected", // Owner rejected ❌
        "active", // Paid, job in progress 🚜
        "completed", // Owner finished job ✅
        "released", // Renter confirmed, ready for admin 🎯
        "disputed", // Renter disputed ⚠️
        "closed", // Final state - payment released 🔒
        "cancelled", // Cancelled before payment 🚫
      ],
      default: "pending",
      required: true,
    },

    // ============================================
    // PRICING
    // ============================================
    pricing: {
      totalPrice: {
        type: Number,
        required: true,
      },
      dailyRate: Number,
      duration: Number,
      numberOfDays: Number,
      numberOfHectares: Number,
      pricePerHectare: Number,
      currency: {
        type: String,
        default: "USD",
      },
    },

    // ============================================
    // PAYMENT
    // ============================================
    payment: {
      status: {
        type: String,
        enum: [
          "pending",
          "held_in_escrow",
          "completed",
          "refunded",
          "failed",
          "disputed",
        ],
        default: "pending",
      },
      amount: Number,
      transactionId: String,
      method: {
        type: String,
        enum: ["stripe", "orange_money", "mtn_momo", "moov", "other"],
      },
      paidAt: Date,
      platformFee: Number,
      ownerPayout: Number,
      releasedAt: Date,
      releasedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      adminNote: String,
    },

    // ============================================
    // APPROVAL (pending → approved/rejected)
    // ============================================
    approvedAt: Date,
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // ============================================
    // REJECTION (pending → rejected)
    // ============================================
    rejectedAt: Date,
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    rejectionReason: {
      type: String,
      minlength: [20, "Rejection reason must be at least 20 characters"],
    },

    // ============================================
    // OWNER COMPLETION (active → completed)
    // ============================================
    ownerConfirmedCompletion: {
      type: Boolean,
      default: false,
    },
    ownerConfirmationNote: {
      type: String,
      trim: true,
      minlength: [10, "Completion note must be at least 10 characters"],
    },
    ownerConfirmedAt: Date,

    // ============================================
    // RENTER CONFIRMATION (completed → released)
    // ============================================
    renterConfirmedCompletion: {
      type: Boolean,
      default: false,
    },
    renterConfirmationNote: {
      type: String,
      trim: true,
      minlength: [10, "Confirmation note must be at least 10 characters"],
    },
    renterConfirmedAt: Date,

    // ============================================
    // CANCELLATION
    // ============================================
    cancelledAt: Date,
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    cancellationReason: String,

    // ============================================
    // DISPUTE (completed → disputed)
    // ============================================
    disputedAt: Date,
    disputedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    disputeReason: {
      type: String,
      minlength: [50, "Dispute reason must be at least 50 characters"],
    },
    disputeResolution: String,
    disputeResolvedAt: Date,
    disputeResolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    disputedBy: {
      type: String,
      enum: ["renter", "owner"],
    },
    disputeImages: [String], 

    disputeResolution: {
  resolvedAt: Date,
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  resolutionType: {
    type: String,
    enum: ["owner", "renter", "split"],
  },
  ownerAmount: Number,
  renterAmount: Number,
  platformFee: Number,
  ownerPayout: Number,
  adminNotes: String,
},

    // ============================================
    // DELIVERY/LOCATION
    // ============================================
    deliveryAddress: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String,
      coordinates: {
        latitude: Number,
        longitude: Number,
      },
    },

    // ============================================
    // REVIEWS (after closed)
    // ============================================
    renterReview: {
      rating: {
        type: Number,
        min: 1,
        max: 5,
      },
      comment: String,
      createdAt: Date,
    },

    ownerReview: {
      rating: {
        type: Number,
        min: 1,
        max: 5,
      },
      comment: String,
      createdAt: Date,
    },

    // ============================================
    // NOTES & METADATA
    // ============================================
    notes: String,
    adminNotes: String,
  },
  {
    timestamps: true,
  },
);

// ============================================
// INDEXES
// ============================================
rentalSchema.index({ status: 1 });
rentalSchema.index({ renterId: 1 });
rentalSchema.index({ ownerId: 1 });
rentalSchema.index({ machineId: 1 });
rentalSchema.index({ "payment.status": 1 });
rentalSchema.index({ createdAt: -1 });

// ============================================
// VALID STATE TRANSITIONS
// ============================================
const validTransitions = {
  booking: ["pending"],
  pending: ["approved", "rejected", "cancelled"],
  approved: ["active", "cancelled"],
  active: ["completed", "disputed"],
  completed: ["released", "disputed"],
  released: ["closed"],
  disputed: ["closed"],
  rejected: [], // Terminal
  closed: [], // Terminal
  cancelled: [], // Terminal
};

rentalSchema.methods.canTransitionTo = function (newStatus) {
  const allowed = validTransitions[this.status] || [];
  return allowed.includes(newStatus);
};

// ============================================
// VIRTUALS
// ============================================
rentalSchema.virtual("bothConfirmed").get(function () {
  return this.ownerConfirmedCompletion && this.renterConfirmedCompletion;
});

rentalSchema.virtual("isReadyForRelease").get(function () {
  return this.status === "released" && this.bothConfirmed;
});

rentalSchema.virtual("durationDays").get(function () {
  if (!this.startDate || !this.endDate) return 0;
  return Math.ceil((this.endDate - this.startDate) / (1000 * 60 * 60 * 24));
});

// ============================================
// PRE-SAVE: Validate status transitions
// ============================================
rentalSchema.pre("save", async function (next) {
  try {
    // Only validate status changes on existing documents
    if (this.isModified("status") && !this.isNew) {
      // ✅ Fetch the CURRENT status from database before this save
      const currentDoc = await this.constructor
        .findById(this._id)
        .select("status")
        .lean();

      if (!currentDoc) {
        return next(new Error("Rental not found"));
      }

      const oldStatus = currentDoc.status;
      const newStatus = this.status;

      console.log(`🔍 Validating transition: ${oldStatus} → ${newStatus}`);

      // Check if transition is allowed
      const allowed = validTransitions[oldStatus] || [];

      if (!allowed.includes(newStatus)) {
        console.log(`❌ Invalid transition. Allowed:`, allowed);
        return next(
          new Error(
            `Invalid status transition: ${oldStatus} → ${newStatus}. ` +
              `Allowed: ${allowed.join(", ")}`
          )
        );
      }

      console.log(`✅ Valid transition: ${oldStatus} → ${newStatus}`);
    }

    next();
  } catch (error) {
    console.error("❌ Pre-save validation error:", error);
    next(error);
  }
});

// ============================================
// METHODS
// ============================================
rentalSchema.methods.calculateSplit = function () {
  const total = this.pricing.totalPrice;
  const platformFee = total * 0.1;
  const ownerPayout = total - platformFee;

  return {
    total,
    platformFee,
    ownerPayout,
    platformPercentage: 10,
    ownerPercentage: 90,
  };
};

// ============================================
// STATIC METHODS
// ============================================
rentalSchema.statics.getStatusStats = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalValue: { $sum: "$pricing.totalPrice" },
      },
    },
  ]);

  return stats.reduce((acc, stat) => {
    acc[stat._id] = {
      count: stat.count,
      totalValue: stat.totalValue,
    };
    return acc;
  }, {});
};

rentalSchema.set("toObject", { virtuals: true });

rentalSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Rental", rentalSchema);