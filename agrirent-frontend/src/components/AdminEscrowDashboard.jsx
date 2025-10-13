// src/components/AdminEscrowDashboard.jsx
import { useState, useEffect } from "react";
import { DollarSign, Clock, AlertTriangle, Shield, ArrowLeft } from "lucide-react";
import { paymentAPI } from "../services/api";
import { useNavigate } from "react-router-dom";

export default function AdminEscrowDashboard() {
  const navigate = useNavigate();
  const [pendingReleases, setPendingReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [adminNote, setAdminNote] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Only fetch pending releases - the only endpoint that exists
      const pendingRes = await paymentAPI.getPendingReleases();
      setPendingReleases(pendingRes.data.data || []);
    } catch (error) {
      console.error("Error fetching admin data:", error);
      setPendingReleases([]);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndRelease = async () => {
    if (!adminNote.trim()) {
      alert("Please provide verification notes");
      return;
    }

    if (!confirm(`Release $${selectedPayment.amount.toFixed(2)} to ${selectedPayment.ownerId?.firstName} ${selectedPayment.ownerId?.lastName}?`)) {
      return;
    }

    try {
      await paymentAPI.verifyAndRelease(selectedPayment._id, {
        adminNote: adminNote,
      });
      alert("✅ Payment verified and released to owner!");
      setShowReleaseModal(false);
      setSelectedPayment(null);
      setAdminNote("");
      fetchData();
    } catch (error) {
      console.error('Release error:', error);
      alert(error.response?.data?.message || "Failed to release payment");
    }
  };

  // Calculate stats from pending releases
  const totalInEscrow = pendingReleases.reduce((sum, p) => sum + (p.amount || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-gray-50 to-blue-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl p-6 mb-6 text-white shadow-xl">
          <button
            onClick={() => navigate('/')}
            className="mb-4 flex items-center gap-2 text-white hover:text-blue-100 transition"
          >
            <ArrowLeft size={20} />
            <span>Back to Dashboard</span>
          </button>
          <div className="flex items-center gap-3 mb-2">
            <Shield size={32} />
            <h1 className="text-3xl font-bold">Admin Escrow Dashboard</h1>
          </div>
          <p className="text-blue-100">Manage payments and releases</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-xl">
                <DollarSign size={32} className="text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600 font-semibold">Total in Escrow</p>
                <p className="text-3xl font-bold text-gray-800">
                  ${totalInEscrow.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500">
                  {pendingReleases.length} payment{pendingReleases.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-100 rounded-xl">
                <Clock size={32} className="text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600 font-semibold">Pending Releases</p>
                <p className="text-3xl font-bold text-gray-800">
                  {pendingReleases.length}
                </p>
                <p className="text-xs text-gray-500">Awaiting verification</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-100 rounded-xl">
                <AlertTriangle size={32} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600 font-semibold">System Status</p>
                <p className="text-xl font-bold text-emerald-600">Operational</p>
                <p className="text-xs text-gray-500">All systems running</p>
              </div>
            </div>
          </div>
        </div>

        {/* Pending Releases Section */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <Clock className="text-amber-600" />
            Pending Payment Releases
          </h2>
          {pendingReleases.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield size={40} className="text-emerald-600" />
              </div>
              <p className="text-gray-600 text-lg font-semibold mb-2">All Caught Up!</p>
              <p className="text-gray-500 text-sm">No pending releases at this time.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingReleases.map((payment) => (
                <div
                  key={payment._id}
                  className="border-2 border-gray-200 rounded-xl p-5 hover:shadow-lg transition hover:border-blue-300"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <h3 className="font-bold text-xl mb-2">
                        Payment #{payment._id.slice(-8).toUpperCase()}
                      </h3>
                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Renter</p>
                          <p className="font-semibold text-gray-800">
                            {payment.userId?.firstName} {payment.userId?.lastName}
                          </p>
                          <p className="text-sm text-gray-600">{payment.userId?.email}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Owner</p>
                          <p className="font-semibold text-gray-800">
                            {payment.ownerId?.firstName} {payment.ownerId?.lastName}
                          </p>
                          <p className="text-sm text-gray-600">{payment.ownerId?.email}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-3xl font-bold text-emerald-600 mb-1">
                        ${payment.amount.toFixed(2)}
                      </p>
                      <span className="inline-block px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold">
                        Pending
                      </span>
                    </div>
                  </div>

                  {payment.confirmations?.renterConfirmed && (
                    <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg p-4 mb-4">
                      <p className="text-sm font-bold text-blue-900 mb-2">
                        ✅ Renter Confirmed Completion
                      </p>
                      <p className="text-xs text-gray-600 mb-2">
                        Confirmed on {new Date(payment.confirmations.renterConfirmedAt).toLocaleString()}
                      </p>
                      {payment.confirmations.renterConfirmationNote && (
                        <div className="mt-2 p-3 bg-white rounded border border-blue-200">
                          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Renter's Note:</p>
                          <p className="text-sm text-gray-700 italic">
                            "{payment.confirmations.renterConfirmationNote}"
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="pt-4 border-t border-gray-200">
                    <button
                      onClick={() => {
                        setSelectedPayment(payment);
                        setShowReleaseModal(true);
                      }}
                      className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-3 rounded-xl font-bold hover:shadow-xl transition transform hover:scale-[1.02]"
                    >
                      Review & Release Payment
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Release Modal */}
      {showReleaseModal && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
              Release Payment to Owner
            </h2>
            
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-4 mb-4 border border-blue-200">
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <p className="text-xs text-gray-600 uppercase font-semibold mb-1">Owner</p>
                  <p className="font-bold text-gray-800">
                    {selectedPayment.ownerId?.firstName} {selectedPayment.ownerId?.lastName}
                  </p>
                  <p className="text-sm text-gray-600">{selectedPayment.ownerId?.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-600 uppercase font-semibold mb-1">Amount</p>
                  <p className="text-3xl font-bold text-emerald-600">
                    ${selectedPayment.amount.toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="pt-3 border-t border-blue-200">
                <p className="text-xs text-gray-600">Transaction ID:</p>
                <p className="text-xs font-mono text-gray-800">{selectedPayment.transactionId}</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block font-semibold mb-2 text-sm">
                Admin Verification Note *
              </label>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="Service verified, no issues reported. Releasing payment to owner..."
                rows={4}
                className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none text-sm"
                maxLength={500}
              />
              <small className="text-gray-500 text-xs">
                {adminNote.length}/500 characters
              </small>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
              <p className="text-xs text-gray-700">
                ⚠️ <strong>Warning:</strong> This action will release ${selectedPayment.amount.toFixed(2)} to the owner.
                This action cannot be undone.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowReleaseModal(false);
                  setSelectedPayment(null);
                  setAdminNote("");
                }}
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-semibold text-gray-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyAndRelease}
                disabled={!adminNote.trim()}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-xl transition"
              >
                Release Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}