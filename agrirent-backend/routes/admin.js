// routes/admin.js - Admin Dashboard Routes
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const Rental = require('../models/Rental');
const User = require('../models/User');
const Machine = require('../models/Machine');
const Payment = require('../models/Payment');

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin only.'
    });
  }
  next();
};

// ============================================
// DASHBOARD OVERVIEW - Main Stats
// ============================================
router.get('/dashboard/overview', protect, isAdmin, async (req, res) => {
  try {
    const [
      totalUsers,
      totalMachines,
      totalRentals,
      activeRentals,
      pendingRentals,
      completedRentals,
      finishedRentals,
      totalRevenue,
      escrowBalance
    ] = await Promise.all([
      User.countDocuments(),
      Machine.countDocuments(),
      Rental.countDocuments(),
      Rental.countDocuments({ status: 'active' }),
      Rental.countDocuments({ status: 'pending' }),
      Rental.countDocuments({ status: 'completed' }),
      Rental.countDocuments({ status: 'finished' }),
      Payment.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Payment.aggregate([
        { $match: { escrowStatus: 'held' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          owners: await User.countDocuments({ role: 'owner' }),
          renters: await User.countDocuments({ role: 'renter' })
        },
        machines: {
          total: totalMachines,
          available: await Machine.countDocuments({ availability: 'available' }),
          rented: await Machine.countDocuments({ availability: 'rented' })
        },
        rentals: {
          total: totalRentals,
          active: activeRentals,
          pending: pendingRentals,
          completed: completedRentals,
          finished: finishedRentals
        },
        revenue: {
          total: totalRevenue[0]?.total || 0,
          escrow: escrowBalance[0]?.total || 0,
          released: (totalRevenue[0]?.total || 0) - (escrowBalance[0]?.total || 0)
        }
      }
    });
  } catch (error) {
    console.error('Dashboard overview error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// ESCROW OVERVIEW - Money Management Stats
// ============================================
router.get('/escrow/overview', protect, isAdmin, async (req, res) => {
  try {
    // Fetch all rentals with payment information
    const rentals = await Rental.find({
      payment: { $exists: true }
    })
    .populate('renterId', 'firstName lastName email phoneNumber')
    .populate('ownerId', 'firstName lastName email phoneNumber')
    .populate('machineId', 'name category')
    .sort({ createdAt: -1 })
    .lean();

    // Calculate escrow statistics
    let totalInEscrow = 0;
    let pendingApproval = 0;
    let completedPayments = 0;
    let disputedPayments = 0;
    let totalRevenue = 0;
    let platformFees = 0;
    let ownerPayouts = 0;

    rentals.forEach(rental => {
      const amount = rental.pricing?.totalPrice || 0;
      const platformFee = amount * 0.10; // 10% platform fee

      // Count payments in escrow
      if (rental.payment?.status === 'held_in_escrow') {
        totalInEscrow += amount;
        
        // Count pending approval (renter confirmed, waiting for admin)
        if (rental.renterConfirmedCompletion) {
          pendingApproval += 1;
        }
      }

      // Count completed payments
      if (rental.payment?.status === 'completed') {
        completedPayments += 1;
        totalRevenue += amount;
        platformFees += platformFee;
        ownerPayouts += (amount - platformFee);
      }

      // Count disputed
      if (rental.status === 'disputed') {
        disputedPayments += 1;
      }
    });

    res.json({
      success: true,
      data: {
        totalInEscrow,
        pendingApproval,
        completedPayments,
        disputedPayments,
        totalRevenue,
        platformFees,
        ownerPayouts,
        rentals // Include rentals for detailed view
      }
    });

  } catch (error) {
    console.error('Error fetching escrow overview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch escrow data',
      error: error.message
    });
  }
});

// ============================================
// ALL RENTALS - Detailed List
// ============================================
router.get('/rentals/all', protect, isAdmin, async (req, res) => {
  try {
    const { 
      status, 
      page = 1, 
      limit = 20,
      sortBy = 'createdAt',
      order = 'desc',
      search 
    } = req.query;

    // Build query
    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    // Search functionality
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const users = await User.find({
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex },
          { phoneNumber: searchRegex }
        ]
      }).select('_id');

      const machines = await Machine.find({
        $or: [
          { name: searchRegex },
          { category: searchRegex }
        ]
      }).select('_id');

      query.$or = [
        { renterId: { $in: users.map(u => u._id) } },
        { ownerId: { $in: users.map(u => u._id) } },
        { machineId: { $in: machines.map(m => m._id) } }
      ];
    }

    const skip = (page - 1) * limit;
    const sortOrder = order === 'desc' ? -1 : 1;

    const [rentals, total] = await Promise.all([
      Rental.find(query)
        .populate('renterId', 'firstName lastName email phoneNumber')
        .populate('ownerId', 'firstName lastName email phoneNumber')
        .populate('machineId', 'name category brand location')
        .populate({
          path: 'payment',
          select: 'amount status escrowStatus transactionId method'
        })
        .sort({ [sortBy]: sortOrder })
        .limit(parseInt(limit))
        .skip(skip)
        .lean(),
      Rental.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        rentals,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all rentals error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// ACTIVE RENTALS - Currently Running
// ============================================
router.get('/rentals/active', protect, isAdmin, async (req, res) => {
  try {
    const activeRentals = await Rental.find({ status: 'active' })
      .populate('renterId', 'firstName lastName email phoneNumber')
      .populate('ownerId', 'firstName lastName email phoneNumber')
      .populate('machineId', 'name category brand')
      .populate({
        path: 'payment',
        select: 'amount status escrowStatus method'
      })
      .sort({ createdAt: -1 })
      .lean();

    // Calculate days remaining for each rental
    const rentalsWithDays = activeRentals.map(rental => {
      const now = new Date();
      const endDate = new Date(rental.endDate || rental.workDate);
      const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
      
      return {
        ...rental,
        daysRemaining,
        isOverdue: daysRemaining < 0
      };
    });

    res.json({
      success: true,
      count: rentalsWithDays.length,
      data: rentalsWithDays
    });
  } catch (error) {
    console.error('Get active rentals error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// PENDING RENTALS - Awaiting Approval
// ============================================
router.get('/rentals/pending', protect, isAdmin, async (req, res) => {
  try {
    const pendingRentals = await Rental.find({ status: 'pending' })
      .populate('renterId', 'firstName lastName email phoneNumber')
      .populate('ownerId', 'firstName lastName email phoneNumber')
      .populate('machineId', 'name category brand location')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      count: pendingRentals.length,
      data: pendingRentals
    });
  } catch (error) {
    console.error('Get pending rentals error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// ALL USERS - User Management
// ============================================
router.get('/users/all', protect, isAdmin, async (req, res) => {
  try {
    const { 
      role, 
      search,
      page = 1,
      limit = 50 
    } = req.query;

    const query = {};
    
    // Filter by role
    if (role && role !== 'all') {
      query.role = role;
    }

    // Search functionality
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { phoneNumber: searchRegex }
      ];
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean(),
      User.countDocuments(query)
    ]);

    // Add user statistics
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const [totalRentalsAsRenter, totalRentalsAsOwner, activeMachines] = await Promise.all([
          Rental.countDocuments({ renterId: user._id }),
          Rental.countDocuments({ ownerId: user._id }),
          Machine.countDocuments({ owner: user._id })
        ]);

        return {
          ...user,
          stats: {
            totalRentalsAsRenter,
            totalRentalsAsOwner,
            activeMachines
          }
        };
      })
    );

    res.json({
      success: true,
      data: {
        users: usersWithStats,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// PAYMENTS - All Transactions
// ============================================
router.get('/payments/all', protect, isAdmin, async (req, res) => {
  try {
    const { 
      status,
      escrowStatus,
      method,
      page = 1,
      limit = 50
    } = req.query;

    const query = {};
    if (status && status !== 'all') query.status = status;
    if (escrowStatus && escrowStatus !== 'all') query.escrowStatus = escrowStatus;
    if (method && method !== 'all') query.method = method;

    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      Payment.find(query)
        .populate('userId', 'firstName lastName email phoneNumber')
        .populate('ownerId', 'firstName lastName email phoneNumber')
        .populate({
          path: 'rentalId',
          populate: {
            path: 'machineId',
            select: 'name category'
          }
        })
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean(),
      Payment.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        payments,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all payments error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// EXPORT DATA - CSV/JSON Export
// ============================================
router.get('/export/rentals', protect, isAdmin, async (req, res) => {
  try {
    const { format = 'json', status } = req.query;

    const query = status && status !== 'all' ? { status } : {};

    const rentals = await Rental.find(query)
      .populate('renterId', 'firstName lastName email phoneNumber')
      .populate('ownerId', 'firstName lastName email phoneNumber')
      .populate('machineId', 'name category brand')
      .sort({ createdAt: -1 })
      .lean();

    if (format === 'csv') {
      // Generate CSV
      const csv = [
        'Rental ID,Machine,Category,Renter Name,Renter Email,Renter Phone,Owner Name,Owner Email,Owner Phone,Status,Start Date,End Date,Amount,Created Date'
      ];

      rentals.forEach(rental => {
        csv.push([
          rental._id,
          rental.machineId?.name || 'N/A',
          rental.machineId?.category || 'N/A',
          `${rental.renterId?.firstName} ${rental.renterId?.lastName}`,
          rental.renterId?.email || '',
          rental.renterId?.phoneNumber || '',
          `${rental.ownerId?.firstName} ${rental.ownerId?.lastName}`,
          rental.ownerId?.email || '',
          rental.ownerId?.phoneNumber || '',
          rental.status,
          rental.startDate || rental.workDate || '',
          rental.endDate || '',
          rental.pricing?.totalPrice || 0,
          rental.createdAt
        ].join(','));
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=rentals-${Date.now()}.csv`);
      res.send(csv.join('\n'));
    } else {
      // Return JSON
      res.json({
        success: true,
        count: rentals.length,
        data: rentals
      });
    }
  } catch (error) {
    console.error('Export rentals error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// SEARCH - Global Search
// ============================================
router.get('/search', protect, isAdmin, async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters'
      });
    }

    const searchRegex = new RegExp(q, 'i');

    const [users, machines, rentals] = await Promise.all([
      User.find({
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex },
          { phoneNumber: searchRegex }
        ]
      })
        .select('firstName lastName email phoneNumber role')
        .limit(10)
        .lean(),
      
      Machine.find({
        $or: [
          { name: searchRegex },
          { brand: searchRegex },
          { category: searchRegex }
        ]
      })
        .populate('owner', 'firstName lastName')
        .limit(10)
        .lean(),
      
      Rental.find({})
        .populate({
          path: 'renterId',
          match: {
            $or: [
              { firstName: searchRegex },
              { lastName: searchRegex },
              { email: searchRegex }
            ]
          },
          select: 'firstName lastName email'
        })
        .populate('machineId', 'name category')
        .limit(10)
        .lean()
    ]);

    // Filter out rentals where no match was found
    const filteredRentals = rentals.filter(r => r.renterId);

    res.json({
      success: true,
      data: {
        users,
        machines,
        rentals: filteredRentals
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// RELEASE PAYMENT - Release escrow to owner
// ============================================
router.post('/escrow/release/:rentalId', protect, isAdmin, async (req, res) => {
  try {
    const { rentalId } = req.params;
    const { adminNote, platformFee, ownerPayout } = req.body;

    if (!adminNote || adminNote.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Admin verification note required (minimum 10 characters)'
      });
    }

    // Find rental
    const rental = await Rental.findById(rentalId)
      .populate('renterId', 'firstName lastName email')
      .populate('ownerId', 'firstName lastName email')
      .populate('machineId', 'name');

    if (!rental) {
      return res.status(404).json({
        success: false,
        message: 'Rental not found'
      });
    }

    // Verify payment is in escrow
    if (rental.payment?.status !== 'held_in_escrow') {
      return res.status(400).json({
        success: false,
        message: 'Payment is not in escrow status'
      });
    }

    // Verify renter confirmed
    if (!rental.renterConfirmedCompletion) {
      return res.status(400).json({
        success: false,
        message: 'Renter has not confirmed completion'
      });
    }

    // Update rental payment status
    rental.payment.status = 'completed';
    rental.payment.releasedAt = new Date();
    rental.payment.releasedBy = req.user._id;
    rental.payment.adminNote = adminNote;
    rental.payment.platformFee = platformFee;
    rental.payment.ownerPayout = ownerPayout;
    rental.status = 'completed';

    await rental.save();

    // TODO: Send email notifications
    // - Email to owner: "Payment of $XXX has been released"
    // - Email to renter: "Payment released for rental"
    // - Record transaction in accounting system

    // Log the transaction
    console.log(`✅ Payment Released:
      Rental: ${rentalId}
      Owner: ${rental.ownerId.email} receives $${ownerPayout}
      Platform Fee: $${platformFee}
      Admin: ${req.user.email}
      Note: ${adminNote}
    `);

    res.json({
      success: true,
      message: 'Payment released successfully',
      data: {
        rental,
        ownerPayout,
        platformFee
      }
    });

  } catch (error) {
    console.error('Release payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to release payment',
      error: error.message
    });
  }
});

// ============================================
// REJECT RELEASE - Reject payment release request
// ============================================
router.post('/escrow/reject/:rentalId', protect, isAdmin, async (req, res) => {
  try {
    const { rentalId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.length < 20) {
      return res.status(400).json({
        success: false,
        message: 'Detailed rejection reason required (minimum 20 characters)'
      });
    }

    // Find rental
    const rental = await Rental.findById(rentalId)
      .populate('renterId', 'firstName lastName email')
      .populate('ownerId', 'firstName lastName email')
      .populate('machineId', 'name');

    if (!rental) {
      return res.status(404).json({
        success: false,
        message: 'Rental not found'
      });
    }

    // Update rental with rejection info
    rental.payment.releaseRejected = true;
    rental.payment.rejectionReason = reason;
    rental.payment.rejectedAt = new Date();
    rental.payment.rejectedBy = req.user._id;
    rental.renterConfirmedCompletion = false; // Reset confirmation

    await rental.save();

    // TODO: Send email notifications
    // - Email to renter: "Payment release rejected"
    // - Email to owner: "Payment release rejected"
    // - Include reason for rejection

    console.log(`❌ Payment Release Rejected:
      Rental: ${rentalId}
      Reason: ${reason}
      Admin: ${req.user.email}
    `);

    res.json({
      success: true,
      message: 'Release rejected successfully',
      data: rental
    });

  } catch (error) {
    console.error('Reject release error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject release',
      error: error.message
    });
  }
});

module.exports = router;