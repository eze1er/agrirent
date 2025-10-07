const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Machine = require('../models/Machine');
const User = require('../models/User');  // ADD THIS LINE

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

// Create machine
router.post('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    // Check if owner is verified
    if (!user.isEmailVerified && (user.role === 'owner' || user.role === 'both')) {
      return res.status(403).json({ 
        success: false, 
        message: 'Please verify your email before listing equipment' 
      });
    }

    const machineData = {
      ...req.body,
      ownerId: req.user.id
    };

    const machine = await Machine.create(machineData);
    
    res.status(201).json({ 
      success: true, 
      data: machine,
      message: 'Machine added successfully' 
    });
  } catch (error) {
    console.error('Machine creation error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get owner's machines
router.get('/my-machines', protect, async (req, res) => {
  try {
    const machines = await Machine.find({ ownerId: req.user.id })
      .sort({ createdAt: -1 });
    res.json({ success: true, data: machines });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update machine
router.put('/:id', protect, async (req, res) => {
  try {
    const machine = await Machine.findById(req.params.id);
    
    if (!machine) {
      return res.status(404).json({ success: false, message: 'Machine not found' });
    }
    
    if (machine.ownerId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    
    const updated = await Machine.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete machine
router.delete('/:id', protect, async (req, res) => {
  try {
    const machine = await Machine.findById(req.params.id);
    
    if (!machine) {
      return res.status(404).json({ success: false, message: 'Machine not found' });
    }
    
    if (machine.ownerId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    
    // Check if machine has active rentals
    const activeRentals = await Rental.countDocuments({
      machineId: req.params.id,
      status: { $in: ['pending', 'approved', 'active'] }
    });
    
    if (activeRentals > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete machine with active rentals' 
      });
    }
    
    await Machine.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Machine deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;