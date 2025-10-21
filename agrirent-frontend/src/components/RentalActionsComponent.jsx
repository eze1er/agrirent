import React, { useState } from 'react';
import api from '../services/api';
// import RentalActionsComponent from '../components/RentalActionsComponent';

const RentalActionsComponent = ({ rental, currentUser, onUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [note, setNote] = useState('');
  const [actionType, setActionType] = useState(''); // 'complete' or 'confirm'

  const isOwner = currentUser?.id === rental.ownerId?._id;
  const isRenter = currentUser?.id === rental.renterId?._id;
  const isAdmin = currentUser?.role === 'admin';

  // Owner marks job as complete
  const handleMarkComplete = async () => {
    setActionType('complete');
    setShowNoteModal(true);
  };

  // Renter confirms completion
  const handleConfirmCompletion = async () => {
    setActionType('confirm');
    setShowNoteModal(true);
  };

  // Submit the action with note
  const handleSubmitAction = async () => {
    if (!note.trim() || note.trim().length < 10) {
      alert('Please provide a detailed note (minimum 10 characters)');
      return;
    }

    setLoading(true);
    try {
      if (actionType === 'complete') {
        // Owner marks as complete
        await api.post(`/payments/owner/mark-complete/${rental._id}`, {
          completionNote: note
        });
        alert('Job marked as complete! Waiting for renter confirmation.');
      } else if (actionType === 'confirm') {
        // Renter confirms completion
        await api.post(`/payments/confirm-completion/${rental._id}`, {
          confirmationNote: note
        });
        alert('Completion confirmed! Payment will be released by admin within 24-48 hours.');
      }
      
      setShowNoteModal(false);
      setNote('');
      if (onUpdate) onUpdate(); // Refresh rental data
    } catch (error) {
      console.error('Action error:', error);
      alert(error.response?.data?.message || 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rental-actions-container">
      {/* OWNER: Mark as Complete Button */}
      {isOwner && rental.status === 'active' && rental.payment?.status === 'held_in_escrow' && (
        <div className="action-card owner-action">
          <h3>🔧 Job Status</h3>
          <p>The rental is currently active. Once you've completed the work:</p>
          <button 
            onClick={handleMarkComplete}
            className="btn-primary"
            disabled={loading}
          >
            ✅ Mark Job as Complete
          </button>
        </div>
      )}

      {/* RENTER: Confirm Completion Button */}
      {isRenter && rental.status === 'completed' && !rental.confirmations?.renterConfirmed && (
        <div className="action-card renter-action">
          <h3>✅ Confirm Completion</h3>
          <p>The owner has marked this job as complete.</p>
          <p><strong>Owner's note:</strong> {rental.confirmations?.ownerCompletionNote || 'No note provided'}</p>
          <p>Please confirm that the work was completed satisfactorily to release payment.</p>
          <button 
            onClick={handleConfirmCompletion}
            className="btn-success"
            disabled={loading}
          >
            👍 Confirm & Release Payment
          </button>
        </div>
      )}

      {/* WAITING STATES */}
      {isOwner && rental.status === 'completed' && !rental.confirmations?.renterConfirmed && (
        <div className="action-card waiting-state">
          <h3>⏳ Waiting for Renter</h3>
          <p>You've marked the job as complete. Waiting for renter confirmation to release payment.</p>
        </div>
      )}

      {isRenter && rental.confirmations?.renterConfirmed && !rental.confirmations?.adminVerified && (
        <div className="action-card waiting-state">
          <h3>⏳ Payment Processing</h3>
          <p>You've confirmed completion. Admin will release payment within 24-48 hours.</p>
          <p><strong>Amount:</strong> ${rental.payment?.amount?.toFixed(2)}</p>
        </div>
      )}

      {/* ADMIN: Can see all pending releases */}
      {isAdmin && rental.confirmations?.renterConfirmed && !rental.confirmations?.adminVerified && (
        <div className="action-card admin-action">
          <h3>🔐 Admin Action Required</h3>
          <p>Both parties have confirmed. Ready to release payment.</p>
          <a href="/admin/payments" className="btn-admin">
            Go to Admin Dashboard
          </a>
        </div>
      )}

      {/* COMPLETED STATE */}
      {rental.payment?.status === 'completed' && rental.confirmations?.adminVerified && (
        <div className="action-card completed-state">
          <h3>✅ Rental Completed</h3>
          <p>Payment has been released to the owner.</p>
          <p><strong>Completed on:</strong> {new Date(rental.confirmations.adminVerifiedAt).toLocaleDateString()}</p>
        </div>
      )}

      {/* MODAL FOR NOTES */}
      {showNoteModal && (
        <div className="modal-overlay" onClick={() => !loading && setShowNoteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>
              {actionType === 'complete' ? '📝 Job Completion Note' : '✅ Confirmation Note'}
            </h3>
            <p>
              {actionType === 'complete' 
                ? 'Describe the work completed and any important details:'
                : 'Confirm that the work was completed satisfactorily:'
              }
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Enter your note here (minimum 10 characters)..."
              rows="5"
              className="modal-textarea"
              disabled={loading}
            />
            <div className="modal-actions">
              <button 
                onClick={() => setShowNoteModal(false)}
                className="btn-secondary"
                disabled={loading}
              >
                Cancel
              </button>
              <button 
                onClick={handleSubmitAction}
                className="btn-primary"
                disabled={loading || note.trim().length < 10}
              >
                {loading ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .rental-actions-container {
          margin: 20px 0;
        }

        .action-card {
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 15px;
          border: 2px solid;
        }

        .owner-action {
          background: #f0f9ff;
          border-color: #3b82f6;
        }

        .renter-action {
          background: #f0fdf4;
          border-color: #22c55e;
        }

        .admin-action {
          background: #fef3c7;
          border-color: #f59e0b;
        }

        .waiting-state {
          background: #f3f4f6;
          border-color: #9ca3af;
        }

        .completed-state {
          background: #ecfdf5;
          border-color: #10b981;
        }

        .action-card h3 {
          margin: 0 0 10px 0;
          font-size: 18px;
        }

        .action-card p {
          margin: 5px 0;
        }

        .btn-primary,
        .btn-success,
        .btn-admin,
        .btn-secondary {
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 10px;
          transition: all 0.3s;
        }

        .btn-primary {
          background: #3b82f6;
          color: white;
        }

        .btn-primary:hover {
          background: #2563eb;
        }

        .btn-success {
          background: #22c55e;
          color: white;
        }

        .btn-success:hover {
          background: #16a34a;
        }

        .btn-admin {
          background: #f59e0b;
          color: white;
          text-decoration: none;
          display: inline-block;
        }

        .btn-admin:hover {
          background: #d97706;
        }

        .btn-secondary {
          background: #6b7280;
          color: white;
        }

        .btn-secondary:hover {
          background: #4b5563;
        }

        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: white;
          padding: 30px;
          border-radius: 12px;
          max-width: 500px;
          width: 90%;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        }

        .modal-content h3 {
          margin: 0 0 15px 0;
        }

        .modal-textarea {
          width: 100%;
          padding: 12px;
          border: 2px solid #e5e7eb;
          border-radius: 6px;
          font-family: inherit;
          font-size: 14px;
          margin: 15px 0;
          resize: vertical;
        }

        .modal-textarea:focus {
          outline: none;
          border-color: #3b82f6;
        }

        .modal-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }
      `}</style>
    </div>
  );
};

export default RentalActionsComponent;
