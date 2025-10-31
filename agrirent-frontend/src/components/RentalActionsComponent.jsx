import React, { useState } from "react";
import { paymentAPI } from "../services/api";
import "./RentalActionsComponent.css";

const RentalActionsComponent = ({ rental, currentUser, onUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [note, setNote] = useState("");
  const [actionType, setActionType] = useState(""); // 'complete' or 'confirm'
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);

  const isOwner =
    currentUser?.id === rental.ownerId?._id ||
    currentUser?.id === rental.ownerId;
  const isRenter =
    currentUser?.id === rental.renterId?._id ||
    currentUser?.id === rental.renterId;
  const isAdmin = currentUser?.role === "admin";

  // Owner marks job as complete
  const handleMarkComplete = () => {
    setActionType("complete");
    setNote("");
    setShowNoteModal(true);
  };

  // Renter confirms completion
  const handleConfirmCompletion = () => {
    setActionType("confirm");
    setNote("");
    setShowNoteModal(true);
  };

  // Submit the action with note
  const handleSubmitAction = async () => {
    if (!note.trim() || note.trim().length < 10) {
      alert("Please provide a detailed note (minimum 10 characters)");
      return;
    }
    // ✅ Require rating for renter confirmation
    if (actionType === "confirm" && rating === 0) {
      alert("Please provide a rating (1-5 stars)");
      return;
    }
    setLoading(true);
    try {
      if (actionType === "complete") {
        // ✅ Owner marks as complete
        const response = await paymentAPI.ownerConfirm(rental._id, {
          confirmationNote: note.trim(),
        });

        if (response.data.success) {
          alert(
            "✅ Job marked as complete! Renter has been notified to confirm."
          );
          setShowNoteModal(false);
          setNote("");
          if (onUpdate) onUpdate();
        }
      } else if (actionType === "confirm") {
        // ✅ Renter confirms completion
        const response = await paymentAPI.renterConfirm(rental._id, {
          confirmationNote: note.trim(),
          rating: rating, // ✅ Include rating
          reviewComment: note.trim(),
        });

        if (response.data.success) {
          alert(
            `✅ Completion confirmed with ${rating}⭐ rating! Both parties confirmed. Admin will release payment.`
          );
          setShowNoteModal(false);
          setNote("");
          setRating(0);
          if (onUpdate) onUpdate();
        }
      }
    } catch (error) {
      console.error("❌ Action error:", error);
      alert(error.response?.data?.message || "Action failed");
    } finally {
      setLoading(false);
    }
  };

  // ✅ StarRating component
  const StarRating = () => (
    <div style={{ marginBottom: "15px" }}>
      <label
        style={{
          display: "block",
          marginBottom: "8px",
          fontWeight: "600",
          color: "#374151",
        }}
      >
        Rating{" "}
        {actionType === "confirm" && (
          <span style={{ color: "#ef4444" }}>*</span>
        )}
      </label>
      <div style={{ display: "flex", gap: "8px", fontSize: "32px" }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoveredRating(star)}
            onMouseLeave={() => setHoveredRating(0)}
            style={{
              cursor: "pointer",
              color: star <= (hoveredRating || rating) ? "#fbbf24" : "#d1d5db",
              transition: "color 0.2s",
            }}
          >
            ★
          </span>
        ))}
      </div>
      {rating > 0 && (
        <p style={{ marginTop: "8px", fontSize: "14px", color: "#6b7280" }}>
          You rated: {rating} star{rating !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );

  return (
    <div className="rental-actions-container">
      {/* ========================================
          OWNER: Mark Job as Complete
          ======================================== */}
      {isOwner &&
        rental.status === "active" &&
        rental.payment?.status === "held_in_escrow" &&
        !rental.ownerConfirmedCompletion && (
          <div className="action-card owner-action">
            <h3>🔧 Job Status</h3>
            <p>
              The rental is currently active and paid. Once you've completed the
              work:
            </p>
            <button
              onClick={handleMarkComplete}
              className="btn-primary"
              disabled={loading}
            >
              ✅ Mark Job as Completed
            </button>
          </div>
        )}

      {/* ========================================
          RENTER: Confirm Completion
          ======================================== */}
      {isRenter &&
        rental.status === "completed" &&
        rental.payment?.status === "held_in_escrow" &&
        rental.ownerConfirmedCompletion &&
        !rental.renterConfirmedCompletion && (
          <div className="action-card renter-action">
            <h3>✅ Confirm Completion</h3>
            <p>
              The owner has marked this job as <strong>completed</strong>.
            </p>
            {rental.ownerConfirmedAt && (
              <p className="highlight-box">
                📋 <strong>Completed on:</strong>{" "}
                {new Date(rental.ownerConfirmedAt).toLocaleDateString()}
              </p>
            )}
            {rental.ownerConfirmationNote && (
              <div className="info-box">
                📝 <strong>Owner's note:</strong> {rental.ownerConfirmationNote}
              </div>
            )}
            <p>
              Please confirm that the work was completed satisfactorily to
              release payment to the owner.
            </p>
            <button
              onClick={handleConfirmCompletion}
              className="btn-success"
              disabled={loading}
            >
              👍 Confirm Job Completion
            </button>
          </div>
        )}

      {/* ========================================
          WAITING STATES
          ======================================== */}

      {/* Owner confirmed, waiting for renter */}
      {isOwner &&
        rental.status === "completed" &&
        rental.ownerConfirmedCompletion &&
        !rental.renterConfirmedCompletion && (
          <div className="action-card waiting-state">
            <h3>⏳ Waiting for Renter Confirmation</h3>
            <p>
              You've marked the job as completed on{" "}
              {rental.ownerConfirmedAt
                ? new Date(rental.ownerConfirmedAt).toLocaleDateString()
                : "today"}
              .
            </p>
            <p>
              The renter will confirm completion, then payment will be released
              to you.
            </p>
            {rental.ownerConfirmationNote && (
              <div className="info-box">
                📝 <strong>Your note:</strong> {rental.ownerConfirmationNote}
              </div>
            )}
            <div className="info-box">
              💰 <strong>Amount to receive:</strong> $
              {rental.pricing?.totalPrice?.toFixed(2)}
            </div>
          </div>
        )}

      {/* Both confirmed, waiting for admin */}
      {rental.ownerConfirmedCompletion &&
        rental.renterConfirmedCompletion &&
        rental.payment?.status === "held_in_escrow" &&
        (isOwner || isRenter) && (
          <div className="action-card waiting-state">
            <h3>🎉 Both Parties Confirmed!</h3>
            <p>
              Both you and the {isOwner ? "renter" : "owner"} have confirmed
              completion.
            </p>
            <p>Admin will review and release payment within 24-48 hours.</p>
            <div className="info-box">
              💰 <strong>Amount:</strong> $
              {rental.pricing?.totalPrice?.toFixed(2)}
              <br />✅ <strong>Owner confirmed:</strong>{" "}
              {rental.ownerConfirmedAt
                ? new Date(rental.ownerConfirmedAt).toLocaleDateString()
                : "Yes"}
              <br />✅ <strong>Renter confirmed:</strong>{" "}
              {rental.renterConfirmedAt
                ? new Date(rental.renterConfirmedAt).toLocaleDateString()
                : "Yes"}
            </div>
          </div>
        )}

      {/* ========================================
          ADMIN VIEW
          ======================================== */}
      {isAdmin &&
        rental.ownerConfirmedCompletion &&
        rental.renterConfirmedCompletion &&
        rental.payment?.status === "held_in_escrow" && (
          <div className="action-card admin-action">
            <h3>🔐 Admin Action Required</h3>
            <p>Both parties have confirmed. Ready to release payment.</p>
            <div className="info-box">
              💰 <strong>Amount:</strong> $
              {rental.pricing?.totalPrice?.toFixed(2)}
              <br />✅ <strong>Owner confirmed:</strong>{" "}
              {rental.ownerConfirmedAt
                ? new Date(rental.ownerConfirmedAt).toLocaleDateString()
                : "Yes"}
              <br />✅ <strong>Renter confirmed:</strong>{" "}
              {rental.renterConfirmedAt
                ? new Date(rental.renterConfirmedAt).toLocaleDateString()
                : "Yes"}
            </div>
            <a href="/admin/escrow" className="btn-admin">
              Go to Admin Dashboard
            </a>
          </div>
        )}

      {/* ========================================
          COMPLETED STATE
          ======================================== */}
      {(rental.status === "closed" ||
        rental.payment?.status === "completed") && (
        <div className="action-card completed-state">
          <h3>✅ Rental Completed Successfully</h3>
          <p>This rental has been completed and payment has been released.</p>
          <div className="info-box">
            💰 <strong>Total Amount:</strong> $
            {rental.pricing?.totalPrice?.toFixed(2)}
            <br />
            📅 <strong>Completed:</strong>{" "}
            {rental.completedAt
              ? new Date(rental.completedAt).toLocaleDateString()
              : "N/A"}
            <br />
            💳 <strong>Payment Released:</strong>{" "}
            {rental.payment?.releasedAt
              ? new Date(rental.payment.releasedAt).toLocaleDateString()
              : "Yes"}
          </div>
        </div>
      )}

      {/* ========================================
          MODAL
          ======================================== */}
      {showNoteModal && (
        <div
          className="modal-overlay"
          onClick={() => !loading && setShowNoteModal(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>
              {actionType === 'complete' 
                ? '✅ Mark Job as Complete' 
                : '✅ Confirm Completion & Rate'
              }
            </h3>

            {actionType === 'confirm' && <StarRating />}
            
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                actionType === 'complete' 
                  ? "Describe the work completed, any issues encountered, equipment condition, etc. (minimum 10 characters)"
                  : "Share your experience with this rental. How was the equipment? Any feedback? (minimum 10 characters)"
              }
              rows={5}
              className="note-input"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical',
                marginBottom: '15px'
              }}
            />
            
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowNoteModal(false);
                  setNote('');
                  setRating(0);
                }}
                className="cancel-btn"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitAction}
                className="confirm-btn"
                disabled={loading || !note.trim() || (actionType === 'confirm' && rating === 0)}
              >
                {loading ? 'Submitting...' : actionType === 'complete' ? 'Mark Complete' : 'Confirm & Submit Rating'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RentalActionsComponent;