const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const Payment = require('../models/Payment');
const Rental = require('../models/Rental');
const User = require('../models/User');
const { sendEmail, sendSMS } = require('../utils/notifications'); 

// Initialisation conditionnelle de Stripe
let stripe = null;

// Initialize Stripe immediately when the module loads
if (process.env.STRIPE_SECRET_KEY) {
  try {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    console.log('✅ Stripe initialized in paymentRoutes with key:', 
      process.env.STRIPE_SECRET_KEY.substring(0, 10) + '...');
  } catch (error) {
    console.error('❌ Failed to initialize Stripe:', error.message);
  }
} else {
  console.warn('⚠️ No STRIPE_SECRET_KEY found in paymentRoutes.js');
  console.warn('   process.env.STRIPE_SECRET_KEY =', process.env.STRIPE_SECRET_KEY);
}

  
// Middleware pour s'assurer que Stripe est configuré
// Middleware pour s'assurer que Stripe est configuré
const requireStripe = (req, res, next) => {
  console.log('🔍 requireStripe check:', {
    stripeExists: !!stripe,
    envKeyExists: !!process.env.STRIPE_SECRET_KEY,
    keyPrefix: process.env.STRIPE_SECRET_KEY ? 
      process.env.STRIPE_SECRET_KEY.substring(0, 10) + '...' : 'NONE'
  });
  
  if (!stripe) {
    console.warn('⚠️ WARNING: STRIPE_SECRET_KEY not configured. Payment routes are disabled.');
    return res.status(503).json({
      success: false,
      message: 'Payment service not configured. Please add STRIPE_SECRET_KEY to environment variables.'
    });
  }
  next();
};
router.get('/stripe/test', (req, res) => {
  res.json({
    stripeConfigured: !!stripe,
    hasSecretKey: !!process.env.STRIPE_SECRET_KEY,
    keyPrefix: process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.substring(0, 7) : 'none'
  });
});
// ============== ✅ NEW: STRIPE CHECKOUT SESSION ==============
// This is what you need for the popup payment flow
router.post('/stripe/create-checkout-session', protect, requireStripe, async (req, res) => {
  try {
    const { rentalId } = req.body;

    console.log('Creating checkout session for rental:', rentalId);

    // Validate rental
    const rental = await Rental.findById(rentalId)
      .populate('machineId')
      .populate('ownerId');
      
    if (!rental) {
      return res.status(404).json({ success: false, message: 'Rental not found' });
    }

    // Check if user is the renter
    if (rental.renterId.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to pay for this rental' 
      });
    }

    // Get the amount from rental pricing
    const amount = rental.pricing?.totalPrice || rental.totalPrice;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid rental amount' 
      });
    }

    console.log('Amount to charge:', amount);

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Rental: ${rental.machineId?.name || 'Machine'}`,
            description: `Rental from ${rental.startDate} to ${rental.endDate}`,
            images: rental.machineId?.images?.[0] ? [rental.machineId.images[0]] : [],
          },
          unit_amount: Math.round(amount * 100), // Convert to cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/rentals/${rentalId}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/rentals/${rentalId}`,
      metadata: {
        rentalId: rentalId.toString(), // ⚠️ CRITICAL: This is what the webhook needs
        userId: req.user.id.toString(),
        ownerId: rental.ownerId._id.toString(),
        type: 'rental_payment',
      },
      customer_email: req.user.email,
    });

    console.log('✅ Checkout session created:', session.id);

    // Create a pending payment record
    await Payment.create({
      userId: req.user.id,
      rentalId,
      ownerId: rental.ownerId._id,
      amount,
      currency: 'usd',
      method: 'stripe',
      status: 'pending',
      escrowStatus: 'pending',
      transactionId: session.id, // Store session ID temporarily
      metadata: {
        checkoutSessionId: session.id,
      },
    });

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url, // Redirect user to this URL
      },
    });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// ============== VERIFY PAYMENT STATUS ==============
