const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Machine = require('../models/Machine');
const User = require('../models/User');
const Rental = require('../models/Rental');

// ✅ ADD THIS: Middleware to check email verification for owners
const requireVerifiedEmail = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Only require verification for owners trying to list machines
    if ((user.role === 'owner' || user.role === 'both') && !user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before listing machines',
        needsVerification: true
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking verification status'
    });
  }
};

// ✅ SPECIFIC ROUTES FIRST (before /:id)

// Get all machines
router.get('/', async (req, res) => {
  try {
    const machines = await Machine.find({ isActive: true })
      .populate('ownerId', 'firstName lastName email')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: machines });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
// Get owner's machines - MUST BE BEFORE /:id
router.get('/my-machines', protect, async (req, res) => {
  try {
    const machines = await Machine.find({ ownerId: req.user.id })
      .sort({ createdAt: -1 });
    res.json({ success: true, data: machines });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});



// ✅ DYNAMIC ROUTES LAST (/:id must be after specific routes)

// Get single machine by ID
router.get('/:id', async (req, res) => {
  try {
    const machine = await Machine.findById(req.params.id)
      .populate('ownerId', 'firstName lastName email phone');
    
    if (!machine) {
      return res.status(404).json({ success: false, message: 'Machine not found' });
    }
    
    res.json({ success: true, data: machine });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create machine
// ✅ UPDATED: Create machine (requires verification)
router.post('/', protect, requireVerifiedEmail, async (req, res) => {
  try {
    const machineData = {
      ...req.body,
      ownerId: req.user.id,
      isActive: true
    };

    const machine = await Machine.create(machineData);
    
    res.status(201).json({
      success: true,
      data: machine,
      message: 'Machine added successfully'
    });
  } catch (error) {
    console.error('Error creating machine:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update machine
router.put('/:id', protect, requireVerifiedEmail, async (req, res) => {
  try {
    const machine = await Machine.findOne({
      _id: req.params.id,
      ownerId: req.user.id
    });

    if (!machine) {
      return res.status(404).json({
        success: false,
        message: 'Machine not found or you are not the owner'
      });
    }

    Object.assign(machine, req.body);
    await machine.save();

    res.json({
      success: true,
      data: machine,
      message: 'Machine updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Delete machine
router.delete('/:id', protect, async (req, res) => {
  try {
    const machine = await Machine.findById(req.params.id);
    
    if (!machine) {
      return res.status(404).json({ 
        success: false, 
        message: 'Machine not found' 
      });
    }
    
    if (machine.ownerId.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to delete this machine' 
      });
    }
    
    const activeRentals = await Rental.countDocuments({
      machineId: req.params.id,
      status: { $in: ['pending', 'approved', 'active'] }
    });
    
    if (activeRentals > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete machine with active or pending rentals' 
      });
    }
    
    await Machine.findByIdAndDelete(req.params.id);
    
    res.json({ 
      success: true, 
      message: 'Machine deleted successfully' 
    });
  } catch (error) {
    console.error('Machine deletion error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Soft delete
router.patch('/:id/deactivate', protect, async (req, res) => {
  try {
    const machine = await Machine.findById(req.params.id);
    
    if (!machine) {
      return res.status(404).json({ 
        success: false, 
        message: 'Machine not found' 
      });
    }
    
    if (machine.ownerId.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized' 
      });
    }
    
    machine.isActive = false;
    await machine.save();
    
    res.json({ 
      success: true, 
      data: machine,
      message: 'Machine deactivated successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;