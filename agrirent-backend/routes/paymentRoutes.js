const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const Payment = require("../models/Payment");
const Rental = require("../models/Rental");
const User = require("../models/User");
const Machine = require("../models/Machine");
const { sendEmail } = require("../services/emailService");
const { sendSMS } = require("../services/smsService");
const { sendNotificationSMS } = require("../services/smsService");
const orangeMoneyService = require("../services/orangeMoneyService");
// Initialize Stripe
let stripe = null;

if (process.env.STRIPE_SECRET_KEY) {
  stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
  console.log("✅ Stripe initialized");
}

const requireStripe = (req, res, next) => {
  if (!stripe) {
    return res.status(503).json({
      success: false,
      message: "Payment service not configured",
    });
  }
  next();
};

// TEST ROUTE
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Payment routes are working!",
    stripe: !!stripe,
  });
});

// DEBUG: Check payment and rental status
router.get("/debug/check-rental/:rentalId", protect, async (req, res) => {
  try {
    const { rentalId } = req.params;
    const rental = await Rental.findById(rentalId);
    const payment = await Payment.findOne({ rentalId });

    res.json({
      success: true,
      rental: {
        id: rental._id,
        status: rental.status,
        paymentStatus: rental.payment?.status,
        amount: rental.payment?.amount,
        paidAt: rental.payment?.paidAt,
      },
      payment: payment
        ? {
            id: payment._id,
            status: payment.status,
            escrowStatus: payment.escrowStatus,
            transactionId: payment.transactionId,
            amount: payment.amount,
          }
        : null,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// CREATE CHECKOUT SESSION
// ============================================
router.post(
  "/stripe/create-checkout-session",
  protect,
  requireStripe,
  async (req, res) => {
    try {
      const { rentalId } = req.body;
      const rental = await Rental.findById(rentalId)
        .populate("machineId")
        .populate("ownerId")
        .populate("renterId");

      if (!rental) {
        return res
          .status(404)
          .json({ success: false, message: "Rental not found" });
      }

      if (rental.renterId._id.toString() !== req.user.id) {
        return res
          .status(403)
          .json({ success: false, message: "Not authorized" });
      }

      if (rental.status !== "approved") {
        return res
          .status(400)
          .json({ success: false, message: "Rental must be approved first" });
      }

      const amount = rental.pricing?.totalPrice || 0;
      if (amount <= 0) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid amount" });
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Rental: ${rental.machineId?.name || "Machine"}`,
                description: `Rental payment for ${rental.machineId?.name}`,
              },
              unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${process.env.FRONTEND_URL}/rentals/${rentalId}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/rentals/${rentalId}`,
        metadata: {
          rentalId: rentalId.toString(),
          userId: req.user.id.toString(),
          ownerId: rental.ownerId._id.toString(),
        },
        customer_email: req.user.email,
      });

      res.json({
        success: true,
        data: {
          sessionId: session.id,
          url: session.url,
        },
      });
    } catch (error) {
      console.error("Stripe checkout error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// ============================================
// VERIFY SESSION AND UPDATE RENTAL STATUS
// ============================================
// Replace the verify-session route in paymentRoutes.js (around line 145-225)
router.get(
  "/stripe/verify-session/:sessionId",
  protect,
  requireStripe,
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === "paid") {
        const rentalId = session.metadata?.rentalId;

        // Get the rental with populated fields
        const rental = await Rental.findById(rentalId)
          .populate("renterId")
          .populate("ownerId");

        if (!rental) {
          return res.status(404).json({
            success: false,
            message: "Rental not found",
          });
        }

        // Find or create payment record
        let payment = await Payment.findOne({ rentalId });

        if (!payment) {
          payment = await Payment.create({
            rentalId,
            userId: rental.renterId._id, // ✅ ADD THIS
            ownerId: rental.ownerId._id, // ✅ ADD THIS
            amount: session.amount_total / 100,
            currency: session.currency || "usd", // ✅ ADD THIS
            method: "stripe", // ✅ ADD THIS
            transactionId: session.payment_intent,
            status: "completed",
            escrowStatus: "held",
            escrowTimeline: {
              paidAt: new Date(),
              heldAt: new Date(),
            },
          });
          console.log("Payment record created:", payment._id);
        } else {
          payment.status = "completed";
          payment.escrowStatus = "held";
          payment.transactionId = session.payment_intent;
          payment.method = "stripe"; // ✅ ADD THIS
          payment.escrowTimeline = payment.escrowTimeline || {};
          payment.escrowTimeline.paidAt = new Date();
          payment.escrowTimeline.heldAt = new Date();
          await payment.save();
          console.log("Payment record updated:", payment._id);
        }

        // Update rental status to 'active' when payment succeeds
        const updatedRental = await Rental.findByIdAndUpdate(
          rentalId,
          {
            status: "active",
            "payment.status": "held_in_escrow",
            "payment.transactionId": session.payment_intent,
            "payment.method": "stripe",
            "payment.amount": session.amount_total / 100,
            "payment.paidAt": new Date(),
            paymentStatus: "paid",
            paymentDate: new Date(),
          },
          { new: true }
        )
          .populate("renterId")
          .populate("ownerId")
          .populate("machineId");

        console.log("Rental status updated to:", updatedRental.status);

        res.json({
          success: true,
          paid: true,
          rental: {
            id: updatedRental._id,
            status: updatedRental.status,
            paymentStatus: "held_in_escrow",
          },
          payment: {
            id: payment._id,
            escrowStatus: payment.escrowStatus,
          },
        });
      } else {
        res.json({
          success: false,
          paid: false,
          status: session.payment_status,
        });
      }
    } catch (error) {
      console.error("Verify session error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// ============================================
// GET RENTAL PAYMENT STATUS
// ============================================
router.get("/rental/:rentalId/payment-status", protect, async (req, res) => {
  try {
    const { rentalId } = req.params;

    const rental = await Rental.findById(rentalId)
      .populate("renterId", "email")
      .populate("ownerId", "email");

    if (!rental) {
      return res
        .status(404)
        .json({ success: false, message: "Rental not found" });
    }

    const payment = await Payment.findOne({ rentalId });

    res.json({
      success: true,
      rentalStatus: rental.status,
      paymentStatus: rental.payment?.status || payment?.status || "pending",
      amount: rental.payment?.amount || payment?.amount,
      transactionId: rental.payment?.transactionId,
      paidAt: rental.payment?.paidAt,
      requiresPayment: rental.status === "approved", // Show payment button if approved
      canCompleteRental: rental.status === "active", // Can only complete if active
      ownerConfirmed: rental.confirmations?.ownerConfirmed,
      renterConfirmed: rental.confirmations?.renterConfirmed,
    });
  } catch (error) {
    console.error("Error getting payment status:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// ADMIN: GET PENDING RELEASES
// ============================================
router.get(
  "/admin/pending-releases",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const pendingPayments = await Payment.find({
        escrowStatus: "held",
        "confirmations.renterConfirmed": true,
        "confirmations.adminVerified": { $ne: true },
      })
        .populate("userId", "firstName lastName email")
        .populate("ownerId", "firstName lastName email")
        .populate({
          path: "rentalId",
          populate: { path: "machineId", select: "name images" },
        })
        .sort({ "confirmations.renterConfirmedAt": 1 });

      console.log(`Found ${pendingPayments.length} pending releases`);

      res.json({ success: true, data: pendingPayments });
    } catch (error) {
      console.error("Error fetching pending releases:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// ============================================
// ADMIN: GET PENDING PAYMENTS FOR ESCROW DASHBOARD
// ============================================
// ============================================
// ADMIN: GET PENDING PAYMENTS FOR ESCROW DASHBOARD
// ============================================
router.get("/admin/pending-payments", protect, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can access this endpoint",
      });
    }

    console.log("🔍 Fetching ALL rentals for escrow dashboard...");

    // ✅ GET ALL RENTALS
    const rentals = await Rental.find({})
      .populate("machineId", "name images category")
      .populate("renterId", "firstName lastName email phone")
      .populate("ownerId", "firstName lastName email phone")
      .sort({ createdAt: -1 });

    console.log(`📊 Total rentals found: ${rentals.length}`);

    // ✅ CRITICAL FIX: Use rental.payment directly, don't override with Payment document
    const rentalsWithPayments = rentals.map((rental) => {
      const rentalObj = rental.toObject();

      // ✅ Use the payment info directly from the rental
      // DO NOT fetch from Payment collection as it might have different status
      if (!rentalObj.payment || !rentalObj.payment.status) {
        rentalObj.payment = {
          status: "pending",
          amount: rentalObj.pricing?.totalPrice || 0,
          method: "unknown",
          transactionId: null,
        };
      }

      return rentalObj;
    });

    console.log(`✅ Processed ${rentalsWithPayments.length} rentals`);
    console.log(`📊 Status Breakdown:`);
    console.log(
      `   - Pending: ${
        rentalsWithPayments.filter((r) => r.status === "pending").length
      }`
    );
    console.log(
      `   - Approved: ${
        rentalsWithPayments.filter((r) => r.status === "approved").length
      }`
    );
    console.log(
      `   - Rejected: ${
        rentalsWithPayments.filter((r) => r.status === "rejected").length
      }`
    );
    console.log(
      `   - Active: ${
        rentalsWithPayments.filter((r) => r.status === "active").length
      }`
    );
    console.log(
      `   - Completed: ${
        rentalsWithPayments.filter((r) => r.status === "completed").length
      }`
    );
    console.log(
      `   - Released: ${
        rentalsWithPayments.filter((r) => r.status === "released").length
      }`
    );
    console.log(
      `   - Closed: ${
        rentalsWithPayments.filter((r) => r.status === "closed").length
      }`
    );

    console.log(`💰 Payment Status:`);
    console.log(
      `   - Pending: ${
        rentalsWithPayments.filter((r) => r.payment?.status === "pending")
          .length
      }`
    );
    console.log(
      `   - Held in escrow: ${
        rentalsWithPayments.filter(
          (r) => r.payment?.status === "held_in_escrow"
        ).length
      }`
    );
    console.log(
      `   - Completed: ${
        rentalsWithPayments.filter((r) => r.payment?.status === "completed")
          .length
      }`
    );

    res.json({
      success: true,
      data: rentalsWithPayments,
      count: rentalsWithPayments.length,
    });
  } catch (error) {
    console.error("❌ Error fetching pending payments:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});
// Get all rentals (admin only)
router.get("/admin/all", protect, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    let query = {};
    if (status) {
      query.status = status;
    }

    const rentals = await Rental.find(query)
      .populate("machineId", "name images category")
      .populate("renterId", "firstName lastName email phone")
      .populate("ownerId", "firstName lastName email phone")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Rental.countDocuments(query);

    res.json({
      success: true,
      data: rentals,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get rentals pending payment release
router.get("/admin/pending-release", protect, async (req, res) => {
  try {
    const rentals = await Rental.find({
      status: "released",
      renterConfirmedCompletion: true,
    })
      .populate("machineId", "name category")
      .populate("renterId", "firstName lastName email")
      .populate("ownerId", "firstName lastName email bankDetails")
      .sort({ renterConfirmedAt: 1 });

    // Get payment details for each rental
    const rentalsWithPayments = await Promise.all(
      rentals.map(async (rental) => {
        const payment = await Payment.findOne({ rentalId: rental._id });
        return {
          ...rental.toObject(),
          payment: payment || null,
        };
      })
    );

    res.json({
      success: true,
      data: rentalsWithPayments,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get rental statistics
router.get("/admin/stats", protect, async (req, res) => {
  try {
    const totalRentals = await Rental.countDocuments();
    const pendingRentals = await Rental.countDocuments({ status: "pending" });
    const activeRentals = await Rental.countDocuments({ status: "active" });
    const completedRentals = await Rental.countDocuments({ status: "closed" });

    const totalRevenue = await Rental.aggregate([
      { $match: { status: "closed" } },
      { $group: { _id: null, total: { $sum: "$pricing.totalPrice" } } },
    ]);

    const monthlyRevenue = await Rental.aggregate([
      {
        $match: {
          status: "closed",
          closedAt: {
            $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      },
      { $group: { _id: null, total: { $sum: "$pricing.totalPrice" } } },
    ]);

    res.json({
      success: true,
      data: {
        totalRentals,
        pendingRentals,
        activeRentals,
        completedRentals,
        totalRevenue: totalRevenue[0]?.total || 0,
        monthlyRevenue: monthlyRevenue[0]?.total || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin update rental status
router.patch("/admin/:id/status", protect, async (req, res) => {
  try {
    const { status, reason } = req.body;

    const rental = await Rental.findById(req.params.id)
      .populate("machineId", "name")
      .populate("ownerId", "firstName lastName email")
      .populate("renterId", "firstName lastName email");

    if (!rental) {
      return res.status(404).json({
        success: false,
        message: "Rental not found",
      });
    }

    const oldStatus = rental.status;
    rental.status = status;
    rental.adminStatusUpdate = {
      previousStatus: oldStatus,
      updatedBy: req.user.id,
      updatedAt: new Date(),
      reason: reason || "Admin status update",
    };

    await rental.save();

    // Update machine availability if needed
    if (["cancelled", "rejected", "closed"].includes(status)) {
      const machine = await Machine.findById(rental.machineId._id);
      if (machine) {
        machine.availability = "available";
        await machine.save();
      }
    }

    res.json({
      success: true,
      message: `Rental status updated from ${oldStatus} to ${status}`,
      data: rental,
    });
  } catch (error) {
    console.error("Admin status update error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Process refund
router.post("/admin/:id/refund", protect, async (req, res) => {
  try {
    const { refundAmount, reason } = req.body;

    const rental = await Rental.findById(req.params.id)
      .populate("machineId", "name")
      .populate("ownerId", "firstName lastName email")
      .populate("renterId", "firstName lastName email");

    if (!rental) {
      return res.status(404).json({
        success: false,
        message: "Rental not found",
      });
    }

    const payment = await Payment.findOne({ rentalId: rental._id });
    if (!payment) {
      return res.status(400).json({
        success: false,
        message: "Payment record not found",
      });
    }

    // Create refund record
    const refund = await Refund.create({
      rentalId: rental._id,
      amount: refundAmount,
      reason,
      processedBy: req.user.id,
      processedAt: new Date(),
    });

    // Update payment status
    payment.escrowStatus = "refunded";
    payment.refundedAmount = refundAmount;
    await payment.save();

    // Update rental status
    rental.status = "cancelled";
    rental.cancelledAt = new Date();
    rental.cancelledBy = req.user.id;
    await rental.save();

    // Notify both parties
    try {
      await sendEmail(
        rental.renterId.email,
        "💰 Refund Processed - AgriRent",
        `
          <h2>Refund Processed</h2>
          <p>Hi ${rental.renterId.firstName},</p>
          <p>Your refund for the rental of <strong>${
            rental.machineId.name
          }</strong> has been processed.</p>
          <p><strong>Refund Amount:</strong> $${refundAmount.toFixed(2)}</p>
          <p><strong>Reason:</strong> ${reason}</p>
          <p>The funds should appear in your account within 5-7 business days.</p>
          <p>Thank you for using AgriRent!</p>
        `
      );
    } catch (emailError) {
      console.error("Email error:", emailError);
    }

    res.json({
      success: true,
      message: "Refund processed successfully",
      data: {
        rental,
        refund,
        payment,
      },
    });
  } catch (error) {
    console.error("Refund processing error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// OWNER: MARK RENTAL AS COMPLETE
// ============================================

router.post("/owner/mark-complete/:rentalId", protect, async (req, res) => {
  try {
    const { rentalId } = req.params;
    const { completionNote } = req.body;

    const rental = await Rental.findById(rentalId)
      .populate("ownerId", "firstName lastName phone")
      .populate("renterId", "firstName lastName phone")
      .populate("machineId", "name");

    if (!rental) {
      return res
        .status(404)
        .json({ success: false, message: "Rental not found" });
    }

    if (rental.ownerId._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Only the owner can mark as complete",
      });
    }

    if (rental.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "Rental must be active to mark as complete",
      });
    }

    const payment = await Payment.findOne({ rentalId });
    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });
    }

    if (payment.escrowStatus !== "held") {
      return res.status(400).json({
        success: false,
        message: "Payment must be in escrow",
      });
    }

    // Update rental to completed
    rental.status = "completed";
    rental.confirmations = rental.confirmations || {};
    rental.confirmations.ownerConfirmed = true;
    rental.confirmations.ownerConfirmedAt = new Date();
    rental.confirmations.ownerCompletionNote = completionNote;
    await rental.save();

    console.log("✅ Owner marked rental as complete");

    // ✅ SEND SMS to renter
    if (rental.renterId?.phone) {
      try {
        const message = `AgriRent: The owner has marked your rental of "${
          rental.machineId?.name
        }" as complete. Please confirm in the app to release payment of $${payment.amount.toFixed(
          2
        )}.`;

        await sendSMS(rental.renterId.phone, message);
        console.log("✅ SMS sent to renter:", rental.renterId.phone);
      } catch (smsError) {
        console.error("⚠️ Failed to send SMS to renter:", smsError.message);
        // Don't fail the request if SMS fails
      }
    } else {
      console.warn("⚠️ No phone number found for renter");
    }

    res.json({
      success: true,
      message: "Rental marked as complete. SMS notification sent to renter.",
      data: rental,
    });
  } catch (error) {
    console.error("Mark complete error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// REPLACE the /confirm-completion route
router.post("/confirm-completion/:rentalId", protect, async (req, res) => {
  try {
    const { rentalId } = req.params;
    const { confirmationNote } = req.body;

    const rental = await Rental.findById(rentalId)
      .populate("ownerId", "firstName lastName phone")
      .populate("renterId", "firstName lastName phone")
      .populate("machineId", "name");

    if (!rental) {
      return res
        .status(404)
        .json({ success: false, message: "Rental not found" });
    }

    if (rental.renterId._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Only the renter can confirm completion",
      });
    }

    if (rental.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Rental must be completed by owner first",
      });
    }

    const payment = await Payment.findOne({ rentalId });
    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });
    }

    if (payment.escrowStatus !== "held") {
      return res.status(400).json({
        success: false,
        message: "Payment must be in escrow",
      });
    }

    // Update payment with renter confirmation
    payment.confirmations = payment.confirmations || {};
    payment.confirmations.renterConfirmed = true;
    payment.confirmations.renterConfirmedAt = new Date();
    payment.confirmations.renterConfirmationNote = confirmationNote;
    payment.escrowTimeline = payment.escrowTimeline || {};
    payment.escrowTimeline.renterConfirmedAt = new Date();
    await payment.save();

    // Update rental
    rental.confirmations = rental.confirmations || {};
    rental.confirmations.renterConfirmed = true;
    rental.confirmations.renterConfirmedAt = new Date();
    rental.confirmations.renterConfirmationNote = confirmationNote;
    await rental.save();

    console.log("✅ Renter confirmed completion");

    // ✅ SEND SMS to owner
    if (rental.ownerId?.phone) {
      try {
        const message = `AgriRent: The renter has confirmed completion of rental "${
          rental.machineId?.name
        }". Your payment of $${payment.amount.toFixed(
          2
        )} will be released within 24-48 hours.`;

        await sendSMS(rental.ownerId.phone, message);
        console.log("✅ SMS sent to owner:", rental.ownerId.phone);
      } catch (smsError) {
        console.error("⚠️ Failed to send SMS to owner:", smsError.message);
      }
    } else {
      console.warn("⚠️ No phone number found for owner");
    }

    // ✅ SEND SMS to admin (if admin phone is configured)
    if (process.env.ADMIN_PHONE) {
      try {
        const adminMessage = `AgriRent Admin: Payment release request. Rental ID: ${
          rental._id
        }, Amount: $${payment.amount.toFixed(2)}, Machine: ${
          rental.machineId?.name
        }`;

        await sendSMS(process.env.ADMIN_PHONE, adminMessage);
        console.log("✅ SMS sent to admin");
      } catch (smsError) {
        console.error("⚠️ Failed to send SMS to admin:", smsError.message);
      }
    }

    res.json({
      success: true,
      message: "Completion confirmed. SMS notifications sent.",
      data: payment,
    });
  } catch (error) {
    console.error("Confirmation error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// ADMIN: RELEASE PAYMENT
// ============================================

router.post(
  "/admin/release-payment/:paymentId",
  protect,
  authorize("admin"),
  requireStripe,
  async (req, res) => {
    try {
      const { paymentId } = req.params;
      const { adminNote } = req.body;

      const payment = await Payment.findById(paymentId)
        .populate("userId", "firstName lastName phone")
        .populate("ownerId", "firstName lastName phone mobileMoneyInfo")
        .populate({
          path: "rentalId",
          populate: { path: "machineId", select: "name" },
        });

      if (!payment) {
        return res
          .status(404)
          .json({ success: false, message: "Payment not found" });
      }

      // ... existing validation code ...

      // Calculate platform fee
      const platformFeePercent = 10;
      const platformFeeAmount = (payment.amount * platformFeePercent) / 100;
      const ownerAmount = payment.amount - platformFeeAmount;

      // Update payment status
      payment.escrowStatus = "released";
      payment.status = "completed";
      payment.confirmations.adminVerified = true;
      payment.confirmations.adminVerifiedAt = new Date();
      payment.confirmations.adminVerifiedBy = req.user.id;
      payment.confirmations.adminNote = adminNote;
      payment.escrowTimeline = payment.escrowTimeline || {};
      payment.escrowTimeline.releasedAt = new Date();

      payment.platformFee = {
        percentage: platformFeePercent,
        amount: platformFeeAmount,
        deductedAt: new Date(),
      };

      payment.payout = {
        amount: ownerAmount,
        status: "completed",
        payoutAt: new Date(),
      };

      await payment.save();

      // Update rental
      const rental = await Rental.findById(payment.rentalId);
      if (rental) {
        rental.payment.status = "completed";
        rental.confirmations = rental.confirmations || {};
        rental.confirmations.adminVerified = true;
        rental.confirmations.adminVerifiedAt = new Date();
        await rental.save();

        if (rental.machineId) {
          await Machine.findByIdAndUpdate(rental.machineId, {
            availability: "available",
          });
        }
      }

      // ✅ SEND SMS to owner
      if (payment.ownerId?.phone) {
        try {
          const { sendNotificationSMS } = require("../services/smsService");

          let payoutInfo = "";
          if (payment.ownerId.mobileMoneyInfo?.provider) {
            payoutInfo = ` via ${payment.ownerId.mobileMoneyInfo.provider.toUpperCase()} to ${
              payment.ownerId.mobileMoneyInfo.accountNumber
            }`;
          }

          const message = `AgriRent: Payment released! You will receive $${ownerAmount.toFixed(
            2
          )}${payoutInfo}. Machine: ${
            rental.machineId?.name
          }. Platform fee: $${platformFeeAmount.toFixed(2)} (10%).`;

          await sendNotificationSMS(payment.ownerId.phone, message);
          console.log("✅ SMS sent to owner");
        } catch (smsError) {
          console.error("⚠️ Failed to send SMS:", smsError.message);
        }
      }

      res.json({
        success: true,
        message: "Payment released successfully",
        data: {
          payment,
          platformFee: platformFeeAmount,
          ownerPayout: ownerAmount,
        },
      });
    } catch (error) {
      console.error("Release error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// ============================================
// ADMIN: DASHBOARD STATS
// ============================================
router.get(
  "/admin/dashboard-stats",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      // Total held in escrow
      const escrowStats = await Payment.aggregate([
        { $match: { escrowStatus: "held" } },
        {
          $group: {
            _id: null,
            totalHeld: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]);

      // Total released
      const releasedStats = await Payment.aggregate([
        { $match: { escrowStatus: "released" } },
        {
          $group: {
            _id: null,
            totalReleased: { $sum: "$amount" },
            totalFees: { $sum: "$platformFee.amount" },
            count: { $sum: 1 },
          },
        },
      ]);

      // Pending confirmations
      const pendingCount = await Payment.countDocuments({
        escrowStatus: "held",
        "confirmations.renterConfirmed": true,
        "confirmations.adminVerified": { $ne: true },
      });

      // All payments summary
      const allPayments = await Payment.aggregate([
        {
          $group: {
            _id: "$escrowStatus",
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]);

      res.json({
        success: true,
        data: {
          escrow: escrowStats[0] || { totalHeld: 0, count: 0 },
          released: releasedStats[0] || {
            totalReleased: 0,
            totalFees: 0,
            count: 0,
          },
          pendingReleases: pendingCount,
          summary: allPayments,
        },
      });
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// ============================================
// ADMIN: GET ALL DISPUTES
// ============================================
router.get("/admin/disputes", protect, authorize("admin"), async (req, res) => {
  try {
    const disputes = await Payment.find({
      escrowStatus: "disputed",
      "dispute.isDisputed": true,
      "dispute.status": { $in: ["open", "under_review"] },
    })
      .populate("userId", "firstName lastName email phone")
      .populate("ownerId", "firstName lastName email phone")
      .populate({
        path: "rentalId",
        populate: { path: "machineId", select: "name images category" },
      })
      .sort({ "dispute.openedAt": 1 });

    console.log(`Found ${disputes.length} active disputes`);

    res.json({ success: true, data: disputes });
  } catch (error) {
    console.error("Error fetching disputes:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// RENTER: OPEN DISPUTE
// ============================================
router.post("/open-dispute/:rentalId", protect, async (req, res) => {
  try {
    const { rentalId } = req.params;
    const { reason, images } = req.body;
    console.log("📸 Received images:", images);
    console.log("📸 Images count:", images?.length || 0);
    console.log(`⚠️ Dispute being opened for rental: ${rentalId}`);

    // Validate reason
    if (!reason || reason.trim().length < 20) {
      return res.status(400).json({
        success: false,
        message: "Please provide a detailed reason (minimum 20 characters)",
      });
    }

    const rental = await Rental.findById(rentalId)
      .populate("ownerId", "firstName lastName email phone")
      .populate("renterId", "firstName lastName email phone")
      .populate("machineId", "name");

    if (!rental) {
      return res.status(404).json({
        success: false,
        message: "Rental not found",
      });
    }

    console.log(`📊 Current rental status: ${rental.status}`);

    // Verify user is renter or owner
    const isRenter = rental.renterId._id.toString() === req.user.id;
    const isOwner = rental.ownerId._id.toString() === req.user.id;

    if (!isRenter && !isOwner) {
      return res.status(403).json({
        success: false,
        message: "Only renter or owner can open a dispute",
      });
    }

    // Check if already disputed
    if (rental.status === "disputed") {
      return res.status(400).json({
        success: false,
        message: "This rental already has an active dispute.",
      });
    }

    // ✅ FIXED: Only block these statuses (allows active, completed, released)
    if (
      ["pending", "approved", "cancelled", "rejected", "closed"].includes(
        rental.status
      )
    ) {
      return res.status(400).json({
        success: false,
        message: `Cannot open dispute for ${rental.status} rentals.`,
      });
    }

    // Check payment status
    const payment = await Payment.findOne({ rentalId });
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // Check if payment already released
    if (payment.status === "completed" || payment.escrowStatus === "released") {
      return res.status(400).json({
        success: false,
        message: "Cannot dispute - payment has already been released",
      });
    }

    // Check if payment is in escrow
    if (payment.escrowStatus !== "held") {
      return res.status(400).json({
        success: false,
        message: "Payment must be in escrow to open dispute",
      });
    }

    console.log(`✅ All checks passed. Opening dispute...`);

    // Update payment to disputed
    payment.escrowStatus = "disputed";
    payment.dispute = {
      isDisputed: true,
      openedBy: req.user.id,
      openedAt: new Date(),
      reason: reason.trim(),
      status: "open",
      images: images || [],
    };
    payment.escrowTimeline = payment.escrowTimeline || {};
    payment.escrowTimeline.disputedAt = new Date();
    await payment.save();

    // Update rental status
    rental.status = "disputed";
    rental.disputeReason = reason.trim();
    rental.disputedAt = new Date();
    rental.disputedBy = isOwner ? "owner" : "renter";
    rental.disputeImages = images || [];
    await rental.save();
    console.log(`⚠️ Dispute created with ${images?.length || 0} images`);
    console.log(`⚠️ Dispute opened by ${rental.disputedBy}`);

    // Notify admin
    const { sendEmail } = require("../utils/notifications");

    try {
      await sendEmail({
        to: process.env.ADMIN_EMAIL || "admin@agrirent.com",
        subject: "⚠️ New Dispute Opened - Action Required",
        html: `
          <h2>⚠️ New Dispute Opened</h2>
          <p><strong>Rental ID:</strong> ${rental._id}</p>
          <p><strong>Machine:</strong> ${rental.machineId.name}</p>
          <p><strong>Amount:</strong> $${payment.amount.toFixed(2)}</p>
          <p><strong>Opened by:</strong> ${isOwner ? "Owner" : "Renter"} - ${
          req.user.firstName
        } ${req.user.lastName}</p>
          <p><strong>Reason:</strong></p>
          <p>${reason.trim()}</p>
          ${
            images && images.length > 0
              ? `<p><strong>Evidence images:</strong> ${images.length} photo(s) attached</p>`
              : ""
          }
          <p>Please review and resolve this dispute in the admin dashboard.</p>
        `,
        text: `New Dispute Opened\n\nRental ID: ${rental._id}\nMachine: ${
          rental.machineId.name
        }\nAmount: $${payment.amount.toFixed(2)}\nOpened by: ${
          isOwner ? "Owner" : "Renter"
        }\nReason: ${reason.trim()}`,
      });
      console.log(`✅ Admin email sent`);
    } catch (emailError) {
      console.error("❌ Admin email error:", emailError.message);
    }

    // Notify the other party
    const otherParty = isRenter ? rental.ownerId : rental.renterId;
    try {
      await sendEmail({
        to: otherParty.email,
        subject: "⚠️ Dispute Opened for Your Rental",
        html: `
          <h2>⚠️ Dispute Notification</h2>
          <p>Hello ${otherParty.firstName},</p>
          <p>A dispute has been opened for the rental of <strong>${
            rental.machineId.name
          }</strong>.</p>
          <p><strong>Amount:</strong> $${payment.amount.toFixed(2)}</p>
          <p><strong>Opened by:</strong> ${isOwner ? "Owner" : "Renter"}</p>
          <p>AgriRent team will review this case and contact you within 24 hours if needed. Your payment is secure in escrow.</p>
          <p>Best regards,<br>AgriRent Team</p>
        `,
        text: `Dispute Opened\n\nA dispute has been opened for ${
          rental.machineId.name
        }.\nAmount: $${payment.amount.toFixed(
          2
        )}\nOur team will review and contact you within 24 hours. Payment is secure.`,
      });
      console.log(`✅ Email sent to other party`);
    } catch (emailError) {
      console.error("❌ Email error:", emailError.message);
    }

    // Send SMS notification
    const { sendNotificationSMS } = require("../services/smsService");
    if (sendNotificationSMS && otherParty?.phone) {
      try {
        await sendNotificationSMS(
          otherParty.phone,
          `AgriRent: A dispute was opened for ${rental.machineId.name}. Our team will contact you within 24 hours. Payment is secure.`
        );
        console.log(`✅ SMS sent to other party`);
      } catch (smsError) {
        console.error("❌ SMS error:", smsError.message);
      }
    }

    console.log(`✅ Dispute opened successfully`);

    res.json({
      success: true,
      message:
        "Dispute opened successfully. Our team will review within 24 hours.",
      data: { payment, rental },
    });
  } catch (error) {
    console.error("❌ Dispute error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});
// ============================================
// ADMIN: RESOLVE DISPUTE
// ============================================
router.post(
  "/admin/resolve-dispute/:paymentId",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const { paymentId } = req.params;
      const { outcome, resolution, refundAmount, releaseAmount } = req.body;

      if (!resolution || resolution.trim().length < 20) {
        return res.status(400).json({
          success: false,
          message: "Please provide detailed resolution (minimum 20 characters)",
        });
      }

      const validOutcomes = [
        "release_to_owner",
        "refund_to_renter",
        "partial_refund",
      ];
      if (!validOutcomes.includes(outcome)) {
        return res.status(400).json({
          success: false,
          message: "Invalid outcome",
        });
      }

      const payment = await Payment.findById(paymentId)
        .populate("userId", "firstName lastName email")
        .populate("ownerId", "firstName lastName email")
        .populate({
          path: "rentalId",
          populate: { path: "machineId", select: "name" },
        });

      if (!payment) {
        return res
          .status(404)
          .json({ success: false, message: "Payment not found" });
      }

      if (payment.escrowStatus !== "disputed") {
        return res.status(400).json({
          success: false,
          message: "Payment is not in disputed status",
        });
      }

      // Calculate platform fee
      const platformFeePercent = 10;
      const platformFee = (payment.amount * platformFeePercent) / 100;

      // Update dispute resolution
      payment.dispute.status = "resolved";
      payment.dispute.resolvedBy = req.user.id;
      payment.dispute.resolvedAt = new Date();
      payment.dispute.outcome = outcome;
      payment.dispute.resolution = resolution.trim();
      payment.escrowTimeline = payment.escrowTimeline || {};
      payment.escrowTimeline.resolvedAt = new Date();

      let renterMessage = "";
      let ownerMessage = "";

      // Handle different outcomes
      switch (outcome) {
        case "release_to_owner":
          payment.escrowStatus = "released";
          payment.status = "completed";
          payment.payout = {
            amount: payment.amount - platformFee,
            status: "completed",
            payoutAt: new Date(),
          };
          payment.platformFee = {
            percentage: platformFeePercent,
            amount: platformFee,
            deductedAt: new Date(),
          };

          renterMessage = `The dispute was resolved in favor of the owner. Payment of ${payment.amount.toFixed(
            2
          )} has been released.`;
          ownerMessage = `The dispute was resolved in your favor! Payment released: ${(
            payment.amount - platformFee
          ).toFixed(2)} (after 10% platform fee).`;
          break;

        case "refund_to_renter":
          payment.escrowStatus = "refunded";
          payment.status = "refunded";
          payment.refund = {
            amount: payment.amount,
            reason: "Dispute resolved - full refund",
            refundedAt: new Date(),
          };

          renterMessage = `The dispute was resolved in your favor. Full refund of ${payment.amount.toFixed(
            2
          )} has been processed.`;
          ownerMessage = `The dispute was resolved in favor of the renter. Payment has been refunded.`;
          break;

        case "partial_refund":
          if (!refundAmount || !releaseAmount) {
            return res.status(400).json({
              success: false,
              message: "Refund and release amounts required for partial refund",
            });
          }

          if (refundAmount + releaseAmount !== payment.amount) {
            return res.status(400).json({
              success: false,
              message: `Amounts must total ${payment.amount.toFixed(2)}`,
            });
          }

          payment.escrowStatus = "refunded";
          payment.status = "completed";
          payment.dispute.refundAmount = refundAmount;
          payment.dispute.releaseAmount = releaseAmount;

          const ownerNet =
            releaseAmount - (releaseAmount * platformFeePercent) / 100;

          payment.refund = {
            amount: refundAmount,
            reason: "Dispute resolved - partial refund",
            refundedAt: new Date(),
          };
          payment.payout = {
            amount: ownerNet,
            status: "completed",
            payoutAt: new Date(),
          };
          payment.platformFee = {
            percentage: platformFeePercent,
            amount: (releaseAmount * platformFeePercent) / 100,
            deductedAt: new Date(),
          };

          renterMessage = `The dispute was resolved with a partial refund. You will receive ${refundAmount.toFixed(
            2
          )}.`;
          ownerMessage = `The dispute was resolved with partial payment. You will receive ${ownerNet.toFixed(
            2
          )} (after platform fee).`;
          break;
      }

      await payment.save();

      // Update rental
      const rental = await Rental.findById(payment.rentalId);
      if (rental) {
        rental.status = "completed";
        await rental.save();

        // Update machine back to available
        if (rental.machineId) {
          await Machine.findByIdAndUpdate(rental.machineId, {
            availability: "available",
          });
        }
      }

      // Send emails
      await sendEmail({
        to: payment.userId.email,
        subject: "Dispute Resolved",
        html: `
          <h2>Dispute Resolution</h2>
          <p>Hi ${payment.userId.firstName},</p>
          <p>${renterMessage}</p>
          <p><strong>Resolution:</strong></p>
          <p>${resolution}</p>
          <p>Thank you for using AgriRent.</p>
        `,
      });

      await sendEmail({
        to: payment.ownerId.email,
        subject: "Dispute Resolved",
        html: `
          <h2>Dispute Resolution</h2>
          <p>Hi ${payment.ownerId.firstName},</p>
          <p>${ownerMessage}</p>
          <p><strong>Resolution:</strong></p>
          <p>${resolution}</p>
          <p>Thank you for using AgriRent.</p>
        `,
      });

      res.json({
        success: true,
        message: "Dispute resolved successfully",
        data: payment,
      });
    } catch (error) {
      console.error("Resolve dispute error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// ============================================
// ORANGE MONEY: INITIATE PAYMENT
// ============================================
router.post(
  "/orange-money/init-payment/:rentalId",
  protect,
  async (req, res) => {
    try {
      const { rentalId } = req.params;

      const rental = await Rental.findById(rentalId)
        .populate("machineId")
        .populate("renterId")
        .populate("ownerId");

      if (!rental) {
        return res
          .status(404)
          .json({ success: false, message: "Rental not found" });
      }

      if (rental.renterId._id.toString() !== req.user.id) {
        return res
          .status(403)
          .json({ success: false, message: "Not authorized" });
      }

      if (rental.status !== "approved") {
        return res.status(400).json({
          success: false,
          message: "Rental must be approved first",
        });
      }

      const amount = rental.pricing?.totalPrice || 0;

      // Initialize Orange Money payment
      const paymentResult = await orangeMoneyService.initPayment({
        amount: amount,
        currency: "CDF",
        orderRef: `RENTAL-${rentalId}`,
        customerPhone: rental.renterId.phone,
        description: `Rental: ${rental.machineId?.name}`,
      });

      // Create payment record
      const payment = await Payment.create({
        rentalId,
        userId: rental.renterId._id,
        ownerId: rental.ownerId._id,
        amount: amount,
        currency: "CDF",
        method: "orange_money",
        transactionId: paymentResult.transactionId,
        status: "pending",
        escrowStatus: "pending",
      });

      res.json({
        success: true,
        data: {
          paymentId: payment._id,
          paymentUrl: paymentResult.paymentUrl,
        },
      });
    } catch (error) {
      console.error("Orange Money init error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// ============================================
// ORANGE MONEY: WEBHOOK
// ============================================
router.post("/orange-money-webhook", async (req, res) => {
  try {
    const payload = req.body;
    console.log("📥 Orange Money webhook:", payload);

    const { order_id, status, notif_token } = payload;

    if (status === "SUCCESS" || status === "SUCCESSFUL") {
      const rentalId = order_id.replace("RENTAL-", "");

      const payment = await Payment.findOne({
        rentalId,
        transactionId: notif_token,
      });

      if (payment) {
        payment.status = "completed";
        payment.escrowStatus = "held";
        payment.escrowTimeline = payment.escrowTimeline || {};
        payment.escrowTimeline.paidAt = new Date();
        payment.escrowTimeline.heldAt = new Date();
        await payment.save();

        await Rental.findByIdAndUpdate(rentalId, {
          status: "active",
          "payment.status": "held_in_escrow",
          "payment.transactionId": notif_token,
          "payment.method": "orange_money",
          "payment.amount": payment.amount,
          "payment.paidAt": new Date(),
        });

        console.log("✅ Orange Money payment confirmed");
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// MTN MONEY: INITIATE PAYMENT
// ============================================
router.post("/mtn-money/init-payment/:rentalId", protect, async (req, res) => {
  try {
    const { rentalId } = req.params;
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    const rental = await Rental.findById(rentalId)
      .populate("machineId")
      .populate("renterId")
      .populate("ownerId");

    if (!rental) {
      return res
        .status(404)
        .json({ success: false, message: "Rental not found" });
    }

    if (rental.renterId._id.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }

    if (rental.status !== "approved") {
      return res.status(400).json({
        success: false,
        message: "Rental must be approved first",
      });
    }

    const amount = rental.pricing?.totalPrice || 0;
    const transactionId = `MTN-${Date.now()}-${rentalId}`;

    // TODO: Integrate with actual MTN Money API
    // For now, create a pending payment record
    const payment = await Payment.create({
      rentalId,
      userId: rental.renterId._id,
      ownerId: rental.ownerId._id,
      amount: amount,
      currency: "CDF", // or your currency
      method: "mtn",
      transactionId: transactionId,
      status: "pending",
      escrowStatus: "pending",
      metadata: {
        phone: phone,
        provider: "MTN Mobile Money",
      },
    });

    // TODO: Replace this with actual MTN Money API call
    // Example placeholder response:
    res.json({
      success: true,
      message:
        "MTN Money payment initiated. Please complete payment on your phone.",
      data: {
        paymentId: payment._id,
        transactionId: transactionId,
        amount: amount,
        phone: phone,
        // In production, you'd return a payment URL or instructions
        instructions: "Check your phone for MTN Mobile Money payment prompt",
      },
    });
  } catch (error) {
    console.error("MTN Money init error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// MTN MONEY: WEBHOOK/CALLBACK
// ============================================
router.post("/mtn-money-webhook", async (req, res) => {
  try {
    const payload = req.body;
    console.log("📥 MTN Money webhook:", payload);

    // TODO: Verify webhook signature from MTN
    // TODO: Parse MTN webhook payload format

    const { transactionId, status } = payload; // Adjust based on actual MTN webhook format

    if (status === "SUCCESSFUL" || status === "SUCCESS") {
      const payment = await Payment.findOne({ transactionId });

      if (payment) {
        payment.status = "completed";
        payment.escrowStatus = "held";
        payment.escrowTimeline = payment.escrowTimeline || {};
        payment.escrowTimeline.paidAt = new Date();
        payment.escrowTimeline.heldAt = new Date();
        await payment.save();

        await Rental.findByIdAndUpdate(payment.rentalId, {
          status: "active",
          "payment.status": "held_in_escrow",
          "payment.transactionId": transactionId,
          "payment.method": "mtn",
          "payment.amount": payment.amount,
          "payment.paidAt": new Date(),
        });

        console.log("✅ MTN Money payment confirmed");
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("MTN webhook error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// MOOV MONEY: INITIATE PAYMENT
// ============================================
router.post("/moov-money/init-payment/:rentalId", protect, async (req, res) => {
  try {
    const { rentalId } = req.params;
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    const rental = await Rental.findById(rentalId)
      .populate("machineId")
      .populate("renterId")
      .populate("ownerId");

    if (!rental) {
      return res
        .status(404)
        .json({ success: false, message: "Rental not found" });
    }

    if (rental.renterId._id.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }

    if (rental.status !== "approved") {
      return res.status(400).json({
        success: false,
        message: "Rental must be approved first",
      });
    }

    const amount = rental.pricing?.totalPrice || 0;
    const transactionId = `MOOV-${Date.now()}-${rentalId}`;

    // TODO: Integrate with actual Moov Money API
    const payment = await Payment.create({
      rentalId,
      userId: rental.renterId._id,
      ownerId: rental.ownerId._id,
      amount: amount,
      currency: "CDF", // or your currency
      method: "moov",
      transactionId: transactionId,
      status: "pending",
      escrowStatus: "pending",
      metadata: {
        phone: phone,
        provider: "Moov Money",
      },
    });

    // TODO: Replace with actual Moov Money API call
    res.json({
      success: true,
      message:
        "Moov Money payment initiated. Please complete payment on your phone.",
      data: {
        paymentId: payment._id,
        transactionId: transactionId,
        amount: amount,
        phone: phone,
        instructions: "Check your phone for Moov Money payment prompt",
      },
    });
  } catch (error) {
    console.error("Moov Money init error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// MOOV MONEY: WEBHOOK/CALLBACK
// ============================================
router.post("/moov-money-webhook", async (req, res) => {
  try {
    const payload = req.body;
    console.log("📥 Moov Money webhook:", payload);

    // TODO: Verify webhook signature from Moov
    // TODO: Parse Moov webhook payload format

    const { transactionId, status } = payload; // Adjust based on actual Moov webhook format

    if (status === "SUCCESSFUL" || status === "SUCCESS") {
      const payment = await Payment.findOne({ transactionId });

      if (payment) {
        payment.status = "completed";
        payment.escrowStatus = "held";
        payment.escrowTimeline = payment.escrowTimeline || {};
        payment.escrowTimeline.paidAt = new Date();
        payment.escrowTimeline.heldAt = new Date();
        await payment.save();

        await Rental.findByIdAndUpdate(payment.rentalId, {
          status: "active",
          "payment.status": "held_in_escrow",
          "payment.transactionId": transactionId,
          "payment.method": "moov",
          "payment.amount": payment.amount,
          "payment.paidAt": new Date(),
        });

        console.log("✅ Moov Money payment confirmed");
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Moov webhook error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// VERIFY MOBILE MONEY PAYMENT STATUS
// ============================================
router.get("/mobile-money/status/:transactionId", protect, async (req, res) => {
  try {
    const { transactionId } = req.params;

    const payment = await Payment.findOne({ transactionId })
      .populate("userId", "firstName lastName email")
      .populate("ownerId", "firstName lastName email");

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // Check if user is authorized to view this payment
    if (
      payment.userId._id.toString() !== req.user.id &&
      payment.ownerId._id.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this payment",
      });
    }

    res.json({
      success: true,
      data: {
        transactionId: payment.transactionId,
        method: payment.method,
        status: payment.status,
        escrowStatus: payment.escrowStatus,
        amount: payment.amount,
        currency: payment.currency,
        createdAt: payment.createdAt,
        metadata: payment.metadata,
      },
    });
  } catch (error) {
    console.error("Check payment status error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// ADMIN: RELEASE PAYMENT (Requires BOTH confirmations)
// ============================================
router.post(
  "/admin/release/:rentalId",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const { rentalId } = req.params;
      const { adminNote } = req.body;

      console.log(
        `🔍 Admin attempting to release payment for rental: ${rentalId}`
      );

      // Validation
      if (!adminNote || adminNote.length < 10) {
        return res.status(400).json({
          success: false,
          message: "Admin verification note required (minimum 10 characters)",
        });
      }

      // Find rental
      const rental = await Rental.findById(rentalId)
        .populate("renterId", "firstName lastName email phone")
        .populate("ownerId", "firstName lastName email phone")
        .populate("machineId", "name category");

      if (!rental) {
        return res.status(404).json({
          success: false,
          message: "Rental not found",
        });
      }

      console.log(`📊 Current rental status: ${rental.status}`);
      console.log(`💳 Payment status: ${rental.payment?.status}`);
      console.log(`✅ Owner confirmed: ${rental.ownerConfirmedCompletion}`);
      console.log(`✅ Renter confirmed: ${rental.renterConfirmedCompletion}`);

      // Verify payment is in escrow
      if (rental.payment?.status !== "held_in_escrow") {
        return res.status(400).json({
          success: false,
          message: `Payment is not in escrow. Current status: ${
            rental.payment?.status || "none"
          }`,
        });
      }

      // ✅ VERIFY OWNER CONFIRMED
      if (!rental.ownerConfirmedCompletion) {
        return res.status(400).json({
          success: false,
          message: "❌ Owner has not confirmed completion yet",
        });
      }

      // ✅ VERIFY RENTER CONFIRMED
      if (!rental.renterConfirmedCompletion) {
        return res.status(400).json({
          success: false,
          message: "❌ Renter has not confirmed completion yet",
        });
      }

      // ✅ VERIFY STATUS IS 'RELEASED'
      if (rental.status !== "released") {
        return res.status(400).json({
          success: false,
          message: `Cannot release payment. Rental must be 'released' status. Current: ${rental.status}`,
        });
      }

      // Calculate amounts
      const amount = rental.pricing?.totalPrice || 0;
      const platformFee = amount * 0.1;
      const ownerPayout = amount - platformFee;

      console.log(`💰 Amount: $${amount}`);
      console.log(`💳 Platform fee (10%): $${platformFee}`);
      console.log(`👤 Owner payout (90%): $${ownerPayout}`);

      // Update Payment document if it exists
      const payment = await Payment.findOne({ rentalId });
      if (payment) {
        payment.status = "completed";
        payment.escrowStatus = "released";
        payment.escrowTimeline = payment.escrowTimeline || {};
        payment.escrowTimeline.releasedAt = new Date();
        payment.confirmations = payment.confirmations || {};
        payment.confirmations.adminVerified = true;
        payment.confirmations.adminVerifiedAt = new Date();
        payment.confirmations.adminVerifiedBy = req.user._id;
        payment.confirmations.adminNote = adminNote;
        payment.platformFee = {
          percentage: 10,
          amount: platformFee,
          deductedAt: new Date(),
        };
        payment.payout = {
          amount: ownerPayout,
          status: "completed",
          payoutAt: new Date(),
        };
        await payment.save();
        console.log(`✅ Payment document updated`);
      }

      // ✅ Update rental - set to "closed" NOT "finished"
      rental.status = "closed";
      rental.payment.status = "completed";
      rental.payment.releasedAt = new Date();
      rental.payment.releasedBy = req.user._id;
      rental.payment.adminNote = adminNote;
      rental.payment.platformFee = platformFee;
      rental.payment.ownerPayout = ownerPayout;

      await rental.save();

      console.log(`✅ Rental status updated to: ${rental.status}`);

      // Send SMS notification to owner
      try {
        if (sendNotificationSMS && rental.ownerId?.phone) {
          await sendNotificationSMS(
            rental.ownerId.phone,
            `AgriRent: Payment of $${ownerPayout.toFixed(2)} released for ${
              rental.machineId?.name
            }. Funds transferred.`
          );
          console.log(`✅ SMS sent to owner`);
        }
      } catch (smsError) {
        console.error("⚠️ SMS error:", smsError);
      }

      console.log(`✅ PAYMENT RELEASED SUCCESSFULLY:
      Rental: ${rentalId}
      Owner receives: $${ownerPayout.toFixed(2)}
      Platform earns: $${platformFee.toFixed(2)}
      Admin: ${req.user.email}
      Status: closed
    `);

      res.json({
        success: true,
        message: "Payment released successfully",
        data: {
          rental,
          payment,
          ownerPayout,
          platformFee,
          releasedAt: rental.payment.releasedAt,
        },
      });
    } catch (error) {
      console.error("❌ Release error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to release payment",
        error: error.message,
      });
    }
  }
);

// ============================================
// ADMIN: REJECT PAYMENT RELEASE
// ============================================
router.post(
  "/admin/reject/:rentalId",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const { rentalId } = req.params;
      const { reason } = req.body;

      console.log(
        `🔍 Admin attempting to reject payment release for rental: ${rentalId}`
      );

      // ✅ VALIDATE FIRST - Before any database changes or SMS
      if (!reason || reason.trim().length < 20) {
        return res.status(400).json({
          success: false,
          message: "Detailed rejection reason required (minimum 20 characters)",
        });
      }

      const rental = await Rental.findById(rentalId)
        .populate("renterId", "firstName lastName email phone")
        .populate("ownerId", "firstName lastName email phone")
        .populate("machineId", "name");

      if (!rental) {
        return res.status(404).json({
          success: false,
          message: "Rental not found",
        });
      }

      console.log(`📊 Current rental status: ${rental.status}`);
      console.log(`💳 Payment status: ${rental.payment?.status}`);

      // Verify payment is in escrow
      if (rental.payment?.status !== "held_in_escrow") {
        return res.status(400).json({
          success: false,
          message: `Cannot reject release. Payment status: ${
            rental.payment?.status || "none"
          }`,
        });
      }

      // ✅ Update rental with rejection
      rental.payment = rental.payment || {};
      rental.payment.releaseRejected = true;
      rental.payment.rejectionReason = reason.trim();
      rental.payment.rejectedAt = new Date();
      rental.payment.rejectedBy = req.user._id;

      // Reset BOTH confirmations so they can re-confirm
      rental.renterConfirmedCompletion = false;
      rental.ownerConfirmedCompletion = false;
      rental.renterConfirmationNote = null;
      rental.ownerConfirmationNote = null;

      // Keep status as "completed" or set back to "active"
      if (rental.status === "released") {
        rental.status = "completed"; // Back to completed, waiting for new confirmations
      }

      await rental.save();

      console.log(`✅ Rental updated with rejection`);

      // Update Payment collection
      const payment = await Payment.findOne({ rentalId });
      if (payment) {
        payment.metadata = payment.metadata || {};
        payment.metadata.adminRejected = true;
        payment.metadata.rejectionReason = reason.trim();
        payment.metadata.rejectedAt = new Date();
        payment.metadata.rejectedBy = req.user._id;
        await payment.save();
        console.log(`✅ Payment document updated with rejection`);
      }

      // ✅ SEND SMS AFTER validation and database updates
      try {
        if (sendNotificationSMS) {
          // Notify renter
          if (rental.renterId?.phone) {
            await sendNotificationSMS(
              rental.renterId.phone,
              `AgriRent: Payment release for ${
                rental.machineId?.name
              } was rejected by admin. Reason: ${reason.trim()}. Please re-confirm completion.`
            );
            console.log(`✅ SMS sent to renter`);
          }

          // Notify owner
          if (rental.ownerId?.phone) {
            await sendNotificationSMS(
              rental.ownerId.phone,
              `AgriRent: Payment release for ${
                rental.machineId?.name
              } was rejected by admin. Reason: ${reason.trim()}. Please re-confirm completion.`
            );
            console.log(`✅ SMS sent to owner`);
          }
        }
      } catch (smsError) {
        console.error("⚠️ SMS error:", smsError);
        // Don't fail the request if SMS fails
      }

      // ✅ Send email notifications
      try {
        // Email to renter
        if (rental.renterId?.email) {
          await sendEmail({
            to: rental.renterId.email,
            subject: "Payment Release Rejected - AgriRent",
            text: `Hello ${
              rental.renterId.firstName
            },\n\nThe payment release for ${
              rental.machineId?.name
            } has been rejected by our admin team.\n\nReason: ${reason.trim()}\n\nPlease review the service and re-confirm completion if appropriate.\n\nBest regards,\nAgriRent Team`,
          });
          console.log(`✅ Email sent to renter`);
        }

        // Email to owner
        if (rental.ownerId?.email) {
          await sendEmail({
            to: rental.ownerId.email,
            subject: "Payment Release Rejected - AgriRent",
            text: `Hello ${
              rental.ownerId.firstName
            },\n\nThe payment release for ${
              rental.machineId?.name
            } has been rejected by our admin team.\n\nReason: ${reason.trim()}\n\nPlease review and re-confirm completion if appropriate.\n\nBest regards,\nAgriRent Team`,
          });
          console.log(`✅ Email sent to owner`);
        }
      } catch (emailError) {
        console.error("⚠️ Email error:", emailError);
      }

      console.log(`❌ PAYMENT RELEASE REJECTED:
        Rental: ${rentalId}
        Machine: ${rental.machineId?.name}
        Reason: ${reason.trim()}
        Admin: ${req.user.email}
        Renter: ${rental.renterId?.email}
        Owner: ${rental.ownerId?.email}
      `);

      res.json({
        success: true,
        message:
          "Release rejected successfully. Both parties have been notified.",
        data: { rental, payment },
      });
    } catch (error) {
      console.error("❌ Reject error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to reject release",
        error: error.message,
      });
    }
  }
);
// RENTER: CONFIRM COMPLETION
router.post(
  "/rentals/:rentalId/confirm-completion",
  protect,
  async (req, res) => {
    try {
      const { rentalId } = req.params;
      const { confirmationNote } = req.body;

      if (!confirmationNote || confirmationNote.length < 10) {
        return res.status(400).json({
          success: false,
          message:
            "Detailed confirmation note required (minimum 10 characters)",
        });
      }

      const rental = await Rental.findById(rentalId)
        .populate("renterId", "firstName lastName email phone")
        .populate("ownerId", "firstName lastName email phone")
        .populate("machineId", "name");

      if (!rental) {
        return res.status(404).json({
          success: false,
          message: "Rental not found",
        });
      }

      if (rental.renterId._id.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: "Only the renter can confirm completion",
        });
      }

      if (rental.status !== "active") {
        return res.status(400).json({
          success: false,
          message: "Rental must be active to confirm",
        });
      }

      if (rental.payment?.status !== "held_in_escrow") {
        return res.status(400).json({
          success: false,
          message: "Payment must be in escrow",
        });
      }

      // Update rental with renter confirmation
      rental.renterConfirmedCompletion = true;
      rental.renterConfirmationNote = confirmationNote;
      rental.renterConfirmedAt = new Date();
      rental.status = "released";
      await rental.save();

      // Update Payment model
      const payment = await Payment.findOne({ rentalId });
      if (payment) {
        await payment.confirmByRenter(confirmationNote);
      }

      // ✅ CRITICAL: Make machine available immediately
      const Machine = require("../models/Machine");
      if (rental.machineId) {
        await Machine.findByIdAndUpdate(rental.machineId._id, {
          availability: "available",
        });
        console.log(`✅ Machine now available`);
      }

      res.json({
        success: true,
        message:
          "Completion confirmed! Machine is now available. Admin can now release payment.",
        data: { rental, payment },
      });
    } catch (error) {
      console.error("Confirm error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);
// ============================================
// OWNER: CONFIRM COMPLETION
// ============================================
router.post("/rentals/:rentalId/owner-confirm", protect, async (req, res) => {
  try {
    const { rentalId } = req.params;
    const { confirmationNote } = req.body;

    if (!confirmationNote || confirmationNote.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: "Detailed confirmation note required (minimum 10 characters)",
      });
    }

    const rental = await Rental.findById(rentalId)
      .populate("renterId", "firstName lastName email phone")
      .populate("ownerId", "firstName lastName email phone")
      .populate("machineId", "name");

    if (!rental) {
      return res.status(404).json({
        success: false,
        message: "Rental not found",
      });
    }

    // Verify user is the owner
    if (rental.ownerId._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Only the owner can confirm completion",
      });
    }

    // Verify rental is active
    if (rental.status !== "active") {
      return res.status(400).json({
        success: false,
        message: `Rental must be active to confirm. Current status: ${rental.status}`,
      });
    }

    // Verify payment in escrow
    if (rental.payment?.status !== "held_in_escrow") {
      return res.status(400).json({
        success: false,
        message: `Payment must be in escrow. Current status: ${
          rental.payment?.status || "none"
        }`,
      });
    }

    // Update rental with owner confirmation
    rental.ownerConfirmedCompletion = true;
    rental.ownerConfirmationNote = confirmationNote.trim();
    rental.ownerConfirmedAt = new Date();
    rental.status = "completed";
    rental.completedAt = new Date();

    await rental.save();

    // Update Payment model
    const payment = await Payment.findOne({ rentalId });
    if (payment) {
      payment.metadata = payment.metadata || {};
      payment.metadata.ownerConfirmed = true;
      payment.metadata.ownerConfirmationNote = confirmationNote.trim();
      payment.metadata.ownerConfirmedAt = new Date();
      await payment.save();
    }

    // Send SMS to renter
    if (rental.renterId?.phone && sendNotificationSMS) {
      try {
        const message = `AgriRent: Owner confirmed completion of "${rental.machineId?.name}". Please confirm to release payment.`;
        await sendNotificationSMS(rental.renterId.phone, message);
      } catch (smsError) {
        console.error("⚠️ SMS error:", smsError);
      }
    }

    console.log(`✅ Owner confirmed completion for rental ${rentalId}`);

    res.json({
      success: true,
      message: "Completion confirmed! Renter will be notified.",
      data: { rental },
    });
  } catch (error) {
    console.error("❌ Owner confirm error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to confirm completion",
      error: error.message,
    });
  }
});

// ============================================
// RENTER: CONFIRM COMPLETION WITH RATING
// ============================================
router.post("/rentals/:rentalId/renter-confirm", protect, async (req, res) => {
  try {
    const { rentalId } = req.params;
    const { confirmationNote, rating, reviewComment } = req.body;

    console.log(`📝 Renter confirming rental: ${rentalId}`);
    console.log(`⭐ Rating: ${rating}`);

    // Validate confirmation note
    if (!confirmationNote || confirmationNote.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: "Detailed confirmation note required (minimum 10 characters)",
      });
    }

    // ✅ Validate rating (REQUIRED)
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating is required (1-5 stars)",
      });
    }

    const rental = await Rental.findById(rentalId)
      .populate("renterId", "firstName lastName email phone")
      .populate("ownerId", "firstName lastName email phone")
      .populate("machineId", "name");

    if (!rental) {
      return res.status(404).json({
        success: false,
        message: "Rental not found",
      });
    }

    // Verify user is the renter
    if (rental.renterId._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Only the renter can confirm completion",
      });
    }

    // Verify rental is completed (owner already confirmed)
    if (rental.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: `Rental must be completed (owner confirmed) first. Current status: ${rental.status}`,
      });
    }

    // Verify owner already confirmed
    if (!rental.ownerConfirmedCompletion) {
      return res.status(400).json({
        success: false,
        message: "Owner must confirm completion first",
      });
    }

    // Verify payment in escrow
    if (rental.payment?.status !== "held_in_escrow") {
      return res.status(400).json({
        success: false,
        message: `Payment must be in escrow. Current status: ${
          rental.payment?.status || "none"
        }`,
      });
    }

    // ✅ Update rental with renter confirmation AND review
    rental.renterConfirmedCompletion = true;
    rental.renterConfirmationNote = confirmationNote.trim();
    rental.renterConfirmedAt = new Date();
    rental.status = "released"; // Ready for admin to release payment

    // ✅ Add review to rental
    rental.renterReview = {
      rating: Number(rating),
      comment: reviewComment?.trim() || confirmationNote.trim(),
      createdAt: new Date(),
    };

    await rental.save();

    console.log(`✅ Rental ${rentalId} status updated to: released`);

    // ✅ CRITICAL: Make machine available immediately
    const Machine = require("../models/Machine");
    const machineId = rental.machineId?._id || rental.machineId;

    console.log(`🔄 Updating machine ${machineId} to available...`);

    const machine = await Machine.findByIdAndUpdate(
      machineId,
      { availability: "available" },
      { new: true }
    );

    if (machine) {
      console.log(
        `✅ ✅ ✅ Machine "${machine.name}" is now AVAILABLE for new rentals!`
      );
      console.log(`📊 Machine availability: ${machine.availability}`);
    } else {
      console.error(`❌ Machine not found: ${machineId}`);
    }

    // ✅ Update machine's average rating
    if (machine) {
      // Get all completed rentals with reviews for this machine
      const reviewedRentals = await Rental.find({
        machineId: machine._id,
        status: { $in: ["released", "closed"] },
        "renterReview.rating": { $exists: true, $ne: null },
      });

      if (reviewedRentals.length > 0) {
        const totalRating = reviewedRentals.reduce(
          (sum, r) => sum + (r.renterReview?.rating || 0),
          0
        );
        const reviewCount = reviewedRentals.length;
        const averageRating = totalRating / reviewCount;

        machine.rating = {
          average: Math.round(averageRating * 10) / 10,
          count: reviewCount,
        };

        await machine.save();
        console.log(
          `✅ Machine rating updated: ${machine.rating.average} (${machine.rating.count} reviews)`
        );
      }
    }

    // Update Payment model
    const payment = await Payment.findOne({ rentalId });
    if (payment) {
      payment.metadata = payment.metadata || {};
      payment.metadata.renterConfirmed = true;
      payment.metadata.renterConfirmationNote = confirmationNote.trim();
      payment.metadata.renterConfirmedAt = new Date();
      payment.metadata.rating = Number(rating);
      payment.metadata.reviewComment =
        reviewComment?.trim() || confirmationNote.trim();
      await payment.save();
    }

    // ✅ Send SMS to owner
    if (rental.ownerId?.phone && sendNotificationSMS) {
      try {
        const stars = "⭐".repeat(Number(rating));
        const message = `AgriRent: ${rental.renterId.firstName} confirmed completion and rated ${stars} (${rating}/5) for "${rental.machineId?.name}". Payment will be released soon.`;
        await sendNotificationSMS(rental.ownerId.phone, message);
        console.log(`✅ SMS sent to owner`);
      } catch (smsError) {
        console.error("⚠️ SMS error:", smsError);
      }
    }

    console.log(`
    ✅ ✅ ✅ RENTER CONFIRMATION COMPLETE ✅ ✅ ✅
    - Rental ${rentalId} status: released
    - Rating: ${rating}⭐
    - Machine: NOW AVAILABLE for new bookings
    - Admin: Can now release payment when ready
    `);

    res.json({
      success: true,
      message: `Completion confirmed with ${rating}⭐ rating! Machine is now available. Admin will release payment soon.`,
      data: { rental },
    });
  } catch (error) {
    console.error("❌ Renter confirm error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to confirm completion",
      error: error.message,
    });
  }
});

// ✅ DEBUG: Log all registered routes
console.log("\n📋 Payment Routes Registered:");
router.stack.forEach((r) => {
  if (r.route) {
    const methods = Object.keys(r.route.methods).join(", ").toUpperCase();
    console.log(`${methods} /api/payments${r.route.path}`);
  }
});

// Get all active disputes for admin
router.get("/admin/disputes", protect, authorize("admin"), async (req, res) => {
  try {
    console.log("🔍 Fetching all active disputes...");

    const disputes = await Rental.find({
      status: "disputed",
    })
      .populate("renterId", "firstName lastName email phone")
      .populate("ownerId", "firstName lastName email phone")
      .populate("machineId", "name category images")
      .sort({ disputedAt: -1 })
      .lean(); // ✅ Use lean for better performance

    console.log(`📊 Found ${disputes.length} active disputes`);

    // Log first dispute to debug
    if (disputes.length > 0) {
      console.log("📋 First dispute data:", {
        id: disputes[0]._id,
        machineId: disputes[0].machineId,
        renterId: disputes[0].renterId,
        ownerId: disputes[0].ownerId,
        disputedAt: disputes[0].disputedAt,
        disputeReason: disputes[0].disputeReason,
        pricing: disputes[0].pricing,
      });
    }

    res.json({
      success: true,
      data: disputes,
      count: disputes.length,
    });
  } catch (error) {
    console.error("❌ Get disputes error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Admin resolves dispute
router.post(
  "/resolve-dispute/:rentalId",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const { rentalId } = req.params;
      const { resolutionType, ownerAmount, renterAmount, adminNotes } =
        req.body;

      console.log(`🔧 Resolving dispute for rental: ${rentalId}`);
      console.log(`Resolution type: ${resolutionType}`);

      // Validate inputs
      if (
        !resolutionType ||
        !["owner", "renter", "split"].includes(resolutionType)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid resolution type",
        });
      }

      if (!adminNotes || adminNotes.trim().length < 20) {
        return res.status(400).json({
          success: false,
          message: "Admin notes required (minimum 20 characters)",
        });
      }

      if (ownerAmount < 0 || renterAmount < 0) {
        return res.status(400).json({
          success: false,
          message: "Amounts cannot be negative",
        });
      }

      // Get rental with all details
      const rental = await Rental.findById(rentalId)
        .populate("renterId", "firstName lastName email phone")
        .populate("ownerId", "firstName lastName email phone")
        .populate("machineId", "name");

      if (!rental) {
        return res.status(404).json({
          success: false,
          message: "Rental not found",
        });
      }

      if (rental.status !== "disputed") {
        return res.status(400).json({
          success: false,
          message: "This rental is not disputed",
        });
      }

      const totalAmount = rental.pricing?.totalPrice || 0;
      const distributedAmount =
        parseFloat(ownerAmount) + parseFloat(renterAmount);

      // Validate amounts add up correctly
      if (Math.abs(distributedAmount - totalAmount) > 0.01) {
        return res.status(400).json({
          success: false,
          message: `Distributed amount ($${distributedAmount.toFixed(
            2
          )}) must equal rental amount ($${totalAmount.toFixed(2)})`,
        });
      }

      // ✅ Calculate platform fee (10% of owner's amount)
      const ownerAmountValue = parseFloat(ownerAmount);
      const platformFeePercent = 10;
      const platformFeeAmount = (ownerAmountValue * platformFeePercent) / 100;
      const ownerPayout = ownerAmountValue - platformFeeAmount;

      console.log(`💰 Owner amount: $${ownerAmountValue.toFixed(2)}`);
      console.log(`💰 Platform fee (10%): $${platformFeeAmount.toFixed(2)}`);
      console.log(`💰 Owner payout (90%): $${ownerPayout.toFixed(2)}`);
      console.log(`💰 Renter refund: $${parseFloat(renterAmount).toFixed(2)}`);

      // Get payment record
      const payment = await Payment.findOne({ rentalId });
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Payment record not found",
        });
      }

      // ✅ FIXED: Use 'released' instead of 'resolved'
      payment.escrowStatus = "released";
      payment.status = "completed";
      payment.dispute = payment.dispute || {};
      payment.dispute.resolvedAt = new Date();
      payment.dispute.resolvedBy = req.user.id;
      payment.dispute.resolutionType = resolutionType;
      payment.dispute.adminNotes = adminNotes.trim();
      payment.dispute.status = "resolved";

      // ✅ Add platform fee
      payment.platformFee = {
        percentage: platformFeePercent,
        amount: platformFeeAmount,
        deductedAt: new Date(),
      };

      // ✅ Add payout info
      payment.payout = {
        amount: ownerPayout,
        status: "completed",
        payoutAt: new Date(),
      };

      payment.resolution = {
        ownerAmount: ownerAmountValue,
        renterAmount: parseFloat(renterAmount),
        platformFee: platformFeeAmount,
        ownerPayout: ownerPayout,
        resolvedAt: new Date(),
        resolvedBy: req.user.id,
        notes: adminNotes.trim(),
      };

      await payment.save();
      console.log("✅ Payment updated");

      // Update rental status
      rental.status = "closed";
      rental.payment = rental.payment || {};
      rental.payment.status = "completed";
      rental.payment.releasedAt = new Date();
      rental.disputeResolution = {
        resolvedAt: new Date(),
        resolvedBy: req.user.id,
        resolutionType,
        ownerAmount: ownerAmountValue,
        renterAmount: parseFloat(renterAmount),
        platformFee: platformFeeAmount,
        ownerPayout: ownerPayout,
        adminNotes: adminNotes.trim(),
      };
      await rental.save();
      console.log("✅ Rental updated to closed");

      // Set machine back to available
      const Machine = require("../models/Machine");
      await Machine.findByIdAndUpdate(rental.machineId._id, {
        availability: "available",
      });
      console.log(`✅ Machine set back to available`);

      // Prepare notification content
      const { sendEmail } = require("../utils/notifications");
      const { sendNotificationSMS } = require("../services/smsService");

      const resolutionSummary = {
        owner: `The owner will receive the full payment (minus 10% platform fee).`,
        renter: "The renter will receive a full refund.",
        split: `Payment split: Owner receives $${ownerPayout.toFixed(
          2
        )} (after 10% fee), Renter receives $${parseFloat(renterAmount).toFixed(
          2
        )} refund.`,
      };

      // ✅ Notify Owner
      try {
        await sendEmail({
          to: rental.ownerId.email,
          subject: "✅ Dispute Resolved - AgriRent",
          html: `
            <h2>✅ Dispute Resolved</h2>
            <p>Hello ${rental.ownerId.firstName},</p>
            <p>The dispute for <strong>${
              rental.machineId.name
            }</strong> has been resolved by our admin team.</p>
            
            <div style="background: #f3f4f6; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <h3 style="margin-top: 0;">💰 Resolution Details:</h3>
              <p><strong>Total amount:</strong> $${ownerAmountValue.toFixed(
                2
              )}</p>
              <p><strong>Platform fee (10%):</strong> -$${platformFeeAmount.toFixed(
                2
              )}</p>
              <p><strong>Your payout:</strong> $${ownerPayout.toFixed(2)}</p>
            </div>

            <div style="background: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; margin: 20px 0;">
              <p style="margin: 0;"><strong>📝 Admin Decision:</strong></p>
              <p style="margin: 10px 0 0 0;">${adminNotes.trim()}</p>
            </div>

            ${
              ownerPayout > 0
                ? `<p>Your payment of $${ownerPayout.toFixed(
                    2
                  )} will be processed within 2-5 business days.</p>`
                : `<p>No payment will be released for this rental.</p>`
            }

            <p>Thank you for using AgriRent!</p>
            <p>Best regards,<br>AgriRent Team</p>
          `,
          text: `Dispute Resolved\n\nHello ${
            rental.ownerId.firstName
          },\n\nThe dispute for ${
            rental.machineId.name
          } has been resolved.\n\nYour payout: $${ownerPayout.toFixed(
            2
          )} (after 10% platform fee)\n\nAdmin Decision: ${adminNotes.trim()}\n\nThank you for using AgriRent!`,
        });

        if (sendNotificationSMS && rental.ownerId.phone) {
          await sendNotificationSMS(
            rental.ownerId.phone,
            `AgriRent: Dispute resolved for ${
              rental.machineId.name
            }. You will receive $${ownerPayout.toFixed(
              2
            )} (after 10% fee). Check your email for details.`
          );
        }

        console.log(`✅ Owner notified`);
      } catch (error) {
        console.error("❌ Owner notification error:", error.message);
      }

      // ✅ Notify Renter
      try {
        await sendEmail({
          to: rental.renterId.email,
          subject: "✅ Dispute Resolved - AgriRent",
          html: `
            <h2>✅ Dispute Resolved</h2>
            <p>Hello ${rental.renterId.firstName},</p>
            <p>The dispute for <strong>${
              rental.machineId.name
            }</strong> has been resolved by our admin team.</p>
            
            <div style="background: #f3f4f6; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <h3 style="margin-top: 0;">💰 Resolution Details:</h3>
              <p><strong>Your refund:</strong> $${parseFloat(
                renterAmount
              ).toFixed(2)}</p>
              <p><strong>Decision:</strong> ${
                resolutionSummary[resolutionType]
              }</p>
            </div>

            <div style="background: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; margin: 20px 0;">
              <p style="margin: 0;"><strong>📝 Admin Decision:</strong></p>
              <p style="margin: 10px 0 0 0;">${adminNotes.trim()}</p>
            </div>

            ${
              parseFloat(renterAmount) > 0
                ? `<p>Your refund of $${parseFloat(renterAmount).toFixed(
                    2
                  )} will be processed within 2-5 business days.</p>`
                : `<p>No refund will be issued for this rental.</p>`
            }

            <p>Thank you for using AgriRent!</p>
            <p>Best regards,<br>AgriRent Team</p>
          `,
          text: `Dispute Resolved\n\nHello ${
            rental.renterId.firstName
          },\n\nThe dispute for ${
            rental.machineId.name
          } has been resolved.\n\nYour refund: $${parseFloat(
            renterAmount
          ).toFixed(
            2
          )}\n\nAdmin Decision: ${adminNotes.trim()}\n\nThank you for using AgriRent!`,
        });

        if (sendNotificationSMS && rental.renterId.phone) {
          await sendNotificationSMS(
            rental.renterId.phone,
            `AgriRent: Dispute resolved for ${
              rental.machineId.name
            }. You will receive $${parseFloat(renterAmount).toFixed(
              2
            )} refund. Check your email for details.`
          );
        }

        console.log(`✅ Renter notified`);
      } catch (error) {
        console.error("❌ Renter notification error:", error.message);
      }

      console.log(`✅ Dispute resolved successfully`);

      res.json({
        success: true,
        message:
          "Dispute resolved successfully. Both parties have been notified.",
        data: {
          rental,
          payment,
          resolution: {
            ownerAmount: ownerAmountValue,
            platformFee: platformFeeAmount,
            ownerPayout: ownerPayout,
            renterAmount: parseFloat(renterAmount),
            type: resolutionType,
          },
        },
      });
    } catch (error) {
      console.error("❌ Resolve dispute error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to resolve dispute",
        error: error.message,
      });
    }
  }
);

module.exports = router;
