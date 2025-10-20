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

    // ✅ UPDATE MACHINE STATUS to 'pending' when rental is created
    machine.availability = 'pending';
    await machine.save();
    console.log(`✅ Machine ${machine.name} status updated to: pending`);

    const populatedRental = await Rental.findById(rental._id)
      .populate(
        "machineId",
        "name images pricePerDay pricePerHectare category pricingType rating"
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

// Add this to routes/rentals.js if it doesn't exist
router.get("/:id", protect, async (req, res) => {
  try {
    const rental = await Rental.findById(req.params.id)
      .populate("machineId")
      .populate("renterId", "firstName lastName email")
      .populate("ownerId", "firstName lastName email");

    if (!rental) {
      return res.status(404).json({
        success: false,
        message: "Rental not found"
      });
    }

    res.json({
      success: true,
      data: rental
    });
  } catch (error) {
    console.error("Error fetching rental:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update rental status (approve/reject) with rejection reason
router.patch("/:id/status", protect, async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;

    // Validate rejection reason if rejecting
    if (
      status === "rejected" &&
      (!rejectionReason || rejectionReason.trim().length < 10)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Rejection reason is required and must be at least 10 characters",
      });
    }

    const rental = await Rental.findById(req.params.id)
      .populate("machineId", "name images pricePerDay pricePerHectare rating")
      .populate("renterId", "firstName lastName email phone")
      .populate("ownerId", "firstName lastName email");

    if (!rental) {
      return res.status(404).json({
        success: false,
        message: "Rental not found",
      });
    }

    // Only owner can approve/reject
    if (rental.ownerId._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    // Define valid status transitions
    const validTransitions = {
      pending: ["approved", "rejected"],
      approved: ["completed"],
      active: ["completed"],
    };

    const allowedNextStatuses = validTransitions[rental.status] || [];
    if (!allowedNextStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot change status from "${rental.status}" to "${status}"`,
      });
    }

    if (status === "approved") {
      rental.status = "approved";

      // ✅ UPDATE MACHINE STATUS to 'rented' when approved
      const machine = await Machine.findById(rental.machineId._id);
      machine.availability = "rented";
      await machine.save();
      console.log(`✅ Machine ${machine.name} status updated to: rented (approved)`);

      // Create notification
      await createNotification(
        rental.renterId._id,
        "rental_accepted",
        "Rental Request Approved",
        `Your rental request for ${rental.machineId.name} has been approved!`,
        rental._id,
        "Rental"
      );

      // Send approval email
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
            .button { display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .info-box { background: white; padding: 20px; border-left: 4px solid #10b981; margin: 20px 0; border-radius: 5px; }
            .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
            .label { font-weight: bold; color: #666; }
            .value { color: #333; }
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
              
              <p>Great news! Your rental request has been <strong style="color: #10b981;">APPROVED</strong> by the owner.</p>
              
              <div class="info-box">
                <h3 style="margin-top: 0; color: #667eea;">Booking Details</h3>
                
                <div class="info-row">
                  <span class="label">Machine:</span>
                  <span class="value">${rental.machineId.name}</span>
                </div>
                
                ${
                  rental.rentalType === "daily"
                    ? `
                  <div class="info-row">
                    <span class="label">Start Date:</span>
                    <span class="value">${new Date(
                      rental.startDate
                    ).toLocaleDateString()}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">End Date:</span>
                    <span class="value">${new Date(
                      rental.endDate
                    ).toLocaleDateString()}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">Duration:</span>
                    <span class="value">${
                      rental.pricing.numberOfDays
                    } days</span>
                  </div>
                `
                    : `
                  <div class="info-row">
                    <span class="label">Work Date:</span>
                    <span class="value">${new Date(
                      rental.workDate
                    ).toLocaleDateString()}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">Hectares:</span>
                    <span class="value">${
                      rental.pricing.numberOfHectares
                    } Ha</span>
                  </div>
                  <div class="info-row">
                    <span class="label">Location:</span>
                    <span class="value">${rental.fieldLocation}</span>
                  </div>
                `
                }
                
                <div class="info-row" style="border-bottom: none; margin-top: 10px; padding-top: 10px; border-top: 2px solid #10b981;">
                  <span class="label" style="font-size: 18px;">Total Amount:</span>
                  <span class="value" style="font-size: 20px; color: #10b981; font-weight: bold;">$${rental.pricing.totalPrice.toFixed(
                    2
                  )}</span>
                </div>
              </div>

              <p><strong>Next Step:</strong> Please proceed with payment to secure your booking.</p>

              <p>If you have any questions, please contact the owner:</p>
              <p><strong>${rental.ownerId.firstName} ${
        rental.ownerId.lastName
      }</strong><br>
              Email: ${rental.ownerId.email}</p>
              
              <p>Thank you for using AgriRent!</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} AgriRent. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      console.log("📧 Sending approval email to:", rental.renterId.email);

      try {
        await sendEmail(rental.renterId.email, emailSubject, emailHtml);
        console.log("✅ Approval email sent successfully");
      } catch (emailError) {
        console.error("❌ Failed to send approval email:", emailError);
      }

      // Send SMS if phone exists
      if (rental.renterId.phone) {
        try {
          const smsMessage =
            rental.rentalType === "daily"
              ? `🎉 AgriRent: Your rental request for ${
                  rental.machineId.name
                } has been APPROVED! Dates: ${new Date(
                  rental.startDate
                ).toLocaleDateString()} - ${new Date(
                  rental.endDate
                ).toLocaleDateString()}. Total: $${rental.pricing.totalPrice.toFixed(
                  2
                )}. Please proceed with payment.`
              : `🎉 AgriRent: Your rental request for ${
                  rental.machineId.name
                } has been APPROVED! Work date: ${new Date(
                  rental.workDate
                ).toLocaleDateString()}, ${
                  rental.pricing.numberOfHectares
                } Ha. Total: $${rental.pricing.totalPrice.toFixed(2)}. Please proceed with payment.`;

          await twilioClient.messages.create({
            body: smsMessage,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: rental.renterId.phone,
          });

          console.log("✅ SMS sent successfully");
        } catch (smsError) {
          console.error("❌ SMS sending failed:", smsError);
        }
      }
    } else if (status === "rejected") {
      rental.status = "rejected";
      rental.rejectionReason = rejectionReason;

      // ✅ UPDATE MACHINE STATUS back to 'available' when rejected
      const machine = await Machine.findById(rental.machineId._id);
      machine.availability = "available";
      await machine.save();
      console.log(`✅ Machine ${machine.name} status updated to: available (rejected)`);

      // Create notification
      await createNotification(
        rental.renterId._id,
        "rental_rejected",
        "Rental Request Declined",
        `Your rental request for ${rental.machineId.name} was declined. Reason: ${rejectionReason}`,
        rental._id,
        "Rental"
      );

      // Send rejection email with reason
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
            .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
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
              
              <p>Unfortunately, your rental request for <strong>${
                rental.machineId.name
              }</strong> has been declined by the owner.</p>
              
              <div class="reason-box">
                <h4 style="margin-top: 0; color: #991b1b;">📝 Reason for Decline:</h4>
                <p style="margin: 0;">${rejectionReason}</p>
              </div>
              
              <p>Don't worry! There are many other great machines available on AgriRent.</p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${
                  process.env.FRONTEND_URL || "http://localhost:5173"
                }" class="button">Browse Other Machines</a>
              </div>
              
              <p>Thank you for using AgriRent!</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} AgriRent. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      console.log("📧 Sending rejection email to:", rental.renterId.email);

      try {
        await sendEmail(rental.renterId.email, emailSubject, emailHtml);
        console.log("✅ Rejection email sent successfully");
      } catch (emailError) {
        console.error("❌ Failed to send rejection email:", emailError);
      }

      // Send SMS if phone exists
      if (
        rental.renterId.phone &&
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_PHONE_NUMBER
      ) {
        try {
          const smsBody = `AgriRent: Your rental request for ${
            rental.machineId.name
          } was declined. Reason: ${rejectionReason.substring(0, 100)}${
            rejectionReason.length > 100 ? "..." : ""
          }`;

          await twilioClient.messages.create({
            body: smsBody,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: rental.renterId.phone,
          });

          console.log("✅ SMS sent successfully!");
        } catch (smsError) {
          console.error("❌ SMS sending failed:", smsError.message);
        }
      }
    }

    await rental.save();

    const updatedRental = await Rental.findById(rental._id)
      .populate(
        "machineId",
        "name images pricePerDay pricePerHectare category rating"
      )
      .populate("renterId", "firstName lastName email")
      .populate("ownerId", "firstName lastName email");

    res.json({
      success: true,
      data: updatedRental,
      message: `Rental ${status} successfully. Notifications sent.`,
    });
  } catch (error) {
    console.error("Error updating rental status:", error);
    res.status(500).json({ success: false, message: error.message });
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

    // ✅ UPDATE MACHINE STATUS back to 'available' when cancelled
    const machine = await Machine.findById(rental.machineId);
    machine.availability = "available";
    await machine.save();
    console.log(`✅ Machine status updated to: available (cancelled)`);

    res.json({ success: true, data: rental });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Complete rental
// ADD THIS TO routes/rentals.js - Replace the /complete route

// ✅ OWNER MARKS JOB AS COMPLETE
router.patch("/:id/complete", protect, async (req, res) => {
  try {
    const rental = await Rental.findById(req.params.id)
      .populate('machineId', 'name')
      .populate('ownerId', 'firstName lastName email')
      .populate('renterId', 'firstName lastName email');

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
    if (!payment || payment.escrowStatus !== 'held') {
      return res.status(400).json({
        success: false,
        message: "Payment must be secured in escrow",
      });
    }

    // ✅ UPDATE RENTAL STATUS TO COMPLETED
    rental.status = "completed";
    rental.completedAt = new Date();
    await rental.save();

    console.log(`✅ Rental ${rental._id} marked as completed by owner`);

    // ✅ NOTIFY RENTER TO CONFIRM
    await sendEmail({
      to: rental.renterId.email,
      subject: '✅ Job Completed - Please Confirm',
      html: `
        <h2>Job Completed!</h2>
        <p>Hi ${rental.renterId.firstName},</p>
        <p>The owner has marked your rental of <strong>${rental.machineId.name}</strong> as completed.</p>
        <p><strong>Please confirm that the job was completed satisfactorily.</strong></p>
        <p>Once you confirm, your payment will be released to the owner.</p>
        <p><a href="${process.env.FRONTEND_URL}/rentals/${rental._id}">Confirm Completion</a></p>
      `,
    });

    // Notify owner
    await sendEmail({
      to: rental.ownerId.email,
      subject: '👍 Rental Marked as Complete',
      html: `
        <h2>Rental Marked Complete</h2>
        <p>You've successfully marked the rental as complete.</p>
        <p><strong>Machine:</strong> ${rental.machineId.name}</p>
        <p>The renter will now confirm completion, and your payment will be released.</p>
      `,
    });

    res.json({ 
      success: true, 
      message: 'Rental marked as complete. Waiting for renter confirmation.',
      data: rental 
    });
  } catch (error) {
    console.error('Complete rental error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ ADDED: Submit review for completed rental
router.post("/:id/review", protect, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const rentalId = req.params.id;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    // Validate comment length
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

    // Only renter can review
    if (rental.renterId._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Only the renter can review this rental",
      });
    }

    // Can only review completed rentals
    if (rental.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "You can only review completed rentals",
      });
    }

    // Check if already reviewed
    if (rental.isReviewed) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this rental",
      });
    }

    // Add review to rental
    rental.review = {
      rating: rating,
      comment: comment?.trim() || "",
      createdAt: new Date(),
    };
    rental.isReviewed = true;
    await rental.save();

    // Update machine's average rating
    const machine = await Machine.findById(rental.machineId._id);

    // Get all completed rentals with reviews for this machine
    const reviewedRentals = await Rental.find({
      machineId: machine._id,
      status: "completed",
      isReviewed: true,
      "review.rating": { $exists: true, $ne: null },
    });

    // Calculate new average
    const totalRating = reviewedRentals.reduce(
      (sum, r) => sum + r.review.rating,
      0
    );
    const reviewCount = reviewedRentals.length;
    const averageRating = reviewCount > 0 ? totalRating / reviewCount : 0;

    machine.rating = {
      average: Math.round(averageRating * 10) / 10, // Round to 1 decimal
      count: reviewCount,
    };
    await machine.save();

    // Create notification for owner
    await createNotification(
      rental.ownerId._id,
      "review_received",
      "New Review Received",
      `${rental.renterId.firstName} left a ${rating}-star review for ${machine.name}`,
      rental._id,
      "Rental"
    );

    // Send email to owner
    const emailSubject = "⭐ New Review for Your Machine";
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .rating-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 5px; }
          .stars { color: #fbbf24; font-size: 24px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">⭐ New Review Received!</h1>
          </div>
          <div class="content">
            <p>Hi ${rental.ownerId.firstName},</p>
            
            <p><strong>${rental.renterId.firstName} ${
      rental.renterId.lastName
    }</strong> left a review for your machine:</p>
            
            <div class="rating-box">
              <h3 style="margin-top: 0; color: #92400e;">📋 ${machine.name}</h3>
              <div class="stars">${"⭐".repeat(rating)}${"☆".repeat(
      5 - rating
    )}</div>
              <p style="margin: 10px 0 0 0; font-size: 18px; font-weight: bold;">${rating} out of 5 stars</p>
              ${
                comment
                  ? `<p style="margin: 15px 0 0 0; font-style: italic; color: #666;">"${comment}"</p>`
                  : ""
              }
            </div>
            
            <p>Your machine now has an average rating of <strong>${
              machine.rating.average
            }</strong> stars from ${machine.rating.count} review${
      machine.rating.count !== 1 ? "s" : ""
    }.</p>
            
            <p>Thank you for using AgriRent!</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} AgriRent. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    try {
      await sendEmail(rental.ownerId.email, emailSubject, emailHtml);
      console.log("✅ Review notification email sent to owner");
    } catch (emailError) {
      console.error("❌ Failed to send review email:", emailError);
    }

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

// ✅ ADDED: Update existing review
router.put("/:id/review", protect, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const rentalId = req.params.id;

    // Validate rating
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

    // Only renter can edit
    if (rental.renterId._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Only the renter can edit this review",
      });
    }

    // Must be completed and already reviewed
    if (rental.status !== "completed" || !rental.isReviewed) {
      return res.status(400).json({
        success: false,
        message:
          "Can only edit reviews for completed rentals that have been reviewed",
      });
    }

    const oldRating = rental.review.rating;

    // Update review
    rental.review = {
      rating,
      comment: comment?.trim() || "",
      createdAt: new Date(), // Optional: keep original date or update to now
    };
    await rental.save();

    // Recalculate machine rating
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

    // Optional: Send notification to owner about review update
    await createNotification(
      rental.ownerId._id,
      "review_updated",
      "Review Updated",
      `${rental.renterId.firstName} updated their review for ${machine.name}`,
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

// ✅ ADDED: Get reviews for a machine
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

module.exports = router;