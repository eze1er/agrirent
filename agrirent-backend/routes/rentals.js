const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Rental = require('../models/Rental');
const Machine = require('../models/Machine');
const User = require('../models/User');

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

module.exports = router;