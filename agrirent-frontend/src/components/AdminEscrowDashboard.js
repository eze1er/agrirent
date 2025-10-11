// src/components/AdminEscrowDashboard.js
import { useState, useEffect } from "react";
import { DollarSign, Clock, AlertTriangle, CheckCircle, X } from "lucide-react";
import { paymentAPI } from "../services/api";

export default function AdminEscrowDashboard() {
  const [escrowBalance, setEscrowBalance] = useState(null);
  const [pendingReleases, setPendingReleases] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [adminNote, setAdminNote] = useState("");
  const [disputeResolution, setDisputeResolution] = useState({
    outcome: "release_to_owner",
    resolution: "",
    refundAmount: 0,
    releaseAmount: 0,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [balanceRes, pendingRes, disputesRes] = await Promise.all([
        paymentAPI.getEscrowBalance(),
        paymentAPI.getPendingPayouts(),
        paymentAPI.getAllDisputes(),
      ]);

      setEscrowBalance(balanceRes.data.data);
      setPendingReleases(pendingRes.data.data || []);
      setDisputes(disputesRes.data.data || []);
    } catch (error) {
      console.error("Error fetching admin data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndRelease = async () => {
    if (!adminNote.trim()) {
      alert("Please provide verification notes");
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
      alert(error.response?.data?.message || "Failed to release payment");
    }
  };

  const handleResolveDispute = async () => {
    if (!disputeResolution.resolution.trim()) {
      alert("Please provide resolution details");
      return;
    }

    if (
      ["partial_refund", "split"].includes(disputeResolution.outcome) &&
      (!disputeResolution.refundAmount || !disputeResolution.releaseAmount)
    ) {
      alert("Please specify refund and release amounts");
      return;
    }

    try {
      await paymentAPI.resolveDispute(selectedPayment._id, disputeResolution);
      alert("✅ Dispute resolved successfully!");
      setShowDisputeModal(false);
      setSelectedPayment(null);
      setDisputeResolution({
        outcome: "release_to_owner",
        resolution: "",
        refundAmount: 0,
        releaseAmount: 0,
      });
      fetchData();
    } catch (error) {
      alert(error.response?.data?.message || "Failed to resolve dispute");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
          Escrow Management Dashboard
        </h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-xl">
                <DollarSign size={32} className="text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Held in Escrow</p>
                <p className="text-3xl font-bold text-gray-800">
                  ${escrowBalance?.totalHeld?.toFixed(2) || "0.00"}
                </p>
                <p className="text-xs text-gray-500">
                  {escrowBalance?.count || 0} payments
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
                <p className="text-sm text-gray-600">Pending Releases</p>
                <p className="text-3xl font-bold text-gray-800">
                  {pendingReleases.length}
                </p>
                <p className="text-xs text-gray-500">Awaiting verification</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-rose-100 rounded-xl">
                <AlertTriangle size={32} className="text-rose-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Active Disputes</p>
                <p className="text-3xl font-bold text-gray-800">
                  {disputes.length}
                </p>
                <p className="text-xs text-gray-500">Need resolution</p>
              </div>
            </div>
          </div>
        </div>

        {/* Pending Releases Section */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Clock className="text-amber-600" />
            Pending Payment Releases
          </h2>
          {pendingReleases.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No pending releases
            </p>
          ) : (
            <div className="space-y-4">
              {pendingReleases.map((payment) => (
                <div
                  key={payment._id}
                  className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-lg">
                        {payment.rentalId?.machineId?.name || "Machine"}
                      </h3>
                      <p className="text-sm text-gray-600">
                        Renter: {payment.userId?.firstName}{" "}
                        {payment.userId?.lastName}
                      </p>
                      <p className="text-sm text-gray-600">
                        Owner: {payment.ownerId?.firstName}{" "}
                        {payment.ownerId?.lastName}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-blue-600">
                        ${payment.amount.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500">
                        Net to owner: ${(payment.amount * 0.9).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {payment.confirmations?.renterConfirmed && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-3">
                      <p className="text-sm font-semibold text-emerald-800">
                        ✅ Renter Confirmed Completion
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        {new Date(
                          payment.confirmations.renterConfirmedAt
                        ).toLocaleString()}
                      </p>
                      {payment.confirmations.renterConfirmationNote && (
                        <p className="text-sm text-gray-700 mt-2 italic">
                          "{payment.confirmations.renterConfirmationNote}"
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setSelectedPayment(payment);
                        setShowReleaseModal(true);
                      }}
                      className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-2 rounded-lg font-semibold hover:shadow-lg transition"
                    >
                      Verify & Release
                    </button>
                    <button
                      onClick={() => {
                        setSelectedPayment(payment);
                        setShowDisputeModal(true);
                      }}
                      className="px-4 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300 transition"
                    >
                      Review Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Disputes Section */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <AlertTriangle className="text-rose-600" />
            Active Disputes
          </h2>
          {disputes.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No active disputes</p>
          ) : (
            <div className="space-y-4">
              {disputes.map((payment) => (
                <div
                  key={payment._id}
                  className="border-2 border-orange-200 bg-orange-50 rounded-xl p-4"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-lg">
                        {payment.rentalId?.machineId?.name || "Machine"}
                      </h3>
                      <p className="text-sm text-gray-600">
                        Disputed by:{" "}
                        {payment.dispute.openedBy?.firstName ||
                          "Unknown"}{" "}
                        on{" "}
                        {new Date(
                          payment.dispute.openedAt
                        ).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-orange-600">
                        ${payment.amount.toFixed(2)}
                      </p>
                      <span className="inline-block px-3 py-1 bg-orange-200 text-orange-800 rounded-full text-xs font-bold">
                        {payment.dispute.status}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg p-3 mb-3">
                    <p className="text-sm font-semibold text-gray-800 mb-1">
                      Dispute Reason:
                    </p>
                    <p className="text-sm text-gray-700">
                      {payment.dispute.reason}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedPayment(payment);
                      setDisputeResolution({
                        outcome: "release_to_owner",
                        resolution: "",
                        refundAmount: 0,
                        releaseAmount: payment.amount * 0.9,
                      });
                      setShowDisputeModal(true);
                    }}
                    className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white py-2 rounded-lg font-semibold hover:shadow-lg transition"
                  >
                    Resolve Dispute
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Release Modal */}
      {showReleaseModal && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
              Verify & Release Payment
            </h2>
            <div className="mb-4">
              <p className="text-gray-700 mb-2">
                <strong>Machine:</strong>{" "}
                {selectedPayment.rentalId?.machineId?.name}
              </p>
              <p className="text-gray-700 mb-2">
                <strong>Amount:</strong> ${selectedPayment.amount.toFixed(2)}
              </p>
              <p className="text-gray-700 mb-2">
                <strong>Net to Owner:</strong> $
                {(selectedPayment.amount * 0.9).toFixed(2)}
              </p>
              <p className="text-gray-700 mb-4">
                <strong>Platform Fee (10%):</strong> $
                {(selectedPayment.amount * 0.1).toFixed(2)}
              </p>
            </div>
            <div className="mb-4">
              <label className="block font-semibold mb-2">
                Verification Notes
              </label>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="Verified rental completion, no issues reported..."
                rows={4}
                className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowReleaseModal(false);
                  setSelectedPayment(null);
                  setAdminNote("");
                }}
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyAndRelease}
                disabled={!adminNote.trim()}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold disabled:opacity-50"
              >
                Release to Owner
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispute Resolution Modal */}
      {showDisputeModal && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
              Resolve Dispute
            </h2>
            <div className="mb-4">
              <p className="text-gray-700 mb-2">
                <strong>Amount in Escrow:</strong> $
                {selectedPayment.amount.toFixed(2)}
              </p>
            </div>
            <div className="mb-4">
              <label className="block font-semibold mb-2">Outcome</label>
              <select
                value={disputeResolution.outcome}
                onChange={(e) =>
                  setDisputeResolution({
                    ...disputeResolution,
                    outcome: e.target.value,
                  })
                }
                className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none"
              >
                <option value="release_to_owner">
                  Release to Owner (100%)
                </option>
                <option value="refund_to_renter">
                  Refund to Renter (100%)
                </option>
                <option value="partial_refund">Partial Refund</option>
                <option value="split">Split Payment</option>
              </select>
            </div>

            {["partial_refund", "split"].includes(
              disputeResolution.outcome
            ) && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block font-semibold mb-2 text-sm">
                    Refund Amount
                  </label>
                  <input
                    type="number"
                    value={disputeResolution.refundAmount}
                    onChange={(e) =>
                      setDisputeResolution({
                        ...disputeResolution,
                        refundAmount: parseFloat(e.target.value),
                      })
                    }
                    className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-2 text-sm">
                    Release to Owner
                  </label>
                  <input
                    type="number"
                    value={disputeResolution.releaseAmount}
                    onChange={(e) =>
                      setDisputeResolution({
                        ...disputeResolution,
                        releaseAmount: parseFloat(e.target.value),
                      })
                    }
                    className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className="block font-semibold mb-2">
                Resolution Details
              </label>
              <textarea
                value={disputeResolution.resolution}
                onChange={(e) =>
                  setDisputeResolution({
                    ...disputeResolution,
                    resolution: e.target.value,
                  })
                }
                placeholder="After reviewing evidence from both parties..."
                rows={5}
                className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDisputeModal(false);
                  setSelectedPayment(null);
                  setDisputeResolution({
                    outcome: "release_to_owner",
                    resolution: "",
                    refundAmount: 0,
                    releaseAmount: 0,
                  });
                }}
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleResolveDispute}
                disabled={!disputeResolution.resolution.trim()}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-semibold disabled:opacity-50"
              >
                Resolve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}