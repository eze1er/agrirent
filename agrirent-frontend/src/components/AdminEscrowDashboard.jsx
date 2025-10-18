import { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle, XCircle, AlertTriangle, DollarSign, Calendar, User, Shield } from 'lucide-react';
import { rentalAPI, paymentAPI } from '../services/api';

export default function AdminEscrowDashboard({ user, onLogout }) {
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending'); // pending, completed, disputed, all
  const [selectedRental, setSelectedRental] = useState(null);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchRentals();
  }, []);

  const fetchRentals = async () => {
    setLoading(true);
    try {
      const response = await rentalAPI.getAll();
      if (response.data.success) {
        // Filter only rentals with payment information
        const rentalsWithPayment = response.data.data.filter(r => 
          r.payment && r.payment.status
        );
        setRentals(rentalsWithPayment);
      }
    } catch (error) {
      console.error('Error fetching rentals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReleasePayment = async () => {
    if (!adminNote.trim() || adminNote.length < 10) {
      alert('Please provide verification notes (minimum 10 characters)');
      return;
    }

    try {
      setProcessing(true);
      const response = await paymentAPI.releasePayment(selectedRental._id, {
        adminNote: adminNote
      });

      if (response.data.success) {
        alert('✅ Payment released successfully! Owner has been notified.');
        setShowReleaseModal(false);
        setSelectedRental(null);
        setAdminNote('');
        await fetchRentals();
      }
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to release payment');
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectRelease = async () => {
    if (!adminNote.trim() || adminNote.length < 20) {
      alert('Please provide a detailed reason (minimum 20 characters)');
      return;
    }

    try {
      setProcessing(true);
      const response = await paymentAPI.rejectRelease(selectedRental._id, {
        reason: adminNote
      });

      if (response.data.success) {
        alert('❌ Release rejected. Both parties have been notified.');
        setShowRejectModal(false);
        setSelectedRental(null);
        setAdminNote('');
        await fetchRentals();
      }
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to reject release');
    } finally {
      setProcessing(false);
    }
  };

  const getFilteredRentals = () => {
    switch (filter) {
      case 'pending':
        return rentals.filter(r => 
          r.renterConfirmedCompletion && 
          r.payment?.status === 'held_in_escrow'
        );
      case 'completed':
        return rentals.filter(r => r.payment?.status === 'completed');
      case 'disputed':
        return rentals.filter(r => r.status === 'disputed');
      case 'all':
        return rentals;
      default:
        return rentals;
    }
  };

  const filteredRentals = getFilteredRentals();

  const stats = {
    pendingApproval: rentals.filter(r => 
      r.renterConfirmedCompletion && 
      r.payment?.status === 'held_in_escrow'
    ).length,
    totalInEscrow: rentals
      .filter(r => r.payment?.status === 'held_in_escrow')
      .reduce((sum, r) => sum + (r.pricing?.totalPrice || 0), 0),
    completed: rentals.filter(r => r.payment?.status === 'completed').length,
    disputed: rentals.filter(r => r.status === 'disputed').length,
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-rose-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-rose-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-rose-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-rose-600 to-red-600 text-white p-6 shadow-xl">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => window.location.href = '/'}
              className="p-2 hover:bg-white/20 rounded-xl transition"
            >
              <ArrowLeft size={24} />
            </button>
            <div className="flex items-center gap-2">
              <Shield size={32} />
              <div>
                <h1 className="text-2xl font-bold">Admin Escrow Dashboard</h1>
                <p className="text-sm text-rose-100">Manage and verify payments</p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={20} />
                <span className="text-sm font-semibold">Pending Approval</span>
              </div>
              <p className="text-3xl font-bold">{stats.pendingApproval}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign size={20} />
                <span className="text-sm font-semibold">In Escrow</span>
              </div>
              <p className="text-3xl font-bold">${stats.totalInEscrow.toFixed(0)}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={20} />
                <span className="text-sm font-semibold">Completed</span>
              </div>
              <p className="text-3xl font-bold">{stats.completed}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <XCircle size={20} />
                <span className="text-sm font-semibold">Disputed</span>
              </div>
              <p className="text-3xl font-bold">{stats.disputed}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="max-w-6xl mx-auto px-4 mt-6">
        <div className="bg-white rounded-2xl p-2 shadow-lg flex gap-2 overflow-x-auto">
          {['pending', 'disputed', 'completed', 'all'].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-6 py-3 rounded-xl font-semibold whitespace-nowrap transition capitalize ${
                filter === tab
                  ? 'bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-lg'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tab === 'pending' && `⏳ Pending (${stats.pendingApproval})`}
              {tab === 'disputed' && `⚠️ Disputed (${stats.disputed})`}
              {tab === 'completed' && `✅ Completed (${stats.completed})`}
              {tab === 'all' && `All (${rentals.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Rentals List */}
      <div className="max-w-6xl mx-auto px-4 mt-6">
        {filteredRentals.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-lg">
            <Shield size={64} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-600 text-lg">
              {filter === 'pending' && 'No payments pending approval'}
              {filter === 'disputed' && 'No disputed rentals'}
              {filter === 'completed' && 'No completed payments yet'}
              {filter === 'all' && 'No rentals with payments found'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRentals.map((rental) => (
              <div
                key={rental._id}
                className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition"
              >
                <div className="p-6">
                  {/* Header */}
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-800">
                        {rental.machineId?.name || 'Machine'}
                      </h3>
                      <p className="text-sm text-gray-500">
                        Rental ID: {rental._id.slice(-8)}
                      </p>
                    </div>
                    <span
                      className={`px-4 py-2 rounded-xl text-sm font-bold ${
                        rental.payment?.status === 'held_in_escrow'
                          ? 'bg-blue-100 text-blue-800'
                          : rental.payment?.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : rental.status === 'disputed'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {rental.payment?.status === 'held_in_escrow' && '🔒 In Escrow'}
                      {rental.payment?.status === 'completed' && '✅ Released'}
                      {rental.status === 'disputed' && '⚠️ Disputed'}
                    </span>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Owner</p>
                      <p className="font-semibold">
                        {rental.ownerId?.firstName} {rental.ownerId?.lastName}
                      </p>
                      <p className="text-xs text-gray-500">{rental.ownerId?.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Renter</p>
                      <p className="font-semibold">
                        {rental.renterId?.firstName} {rental.renterId?.lastName}
                      </p>
                      <p className="text-xs text-gray-500">{rental.renterId?.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Amount</p>
                      <p className="text-2xl font-bold text-green-600">
                        ${rental.pricing?.totalPrice?.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Payment Date</p>
                      <p className="font-semibold">
                        {rental.payment?.paidAt 
                          ? new Date(rental.payment.paidAt).toLocaleDateString()
                          : 'N/A'}
                      </p>
                    </div>
                  </div>

                  {/* Rental Details */}
                  {rental.rentalType === 'daily' ? (
                    <div className="bg-gray-50 rounded-xl p-3 mb-4">
                      <p className="text-sm text-gray-600">
                        📅 {new Date(rental.startDate).toLocaleDateString()} - {new Date(rental.endDate).toLocaleDateString()}
                      </p>
                      <p className="text-sm text-gray-600">
                        Duration: {rental.pricing?.numberOfDays} days
                      </p>
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-xl p-3 mb-4">
                      <p className="text-sm text-gray-600">
                        📅 Work Date: {new Date(rental.workDate).toLocaleDateString()}
                      </p>
                      <p className="text-sm text-gray-600">
                        Area: {rental.pricing?.numberOfHectares} hectares
                      </p>
                      <p className="text-sm text-gray-600">
                        Location: {rental.fieldLocation}
                      </p>
                    </div>
                  )}

                  {/* Renter Confirmation Note */}
                  {rental.renterConfirmedCompletion && rental.renterConfirmationNote && (
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4 rounded">
                      <p className="text-sm font-semibold text-blue-800 mb-1">
                        ✅ Renter Confirmation Note:
                      </p>
                      <p className="text-sm text-gray-700 italic">
                        "{rental.renterConfirmationNote}"
                      </p>
                      <p className="text-xs text-gray-500 mt-2">
                        Confirmed: {new Date(rental.renterConfirmedAt).toLocaleString()}
                      </p>
                    </div>
                  )}

                  {/* Dispute Information */}
                  {rental.status === 'disputed' && rental.disputeReason && (
                    <div className="bg-orange-50 border-l-4 border-orange-500 p-4 mb-4 rounded">
                      <p className="text-sm font-semibold text-orange-800 mb-1">
                        ⚠️ Dispute Reason:
                      </p>
                      <p className="text-sm text-gray-700">"{rental.disputeReason}"</p>
                    </div>
                  )}

                  {/* Admin Note (if released) */}
                  {rental.payment?.adminNote && (
                    <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 mb-4 rounded">
                      <p className="text-sm font-semibold text-emerald-800 mb-1">
                        🛡️ Admin Verification Note:
                      </p>
                      <p className="text-sm text-gray-700">"{rental.payment.adminNote}"</p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  {rental.renterConfirmedCompletion && 
                   rental.payment?.status === 'held_in_escrow' && (
                    <div className="flex gap-3 mt-4">
                      <button
                        onClick={() => {
                          setSelectedRental(rental);
                          setShowReleaseModal(true);
                          setAdminNote('');
                        }}
                        className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-3 rounded-xl font-bold hover:shadow-xl transition"
                      >
                        ✅ Release Payment
                      </button>
                      <button
                        onClick={() => {
                          setSelectedRental(rental);
                          setShowRejectModal(true);
                          setAdminNote('');
                        }}
                        className="flex-1 bg-gradient-to-r from-rose-500 to-red-500 text-white py-3 rounded-xl font-bold hover:shadow-xl transition"
                      >
                        ❌ Reject Release
                      </button>
                    </div>
                  )}

                  {rental.payment?.status === 'completed' && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                      <p className="text-emerald-800 font-semibold text-sm">
                        ✅ Payment Released on {new Date(rental.payment.releasedAt).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Release Payment Modal */}
      {showReleaseModal && selectedRental && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
              Release Payment to Owner
            </h2>
            <p className="text-gray-700 mb-4">
              Release <strong>${selectedRental.pricing?.totalPrice?.toFixed(2)}</strong> to{' '}
              <strong>
                {selectedRental.ownerId?.firstName} {selectedRental.ownerId?.lastName}
              </strong>
              ?
            </p>
            <div className="mb-4">
              <label className="block font-semibold mb-2 text-sm">
                Verification Notes (Required) *
              </label>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="Verified service completion. Renter confirmed satisfaction..."
                rows={4}
                className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none text-sm"
                maxLength={500}
              />
              <small className="text-gray-500 text-xs">
                {adminNote.length}/500 characters (minimum 10)
              </small>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
              <p className="text-xs text-gray-700">
                ✅ This action will transfer the funds to the owner's account and mark the rental
                as completed.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowReleaseModal(false);
                  setSelectedRental(null);
                  setAdminNote('');
                }}
                disabled={processing}
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-semibold text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleReleasePayment}
                disabled={processing || adminNote.length < 10}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? 'Processing...' : 'Release Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Release Modal */}
      {showRejectModal && selectedRental && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-rose-600 to-red-600 bg-clip-text text-transparent">
              Reject Payment Release
            </h2>
            <p className="text-gray-700 mb-4">
              Reject release request for{' '}
              <strong>${selectedRental.pricing?.totalPrice?.toFixed(2)}</strong>?
            </p>
            <div className="mb-4">
              <label className="block font-semibold mb-2 text-sm">
                Reason for Rejection (Required) *
              </label>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="Service not completed as agreed. Further investigation required..."
                rows={4}
                className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-rose-500 focus:outline-none text-sm"
                maxLength={500}
              />
              <small className="text-gray-500 text-xs">
                {adminNote.length}/500 characters (minimum 20)
              </small>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
              <p className="text-xs text-gray-700">
                ⚠️ Both parties will be notified. The payment will remain in escrow pending
                resolution.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setSelectedRental(null);
                  setAdminNote('');
                }}
                disabled={processing}
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-semibold text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectRelease}
                disabled={processing || adminNote.length < 20}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-rose-500 to-red-500 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? 'Processing...' : 'Reject Release'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}