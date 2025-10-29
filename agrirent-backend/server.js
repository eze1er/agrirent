const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");
const stripe = require("stripe");
const adminRoutes = require('./routes/admin');

const app = express();

// --- 1. INITIALISATION DE STRIPE ---
const stripeInstance = stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// CORS configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);

// -------------------------------------------------------------------------
// --- 2. ROUTE DE WEBHOOK STRIPE ---
// -------------------------------------------------------------------------
// ============================================
// REPLACE THE WEBHOOK SECTION IN YOUR server.js
// This goes after line: app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
// ============================================

const Payment = require("./models/Payment");
const Rental = require("./models/Rental");
const Machine = require("./models/Machine");

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;
    try {
      event = stripeInstance.webhooks.constructEvent(req.body, sig, webhookSecret);
      console.log("🔔 Webhook received:", event.type);
    } catch (err) {
      console.error("❌ Webhook signature invalid:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const rentalId = session.metadata?.rentalId;

          console.log("✅ Checkout Session completed:", session.id);
          console.log("💰 Amount:", session.amount_total / 100);
          console.log("🎯 Rental ID:", rentalId);

          if (!rentalId) {
            console.error("❌ No rentalId in session metadata");
            break;
          }

          // Get rental with populated fields
          const rental = await Rental.findById(rentalId)
            .populate("machineId")
            .populate("ownerId")
            .populate("renterId");

          if (!rental) {
            console.error(`❌ Rental ${rentalId} not found`);
            break;
          }

          // Calculate amounts
          const amount = session.amount_total / 100;
          const platformFeePercent = 10;
          const platformFee = (amount * platformFeePercent) / 100;

          // Find or create Payment record
          let payment = await Payment.findOne({ rentalId });

          if (payment) {
            // Update existing payment
            payment.transactionId = session.payment_intent;
            payment.status = "completed";
            payment.escrowStatus = "held";
            payment.escrowTimeline = payment.escrowTimeline || {};
            payment.escrowTimeline.paidAt = new Date();
            payment.escrowTimeline.heldAt = new Date();
            payment.platformFee = {
              percentage: platformFeePercent,
              amount: platformFee,
              deductedAt: new Date(),
            };
            await payment.save();
            console.log("✅ Payment record updated:", payment._id);
          } else {
            // Create new payment record
            payment = await Payment.create({
              rentalId,
              userId: rental.renterId._id,
              ownerId: rental.ownerId._id,
              amount,
              currency: session.currency || "usd",
              method: "stripe",
              status: "completed",
              escrowStatus: "held",
              transactionId: session.payment_intent,
              escrowTimeline: {
                paidAt: new Date(),
                heldAt: new Date(),
              },
              platformFee: {
                percentage: platformFeePercent,
                amount: platformFee,
                deductedAt: new Date(),
              },
            });
            console.log("✅ Payment record created:", payment._id);
          }

          // ✅ CRITICAL: Update rental to 'active'
          rental.status = "active";
          rental.payment = {
            status: "held_in_escrow",
            transactionId: session.payment_intent,
            method: "stripe",
            amount,
            paidAt: new Date(),
          };
          await rental.save();
          console.log("✅ Rental status updated to: ACTIVE");

          // ✅ Update machine status to rented
          if (rental.machineId) {
            await Machine.findByIdAndUpdate(rental.machineId._id, {
              availability: "rented",
            });
            console.log(`✅ Machine ${rental.machineId.name} set to: rented`);
          }

          break;
        }

        case "payment_intent.succeeded": {
          const paymentIntent = event.data.object;
          console.log(`✅ PaymentIntent succeeded: ${paymentIntent.id}`);
          break;
        }

        case "payment_intent.payment_failed": {
          const failedIntent = event.data.object;
          console.error(`❌ PaymentIntent failed: ${failedIntent.id}`);

          if (failedIntent.metadata?.rentalId) {
            await Rental.findByIdAndUpdate(failedIntent.metadata.rentalId, {
              "payment.status": "failed",
              status: "approved",
            });
          }
          break;
        }

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      console.error("❌ Webhook processing error:", error);
    }

    res.json({ received: true });
  }
);
// Global Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

// Passport
require("./middleware/config/passport");
app.use(passport.initialize());
app.use(passport.session());

// MongoDB Connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB Connected Successfully"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// Routes API
app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/machines", require("./routes/machines"));
app.use("/api/rentals", require("./routes/rentals")); // ✅ CHANGED THIS LINE
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/upload", require("./routes/upload"));
app.use("/api/payments", require("./routes/paymentRoutes"));
app.use('/api/admin', adminRoutes);

// Health check
app.get("/", (req, res) => {
  res.json({
    message: "AgriRent API is running!",
    status: "success",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    uptime: process.uptime(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Error:", err.stack);
  res.status(500).json({
    success: false,
    message: "Server Error",
  });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`API URL: http://localhost:${PORT}`);
  console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook`);
});