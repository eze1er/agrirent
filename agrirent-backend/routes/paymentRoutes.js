const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const Payment = require('../models/Payment');
const Rental = require('../models/Rental');
const User = require('../models/User');
// Assurez-vous d'avoir les utilitaires pour l'envoi d'e-mails/SMS
const { sendEmail, sendSMS } = require('../utils/notifications'); 

// Initialisation conditionnelle de Stripe
const stripe = process.env.STRIPE_SECRET_KEY 
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

// Middleware pour s'assurer que Stripe est configuré
const requireStripe = (req, res, next) => {
  if (!stripe) {
    console.warn('⚠️ WARNING: STRIPE_SECRET_KEY not configured. Payment routes are disabled.');
    return res.status(503).json({
      success: false,
      message: 'Payment service not configured. Please add STRIPE_SECRET_KEY to environment variables.'
    });
  }
  next();
};

// ============== STRIPE ESCROW PAYMENT ==============

// Créer l'intention de paiement et retenir les fonds en séquestre
router.post('/stripe/create-intent', protect, requireStripe, async (req, res) => {
  try {
    const { amount, currency = 'usd', rentalId } = req.body;

    const rental = await Rental.findById(rentalId).populate('ownerId');
    if (!rental) {
      return res.status(404).json({ success: false, message: 'Rental not found' });
    }

    // Création de l'intention de paiement Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Stripe utilise les centimes
      currency,
      metadata: {
        rentalId: rentalId,
        userId: req.user.id,
        ownerId: rental.ownerId._id.toString(),
        type: 'escrow',
      },
      // Important: Pas de transfert immédiat, les fonds restent sur le compte de la plateforme
      transfer_data: undefined,
      // Méthode de capture immédiate
      capture_method: 'automatic',
    });

    // Enregistrement du paiement avec statut en séquestre ('pending')
    const payment = await Payment.create({
      userId: req.user.id,
      rentalId,
      ownerId: rental.ownerId._id,
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
        paymentId: payment._id,
      },
    });
  } catch (error) {
    console.error('Stripe payment error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Confirmer le paiement et le marquer comme détenu en séquestre
router.post('/stripe/confirm', protect, async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    
    // Si stripe est null, le middleware requireStripe l'aurait bloqué, mais double vérification
    if (!stripe) {
      return res.status(503).json({ success: false, message: 'Payment service not configured.' });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      const payment = await Payment.findOne({ transactionId: paymentIntentId });
      
      if (!payment) {
         return res.status(404).json({ success: false, message: 'Payment record not found' });
      }

      // Marquer comme détenu en séquestre (held)
      await payment.markAsHeldInEscrow();
      payment.escrowTimeline.paidAt = new Date();
      await payment.save();

      // Mettre à jour la location
      await Rental.findByIdAndUpdate(payment.rentalId, {
        status: 'active', // Maintenant actif puisque payé
        'payment.status': 'held_in_escrow',
        'payment.transactionId': paymentIntentId,
        'payment.method': 'stripe',
        'payment.amount': payment.amount,
      });

      // Notifier le propriétaire que le paiement est sécurisé
      const rental = await Rental.findById(payment.rentalId)
        .populate('machineId')
        .populate('renterId')
        .populate('ownerId'); // Populer ownerId car il est utilisé pour l'email
      
      await sendEmail({
        to: rental.ownerId.email,
        subject: 'Paiement Sécurisé - Location Active',
        html: `
          <h2>Paiement Sécurisé en Séquestre</h2>
          <p>Bonne nouvelle! Le locataire a payé $${payment.amount} pour "${rental.machineId.name}".</p>
          <p>Le paiement est détenu en toute sécurité par AgriRent et vous sera versé une fois la location terminée et confirmée.</p>
          <p><strong>Locataire:</strong> ${rental.renterId.firstName} ${rental.renterId.lastName}</p>
          <p><strong>Statut:</strong> Paiement Détenu en Séquestre</p>
        `,
      });

      res.json({ 
        success: true, 
        message: 'Payment held in escrow. Owner will be notified.',
        data: payment 
      });
    } else {
      res.status(400).json({ success: false, message: 'Payment not completed' });
    }
  } catch (error) {
    console.error('Stripe confirm error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============== RENTER CONFIRMATION ==============

// Le locataire confirme que le travail est terminé
router.post('/confirm-completion/:rentalId', protect, async (req, res) => {
  try {
    const { rentalId } = req.params;
    const { confirmationNote } = req.body;

    const rental = await Rental.findById(rentalId)
      .populate('ownerId')
      .populate('renterId')
      .populate('machineId'); // Populer pour la notification
    
    if (!rental) {
      return res.status(404).json({ success: false, message: 'Rental not found' });
    }

    // Vérifier que c'est bien le locataire
    if (rental.renterId._id.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only the renter can confirm completion' 
      });
    }

    // Vérifier que la location est en statut "completed" (ou active, selon votre workflow)
    // J'ai ajusté la condition pour être plus tolérant si le statut est 'active' ou 'completed'
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

    // Confirmation par le locataire
    await payment.confirmByRenter(confirmationNote);

    // Mettre à jour la location
    rental.renterConfirmedCompletion = true;
    rental.renterConfirmedAt = new Date();
    await rental.save();

    // Notifier l'administrateur pour vérification
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

    // Notifier le propriétaire
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

// L'administrateur vérifie et libère le paiement
router.post('/admin/verify-and-release/:paymentId', 
  protect, 
  authorize('admin'), 
  requireStripe,
  async (req, res) => {
    try {
      const { paymentId } = req.params;
      const { adminNote } = req.body;

      const payment = await Payment.findById(paymentId)
        .populate('userId')
        .populate('ownerId')
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

      if (!payment.confirmations.renterConfirmed) {
        return res.status(400).json({ 
          success: false, 
          message: 'Renter has not confirmed completion yet' 
        });
      }

      // Vérification par l'administrateur
      await payment.verifyByAdmin(req.user.id, adminNote);

      // Libération du séquestre
      await payment.releaseToOwner();

      // Création du transfert Stripe vers le compte connecté du propriétaire
      if (payment.method === 'stripe' && payment.ownerId.stripeAccountId) {
        const transfer = await stripe.transfers.create({
          amount: Math.round(payment.payout.amount * 100),
          currency: payment.currency.toLowerCase(),
          destination: payment.ownerId.stripeAccountId,
          transfer_group: payment.rentalId._id.toString(),
          metadata: {
            paymentId: payment._id.toString(),
            rentalId: payment.rentalId._id.toString(),
          },
        });

        payment.payout.status = 'completed';
        payment.payout.payoutTransactionId = transfer.id;
        payment.payout.payoutAt = new Date();
        await payment.save();
      } else {
        // Si pas de compte connecté, paiement manuel en attente
        payment.payout.status = 'pending';
        await payment.save();
      }

      // Notifier le propriétaire
      await sendEmail({
        to: payment.ownerId.email,
        subject: 'Paiement Libéré - Fonds en Route!',
        html: `
          <h2>💰 Paiement Libéré!</h2>
          <p>Excellente nouvelle! Votre paiement pour la location #${payment.rentalId._id} a été libéré.</p>
          <p><strong>Montant:</strong> $${payment.payout.amount.toFixed(2)}</p>
          <p><strong>Frais de Plateforme:</strong> $${payment.platformFee.amount.toFixed(2)}</p>
          <p>Les fonds arriveront sur votre compte d'ici 2 à 5 jours ouvrables.</p>
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

// ============== DISPUTE MANAGEMENT ==============

// Ouvrir un litige
router.post('/dispute/open/:rentalId', protect, async (req, res) => {
  try {
    const { rentalId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.length < 20) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide a detailed reason (min 20 characters)' 
      });
    }

    const rental = await Rental.findById(rentalId).populate('ownerId').populate('renterId');
    if (!rental) {
      return res.status(404).json({ success: false, message: 'Rental not found' });
    }

    // Vérifier si l'utilisateur est le locataire ou le propriétaire
    const isRenter = rental.renterId._id.toString() === req.user.id;
    const isOwner = rental.ownerId._id.toString() === req.user.id;
    
    if (!isRenter && !isOwner) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only renter or owner can open a dispute' 
      });
    }

    const payment = await Payment.findOne({ rentalId });
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    if (payment.escrowStatus !== 'held') {
      return res.status(400).json({ 
        success: false, 
        message: 'Can only dispute payments held in escrow' 
      });
    }

    // Ouvrir le litige
    await payment.openDispute(req.user.id, reason);

    // Mettre à jour la location
    rental.status = 'disputed';
    await rental.save();

    // Notifier l'administrateur
    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: '⚠️ Litige de Paiement Ouvert',
      html: `
        <h2>Litige de Paiement Ouvert</h2>
        <p><strong>ID Location:</strong> ${rental._id}</p>
        <p><strong>Montant:</strong> $${payment.amount}</p>
        <p><strong>Ouvert par:</strong> ${isRenter ? 'Locataire' : 'Propriétaire'}</p>
        <p><strong>Raison:</strong> ${reason}</p>
        <p>Veuillez examiner et résoudre ce litige.</p>
        <a href="${process.env.ADMIN_DASHBOARD_URL}/disputes/${payment._id}">Examiner le Litige</a>
      `,
    });

    // Notifier l'autre partie
    const otherParty = isRenter ? rental.ownerId : rental.renterId;
    await sendEmail({
      to: otherParty.email,
      subject: 'Litige Ouvert pour Votre Location',
      html: `
        <h2>Un Litige a été Ouvert</h2>
        <p>Un litige a été ouvert pour la location #${rental._id}.</p>
        <p>Notre équipe examinera le cas et contactera les deux parties.</p>
        <p>Vos fonds sont sécurisés et seront gérés équitablement.</p>
      `,
    });

    res.json({ 
      success: true, 
      message: 'Dispute opened. Our team will review within 24 hours.',
      data: payment 
    });
  } catch (error) {
    console.error('Dispute error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// L'administrateur résout le litige
router.post('/admin/resolve-dispute/:paymentId', 
  protect, 
  authorize('admin'), 
  requireStripe,
  async (req, res) => {
    try {
      const { paymentId } = req.params;
      const { outcome, resolution, refundAmount, releaseAmount } = req.body;

      const payment = await Payment.findById(paymentId)
        .populate('userId')
        .populate('ownerId');

      if (!payment) {
        return res.status(404).json({ success: false, message: 'Payment not found' });
      }

      if (!payment.dispute.isDisputed) {
        return res.status(400).json({ 
          success: false, 
          message: 'No active dispute for this payment' 
        });
      }

      // Définir les montants en fonction du résultat
      if (outcome === 'partial_refund' || outcome === 'split') {
        payment.dispute.refundAmount = refundAmount;
        payment.dispute.releaseAmount = releaseAmount;
      }

      // Résoudre le litige
      await payment.resolveDispute(req.user.id, outcome, resolution);

      // Traiter le remboursement si nécessaire
      if (['refund_to_renter', 'partial_refund', 'split'].includes(outcome)) {
        // Le montant à rembourser est le montant total ou le montant spécifié
        const amountToRefund = outcome === 'refund_to_renter' 
            ? payment.amount 
            : refundAmount;

        const refund = await stripe.refunds.create({
          payment_intent: payment.transactionId,
          amount: Math.round(amountToRefund * 100),
          reason: 'requested_by_customer',
          metadata: {
            paymentId: payment._id.toString(),
            disputeResolution: outcome,
          },
        });

        payment.refund.refundId = refund.id;
        payment.refund.refundedAt = new Date();
        await payment.save();
      }

      // Traiter le versement si nécessaire
      if (['release_to_owner', 'partial_refund', 'split'].includes(outcome)) {
        if (payment.ownerId.stripeAccountId) {
          // Le montant à verser est le net ou le montant spécifié
          const payoutAmount = outcome === 'release_to_owner' 
            ? payment.netAmountToOwner 
            : releaseAmount;

          if (payoutAmount > 0) {
            const transfer = await stripe.transfers.create({
              amount: Math.round(payoutAmount * 100),
              currency: payment.currency.toLowerCase(),
              destination: payment.ownerId.stripeAccountId,
            });

            payment.payout.status = 'completed';
            payment.payout.payoutTransactionId = transfer.id;
            payment.payout.payoutAt = new Date();
            await payment.save();
          }
        }
      }

      // Notifier les deux parties
      await sendEmail({
        to: payment.userId.email,
        subject: 'Litige Résolu',
        html: `
          <h2>Résolution du Litige</h2>
          <p>Votre litige a été résolu.</p>
          <p><strong>Résultat:</strong> ${outcome.replace(/_/g, ' ')}</p>
          <p><strong>Résolution:</strong> ${resolution}</p>
          ${payment.refund.refundId ? `<p><strong>Montant Remboursé:</strong> $${(payment.refund.refundId && refundAmount) ? refundAmount.toFixed(2) : 'N/A'}</p>` : ''}
        `,
      });

      await sendEmail({
        to: payment.ownerId.email,
        subject: 'Litige Résolu',
        html: `
          <h2>Résolution du Litige</h2>
          <p>Le litige a été résolu.</p>
          <p><strong>Résultat:</strong> ${outcome.replace(/_/g, ' ')}</p>
          <p><strong>Résolution:</strong> ${resolution}</p>
          ${payment.payout.payoutTransactionId ? `<p><strong>Montant Libéré:</strong> $${(payment.payout.payoutTransactionId && releaseAmount) ? releaseAmount.toFixed(2) : 'N/A'}</p>` : ''}
        `,
      });

      res.json({ 
        success: true, 
        message: 'Dispute resolved successfully',
        data: payment 
      });
    } catch (error) {
      console.error('Resolve dispute error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
});

// ============== AUTO-RELEASE JOB ==============

// Obtenir les paiements prêts pour la libération automatique (appelé par une tâche cron)
router.get('/admin/auto-release-check', 
  protect, 
  authorize('admin'), 
  requireStripe,
  async (req, res) => {
    try {
      // Assurez-vous que getPendingReleases est implémenté dans le modèle Payment
      const pendingReleases = await Payment.getPendingReleases(); 

      const results = [];
      for (const payment of pendingReleases) {
        try {
          // Libération automatique au propriétaire
          await payment.releaseToOwner();
          
          // Traitement du versement
          if (payment.method === 'stripe' && payment.ownerId.stripeAccountId) {
            const transfer = await stripe.transfers.create({
              amount: Math.round(payment.payout.amount * 100),
              currency: payment.currency.toLowerCase(),
              destination: payment.ownerId.stripeAccountId,
            });
            
            payment.payout.status = 'completed';
            payment.payout.payoutTransactionId = transfer.id;
            payment.payout.payoutAt = new Date();
            await payment.save();
          }
          
          // Notifier le propriétaire
          const owner = await User.findById(payment.ownerId);
          await sendEmail({
            to: owner.email,
            subject: 'Paiement Auto-Libéré',
            html: `
              <h2>💰 Paiement Libéré!</h2>
              <p>Votre paiement de $${payment.payout.amount.toFixed(2)} a été automatiquement libéré.</p>
              <p>Les fonds arriveront sur votre compte d'ici 2 à 5 jours ouvrables.</p>
            `,
          });
          
          results.push({ paymentId: payment._id, status: 'released' });
        } catch (error) {
          console.error(`Failed to auto-release payment ${payment._id}:`, error);
          results.push({ paymentId: payment._id, status: 'failed', error: error.message });
        }
      }
      
      res.json({ 
        success: true, 
        message: `Processed ${results.length} auto-releases`,
        data: results 
      });
    } catch (error) {
      console.error('Auto-release check error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
});

// ============== PAYMENT STATUS & QUERIES ==============

// Obtenir le solde du séquestre (admin seulement)
router.get('/admin/escrow-balance', protect, authorize('admin'), async (req, res) => {
  try {
    const balance = await Payment.getEscrowBalance();
    
    res.json({ 
      success: true, 
      data: balance 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Obtenir les revenus du propriétaire
router.get('/owner/earnings', protect, async (req, res) => {
  try {
    const earnings = await Payment.getOwnerEarnings(req.user.id);
    
    // Obtenir les gains en attente (en séquestre)
    const pendingPayments = await Payment.find({
      ownerId: req.user.id,
      escrowStatus: 'held',
    });
    
    const pendingAmount = pendingPayments.reduce((sum, p) => sum + p.netAmountToOwner, 0);
    
    res.json({ 
      success: true, 
      data: {
        ...earnings,
        pendingEarnings: pendingAmount,
        pendingCount: pendingPayments.length,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Obtenir les détails du paiement avec les infos de séquestre
router.get('/:paymentId', protect, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId)
      .populate('rentalId')
      .populate('userId', 'firstName lastName email')
      .populate('ownerId', 'firstName lastName email')
      .populate('confirmations.adminVerifiedBy', 'firstName lastName');

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    // Vérification de l'autorisation
    const isRenter = payment.userId._id.toString() === req.user.id;
    const isOwner = payment.ownerId._id.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';
    
    if (!isRenter && !isOwner && !isAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to view this payment' 
      });
    }

    res.json({ success: true, data: payment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Obtenir l'historique des paiements avec statut de séquestre
router.get('/history/all', protect, async (req, res) => {
  try {
    const { status, escrowStatus } = req.query;
    
    const query = { userId: req.user.id };
    if (status) query.status = status;
    if (escrowStatus) query.escrowStatus = escrowStatus;
    
    const payments = await Payment.find(query)
      .populate('rentalId')
      .populate('ownerId', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Obtenir les versements en attente du propriétaire
router.get('/owner/pending-payouts', protect, async (req, res) => {
  try {
    const payments = await Payment.find({
      ownerId: req.user.id,
      escrowStatus: 'held',
    })
      .populate('rentalId')
      .populate('userId', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Obtenir tous les litiges (admin seulement)
router.get('/admin/disputes', protect, authorize('admin'), async (req, res) => {
  try {
    const disputes = await Payment.find({
      'dispute.isDisputed': true,
      'dispute.status': { $in: ['open', 'under_review'] },
    })
      .populate('rentalId')
      .populate('userId', 'firstName lastName email')
      .populate('ownerId', 'firstName lastName email')
      .populate('dispute.openedBy', 'firstName lastName')
      .sort({ 'dispute.openedAt': -1 });

    res.json({ success: true, data: disputes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============== NOTIFICATIONS ==============

// Renvoyer la confirmation de paiement au locataire
router.post('/resend-confirmation/:paymentId', protect, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId)
      .populate('rentalId')
      .populate('userId');

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    if (payment.userId._id.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized' 
      });
    }

    await sendEmail({
      to: payment.userId.email,
      subject: 'Confirmation de Paiement - AgriRent',
      html: `
        <h2>Confirmation de Paiement</h2>
        <p>Votre paiement de $${payment.amount} est sécurisé en séquestre.</p>
        <p><strong>ID Location:</strong> ${payment.rentalId._id}</p>
        <p><strong>Statut:</strong> ${payment.escrowStatus}</p>
        <p>Une fois la location terminée, veuillez la confirmer dans l'application pour libérer le paiement au propriétaire.</p>
      `,
    });

    res.json({ 
      success: true, 
      message: 'Confirmation email sent' 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
