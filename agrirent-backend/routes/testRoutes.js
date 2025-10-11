// backend/routes/testRoutes.js
const express = require('express');
const router = express.Router();
const { sendEmail, sendSMS } = require('../utils/notifications');

// ============== TEST ENDPOINTS ==============

// Ping test
router.get('/ping', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Test route is working!',
    config: {
      emailConfigured: !!(process.env.SMTP_HOST && process.env.SMTP_USER),
      smsConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      twilioPhone: process.env.TWILIO_PHONE_NUMBER
    }
  });
});

// Test email
router.post('/test-email', async (req, res) => {
  try {
    const { to, subject, message } = req.body;

    if (!to) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email address required' 
      });
    }

    const result = await sendEmail({
      to,
      subject: subject || 'Test Email from AgriRent',
      html: message || '<h1>Test Email</h1><p>Your email service is working! 🎉</p>',
      text: message || 'Your email service is working!'
    });

    res.json(result);
  } catch (error) {
    console.error('Email Test Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message
    });
  }
});

// Test SMS
router.post('/test-sms', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number required (include country code: +1234567890)' 
      });
    }

    const result = await sendSMS({
      to: phone,
      message: 'Test message from AgriRent! 🎉 Your SMS integration is working!'
    });

    res.json(result);
  } catch (error) {
    console.error('SMS Test Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message
    });
  }
});

module.exports = router;