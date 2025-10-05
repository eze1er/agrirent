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
    const user = await User.findById(req.user.id);
    
    // Check if owner is verified
    if (!user.isEmailVerified) {
      return res.status(403).json({ 
        success: false, 
        message: 'Please verify your email before listing equipment' 
      });
    }
    
    // Rest of your machine creation code...
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
