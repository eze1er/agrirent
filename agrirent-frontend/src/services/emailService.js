const nodemailer = require('nodemailer');
const crypto = require('crypto');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

const sendWelcomeEmail = async (user) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: user.email,
    subject: 'Welcome to AgriRent!',
    html: `
      <h1>Welcome to AgriRent, ${user.firstName}!</h1>
      <p>Thank you for joining our agricultural equipment rental platform.</p>
      <p>You can now browse and rent equipment from farmers in your area.</p>
      <p>Best regards,<br>The AgriRent Team</p>
    `
  };

  await transporter.sendMail(mailOptions);
};

const sendVerificationEmail = async (user, token) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
  
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: user.email,
    subject: 'Verify Your Email - AgriRent',
    html: `
      <h1>Email Verification</h1>
      <p>Hi ${user.firstName},</p>
      <p>Please verify your email address by clicking the link below:</p>
      <a href="${verificationUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
        Verify Email
      </a>
      <p>Or copy this link: ${verificationUrl}</p>
      <p>This link will expire in 24 hours.</p>
      <p>If you didn't create an account, please ignore this email.</p>
    `
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { sendWelcomeEmail, sendVerificationEmail };