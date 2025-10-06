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

// Get machine by ID
router.get('/:id', async (req, res) => {
  try {
    const machine = await Machine.findById(req.params.id)
      .populate('ownerId', 'firstName lastName email phoneNumber');
    
    if (!machine) {
      return res.status(404).json({ success: false, message: 'Machine not found' });
    }
    
    res.json({ success: true, data: machine });
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
    
    const updatedMachine = await Machine.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    res.json({ success: true, data: updatedMachine });
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
    
    await machine.deleteOne();
    
    res.json({ success: true, message: 'Machine deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;