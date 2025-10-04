const express = require('express');
const router = express.Router();
const Machine = require('../models/Machine');
const { protect } = require('../middleware/auth');

// Get all machines
router.get('/', async (req, res) => {
  try {
    const machines = await Machine.find({ isActive: true })
      .populate('ownerId', 'firstName lastName')
      .sort('-createdAt');
    
    res.json({
      success: true,
      count: machines.length,
      data: machines
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Create machine (protected - must be logged in)
router.post('/', protect, async (req, res) => {
  try {
    console.log('Creating machine with data:', req.body);
    console.log('User:', req.user);
    
    req.body.ownerId = req.user.id;
    
    const machine = await Machine.create(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Machine created successfully',
      data: machine
    });
  } catch (error) {
    console.error('Error creating machine:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;
