require('dotenv').config();
const mongoose = require('mongoose');

// Import models in correct order
const User = require('../models/User');
const Machine = require('../models/Machine');
const Payment = require('../models/Payment');
const Rental = require('../models/Rental');

const testEscrowFlow = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📦 Connected to MongoDB\n');

    // Get a sample rental
    const rentalId = process.argv[2];
    if (!rentalId) {
      console.log('Usage: node scripts/testEscrowFlow.js <rentalId>');
      console.log('\nRun "node scripts/listRentals.js" to see available rental IDs');
      process.exit(1);
    }

    const rental = await Rental.findById(rentalId)
      .populate('renterId', 'firstName lastName email')
      .populate('ownerId', 'firstName lastName email')
      .populate('machineId', 'name');

    if (!rental) {
      console.log('❌ Rental not found');
      process.exit(1);
    }

    console.log('🎯 TESTING ESCROW FLOW FOR RENTAL');
    console.log('=====================================');
    console.log('Rental ID:', rental._id);
    console.log('Machine:', rental.machineId?.name || 'N/A');
    console.log('Renter:', rental.renterId?.email);
    console.log('Owner:', rental.ownerId?.email);
    console.log('Amount:', `$${rental.pricing.totalPrice}`);
    console.log('\n');

    // Check current status
    console.log('📊 CURRENT STATUS:');
    console.log('------------------');
    console.log('Rental Status:', rental.status);
    console.log('Payment Status:', rental.payment?.status || 'No payment yet');
    console.log('Renter Confirmed:', rental.renterConfirmedCompletion ? 'Yes' : 'No');
    console.log('\n');

    // Find payment record
    const payment = await Payment.findOne({ rentalId: rental._id });
    
    if (!payment) {
      console.log('⚠️  NO PAYMENT RECORD FOUND');
      console.log('This means payment has NOT been made yet.\n');
      console.log('✅ ESCROW CHECK: Money is NOT with owner (no payment made)');
      console.log('\nNext steps:');
      console.log('1. Renter needs to pay for this rental');
      console.log('2. Money will go to escrow (platform account)');
      console.log('3. Owner will be notified');
    } else {
      console.log('💰 PAYMENT RECORD FOUND:');
      console.log('------------------------');
      console.log('Payment ID:', payment._id);
      console.log('Amount:', `$${payment.amount}`);
      console.log('Escrow Status:', payment.escrowStatus);
      console.log('Transaction ID:', payment.transactionId);
      console.log('Paid At:', payment.escrowTimeline?.paidAt || 'Not paid');
      console.log('Held At:', payment.escrowTimeline?.heldAt || 'Not held');
      console.log('Released At:', payment.escrowTimeline?.releasedAt || 'Not released');
      console.log('\n');

      // Verify escrow status
      console.log('🔒 ESCROW VERIFICATION:');
      console.log('----------------------');
      
      if (payment.escrowStatus === 'held') {
        console.log('✅ PASS: Money is HELD IN ESCROW (platform account)');
        console.log('✅ Owner has NOT received payment yet');
        console.log('✅ Money will be released only after:');
        console.log('   1. Owner marks rental as completed');
        console.log('   2. Renter confirms completion');
        console.log('   3. Admin verifies (or auto-release after 3 days)');
      } else if (payment.escrowStatus === 'released') {
        console.log('✅ Money has been RELEASED to owner');
        console.log('Released at:', payment.escrowTimeline?.releasedAt);
        console.log('Payout amount:', `$${payment.payout?.amount}`);
        console.log('Payout status:', payment.payout?.status);
      } else if (payment.escrowStatus === 'pending') {
        console.log('⏳ Payment is PENDING (not completed yet)');
        console.log('✅ Money is NOT with owner');
      } else if (payment.escrowStatus === 'disputed') {
        console.log('⚠️  Payment is DISPUTED');
        console.log('✅ Money is FROZEN in escrow until resolution');
      }
      console.log('\n');

      // Calculate platform fee
      console.log('💵 FINANCIAL BREAKDOWN:');
      console.log('----------------------');
      console.log('Total paid by renter:', `$${payment.amount}`);
      const platformFee = payment.platformFee?.amount || (payment.amount * 0.1);
      const netToOwner = payment.amount - platformFee;
      console.log('Platform fee (10%):', `$${platformFee.toFixed(2)}`);
      console.log('Owner will receive:', `$${netToOwner.toFixed(2)}`);
      console.log('\n');

      // Check confirmations
      console.log('✅ CONFIRMATION STATUS:');
      console.log('----------------------');
      console.log('Renter confirmed:', payment.confirmations?.renterConfirmed ? 'YES ✅' : 'NO ❌');
      if (payment.confirmations?.renterConfirmed) {
        console.log('  Confirmed at:', payment.confirmations.renterConfirmedAt);
        console.log('  Note:', payment.confirmations.renterConfirmationNote || 'No note');
      }
      console.log('Admin verified:', payment.confirmations?.adminVerified ? 'YES ✅' : 'NO ❌');
      if (payment.confirmations?.adminVerified) {
        console.log('  Verified at:', payment.confirmations.adminVerifiedAt);
      }
      console.log('\n');

      // Safety checks
      console.log('🛡️  SAFETY CHECKS:');
      console.log('------------------');
      
      if (payment.escrowStatus === 'held' && !payment.payout?.payoutAt) {
        console.log('✅ PASS: Payment held, NOT paid out to owner');
      }
      
      if (payment.escrowStatus === 'released' && payment.payout?.status === 'completed') {
        console.log('✅ PASS: Payment released AND transferred to owner');
      }
      
      if (payment.escrowStatus === 'held' && rental.status !== 'completed') {
        console.log('✅ PASS: Payment held, waiting for rental completion');
      }
      
      if (payment.escrowStatus === 'held' && !rental.renterConfirmedCompletion) {
        console.log('✅ PASS: Payment held, waiting for renter confirmation');
      }
    }

    console.log('\n');
    console.log('================================');
    console.log('✅ ESCROW FLOW TEST COMPLETE');
    console.log('================================');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

testEscrowFlow();
