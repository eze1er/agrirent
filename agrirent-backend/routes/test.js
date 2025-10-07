const express = require('express');
const router = express.Router();
const twilio = require('twilio');

// Test SMS endpoint
router.post('/test-sms', async (req, res) => {
  try {
    console.log('Testing SMS with:', {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      phoneNumber: process.env.TWILIO_PHONE_NUMBER,
      toPhone: req.body.phone
    });

    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const message = await client.messages.create({
      body: 'Test message from AgriRent! 🎉 Your Twilio integration is working!',
      from: process.env.TWILIO_PHONE_NUMBER,
      to: req.body.phone
    });

    res.json({ 
      success: true, 
      message: 'SMS sent successfully!',
      sid: message.sid,
      to: message.to,
      status: message.status
    });
  } catch (error) {
    console.error('SMS Test Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      details: error.code || 'Unknown error'
    });
  }
});

// Test route to verify endpoint is accessible
router.get('/ping', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Test route is working!',
    twilioConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER)
  });
});

module.exports = router;