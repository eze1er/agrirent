const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const Payment = require("../models/Payment");
const Rental = require("../models/Rental");
const User = require("../models/User");
const Machine = require("../models/Machine");
const { sendEmail } = require("../services/emailService");
const { sendSMS } = require("../services/smsService");

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
        paidAt: rental.payment?.paidAt
      },
      payment: payment ? {
        id: payment._id,
        status: payment.status,
        escrowStatus: payment.escrowStatus,
        transactionId: payment.transactionId,
        amount: payment.amount
      } : null
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
            message: "Rental not found"
          });
        }
        
        // Find or create payment record
        let payment = await Payment.findOne({ rentalId });

        if (!payment) {
          payment = await Payment.create({
            rentalId,
            userId: rental.renterId._id,        // ✅ ADD THIS
            ownerId: rental.ownerId._id,        // ✅ ADD THIS
            amount: session.amount_total / 100,
            currency: session.currency || "usd", // ✅ ADD THIS
            method: "stripe",                    // ✅ ADD THIS
            transactionId: session.payment_intent,
            status: "completed",
            escrowStatus: "held",
            escrowTimeline: {
              paidAt: new Date(),
              heldAt: new Date()
            }
          });
          console.log("Payment record created:", payment._id);
        } else {
          payment.status = "completed";
          payment.escrowStatus = "held";
          payment.transactionId = session.payment_intent;
          payment.method = "stripe";           // ✅ ADD THIS
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
            paymentDate: new Date()
          },
          { new: true }
        ).populate("renterId").populate("ownerId").populate("machineId");

        console.log("Rental status updated to:", updatedRental.status);

        res.json({
          success: true,
          paid: true,
          rental: {
            id: updatedRental._id,
            status: updatedRental.status,
            paymentStatus: "held_in_escrow"
          },
          payment: {
            id: payment._id,
            escrowStatus: payment.escrowStatus
          }
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
      renterConfirmed: rental.confirmations?.renterConfirmed
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
// ADMIN: GET PENDING PAYMENTS FOR DASHBOARD
// ============================================
router.get(
  "/admin/pending-payments",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const pendingPayments = await Rental.find({
        status: "active",
        "payment.status": "held_in_escrow"
      })
        .populate("renterId", "firstName lastName email")
        .populate("ownerId", "firstName lastName email")
        .populate("machineId", "name")
        .select("-password")
        .sort({ "payment.paidAt": -1 });

      console.log("Found pending payments:", pendingPayments.length);

      res.json({
        success: true,
        count: pendingPayments.length,
        data: pendingPayments.map(rental => ({
          _id: rental._id,
          rentalId: rental._id,
          machineName: rental.machineId?.name,
          renterName: `${rental.renterId?.firstName} ${rental.renterId?.lastName}`,
          renterEmail: rental.renterId?.email,
          ownerName: `${rental.ownerId?.firstName} ${rental.ownerId?.lastName}`,
          ownerEmail: rental.ownerId?.email,
          amount: rental.payment?.amount,
          paymentStatus: rental.payment?.status,
          rentalStatus: rental.status,
          paidAt: rental.payment?.paidAt,
          endDate: rental.endDate,
          ownerConfirmed: rental.confirmations?.ownerConfirmed,
          renterConfirmed: rental.confirmations?.renterConfirmed
        }))
      });
    } catch (error) {
      console.error("Error fetching pending payments:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// ============================================
// OWNER: MARK RENTAL AS COMPLETE
// ============================================
router.post("/owner/mark-complete/:rentalId", protect, async (req, res) => {
  try {
    const { rentalId } = req.params;
    const { completionNote } = req.body;

    const rental = await Rental.findById(rentalId)
      .populate("ownerId", "firstName lastName phoneNumber")
      .populate("renterId", "firstName lastName phoneNumber")
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
    if (rental.renterId?.phoneNumber) {
      try {
        const message = `AgriRent: The owner has marked your rental of "${rental.machineId?.name}" as complete. Please confirm in the app to release payment of $${payment.amount.toFixed(2)}.`;
        
        await sendSMS(rental.renterId.phoneNumber, message);
        console.log("✅ SMS sent to renter:", rental.renterId.phoneNumber);
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
      data: rental
    });
  } catch (error) {
    console.error("Mark complete error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// REPLACE the /confirm-completion route
// At the top of paymentRoutes.js, ADD this import (keep existing imports):
// const { sendNotificationSMS } = require("../services/smsService");

// REPLACE the /owner/mark-complete route
// At the top of paymentRoutes.js, ADD this import (keep existing imports):
const { sendNotificationSMS } = require("../services/smsService");

// REPLACE the /owner/mark-complete route
router.post("/owner/mark-complete/:rentalId", protect, async (req, res) => {
  try {
    const { rentalId } = req.params;
    const { completionNote } = req.body;

    const rental = await Rental.findById(rentalId)
      .populate("ownerId", "firstName lastName phoneNumber")
      .populate("renterId", "firstName lastName phoneNumber")
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
    if (rental.renterId?.phoneNumber) {
      try {
        const message = `AgriRent: The owner has marked your rental of "${rental.machineId?.name}" as complete. Please confirm in the app to release payment of $${payment.amount.toFixed(2)}.`;
        
        await sendSMS(rental.renterId.phoneNumber, message);
        console.log("✅ SMS sent to renter:", rental.renterId.phoneNumber);
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
      data: rental
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
      .populate("ownerId", "firstName lastName phoneNumber")
      .populate("renterId", "firstName lastName phoneNumber")
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
    if (rental.ownerId?.phoneNumber) {
      try {
        const message = `AgriRent: The renter has confirmed completion of rental "${rental.machineId?.name}". Your payment of $${payment.amount.toFixed(2)} will be released within 24-48 hours.`;
        
        await sendSMS(rental.ownerId.phoneNumber, message);
        console.log("✅ SMS sent to owner:", rental.ownerId.phoneNumber);
      } catch (smsError) {
        console.error("⚠️ Failed to send SMS to owner:", smsError.message);
      }
    } else {
      console.warn("⚠️ No phone number found for owner");
    }

    // ✅ SEND SMS to admin (if admin phone is configured)
    if (process.env.ADMIN_PHONE) {
      try {
        const adminMessage = `AgriRent Admin: Payment release request. Rental ID: ${rental._id}, Amount: $${payment.amount.toFixed(2)}, Machine: ${rental.machineId?.name}`;
        
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

      if (payment.escrowStatus !== "held") {
        return res.status(400).json({
          success: false,
          message: "Payment is not in escrow",
        });
      }

      if (!payment.confirmations?.renterConfirmed) {
        return res.status(400).json({
          success: false,
          message: "Renter has not confirmed yet",
        });
      }

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

        // Update machine back to available
        if (rental.machineId) {
          await Machine.findByIdAndUpdate(rental.machineId, {
            availability: "available",
          });
          console.log("Machine set back to available");
        }
      }

      // Notify owner
      await sendEmail({
        to: payment.ownerId.email,
        subject: "Payment Released!",
        html: `
          <h2>Your Payment Has Been Released!</h2>
          <p>Great news! Your payment has been released.</p>
          <p><strong>Total Amount:</strong> $${payment.amount.toFixed(2)}</p>
          <p><strong>Platform Fee (10%):</strong> -$${platformFeeAmount.toFixed(
            2
          )}</p>
          <p><strong>Your Payout:</strong> $${ownerAmount.toFixed(2)}</p>
          <p><strong>Machine:</strong> ${rental.machineId?.name || "N/A"}</p>
          <p>Thank you for using AgriRent!</p>
        `,
      });

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
    const { reason } = req.body;

    if (!reason || reason.trim().length < 20) {
      return res.status(400).json({
        success: false,
        message: "Please provide a detailed reason (minimum 20 characters)",
      });
    }

    const rental = await Rental.findById(rentalId)
      .populate("ownerId", "firstName lastName email")
      .populate("renterId", "firstName lastName email")
      .populate("machineId", "name");

    if (!rental) {
      return res
        .status(404)
        .json({ success: false, message: "Rental not found" });
    }

    if (rental.renterId._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Only the renter can open a dispute",
      });
    }

    if (rental.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Can only dispute completed rentals",
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
        message: "Payment must be in escrow to open dispute",
      });
    }

    // Update payment to disputed
    payment.escrowStatus = "disputed";
    payment.dispute = {
      isDisputed: true,
      openedBy: req.user.id,
      openedAt: new Date(),
      reason: reason.trim(),
      status: "open",
    };
    payment.escrowTimeline = payment.escrowTimeline || {};
    payment.escrowTimeline.disputedAt = new Date();
    await payment.save();

    // Update rental status
    rental.status = "disputed";
    await rental.save();

    // Notify admin
    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: "New Dispute Opened - Action Required",
      html: `
        <h2>New Dispute Opened</h2>
        <p><strong>Rental ID:</strong> ${rental._id}</p>
        <p><strong>Machine:</strong> ${rental.machineId.name}</p>
        <p><strong>Amount:</strong> $${payment.amount.toFixed(2)}</p>
        <p><strong>Opened by:</strong> ${rental.renterId.firstName} ${
        rental.renterId.lastName
      } (Renter)</p>
        <p><strong>Reason:</strong></p>
        <p>${reason}</p>
        <p>Please review and resolve this dispute in the admin dashboard.</p>
      `,
    });

    // Notify owner
    await sendEmail({
      to: rental.ownerId.email,
      subject: "Dispute Opened for Your Rental",
      html: `
        <h2>Dispute Notification</h2>
        <p>A dispute has been opened for your rental.</p>
        <p><strong>Machine:</strong> ${rental.machineId.name}</p>
        <p><strong>Amount:</strong> $${payment.amount.toFixed(2)}</p>
        <p>AgriRent team will review this case and contact you if needed. Your payment is secure.</p>
      `,
    });

    res.json({
      success: true,
      message:
        "Dispute opened successfully. Our team will review within 24 hours.",
      data: payment,
    });
  } catch (error) {
    console.error("Dispute error:", error);
    res.status(500).json({ success: false, message: error.message });
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

module.exports = router;