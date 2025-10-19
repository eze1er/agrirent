const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const Payment = require('../models/Payment');
const Rental = require('../models/Rental');
const User = require('../models/User');
const { sendEmail } = require('../services/emailService'); // Use your existing email service
// Note: sendSMS not used in this file, so removed

// Initialize Stripe
let stripe = null;
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
}

// Middleware: ensure Stripe is configured
const requireStripe = (req, res, next) => {
  if (!stripe) {
    return res.status(503).json({
      success: false,
      message: 'Payment service not configured. Please add STRIPE_SECRET_KEY to environment variables.'
    });
  }
  next();
};

// Test endpoint
router.get('/stripe/test', (req, res) => {
  res.json({
    stripeConfigured: !!stripe,
    hasSecretKey: !!process.env.STRIPE_SECRET_KEY,
    keyPrefix: process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.substring(0, 7) : 'none'
  });
});

// ============== STRIPE CHECKOUT SESSION ==============
router.post('/stripe/create-checkout-session', protect, requireStripe, async (req, res) => {
  try {
    const { rentalId } = req.body;
    const rental = await Rental.findById(rentalId)
      .populate('machineId')
      .populate('ownerId');
      
    if (!rental) {
      return res.status(404).json({ success: false, message: 'Rental not found' });
    }

    if (rental.renterId.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to pay for this rental' 
      });
    }

    const amount = rental.pricing?.totalPrice || rental.totalPrice;
    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid rental amount' 
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Rental: ${rental.machineId?.name || 'Machine'}`,
            description: rental.rentalType === 'daily' 
              ? `Rental from ${new Date(rental.startDate).toLocaleDateString()} to ${new Date(rental.endDate).toLocaleDateString()}`
              : `Work on ${new Date(rental.workDate).toLocaleDateString()} for ${rental.pricing?.numberOfHectares || 0} Ha`,
            images: rental.machineId?.images?.[0] ? [rental.machineId.images[0]] : [],
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/rentals/${rentalId}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/rentals/${rentalId}`,
      metadata: {
        rentalId: rentalId.toString(),
        userId: req.user.id.toString(),
        ownerId: rental.ownerId._id.toString(),
        type: 'rental_payment',
      },
      customer_email: req.user.email,
    });

    // Create pending payment record
    await Payment.create({
      userId: req.user.id,
      rentalId,
      ownerId: rental.ownerId._id,
      amount,
      currency: 'usd',
      method: 'stripe',
      status: 'pending',
      escrowStatus: 'pending',
      transactionId: session.id,
      metadata: {
        checkoutSessionId: session.id,
      },
    });

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
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
router.get('/stripe/verify-session/:sessionId', protect, requireStripe, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status === 'paid') {
      const rentalId = session.metadata?.rentalId;
      const rental = rentalId ? await Rental.findById(rentalId) : null;
      const payment = rentalId ? await Payment.findOne({ rentalId }) : null;
      
      res.json({
        success: true,
        paid: true,
        rental: rental ? {
          id: rental._id,
          status: rental.status,
        } : null,
        payment: payment ? {
          id: payment._id,
          status: payment.status,
          escrowStatus: payment.escrowStatus,
        } : null
      });
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

// ============== STRIPE ESCROW PAYMENT ==============
router.post('/stripe/create-intent', protect, requireStripe, async (req, res) => {
  try {
    const { amount, currency = 'usd', rentalId } = req.body;
    const rental = await Rental.findById(rentalId);
    if (!rental) {
      return res.status(404).json({ success: false, message: 'Rental not found' });
    }

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

// ============== CREATE PAYMENT (Simplified for testing) ==============
router.post('/create-payment', protect, requireStripe, async (req, res) => {
  try {
    const { rentalId, paymentMethod } = req.body;

    console.log('💳 Payment request received:', { rentalId, paymentMethod });

    const rental = await Rental.findById(rentalId)
      .populate('machineId')
      .populate('renterId')
      .populate('ownerId');

    if (!rental) {
      return res.status(404).json({
        success: false,
        message: 'Rental not found'
      });
    }

    if (rental.renterId._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to pay for this rental'
      });
    }

    if (rental.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Rental must be approved before payment'
      });
    }

    const amount = rental.pricing?.totalPrice || 0;
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid rental amount'
      });
    }

    console.log('💰 Creating payment intent for amount:', amount);

    // Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      payment_method: paymentMethod,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never'
      },
      metadata: {
        rentalId: rental._id.toString(),
        machineId: rental.machineId._id.toString(),
        renterId: rental.renterId._id.toString(),
        ownerId: rental.ownerId._id.toString()
      }
    });

    console.log('✅ Payment intent created:', paymentIntent.id, 'Status:', paymentIntent.status);

    // Create payment record
    const payment = await Payment.create({
      userId: req.user.id,
      rentalId: rental._id,
      ownerId: rental.ownerId._id,
      amount: amount,
      currency: 'usd',
      method: 'stripe',
      status: 'completed',
      escrowStatus: 'held',
      transactionId: paymentIntent.id,
      escrowTimeline: {
        paidAt: new Date(),
        heldAt: new Date()
      },
      metadata: {
        paymentIntentId: paymentIntent.id
      }
    });

    console.log('💾 Payment record created:', payment._id);

    // ✅ UPDATE RENTAL STATUS TO 'ACTIVE'
    rental.status = 'active';
    rental.payment = {
      status: 'held_in_escrow',
      transactionId: paymentIntent.id,
      method: 'stripe',
      amount: amount,
      paidAt: new Date()
    };
    await rental.save();

    console.log('✅ Rental status updated to: active');

    // ✅ UPDATE MACHINE STATUS TO 'RENTED'
    const Machine = require('../models/Machine');
    const machine = await Machine.findById(rental.machineId._id);
    if (machine) {
      machine.availability = 'rented';
      await machine.save();
      console.log(`✅ Machine ${machine.name} status updated to: rented`);
    }

    // Send confirmation emails
    try {
      // Email to renter
      await sendEmail({
        to: rental.renterId.email,
        subject: '✅ Payment Successful - Rental Confirmed',
        html: `
          <h2>Payment Successful!</h2>
          <p>Hi ${rental.renterId.firstName},</p>
          <p>Your payment of <strong>$${amount.toFixed(2)}</strong> has been received and is held securely in escrow.</p>
          <p><strong>Machine:</strong> ${rental.machineId.name}</p>
          <p><strong>Transaction ID:</strong> ${paymentIntent.id}</p>
          <p>Your funds will be released to the owner once you confirm the service is complete.</p>
          <p>Thank you for using AgriRent!</p>
        `
      });

      // Email to owner
      await sendEmail({
        to: rental.ownerId.email,
        subject: '💰 Payment Received - Rental Active',
        html: `
          <h2>Payment Received!</h2>
          <p>Hi ${rental.ownerId.firstName},</p>
          <p>Great news! Payment for your machine rental has been received.</p>
          <p><strong>Machine:</strong> ${rental.machineId.name}</p>
          <p><strong>Amount:</strong> $${amount.toFixed(2)}</p>
          <p><strong>Renter:</strong> ${rental.renterId.firstName} ${rental.renterId.lastName}</p>
          <p>The payment is held securely in escrow and will be released to you once the service is completed and confirmed.</p>
          <p>Thank you for using AgriRent!</p>
        `
      });

      console.log('✅ Confirmation emails sent');
    } catch (emailError) {
      console.error('❌ Email sending failed:', emailError);
    }

    res.json({
      success: true,
      message: 'Payment successful',
      data: {
        transactionId: paymentIntent.id,
        rental: {
          id: rental._id,
          status: rental.status,
          machine: rental.machineId.name
        },
        payment: {
          id: payment._id,
          amount: payment.amount,
          escrowStatus: payment.escrowStatus
        }
      }
    });
  } catch (error) {
    console.error('❌ Payment error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Payment processing failed'
    });
  }
});
router.post('/stripe/confirm', protect, requireStripe, async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    
    console.log('💳 Payment confirmation request:', paymentIntentId);
    
    if (!paymentIntentId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Payment intent ID is required' 
      });
    }

    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    console.log('📋 Payment intent status:', paymentIntent.status);
    
    if (paymentIntent.status === 'succeeded') {
      // Find payment record
      const payment = await Payment.findOne({ transactionId: paymentIntentId });
      
      if (!payment) {
        console.error('❌ Payment record not found for:', paymentIntentId);
        return res.status(404).json({ 
          success: false, 
          message: 'Payment record not found' 
        });
      }

      console.log('📦 Found payment record:', payment._id);
      console.log('📦 Rental ID:', payment.rentalId);

      // Update payment status
      payment.status = 'completed';
      payment.escrowStatus = 'held';
      payment.escrowTimeline = payment.escrowTimeline || {};
      payment.escrowTimeline.paidAt = new Date();
      payment.escrowTimeline.heldAt = new Date();
      await payment.save();
      
      console.log('✅ Payment updated to held in escrow');

      // ✅ CRITICAL: Update rental status to 'active'
      const Rental = require('../models/Rental');
      const rental = await Rental.findById(payment.rentalId);
      
      if (!rental) {
        console.error('❌ Rental not found:', payment.rentalId);
        return res.status(404).json({ 
          success: false, 
          message: 'Rental not found' 
        });
      }

      console.log('📦 Current rental status:', rental.status);

      // Update rental with payment info
      rental.status = 'active';
      rental.payment = {
        status: 'held_in_escrow',
        transactionId: paymentIntentId,
        method: 'stripe',
        amount: payment.amount,
        paidAt: new Date()
      };
      await rental.save();

      console.log('✅ Rental updated to ACTIVE with payment info');

      // ✅ Update machine to 'rented'
      const Machine = require('../models/Machine');
      if (rental.machineId) {
        await Machine.findByIdAndUpdate(rental.machineId, {
          availability: 'rented'
        });
        console.log('✅ Machine updated to rented');
      }

      res.json({ 
        success: true, 
        message: 'Payment held in escrow, rental is now active',
        data: {
          payment: {
            id: payment._id,
            status: payment.status,
            escrowStatus: payment.escrowStatus
          },
          rental: {
            id: rental._id,
            status: rental.status,
            paymentStatus: rental.payment?.status
          }
        }
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: 'Payment not completed. Status: ' + paymentIntent.status 
      });
    }
  } catch (error) {
    console.error('❌ Stripe confirm error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// ============== RENTER CONFIRMATION ==============
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

    if (rental.status !== 'active') {
      return res.status(400).json({ 
        success: false, 
        message: 'Rental must be active to confirm completion' 
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

    // Update payment
    payment.confirmations = payment.confirmations || {};
    payment.confirmations.renterConfirmed = true;
    payment.confirmations.renterConfirmedAt = new Date();
    payment.confirmations.renterConfirmationNote = confirmationNote;
    await payment.save();

    // Update rental
    rental.renterConfirmedCompletion = true;
    rental.renterConfirmedAt = new Date();
    await rental.save();

    // Notify admin and owner
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
        <p><strong>Montant à recevoir:</strong> $${payment.amount.toFixed(2)}</p>
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

      // Release payment
      payment.escrowStatus = 'released';
      payment.status = 'completed';
      payment.confirmations.adminVerified = true;
      payment.confirmations.adminVerifiedAt = new Date();
      payment.confirmations.adminVerifiedBy = req.user.id;
      payment.confirmations.adminNote = adminNote;
      payment.escrowTimeline = payment.escrowTimeline || {};
      payment.escrowTimeline.releasedAt = new Date();
      await payment.save();

      // Update rental
      await Rental.findByIdAndUpdate(payment.rentalId, {
        'payment.status': 'completed',
        'paymentInfo.status': 'released'
      });

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

// ============== ADMIN: GET PENDING RELEASES ==============
// ✅ UPDATED AS REQUESTED
router.get('/admin/pending-releases', protect, authorize('admin'), async (req, res) => {
  try {
    const pendingPayments = await Payment.find({
      escrowStatus: 'held',
      $or: [
        { 'confirmations.renterConfirmed': true },
        { renterConfirmed: true }  // ✅ Add this to check both locations
      ],
      $or: [
        { 'confirmations.adminVerified': { $ne: true } },
        { adminVerified: { $ne: true } }
      ]
    })
      .populate('userId', 'firstName lastName email')
      .populate('ownerId', 'firstName lastName email')
      .populate('rentalId', 'machineId status')
      .sort({ 'confirmations.renterConfirmedAt': 1 });

    console.log(`📊 Found ${pendingPayments.length} pending releases`);

    res.json({ success: true, data: pendingPayments });
  } catch (error) {
    console.error('❌ Error fetching pending releases:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all released payments (admin only)
router.get('/admin/released-payments', protect, authorize('admin'), async (req, res) => {
  try {
    const releasedPayments = await Payment.find({
      escrowStatus: 'released',
      'confirmations.adminVerified': true
    })
      .populate('userId', 'firstName lastName email')
      .populate('ownerId', 'firstName lastName email')
      .populate('rentalId', 'machineId status')
      .sort({ 'escrowTimeline.releasedAt': -1 }) // Most recent first
      .limit(50); // Limit to last 50 releases

    console.log(`✅ Found ${releasedPayments.length} released payments`);

    res.json({ success: true, data: releasedPayments });
  } catch (error) {
    console.error('❌ Error fetching released payments:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============== DEBUG ENDPOINT ==============
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

const crypto = require('crypto');

router.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('❌ Webhook signature invalid:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle successful checkout
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const rentalId = session.metadata?.rentalId;

    if (rentalId) {
      // ✅ FIX: Update rental to 'active' when payment succeeds
      const rental = await Rental.findByIdAndUpdate(
        rentalId, 
        { 
          status: 'active',  // ← Changed from whatever it was
          'payment.status': 'held_in_escrow',
          'payment.transactionId': session.payment_intent,
          'payment.paidAt': new Date()
        },
        { new: true }
      );

      // Update payment to 'held in escrow'
      await Payment.findOneAndUpdate(
        { rentalId },
        {
          status: 'completed',
          escrowStatus: 'held',
          'escrowTimeline.paidAt': new Date(),
          'escrowTimeline.heldAt': new Date()
        }
      );
      
      console.log(`✅ Rental ${rentalId} activated via webhook, status: ${rental.status}`);
    }
  }

  res.json({ received: true });
});

module.exports = router;