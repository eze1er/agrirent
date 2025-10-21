const twilio = require('twilio');
// const { sendNotificationSMS } = require("../services/smsService");

// Initialize Twilio client
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Generate 6-digit code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send SMS verification code
const sendVerificationSMS = async (phoneNumber, code, firstName) => {
  const message = `Hi ${firstName}! Your AgriRent verification code is: ${code}. Valid for 10 minutes.`;

  try {
    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });

    console.log('✅ SMS sent to:', phoneNumber, 'SID:', result.sid);
    return { success: true, sid: result.sid };
  } catch (error) {
    console.error('❌ Failed to send SMS:', error.message);
    throw new Error('Failed to send verification SMS');
  }
};

// Send SMS notification (for rentals, payments, etc.)
const sendNotificationSMS = async (phoneNumber, message) => {
  try {
    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });

    console.log('✅ Notification SMS sent to:', phoneNumber);
    return { success: true, sid: result.sid };
  } catch (error) {
    console.error('❌ Failed to send notification SMS:', error.message);
    throw error;
  }
};

module.exports = {
  generateVerificationCode,
  sendVerificationSMS,
  sendNotificationSMS
};