// Frontend can call this after payment to verify it worked
router.get('/stripe/verify-session/:sessionId', protect, requireStripe, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status === 'paid') {
      // Find the rental from metadata
      const rentalId = session.metadata?.rentalId;
      
      if (rentalId) {
        const rental = await Rental.findById(rentalId);
        const payment = await Payment.findOne({ rentalId });
        
        res.json({
          success: true,
          paid: true,
          rental: {
            id: rental?._id,
            status: rental?.status,
            paymentStatus: rental?.paymentInfo?.status,
          },
          payment: {
            id: payment?._id,
            status: payment?.status,
            escrowStatus: payment?.escrowStatus,
          }
        });
      } else {
        res.json({
          success: true,
          paid: true,
          message: 'Payment successful but rental not found in metadata'
        });
      }
    } else {
      res.json({
        success: false,
        paid: false,
        status: session.payment_status
      });
    }
  } catch (error) {
    console.error('Verify session error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// ============== STRIPE ESCROW PAYMENT (Keep existing) ==============

// Créer l'intention de paiement et retenir les fonds en séquestre
router.post('/stripe/create-intent', protect, requireStripe, async (req, res) => {
  try {
    const { amount, currency = 'usd', rentalId } = req.body;

    console.log('Creating payment intent:', { amount, currency, rentalId });

    // Validate rental
    const rental = await Rental.findById(rentalId);
    if (!rental) {
      return res.status(404).json({ success: false, message: 'Rental not found' });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
      metadata: {
        rentalId: rentalId,
        userId: req.user.id,
        ownerId: rental.ownerId.toString(),
        type: 'escrow',
      },
    });

    console.log('Payment intent created:', paymentIntent.id);

    // Save payment record
    const payment = await Payment.create({
      userId: req.user.id,
      rentalId,
      ownerId: rental.ownerId,
      amount,
      currency,
      method: 'stripe',
      status: 'pending',
      escrowStatus: 'pending',
      transactionId: paymentIntent.id,
      metadata: {
        clientSecret: paymentIntent.client_secret,
      },
    });

    res.json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        paymentId: payment._id,
      },
    });
  } catch (error) {
    console.error('Stripe payment error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Confirmer le paiement et le marquer comme détenu en séquestre
router.post('/stripe/confirm', protect, requireStripe, async (req, res) => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Payment intent ID is required' 
      });
    }

    console.log('Confirming payment intent:', paymentIntentId);

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      const payment = await Payment.findOne({ transactionId: paymentIntentId });
      
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment record not found'
        });
      }

      await payment.markAsHeldInEscrow();
      payment.escrowTimeline.paidAt = new Date();
      await payment.save();

      await Rental.findByIdAndUpdate(payment.rentalId, {
        status: 'active',
        'payment.status': 'held_in_escrow',
        'payment.transactionId': paymentIntentId,
        'payment.method': 'stripe',
        'payment.amount': payment.amount,
        'payment.paidAt': new Date(),
      });

      res.json({ 
        success: true, 
        message: 'Payment held in escrow',
        data: payment 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: 'Payment not completed. Status: ' + paymentIntent.status 
      });
    }
  } catch (error) {
    console.error('Stripe confirm error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// ============== REST OF YOUR EXISTING ROUTES ==============
// (Keep all your other routes exactly as they are)

// RENTER CONFIRMATION
router.post('/confirm-completion/:rentalId', protect, async (req, res) => {
  try {
    const { rentalId } = req.params;
    const { confirmationNote } = req.body;

    const rental = await Rental.findById(rentalId)
      .populate('ownerId')
      .populate('renterId')
      .populate('machineId');
    
    if (!rental) {
      return res.status(404).json({ success: false, message: 'Rental not found' });
    }

    if (rental.renterId._id.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only the renter can confirm completion' 
      });
    }

    if (rental.status !== 'active' && rental.status !== 'completed') {
       return res.status(400).json({ 
        success: false, 
        message: 'Rental is not in a state ready for completion confirmation.' 
      });
    }

    const payment = await Payment.findOne({ rentalId });
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    if (payment.escrowStatus !== 'held') {
      return res.status(400).json({ 
        success: false, 
        message: 'Payment is not held in escrow' 
      });
    }

    await payment.confirmByRenter(confirmationNote);

    rental.renterConfirmedCompletion = true;
    rental.renterConfirmedAt = new Date();
    await rental.save();

    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: 'Libération de Paiement en Attente - Locataire Confirmé',
      html: `
        <h2>Le Locataire a Confirmé la Fin de la Location</h2>
        <p><strong>ID Location:</strong> ${rental._id}</p>
        <p><strong>Machine:</strong> ${rental.machineId.name}</p>
        <p><strong>Montant:</strong> $${payment.amount}</p>
        <p><strong>Propriétaire:</strong> ${rental.ownerId.firstName} ${rental.ownerId.lastName}</p>
        <p><strong>Note du Locataire:</strong> ${confirmationNote || 'Aucune note fournie'}</p>
        <p>Veuillez vérifier et libérer le paiement au propriétaire.</p>
        <a href="${process.env.ADMIN_DASHBOARD_URL}/payments/${payment._id}">Examiner le Paiement</a>
      `,
    });

    await sendEmail({
      to: rental.ownerId.email,
      subject: 'Location Confirmée - Paiement en Cours de Traitement',
      html: `
        <h2>Le Locataire a Confirmé la Fin</h2>
        <p>Le locataire a confirmé que la location de "${rental.machineId.name}" est terminée.</p>
        <p>AgriRent est en train de vérifier la transaction et votre paiement sera libéré dans les 24-48 heures.</p>
        <p><strong>Montant à recevoir:</strong> $${payment.netAmountToOwner.toFixed(2)}</p>
      `,
    });

    res.json({ 
      success: true, 
      message: 'Achèvement confirmé. Le paiement sera vérifié et libéré.',
      data: payment 
    });
  } catch (error) {
    console.error('Confirmation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============== ADMIN VERIFICATION & RELEASE ==============

// Admin verifies and releases payment
router.post('/admin/verify-and-release/:paymentId', 
  protect, 
  authorize('admin'), 
  requireStripe,
  async (req, res) => {
    try {
      const { paymentId } = req.params;
      const { adminNote } = req.body;

      const payment = await Payment.findById(paymentId)
        .populate('userId', 'firstName lastName email')
        .populate('ownerId', 'firstName lastName email stripeAccountId')
        .populate('rentalId');

      if (!payment) {
        return res.status(404).json({ success: false, message: 'Payment not found' });
      }

      if (payment.escrowStatus !== 'held') {
        return res.status(400).json({ 
          success: false, 
          message: 'Payment is not in escrow' 
        });
      }

      if (!payment.confirmations?.renterConfirmed) {
        return res.status(400).json({ 
          success: false, 
          message: 'Renter has not confirmed completion yet' 
        });
      }

      // Mark as verified and released
      payment.escrowStatus = 'released';
      payment.status = 'completed';
      payment.confirmations = payment.confirmations || {};
      payment.confirmations.adminVerified = true;
      payment.confirmations.adminVerifiedAt = new Date();
      payment.confirmations.adminVerifiedBy = req.user.id;
      payment.confirmations.adminNote = adminNote;
      
      if (!payment.escrowTimeline) payment.escrowTimeline = {};
      payment.escrowTimeline.releasedAt = new Date();
      
      await payment.save();

      // Update rental payment status
      await Rental.findByIdAndUpdate(payment.rentalId, {
        'payment.status': 'completed',
        'paymentInfo.status': 'released'
      });

      // TODO: Transfer to owner's Stripe account if connected
      // if (payment.ownerId.stripeAccountId) {
      //   const transfer = await stripe.transfers.create({
      //     amount: Math.round(payment.amount * 100),
      //     currency: 'usd',
      //     destination: payment.ownerId.stripeAccountId,
      //   });
      // }

      // Notify owner
      await sendEmail({
        to: payment.ownerId.email,
        subject: '💰 Payment Released - Funds Available!',
        html: `
          <h2>🎉 Payment Released!</h2>
          <p>Great news! Your payment has been released by AgriRent.</p>
          <p><strong>Amount:</strong> $${payment.amount.toFixed(2)}</p>
          <p><strong>Rental ID:</strong> ${payment.rentalId._id}</p>
          <p>The funds will arrive in your account within 2-5 business days.</p>
        `,
      });

      res.json({ 
        success: true, 
        message: 'Payment verified and released to owner',
        data: payment 
      });
    } catch (error) {
      console.error('Release error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
});

// Get all pending releases (admin only)
router.get('/admin/pending-releases', protect, authorize('admin'), async (req, res) => {
  try {
    const pendingPayments = await Payment.find({
      escrowStatus: 'held',
      'confirmations.renterConfirmed': true,
      'confirmations.adminVerified': false
    })
      .populate('userId', 'firstName lastName email')
      .populate('ownerId', 'firstName lastName email')
      .populate('rentalId', 'machineId status')
      .sort({ 'confirmations.renterConfirmedAt': 1 });

    res.json({ success: true, data: pendingPayments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
// Keep all your other existing routes...
// (I'm keeping the code shorter here, but include ALL your other routes)

router.post('/debug-payment', protect, async (req, res) => {
  try {
    const { rentalId } = req.body;
    
    if (!rentalId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Rental ID is required' 
      });
    }
    
    const rental = await Rental.findById(rentalId)
      .populate('renterId', 'firstName lastName email')
      .populate('ownerId', 'firstName lastName email')
      .populate('machineId', 'name');
      
    const payment = await Payment.findOne({ rentalId });
    
    res.json({
      success: true,
      rental: rental ? {
        id: rental._id,
        machine: rental.machineId?.name,
        renter: rental.renterId?.email,
        owner: rental.ownerId?.email,
        status: rental.status,
        payment: rental.payment,
        paymentInfo: rental.paymentInfo,
        amount: rental.pricing?.totalPrice,
      } : null,
      payment: payment ? {
        id: payment._id,
        transactionId: payment.transactionId,
        escrowStatus: payment.escrowStatus,
        amount: payment.amount,
        status: payment.status,
      } : null
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;