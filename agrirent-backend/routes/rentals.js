const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const Rental = require("../models/Rental");
const Machine = require("../models/Machine");
const User = require("../models/User");
const Payment = require("../models/Payment");
const Notification = require("../models/Notification");
const { sendEmail } = require("../services/emailService");
const twilio = require("twilio");
const { sendNotificationSMS } = require("../services/smsService");

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Helper function to create notification
const createNotification = async (
  userId,
  type,
  title,
  message,
  relatedId,
  relatedModel
) => {
  try {
    await Notification.create({
      userId,
      type,
      title,
      message,
      relatedId,
      relatedModel,
    });
  } catch (error) {
    console.error("Failed to create notification:", error);
  }
};

// Get all rentals for current user
router.get("/", protect, async (req, res) => {
  try {
    const rentals = await Rental.find({
      $or: [{ renterId: req.user.id }, { ownerId: req.user.id }],
    })
      .populate(
        "machineId",
        "name images pricePerDay pricePerHectare category rating"
      )
      .populate("renterId", "firstName lastName email")
      .populate("ownerId", "firstName lastName email")
      .sort({ createdAt: -1 });

    res.json({ success: true, data: rentals });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create rental request
router.post("/", protect, async (req, res) => {
  try {
    const {
      machineId,
      rentalType,
      startDate,
      endDate,
      hectares,
      workDate,
      fieldLocation,
    } = req.body;

    const machine = await Machine.findById(machineId);
    if (!machine) {
      return res
        .status(404)
        .json({ success: false, message: "Machine not found" });
    }

    if (machine.ownerId.toString() === req.user.id) {
      return res
        .status(400)
        .json({ success: false, message: "You cannot rent your own machine" });
    }

    let pricing = {};
    let rentalData = {
      machineId,
      renterId: req.user.id,
      ownerId: machine.ownerId,
      rentalType,
      status: "pending",
    };

    if (rentalType === "daily") {
      if (!startDate || !endDate) {
        return res
          .status(400)
          .json({ success: false, message: "Start and end dates required" });
      }

      if (!fieldLocation || !fieldLocation.trim()) {
        return res
          .status(400)
          .json({ success: false, message: "Field location is required" });
      }

      if (!machine.pricePerDay) {
        return res.status(400).json({
          success: false,
          message: "This machine is not available for daily rental",
        });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (start < today) {
        return res.status(400).json({
          success: false,
          message: "Start date cannot be in the past",
        });
      }

      if (end <= start) {
        return res.status(400).json({
          success: false,
          message: "End date must be after start date",
        });
      }

      const conflictingRental = await Rental.findOne({
        machineId,
        rentalType: "daily",
        status: { $in: ["pending", "active", "approved"] },
        $or: [{ startDate: { $lte: end }, endDate: { $gte: start } }],
      });

      if (conflictingRental) {
        return res.status(400).json({
          success: false,
          message: "Machine is not available for these dates",
        });
      }

      const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      const subtotal = days * machine.pricePerDay;
      const serviceFee = subtotal * 0.1;
      const totalPrice = subtotal + serviceFee;

      rentalData.startDate = start;
      rentalData.endDate = end;
      rentalData.fieldLocation = fieldLocation;
      pricing = {
        pricePerDay: machine.pricePerDay,
        numberOfDays: days,
        subtotal,
        serviceFee,
        totalPrice,
      };
    } else if (rentalType === "per_hectare") {
      if (!hectares || !workDate || !fieldLocation) {
        return res.status(400).json({
          success: false,
          message: "Hectares, work date, and field location required",
        });
      }

      if (!machine.pricePerHectare) {
        return res.status(400).json({
          success: false,
          message: "This machine is not available for per-hectare rental",
        });
      }

      if (hectares < (machine.minimumHectares || 1)) {
        return res.status(400).json({
          success: false,
          message: `Minimum ${machine.minimumHectares || 1} hectares required`,
        });
      }

      const work = new Date(workDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (work < today) {
        return res
          .status(400)
          .json({ success: false, message: "Work date cannot be in the past" });
      }

      const conflictingRental = await Rental.findOne({
        machineId,
        status: { $in: ["pending", "active", "approved"] },
        $or: [
          { rentalType: "per_hectare", workDate: work },
          {
            rentalType: "daily",
            startDate: { $lte: work },
            endDate: { $gte: work },
          },
        ],
      });

      if (conflictingRental) {
        return res.status(400).json({
          success: false,
          message: "Machine is not available on this date",
        });
      }

      const subtotal = hectares * machine.pricePerHectare;
      const serviceFee = subtotal * 0.1;
      const totalPrice = subtotal + serviceFee;

      rentalData.hectares = hectares;
      rentalData.workDate = work;
      rentalData.fieldLocation = fieldLocation;
      pricing = {
        pricePerHectare: machine.pricePerHectare,
        numberOfHectares: hectares,
        subtotal,
        serviceFee,
        totalPrice,
      };
    } else {
      return res
        .status(400)
        .json({ success: false, message: "Invalid rental type" });
    }

    rentalData.pricing = pricing;
    const rental = await Rental.create(rentalData);

    // Update machine status to pending
    machine.availability = "pending";
    await machine.save();

    const populatedRental = await Rental.findById(rental._id)
      .populate(
        "machineId",
        "name images pricePerDay pricePerHectare category rating"
      )
      .populate("renterId", "firstName lastName email")
      .populate("ownerId", "firstName lastName email");

    res.status(201).json({
      success: true,
      data: populatedRental,
      message: "Rental request sent successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get rental by ID
router.get("/:id", protect, async (req, res) => {
  try {
    const rental = await Rental.findById(req.params.id)
      .populate("machineId")
      .populate("renterId", "firstName lastName email")
      .populate("ownerId", "firstName lastName email");

    if (!rental) {
      return res.status(404).json({
        success: false,
        message: "Rental not found",
      });
    }

    res.json({
      success: true,
      data: rental,
    });
  } catch (error) {
    console.error("Error fetching rental:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Update rental status (approve/reject)
router.patch("/:id/status", protect, async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;

    // ✅ CHANGE: Validate for 20 characters (not 10)
    if (
      status === "rejected" &&
      (!rejectionReason || rejectionReason.trim().length < 20)
    ) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required and must be at least 20 characters",
      });
    }

    const rental = await Rental.findById(req.params.id)
      .populate("machineId", "name images pricePerDay pricePerHectare rating")
      .populate("renterId", "firstName lastName email phone") // ✅ ADD phoneNumber
      .populate("ownerId", "firstName lastName email phone"); // ✅ ADD phoneNumber

    if (!rental) {
      return res.status(404).json({
        success: false,
        message: "Rental not found",
      });
    }

    if (rental.ownerId._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    const validTransitions = {
      pending: ["approved", "rejected", "cancelled"],
      approved: ["active", "cancelled"],
      active: ["completed", "disputed"],
      completed: ["released", "disputed"],
      released: ["closed"],
      closed: [],
      cancelled: [],
      rejected: [],
      disputed: ["closed"]
    };

    const allowedNextStatuses = validTransitions[rental.status] || [];
    if (!allowedNextStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot change status from "${rental.status}" to "${status}"`,
      });
    }

    rental.status = status;

    if (status === "approved") {
      rental.approvedAt = new Date();
      rental.approvedBy = req.user.id;

      const machine = await Machine.findById(rental.machineId._id);
      if (machine) {
        machine.availability = "rented";
        await machine.save();
      }

      await createNotification(
        rental.renterId._id,
        "rental_accepted",
        "Rental Request Approved",
        `Your rental request for ${rental.machineId.name} has been approved!`,
        rental._id,
        "Rental"
      );

      const emailSubject = "✅ Your Rental Request Has Been Approved!";
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .info-box { background: white; padding: 20px; border-left: 4px solid #10b981; margin: 20px 0; border-radius: 5px; }
            .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Booking Approved!</h1>
            </div>
            <div class="content">
              <p>Hi ${rental.renterId.firstName},</p>
              <p>Great news! Your rental request has been <strong style="color: #10b981;">APPROVED</strong>.</p>
              <div class="info-box">
                <h3 style="margin-top: 0;">Booking Details</h3>
                <div class="info-row">
                  <span>Machine:</span>
                  <span>${rental.machineId.name}</span>
                </div>
                <div class="info-row" style="border-bottom: none;">
                  <span style="font-size: 18px;">Total:</span>
                  <span style="font-size: 20px; color: #10b981; font-weight: bold;">$${rental.pricing.totalPrice.toFixed(2)}</span>
                </div>
              </div>
              <p><strong>Next Step:</strong> Please proceed with payment.</p>
              <p>Thank you for using AgriRent!</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} AgriRent</p>
            </div>
          </div>
        </body>
        </html>
      `;

      try {
        await sendEmail(rental.renterId.email, emailSubject, emailHtml);
      } catch (emailError) {
        console.error("Email error:", emailError);
      }

      // ✅ FIXED: Use phoneNumber instead of phone
      if (rental.renterId.phone && sendNotificationSMS) {
        try {
          await sendNotificationSMS(
            rental.renterId.phone,
            `🎉 AgriRent: Your rental for ${rental.machineId.name} has been APPROVED! Total: $${rental.pricing.totalPrice.toFixed(2)}. Please proceed with payment.`
          );
          console.log("✅ Approval SMS sent");
        } catch (smsError) {
          console.error("⚠️ SMS error:", smsError);
        }
      }
      
    } else if (status === "rejected") {
      // ✅ IMPORTANT: Save rejection data BEFORE sending notifications
      rental.rejectionReason = rejectionReason.trim();
      rental.rejectedAt = new Date();
      rental.rejectedBy = req.user.id;

      const machine = await Machine.findById(rental.machineId._id);
      if (machine) {
        machine.availability = "available";
        await machine.save();
      }

      await createNotification(
        rental.renterId._id,
        "rental_rejected",
        "Rental Request Declined",
        `Your rental request for ${rental.machineId.name} was declined.`,
        rental._id,
        "Rental"
      );

      const emailSubject = "❌ Rental Request Update";
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #f87171 0%, #ef4444 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .reason-box { background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 5px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Rental Request Update</h1>
            </div>
            <div class="content">
              <p>Hi ${rental.renterId.firstName},</p>
              <p>Your rental request for <strong>${rental.machineId.name}</strong> has been declined.</p>
              <div class="reason-box">
                <h4 style="margin-top: 0;">📝 Reason:</h4>
                <p style="margin: 0;">${rejectionReason.trim()}</p>
              </div>
              <p>There are many other machines available on AgriRent.</p>
              <p>Thank you!</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} AgriRent</p>
            </div>
          </div>
        </body>
        </html>
      `;

      try {
        await sendEmail(rental.renterId.email, emailSubject, emailHtml);
        console.log("✅ Rejection email sent");
      } catch (emailError) {
        console.error("⚠️ Email error:", emailError);
      }

      // ✅ FIXED: Use phoneNumber and sendNotificationSMS
      if (rental.renterId.phone && sendNotificationSMS) {
        try {
          await sendNotificationSMS(
            rental.renterId.phone,
            `AgriRent: Your rental for ${rental.machineId.name} was declined. Reason: ${rejectionReason.trim().substring(0, 100)}`
          );
          console.log("✅ Rejection SMS sent");
        } catch (smsError) {
          console.error("⚠️ SMS error:", smsError);
        }
      }
    }

    await rental.save();

    const updatedRental = await Rental.findById(rental._id)
      .populate(
        "machineId",
        "name images pricePerDay pricePerHectare category rating availability"
      )
      .populate("renterId", "firstName lastName email phone")
      .populate("ownerId", "firstName lastName email phone");

    res.json({
      success: true,
      data: updatedRental,
      message: `Rental ${status} successfully`,
    });
  } catch (error) {
    console.error("Status update error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Cancel rental
router.patch("/:id/cancel", protect, async (req, res) => {
  try {
    const rental = await Rental.findById(req.params.id);

    if (!rental) {
      return res.status(404).json({
        success: false,
        message: "Rental not found",
      });
    }

    if (rental.renterId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    if (!["pending", "approved"].includes(rental.status)) {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel this rental",
      });
    }

    rental.status = "cancelled";
    await rental.save();

    const machine = await Machine.findById(rental.machineId);
    if (machine) {
      machine.availability = "available";
      await machine.save();
    }

    res.json({ success: true, data: rental });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Owner marks job as complete
router.patch("/:id/complete", protect, async (req, res) => {
  try {
    const { completionNote } = req.body; // ✅ Get the note from request

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

    // Only owner can mark complete
    if (rental.ownerId._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Only the owner can mark this as complete",
      });
    }

    // Must be active (paid)
    if (rental.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "Rental must be active (paid) before marking complete",
      });
    }

    // Verify payment is in escrow
    const payment = await Payment.findOne({ rentalId: rental._id });
    if (!payment || payment.escrowStatus !== "held") {
      return res.status(400).json({
        success: false,
        message: "Payment must be secured in escrow",
      });
    }

    // ✅ UPDATE RENTAL WITH OWNER CONFIRMATION FIELDS
    rental.status = "completed";
    rental.completedAt = new Date();
    rental.ownerConfirmedCompletion = true;  // ✅ ADD THIS
    rental.ownerConfirmedAt = new Date();     // ✅ ADD THIS
    rental.ownerConfirmationNote = completionNote || "Job completed by owner";  // ✅ ADD THIS
    await rental.save();

    console.log(`✅ Rental ${rental._id} marked as completed by owner`);

    // Notify renter
    try {
      await sendEmail(
        rental.renterId.email,
        "✅ Job Completed - Please Confirm",
        `
          <h2>Job Completed!</h2>
          <p>Hi ${rental.renterId.firstName},</p>
          <p>The owner has marked your rental of <strong>${rental.machineId.name}</strong> as completed.</p>
          ${completionNote ? `<p><strong>Owner's note:</strong> ${completionNote}</p>` : ''}
          <p><strong>Please confirm that the job was completed satisfactorily.</strong></p>
          <p>Once you confirm, the payment will be released to the owner.</p>
        `
      );
    } catch (emailError) {
      console.error("❌ Email error:", emailError);
    }

    // Fetch updated rental with all fields
    const updatedRental = await Rental.findById(rental._id)
      .populate("machineId", "name images")
      .populate("renterId", "firstName lastName email")
      .populate("ownerId", "firstName lastName email");

    res.json({
      success: true,
      message: "Rental marked as complete. Waiting for renter confirmation.",
      data: updatedRental,
    });
  } catch (error) {
    console.error("Complete rental error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Renter confirms completion
router.patch("/:id/confirm-completion", protect, async (req, res) => {
  try {
    const { confirmationNote } = req.body;
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

    if (rental.renterId._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Only the renter can confirm completion",
      });
    }

    if (rental.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Owner must mark the job as completed first",
      });
    }

    rental.status = "released";
    rental.renterConfirmedCompletion = true;
    rental.renterConfirmedAt = new Date();
    rental.renterConfirmationNote = confirmationNote || "Job completed satisfactorily";
    await rental.save();

    const machine = await Machine.findById(rental.machineId._id);
    if (machine) {
      machine.availability = "available";
      await machine.save();
    }

    try {
      await sendEmail(
        rental.ownerId.email,
        "✅ Renter Confirmed Completion",
        `
          <h2>Job Confirmed!</h2>
          <p>Hi ${rental.ownerId.firstName},</p>
          <p>Great news! ${rental.renterId.firstName} has confirmed that the rental of <strong>${rental.machineId.name}</strong> was completed successfully.</p>
          <p>Your payment will be released shortly by the admin.</p>
          ${confirmationNote ? `<p><strong>Renter's note:</strong> ${confirmationNote}</p>` : ""}
          <p>Thank you for using AgriRent!</p>
        `
      );
    } catch (emailError) {
      console.error("Email error:", emailError);
    }

    try {
      await sendEmail(
        rental.renterId.email,
        "✅ Completion Confirmed",
        `
          <h2>Thank You for Confirming!</h2>
          <p>Hi ${rental.renterId.firstName},</p>
          <p>You've successfully confirmed the completion of your rental for <strong>${rental.machineId.name}</strong>.</p>
          <p>The payment will be released to the owner shortly.</p>
          <p>Thank you for using AgriRent!</p>
        `
      );
    } catch (emailError) {
      console.error("Email error:", emailError);
    }

    const updatedRental = await Rental.findById(rental._id)
      .populate("machineId", "name images")
      .populate("renterId", "firstName lastName email")
      .populate("ownerId", "firstName lastName email");

    res.json({
      success: true,
      message: "Completion confirmed. Payment will be released to owner.",
      data: updatedRental,
    });
  } catch (error) {
    console.error("Confirm completion error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Submit review
router.post("/:id/review", protect, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const rentalId = req.params.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    if (comment && comment.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Review comment must be 500 characters or less",
      });
    }

    const rental = await Rental.findById(rentalId)
      .populate("machineId")
      .populate("renterId", "firstName lastName email")
      .populate("ownerId", "firstName lastName email");

    if (!rental) {
      return res.status(404).json({
        success: false,
        message: "Rental not found",
      });
    }

    if (rental.renterId._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Only the renter can review this rental",
      });
    }

    if (rental.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "You can only review completed rentals",
      });
    }

    if (rental.isReviewed) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this rental",
      });
    }

    rental.review = {
      rating: rating,
      comment: comment?.trim() || "",
      createdAt: new Date(),
    };
    rental.isReviewed = true;
    await rental.save();

    const machine = await Machine.findById(rental.machineId._id);
    const reviewedRentals = await Rental.find({
      machineId: machine._id,
      status: "completed",
      isReviewed: true,
      "review.rating": { $exists: true, $ne: null },
    });

    const totalRating = reviewedRentals.reduce(
      (sum, r) => sum + r.review.rating,
      0
    );
    const reviewCount = reviewedRentals.length;
    const averageRating = reviewCount > 0 ? totalRating / reviewCount : 0;

    machine.rating = {
      average: Math.round(averageRating * 10) / 10,
      count: reviewCount,
    };
    await machine.save();

    await createNotification(
      rental.ownerId._id,
      "review_received",
      "New Review Received",
      `${rental.renterId.firstName} left a ${rating}-star review for ${machine.name}`,
      rental._id,
      "Rental"
    );

    const updatedRental = await Rental.findById(rental._id)
      .populate("machineId", "name images rating")
      .populate("renterId", "firstName lastName")
      .populate("ownerId", "firstName lastName");

    res.json({
      success: true,
      data: updatedRental,
      message: "Review submitted successfully!",
    });
  } catch (error) {
    console.error("Review submission error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Update review
router.put("/:id/review", protect, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const rentalId = req.params.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    if (comment && comment.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Review comment must be 500 characters or less",
      });
    }

    const rental = await Rental.findById(rentalId)
      .populate("machineId")
      .populate("renterId", "firstName lastName email")
      .populate("ownerId", "firstName lastName email");

    if (!rental) {
      return res.status(404).json({
        success: false,
        message: "Rental not found",
      });
    }

    if (rental.renterId._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Only the renter can edit this review",
      });
    }

    if (rental.status !== "completed" || !rental.isReviewed) {
      return res.status(400).json({
        success: false,
        message: "Can only edit reviews for completed rentals that have been reviewed",
      });
    }

    rental.review = {
      rating,
      comment: comment?.trim() || "",
      createdAt: new Date(),
    };
    await rental.save();

    const machine = await Machine.findById(rental.machineId._id);
    const reviewedRentals = await Rental.find({
      machineId: machine._id,
      status: "completed",
      isReviewed: true,
      "review.rating": { $exists: true, $ne: null },
    });

    const totalRating = reviewedRentals.reduce(
      (sum, r) => sum + r.review.rating,
      0
    );
    const reviewCount = reviewedRentals.length;
    const averageRating = reviewCount > 0 ? totalRating / reviewCount : 0;

    machine.rating = {
      average: Math.round(averageRating * 10) / 10,
      count: reviewCount,
    };
    await machine.save();

    const updatedRental = await Rental.findById(rental._id)
      .populate("machineId", "name images rating")
      .populate("renterId", "firstName lastName")
      .populate("ownerId", "firstName lastName");

    res.json({
      success: true,
      data: updatedRental,
      message: "Review updated successfully!",
    });
  } catch (error) {
    console.error("Review update error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get reviews for a machine
router.get("/machine/:machineId/reviews", async (req, res) => {
  try {
    const reviews = await Rental.find({
      machineId: req.params.machineId,
      status: "completed",
      isReviewed: true,
      "review.rating": { $exists: true },
    })
      .populate("renterId", "firstName lastName")
      .select("review createdAt renterId")
      .sort({ "review.createdAt": -1 });

    res.json({
      success: true,
      data: reviews,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ============================================
// GET RENTALS PENDING ADMIN RELEASE
// ============================================
router.get("/admin/pending-release", protect, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Only admins can access this endpoint",
      });
    }

    console.log('🔍 Fetching rentals with status: released');

    // Find all rentals in 'released' status
    const rentals = await Rental.find({
      status: "released",
    })
      .populate("machineId", "name images category")
      .populate("renterId", "firstName lastName email")
      .populate("ownerId", "firstName lastName email")
      .sort({ renterConfirmedAt: -1 });

    console.log(`✅ Found ${rentals.length} rentals ready for release`);

    res.json({
      success: true,
      data: rentals,
      count: rentals.length,
    });
  } catch (error) {
    console.error("❌ Error fetching pending releases:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;