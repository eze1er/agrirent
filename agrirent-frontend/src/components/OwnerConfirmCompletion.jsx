import { useState } from 'react';
import { CheckCircle, MessageSquare } from 'lucide-react';

export default function OwnerConfirmCompletion({ rental, onSuccess }) {
  const [showModal, setShowModal] = useState(false);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  // Only show if rental is active and payment is in escrow
  const canConfirm = rental.status === 'active' && 
                     rental.payment?.status === 'held_in_escrow' &&
                     !rental.ownerConfirmedCompletion;

  if (!canConfirm) return null;

  const handleConfirm = async () => {
    if (!note.trim() || note.trim().length < 10) {
      alert('❌ Please provide a detailed note (minimum 10 characters)');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_BASE}/payments/rentals/${rental._id}/owner-confirm`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            confirmationNote: note.trim()
          })
        }
      );

      const data = await response.json();

      if (data.success) {
        alert('✅ Job completion confirmed! Renter will be notified to confirm.');
        setShowModal(false);
        setNote('');
        if (onSuccess) onSuccess();
      } else {
        alert(`❌ ${data.message}`);
      }
    } catch (error) {
      console.error('Confirmation error:', error);
      alert('❌ Failed to confirm completion. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Confirm Button */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <CheckCircle size={24} className="text-green-600" />
          <div>
            <h4 className="font-bold text-green-900">Job Complete?</h4>
            <p className="text-sm text-gray-700">Mark this rental as completed</p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="w-full px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg font-bold hover:shadow-lg transition"
        >
          ✅ Mark Job as Completed
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => !loading && setShowModal(false)}
        >
          <div 
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              🎉 Confirm Job Completion
            </h2>

            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4 rounded">
              <p className="text-sm text-gray-700">
                <strong>Machine:</strong> {rental.machineId?.name}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Renter:</strong> {rental.renterId?.firstName} {rental.renterId?.lastName}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Amount:</strong> ${rental.pricing?.totalPrice?.toFixed(2)}
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Completion Notes *
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Example: Job completed successfully. Machine returned in good condition. Service was provided as agreed. Renter was professional and followed all safety guidelines."
                rows={5}
                disabled={loading}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:ring-2 focus:ring-green-200 disabled:bg-gray-100"
                maxLength={500}
              />
              <small className="text-gray-500">
                {note.length}/500 characters (minimum 10 required)
              </small>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-xs text-gray-700">
                ⚠️ After you confirm, the renter will be notified to confirm completion. 
                Payment will be released once both parties confirm.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowModal(false);
                  setNote('');
                }}
                disabled={loading}
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading || note.trim().length < 10}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg font-bold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Confirming...' : '✅ Confirm Completion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}