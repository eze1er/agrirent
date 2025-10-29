const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'rental_request', 
      'rental_accepted', 
      'rental_rejected', 
      'rental_starting', 
      'rental_ending', 
      'rental_completed',
      'rental_finished', 
      'payment_received', 
      'review_received', 
      'machine_available'
    ],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  relatedId: mongoose.Schema.Types.ObjectId,
  relatedModel: {
    type: String,
    enum: ['Rental', 'Machine', 'Review']
  },
  isRead: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Notification', notificationSchema);