const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");
const stripe = require("stripe");
const paymentRoutes = require("./routes/paymentRoutes");
const userRoutes = require('./routes/users');

const app = express();

// --- 1. INITIALISATION DE STRIPE ---
const stripeInstance = stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// After dotenv.config()
// console.log('🔑 Google Client ID:', process.env.GOOGLE_CLIENT_ID ? '✅ Found' : '❌ Missing');
// console.log('🔑 Google Secret:', process.env.GOOGLE_CLIENT_SECRET ? '✅ Found' : '❌ Missing');

// 🔍 DEBUG: Log all requests
app.use((req, res, next) => {
  // console.log(`📥 ${req.method} ${req.path}`);
  next();
});
// ✅ ADD THIS DEBUG LINE
console.log(
  "🔑 Stripe Key Check:",
  process.env.STRIPE_SECRET_KEY
    ? "✅ Found (starts with " +
        process.env.STRIPE_SECRET_KEY.substring(0, 7) +
        ")"
    : "❌ NOT FOUND"
);
// console.log("📁 Current directory:", __dirname);
// console.log(
//   "📄 Looking for .env in:",
//   require("path").resolve(process.cwd(), ".env")
// );

// CORS configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);

// -------------------------------------------------------------------------
// --- 2. ROUTE DE WEBHOOK STRIPE (DOIT ÊTRE PLACÉE AVANT express.json()) ---
// -------------------------------------------------------------------------
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripeInstance.webhooks.constructEvent(
        req.body,
        sig,
        webhookSecret
      );
    } catch (err) {
      console.error(`⚠️ Webhook Signature Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`🔔 Webhook received: ${event.type}`);

    // Traitement des événements Stripe
    try {
      switch (event.type) {
        // Find this section in server.js and replace it:
        case "checkout.session.completed": {
          const session = event.data.object;
          // console.log(`✅ Checkout Session completed: ${session.id}`);

          // Récupérer les métadonnées
          const rentalId = session.metadata?.rentalId;

          if (!rentalId) {
            console.error("❌ No rentalId found in session metadata");
            break;
          }

          // console.log(`📝 Updating rental ${rentalId} with payment info`);

          // Importer les modèles nécessaires
          const Rental = require("./models/Rental");
          const Payment = require("./models/Payment");

          // 1. Get the rental to extract userId and ownerId
          const rental = await Rental.findById(rentalId);

          if (!rental) {
            console.error(`❌ Rental ${rentalId} not found`);
            break;
          }

          // 2. Mettre à jour le Rental avec tous les champs payment
          const updatedRental = await Rental.findByIdAndUpdate(
            rentalId,
            {
              // Update paymentInfo object
              "paymentInfo.status": "completed",
              "paymentInfo.method": "stripe",
              "paymentInfo.transactionId": session.payment_intent,
              "paymentInfo.amount": session.amount_total / 100,

              // Update payment object
              "payment.status": "held_in_escrow",
              "payment.method": "stripe",
              "payment.transactionId": session.payment_intent,
              "payment.amount": session.amount_total / 100,
              "payment.paidAt": new Date(),

              // Update top-level fields
              paymentStatus: "paid",
              paymentDate: new Date(),
              status: "active",
            },
            { new: true }
          );

          if (!updatedRental) {
            console.error(`❌ Rental ${rentalId} not found`);
            break;
          }

          // console.log(`✅ Rental updated successfully`);
          // console.log(`   Status: ${updatedRental.status}`);
          // console.log(
          //   `   Payment status: ${updatedRental.payment?.status || "N/A"}`
          // );

          // console.log(`✅ Rental updated successfully`);

          // 3. Update or create Payment record
          let payment = await Payment.findOne({ rentalId });

          if (payment) {
            // Update existing payment
            payment.transactionId = session.payment_intent;
            payment.status = "completed";
            payment.escrowStatus = "held";
            payment.paidAt = new Date();
            payment.escrowTimeline = payment.escrowTimeline || {};
            payment.escrowTimeline.paidAt = new Date();
            await payment.save();
            console.log(`✅ Payment record updated: ${payment._id}`);
          } else {
            // Create new payment if it doesn't exist
            payment = await Payment.create({
              rentalId: rentalId,
              transactionId: session.payment_intent,
              amount: session.amount_total / 100,
              currency: session.currency || "usd",
              status: "completed",
              method: "stripe",
              escrowStatus: "held",
              userId: rental.renterId,
              ownerId: rental.ownerId,
              payerId: rental.renterId,
              payeeId: rental.ownerId,
              paidAt: new Date(),
              stripeSessionId: session.id,
              escrowTimeline: {
                paidAt: new Date(),
              },
            });
            console.log(`✅ Payment record created: ${payment._id}`);
          }

          break;
        }

        case "payment_intent.succeeded": {
          const paymentIntent = event.data.object;
          console.log(
            `✅ PaymentIntent réussi (Transaction ID: ${paymentIntent.id})`
          );
          break;
        }

        case "transfer.succeeded": {
          const transfer = event.data.object;
          console.log(
            `✅ Transfert réussi vers le compte connecté: ${transfer.id}`
          );
          break;
        }

        case "payment_intent.payment_failed": {
          const failedPaymentIntent = event.data.object;
          console.error(`❌ PaymentIntent échoué: ${failedPaymentIntent.id}`);

          // Optionnel: Mettre à jour le rental en cas d'échec
          if (failedPaymentIntent.metadata?.rentalId) {
            const Rental = require("./models/Rental");
            await Rental.findByIdAndUpdate(
              failedPaymentIntent.metadata.rentalId,
              {
                "paymentInfo.status": "failed",
                paymentStatus: "failed",
              }
            );
          }
          break;
        }

        default:
          console.log(`Type d'événement Stripe non géré: ${event.type}`);
      }
    } catch (error) {
      console.error("❌ Error processing webhook:", error);
      // On retourne quand même 200 pour éviter les retry de Stripe
      // mais on log l'erreur pour investigation
    }

    // Retourner un '200 OK' rapidement à Stripe pour accuser réception
    res.json({ received: true });
  }
);
// -------------------------------------------------------------------------

// Global Middleware pour le reste de l'application
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration (required for Passport)
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

// Initialisation de la configuration Passport
require('./middleware/config/passport');
// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// MongoDB Connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB Connected Successfully"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// Routes publiques
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

// Routes API
app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/machines", require("./routes/machines"));
app.use("/api/rentals", require("./routes/rentals"));
app.use('/api/users', require('./routes/users'));  // ← ADD THIS
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/upload", require("./routes/upload"));
app.use('/api/payments', require('./routes/paymentRoutes'));


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
