import React, { useState } from 'react';
import { CheckCircle, MessageSquare, AlertCircle } from 'lucide-react';

export default function RenterConfirmCompletion({ rental, onSuccess }) {
  const [showModal, setShowModal] = useState(false);
  const [confirmationNote, setConfirmationNote] = useState('');
  const [loading, setLoading] = useState(false);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  const handleConfirm = async () => {
    if (!confirmationNote || confirmationNote.length < 10) {
      alert('❌ Please provide a detailed confirmation note (minimum 10 characters)');
      return;
    }

    if (!window.confirm(
      `Confirm rental completion?\n\n` +
      `This will notify the admin to release payment to the owner.\n\n` +
      `Machine: ${rental.machineId?.name || 'N/A'}\n` +
      `Amount: $${rental.pricing?.totalPrice?.toFixed(2) || '0.00'}`
    )) {
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const response = await fetch(
        `${API_BASE}/rentals/${rental._id}/renter-confirm`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ confirmationNote })
        }
      );

      const data = await response.json();

      if (data.success) {
        alert('✅ Rental completion confirmed!\n\nAdmin will review and release payment to the owner.');
        setShowModal(false);
        setConfirmationNote('');
        if (onSuccess) onSuccess();
      } else {
        throw new Error(data.message || 'Failed to confirm completion');
      }
    } catch (error) {
      console.error('Confirm error:', error);
      alert(`❌ Failed to confirm: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Only show if rental is active and payment is in escrow
  if (rental.status !== 'active' || rental.payment?.status !== 'held_in_escrow') {
    return null;
  }

  // Don't show if already confirmed
  if (rental.renterConfirmedCompletion) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4">
        <div className="flex items-center gap-2 text-green-800">
          <CheckCircle size={20} />
          <span className="font-semibold">✅ You confirmed completion</span>
        </div>
        {rental.renterConfirmationNote && (
          <p className="text-sm text-gray-700 mt-2 italic">
            "{rental.renterConfirmationNote}"
          </p>
        )}
        <p className="text-xs text-gray-600 mt-2">
          Waiting for admin to release payment to owner...
        </p>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white py-3 px-4 rounded-xl font-bold hover:shadow-xl transition flex items-center justify-center gap-2"
      >
        <CheckCircle size={20} />
        Confirm Rental Completion
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">
              Confirm Rental Completion
            </h2>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
              <p className="text-sm text-gray-700">
                <strong>Machine:</strong> {rental.machineId?.name || 'N/A'}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Amount:</strong> ${rental.pricing?.totalPrice?.toFixed(2) || '0.00'}
              </p>
              <p className="text-sm text-gray-700 mt-2">
                By confirming, you acknowledge:
              </p>
              <ul className="text-xs text-gray-600 mt-2 ml-4 list-disc space-y-1">
                <li>Service has been completed satisfactorily</li>
                <li>Machine was as described</li>
                <li>Payment will be released to owner</li>
                <li>No disputes or issues</li>
              </ul>
            </div>

            <div className="mb-4">
              <label className="block font-semibold mb-2 flex items-center gap-2">
                <MessageSquare size={18} />
                Your Feedback (Required) *
              </label>
              <textarea
                value={confirmationNote}
                onChange={(e) => setConfirmationNote(e.target.value)}
                placeholder="Example: Excellent service! Machine worked perfectly. Owner was professional and helpful. Very satisfied with the rental."
                rows={5}
                className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none"
                maxLength={500}
              />
              <div className="flex justify-between items-center mt-2">
                <small className="text-gray-500 text-xs">
                  {confirmationNote.length}/500 characters
                </small>
                <small className={`text-xs font-semibold ${
                  confirmationNote.length >= 10 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {confirmationNote.length >= 10 ? '✓ Good' : `Need ${10 - confirmationNote.length} more`}
                </small>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
              <div className="flex items-start gap-2">
                <AlertCircle size={18} className="text-amber-600 mt-0.5" />
                <p className="text-xs text-gray-700">
                  <strong>Important:</strong> Only confirm if you are completely satisfied. 
                  Once confirmed, admin will release payment to the owner.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowModal(false);
                  setConfirmationNote('');
                }}
                disabled={loading}
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading || confirmationNote.length < 10}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-xl transition"
              >
                {loading ? 'Confirming...' : '✓ Confirm Completion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};