const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Rental = require('../models/Rental');
const Machine = require('../models/Machine');
const User = require('../models/User');
const { sendEmail } = require('../services/emailService');
const twilio = require('twilio');

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Get all rentals for current user
router.get('/', protect, async (req, res) => {
  try {
    const rentals = await Rental.find({
      $or: [{ renterId: req.user.id }, { ownerId: req.user.id }]
    })
    .populate('machineId', 'name images pricePerDay category')
    .populate('renterId', 'firstName lastName email')
    .populate('ownerId', 'firstName lastName email')
    .sort({ createdAt: -1 });

    res.json({ success: true, data: rentals });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create rental request
router.post('/', protect, async (req, res) => {
  try {
    const { machineId, rentalType, startDate, endDate, hectares, workDate, fieldLocation } = req.body;

    // Get machine
    const machine = await Machine.findById(machineId);
    if (!machine) {
      return res.status(404).json({ success: false, message: 'Machine not found' });
    }

    // Check if user is trying to rent their own machine
    if (machine.ownerId.toString() === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot rent your own machine' });
    }

    let pricing = {};
    let rentalData = {
      machineId,
      renterId: req.user.id,
      ownerId: machine.ownerId,
      rentalType,
      status: 'pending'
    };

    if (rentalType === 'daily') {
      // Validate daily rental
      if (!startDate || !endDate) {
        return res.status(400).json({ success: false, message: 'Start and end dates required' });
      }

      if (!machine.pricePerDay) {
        return res.status(400).json({ success: false, message: 'This machine is not available for daily rental' });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (start < today) {
        return res.status(400).json({ success: false, message: 'Start date cannot be in the past' });
      }

      if (end <= start) {
        return res.status(400).json({ success: false, message: 'End date must be after start date' });
      }

      // Check availability for these dates
      const conflictingRental = await Rental.findOne({
        machineId,
        rentalType: 'daily',
        status: { $in: ['pending', 'active', 'approved'] },
        $or: [{ startDate: { $lte: end }, endDate: { $gte: start } }]
      });

      if (conflictingRental) {
        return res.status(400).json({ success: false, message: 'Machine is not available for these dates' });
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
        totalPrice
      };

    } else if (rentalType === 'per_hectare') {
      // Validate per-hectare rental
      if (!hectares || !workDate || !fieldLocation) {
        return res.status(400).json({ success: false, message: 'Hectares, work date, and field location required' });
      }

      if (!machine.pricePerHectare) {
        return res.status(400).json({ success: false, message: 'This machine is not available for per-hectare rental' });
      }

      if (hectares < (machine.minimumHectares || 1)) {
        return res.status(400).json({ 
          success: false, 
          message: `Minimum ${machine.minimumHectares || 1} hectares required` 
        });
      }

      const work = new Date(workDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (work < today) {
        return res.status(400).json({ success: false, message: 'Work date cannot be in the past' });
      }

      // Check if machine is available on this date
      const conflictingRental = await Rental.findOne({
        machineId,
        status: { $in: ['pending', 'active', 'approved'] },
        $or: [
          { rentalType: 'per_hectare', workDate: work },
          { rentalType: 'daily', startDate: { $lte: work }, endDate: { $gte: work } }
        ]
      });

      if (conflictingRental) {
        return res.status(400).json({ success: false, message: 'Machine is not available on this date' });
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
        totalPrice
      };

    } else {
      return res.status(400).json({ success: false, message: 'Invalid rental type' });
    }

    rentalData.pricing = pricing;

    const rental = await Rental.create(rentalData);

    const populatedRental = await Rental.findById(rental._id)
      .populate('machineId', 'name images pricePerDay pricePerHectare category pricingType')
      .populate('renterId', 'firstName lastName email')
      .populate('ownerId', 'firstName lastName email');

    res.status(201).json({ 
      success: true, 
      data: populatedRental,
      message: 'Rental request sent successfully' 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// Update rental status (approve/reject)
router.patch('/:id/status', protect, async (req, res) => {
  try {
    const { status } = req.body;
    const rental = await Rental.findById(req.params.id);

    if (!rental) {
      return res.status(404).json({ 
        success: false, 
        message: 'Rental not found' 
      });
    }

    // Only owner can approve/reject
    if (rental.ownerId.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized' 
      });
    }

    // Only pending rentals can be approved/rejected
    if (rental.status !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: 'Only pending rentals can be updated' 
      });
    }

    if (status === 'approved') {
      rental.status = 'approved';
      
      // Update machine availability
      const machine = await Machine.findById(rental.machineId);
      machine.availability = 'rented';
      await machine.save();
    } else if (status === 'rejected') {
      rental.status = 'rejected';
    }

    await rental.save();

    const updatedRental = await Rental.findById(rental._id)
      .populate('machineId', 'name images pricePerDay category')
      .populate('renterId', 'firstName lastName email')
      .populate('ownerId', 'firstName lastName email');

    res.json({ success: true, data: updatedRental });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Cancel rental
router.patch('/:id/cancel', protect, async (req, res) => {
  try {
    const rental = await Rental.findById(req.params.id);

    if (!rental) {
      return res.status(404).json({ 
        success: false, 
        message: 'Rental not found' 
      });
    }

    // Only renter can cancel
    if (rental.renterId.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized' 
      });
    }

    // Can only cancel pending or approved rentals
    if (!['pending', 'approved'].includes(rental.status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot cancel this rental' 
      });
    }

    rental.status = 'cancelled';
    await rental.save();

    // If was approved, make machine available again
    if (rental.status === 'approved') {
      const machine = await Machine.findById(rental.machineId);
      machine.availability = 'available';
      await machine.save();
    }

    res.json({ success: true, data: rental });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Complete rental
router.patch('/:id/complete', protect, async (req, res) => {
  try {
    const rental = await Rental.findById(req.params.id);

    if (!rental) {
      return res.status(404).json({ 
        success: false, 
        message: 'Rental not found' 
      });
    }

    // Only owner can mark as completed
    if (rental.ownerId.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized' 
      });
    }

    if (rental.status !== 'approved') {
      return res.status(400).json({ 
        success: false, 
        message: 'Only approved rentals can be completed' 
      });
    }

    rental.status = 'completed';
    await rental.save();

    // Make machine available again
    const machine = await Machine.findById(rental.machineId);
    machine.availability = 'available';
    await machine.save();

    res.json({ success: true, data: rental });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update rental status (approve/reject)
router.patch('/:id/status', protect, async (req, res) => {
  try {
    const { status } = req.body;
    const rental = await Rental.findById(req.params.id)
      .populate('machineId', 'name images pricePerDay pricePerHectare')
      .populate('renterId', 'firstName lastName email phone')
      .populate('ownerId', 'firstName lastName email');

    if (!rental) {
      return res.status(404).json({ 
        success: false, 
        message: 'Rental not found' 
      });
    }

    // Only owner can approve/reject
    if (rental.ownerId._id.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized' 
      });
    }

    // Only pending rentals can be approved/rejected
    if (rental.status !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: 'Only pending rentals can be updated' 
      });
    }

    if (status === 'approved') {
      rental.status = 'approved';
      
      // Update machine availability
      const machine = await Machine.findById(rental.machineId._id);
      machine.availability = 'rented';
      await machine.save();

      // Send approval email to renter
      const emailSubject = '✅ Your Rental Request Has Been Approved!';
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
                
                ${rental.rentalType === 'daily' ? `
                  <div class="info-row">
                    <span class="label">Start Date:</span>
                    <span class="value">${new Date(rental.startDate).toLocaleDateString()}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">End Date:</span>
                    <span class="value">${new Date(rental.endDate).toLocaleDateString()}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">Duration:</span>
                    <span class="value">${rental.pricing.numberOfDays} days</span>
                  </div>
                ` : `
                  <div class="info-row">
                    <span class="label">Work Date:</span>
                    <span class="value">${new Date(rental.workDate).toLocaleDateString()}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">Hectares:</span>
                    <span class="value">${rental.pricing.numberOfHectares} Ha</span>
                  </div>
                  <div class="info-row">
                    <span class="label">Location:</span>
                    <span class="value">${rental.fieldLocation}</span>
                  </div>
                `}
                
                <div class="info-row" style="border-bottom: none; margin-top: 10px; padding-top: 10px; border-top: 2px solid #10b981;">
                  <span class="label" style="font-size: 18px;">Total Amount:</span>
                  <span class="value" style="font-size: 20px; color: #10b981; font-weight: bold;">$${rental.pricing.totalPrice.toFixed(2)}</span>
                </div>
              </div>

              <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h4 style="margin-top: 0; color: #856404;">📋 Next Steps:</h4>
                <ol style="margin: 10px 0; padding-left: 20px;">
                  <li>The owner will contact you to arrange pickup/delivery</li>
                  <li>Ensure payment is ready before pickup</li>
                  <li>Inspect the equipment before accepting it</li>
                  <li>Follow all safety guidelines during operation</li>
                </ol>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="http://localhost:5173" class="button">View My Rentals</a>
              </div>

              <p>If you have any questions, please contact the owner:</p>
              <p><strong>${rental.ownerId.firstName} ${rental.ownerId.lastName}</strong><br>
              Email: ${rental.ownerId.email}</p>
              
              <p>Thank you for using AgriRent!</p>
            </div>
            <div class="footer">
              <p>This is an automated message from AgriRent</p>
              <p>© ${new Date().getFullYear()} AgriRent. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      // Send email
      await sendEmail(rental.renterId.email, emailSubject, emailHtml);

      // Send SMS notification if phone number exists
      if (rental.renterId.phone) {
        try {
          const smsMessage = rental.rentalType === 'daily' 
            ? `🎉 AgriRent: Your rental request for ${rental.machineId.name} has been APPROVED! Dates: ${new Date(rental.startDate).toLocaleDateString()} - ${new Date(rental.endDate).toLocaleDateString()}. Total: $${rental.pricing.totalPrice.toFixed(2)}. Check your email for details.`
            : `🎉 AgriRent: Your rental request for ${rental.machineId.name} has been APPROVED! Work date: ${new Date(rental.workDate).toLocaleDateString()}, ${rental.pricing.numberOfHectares} Ha. Total: $${rental.pricing.totalPrice.toFixed(2)}. Check your email for details.`;

          await twilioClient.messages.create({
            body: smsMessage,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: rental.renterId.phone
          });
          
          console.log('SMS sent successfully to:', rental.renterId.phone);
        } catch (smsError) {
          console.error('SMS sending failed:', smsError);
          // Don't fail the whole request if SMS fails
        }
      }

    } else if (status === 'rejected') {
      rental.status = 'rejected';

      // Send rejection email
      const emailSubject = '❌ Rental Request Update';
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
              
              <p>Unfortunately, your rental request for <strong>${rental.machineId.name}</strong> has been declined by the owner.</p>
              
              <p>Don't worry! There are many other great machines available on AgriRent.</p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="http://localhost:5173" class="button">Browse Other Machines</a>
              </div>
              
              <p>Thank you for using AgriRent!</p>
            </div>
            <div class="footer">
              <p>This is an automated message from AgriRent</p>
              <p>© ${new Date().getFullYear()} AgriRent. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      await sendEmail(rental.renterId.email, emailSubject, emailHtml);

      // Send rejection SMS if phone exists
      if (rental.renterId.phone) {
        try {
          await twilioClient.messages.create({
            body: `AgriRent: Your rental request for ${rental.machineId.name} was not approved. Browse other available machines at AgriRent.`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: rental.renterId.phone
          });
        } catch (smsError) {
          console.error('SMS sending failed:', smsError);
        }
      }
    }

    await rental.save();

    const updatedRental = await Rental.findById(rental._id)
      .populate('machineId', 'name images pricePerDay pricePerHectare category')
      .populate('renterId', 'firstName lastName email')
      .populate('ownerId', 'firstName lastName email');

    res.json({ 
      success: true, 
      data: updatedRental,
      message: `Rental ${status} successfully. Notifications sent.`
    });
  } catch (error) {
    console.error('Error updating rental status:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;