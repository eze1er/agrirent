const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const dotenv = require('dotenv');
// Import de la librairie Stripe
const stripe = require('stripe'); 

dotenv.config();

// --- 1. INITIALISATION DE STRIPE ---
const stripeInstance = stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Initialisation de la configuration Passport
require('./middleware/config/passport');

const app = express();

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));

// -------------------------------------------------------------------------
// --- 2. ROUTE DE WEBHOOK STRIPE (DOIT ÊTRE PLACÉE AVANT express.json()) ---
// -------------------------------------------------------------------------
// Nous utilisons express.raw() uniquement pour cette route afin de garder
// le corps de la requête brut, nécessaire à la vérification de la signature.
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripeInstance.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    // Échec de la vérification de signature (potentielle tentative de fraude)
    console.error(`⚠️ Webhook Signature Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Événement vérifié et valide. On peut maintenant le traiter.
  
  // Dans un switch, vous traitez les différents événements envoyés par Stripe
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log(`✅ PaymentIntent réussi (Transaction ID: ${paymentIntent.id}). Déclenchement du séquestre/payout.`);
      // Dans une architecture d'escrow, c'est ici que vous pourriez confirmer la réception
      // des fonds dans le compte de la plateforme (si non fait par l'API de confirmation).
      break;

    case 'transfer.succeeded':
      const transfer = event.data.object;
      console.log(`✅ Transfert réussi vers le compte connecté: ${transfer.id}.`);
      // Ex: Mettre à jour le statut du versement chez le propriétaire.
      break;
    
    case 'payment_intent.payment_failed':
      const failedPaymentIntent = event.data.object;
      console.error(`❌ PaymentIntent échoué: ${failedPaymentIntent.id}.`);
      break;

    default:
      // Type d'événement non géré
      console.log(`Type d'événement Stripe non géré: ${event.type}`);
  }

  // Retourner un '200 OK' rapidement à Stripe pour accuser réception
  res.send();
});
// -------------------------------------------------------------------------

// Global Middleware pour le reste de l'application : 
// Maintenant, on peut parser les corps de requête JSON et URL-encoded.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Session configuration (required for Passport)
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// Routes publiques
app.get('/', (req, res) => {
  res.json({ 
    message: 'AgriRent API is running!',
    status: 'success',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

// Routes API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/machines', require('./routes/machines'));
app.use('/api/rentals', require('./routes/rentals'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/upload', require('./routes/upload'));
// Route de paiement mise à jour pour utiliser require() directement
app.use('/api/payments', require('./routes/paymentRoutes')); 

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Route not found' 
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Server Error'
  });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`API URL: http://localhost:${PORT}`);
});
