// backend/utils/notifications.js
const nodemailer = require('nodemailer');
const twilio = require('twilio');

// ============== EMAIL SERVICE ==============
let emailTransporter = null;

// Initialize email transporter
const initializeEmail = () => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn('⚠️  Email not configured. Emails will be logged only.');
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
};

// Send email function
exports.sendEmail = async ({ to, subject, html, text }) => {
  try {
    // Initialize if not already done
    if (!emailTransporter) {
      emailTransporter = initializeEmail();
    }

    // If email not configured, just log
    if (!emailTransporter) {
      console.log('📧 [EMAIL LOG] To:', to);
      console.log('📧 [EMAIL LOG] Subject:', subject);
      console.log('📧 [EMAIL LOG] Content:', text || html.substring(0, 100) + '...');
      console.log('---');
      return { success: true, simulated: true };
    }

    // Send actual email
    const info = await emailTransporter.sendMail({
      from: `"${process.env.FROM_NAME || 'AgriRent'}" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html,
    });

    console.log('✅ Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email send error:', error.message);
    return { success: false, error: error.message };
  }
};

// ============== SMS SERVICE ==============
let twilioClient = null;

// Initialize Twilio client
const initializeTwilio = () => {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.warn('⚠️  Twilio not configured. SMS will be logged only.');
    return null;
  }

  return twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
};

// Send SMS function
exports.sendSMS = async ({ to, message }) => {
  try {
    // Initialize if not already done
    if (!twilioClient) {
      twilioClient = initializeTwilio();
    }

    // If SMS not configured, just log
    if (!twilioClient) {
      console.log('📱 [SMS LOG] To:', to);
      console.log('📱 [SMS LOG] Message:', message);
      console.log('---');
      return { success: true, simulated: true };
    }

    // Validate phone number format
    if (!to.startsWith('+')) {
      throw new Error('Phone number must include country code (e.g., +1234567890)');
    }

    // Send actual SMS
    const twilioMessage = await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to,
    });

    console.log('✅ SMS sent:', twilioMessage.sid);
    return { 
      success: true, 
      sid: twilioMessage.sid,
      status: twilioMessage.status 
    };
  } catch (error) {
    console.error('❌ SMS send error:', error.message);
    return { success: false, error: error.message };
  }
};

// ============== COMBINED NOTIFICATION ==============
// Send both email and SMS
exports.sendNotification = async ({ to, subject, message, html, sms }) => {
  const results = {
    email: null,
    sms: null
  };

  // Send email
  if (to.email) {
    results.email = await exports.sendEmail({
      to: to.email,
      subject,
      html: html || message,
      text: message
    });
  }

  // Send SMS
  if (to.phone && sms) {
    results.sms = await exports.sendSMS({
      to: to.phone,
      message: sms || message
    });
  }

  return results;
};

// ============== NOTIFICATION TEMPLATES ==============
// Reusable notification templates
exports.templates = {
  // Payment held in escrow
  paymentHeld: (owner, amount, machineName) => ({
    subject: '💰 Payment Secured in Escrow',
    html: `
      <h2>Payment Secured!</h2>
      <p>Hi ${owner.firstName},</p>
      <p>Good news! A payment of <strong>$${amount}</strong> for "${machineName}" has been secured in escrow.</p>
      <p>Complete the rental service, and the payment will be released to you once confirmed by the renter.</p>
      <p>Best regards,<br>AgriRent Team</p>
    `,
    sms: `AgriRent: $${amount} payment secured for ${machineName}. Complete service to receive payment.`
  }),

  // Rental confirmed by renter
  rentalConfirmed: (owner, amount, machineName) => ({
    subject: '✅ Rental Confirmed - Payment Being Processed',
    html: `
      <h2>Rental Confirmed!</h2>
      <p>Hi ${owner.firstName},</p>
      <p>The renter has confirmed completion of "${machineName}".</p>
      <p>Your payment of <strong>$${amount}</strong> will be released within 24-48 hours.</p>
      <p>Best regards,<br>AgriRent Team</p>
    `,
    sms: `AgriRent: Rental confirmed! $${amount} will be released to you within 24-48 hours.`
  }),

  // Payment released
  paymentReleased: (owner, amount) => ({
    subject: '💸 Payment Released!',
    html: `
      <h2>Payment Released!</h2>
      <p>Hi ${owner.firstName},</p>
      <p>Great news! Your payment of <strong>$${amount}</strong> has been released.</p>
      <p>Funds will arrive in your account within 2-5 business days.</p>
      <p>Best regards,<br>AgriRent Team</p>
    `,
    sms: `AgriRent: $${amount} released! Funds arrive in 2-5 business days.`
  }),

  // Dispute opened
  disputeOpened: (user, rentalId) => ({
    subject: '⚠️ Dispute Opened',
    html: `
      <h2>Dispute Opened</h2>
      <p>Hi ${user.firstName},</p>
      <p>A dispute has been opened for rental #${rentalId}.</p>
      <p>Our team will review and contact you shortly. Your payment is secure.</p>
      <p>Best regards,<br>AgriRent Team</p>
    `,
    sms: `AgriRent: Dispute opened for rental #${rentalId}. We'll contact you shortly.`
  })
};