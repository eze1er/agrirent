import React, { useState } from "react";
import "./RentalActionsComponent.css";
import { paymentAPI, uploadAPI } from "../services/api";

const RentalActionsComponent = ({ rental, currentUser, onUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [note, setNote] = useState("");
  const [actionType, setActionType] = useState("");
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeError, setDisputeError] = useState("");
  const [disputeImages, setDisputeImages] = useState([]);
  const [disputeImagePreviews, setDisputeImagePreviews] = useState([]);

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

  const handleDisputeImageUpload = (e) => {
    const files = Array.from(e.target.files);

    // Limit to 5 images
    if (files.length + disputeImages.length > 5) {
      setDisputeError("Maximum 5 images allowed");
      return;
    }

    setDisputeImages([...disputeImages, ...files]);

    // Create previews
    const newPreviews = files.map((file) => URL.createObjectURL(file));
    setDisputeImagePreviews([...disputeImagePreviews, ...newPreviews]);
  };

  const removeDisputeImage = (index) => {
    setDisputeImages(disputeImages.filter((_, i) => i !== index));
    setDisputeImagePreviews(disputeImagePreviews.filter((_, i) => i !== index));
  };
  // Handle opening a dispute
// Handle opening a dispute
  const handleOpenDispute = async () => {
    if (!disputeReason.trim() || disputeReason.trim().length < 20) {
      setDisputeError(
        "Please provide a detailed reason (minimum 20 characters)"
      );
      return;
    }

    if (!window.confirm("⚠️ Are you sure you want to open a dispute? This will pause the payment process and notify our admin team.")) {
      return;
    }

    setLoading(true);
    setDisputeError("");

    try {
      console.log("🔍 Starting dispute submission...");
      
      // ✅ Upload images FIRST if any
      let imageUrls = [];
      if (disputeImages.length > 0) {
        console.log("📸 Uploading", disputeImages.length, "images...");
        try {
          // Upload using your existing uploadAPI
          const uploadResponse = await uploadAPI.uploadImages(disputeImages);
          imageUrls = uploadResponse.data.images.map(img => img.url);
          console.log("✅ Images uploaded:", imageUrls);
        } catch (uploadError) {
          console.error("❌ Image upload failed:", uploadError);
          console.error("❌ Upload error details:", uploadError.response?.data);
          setDisputeError(`Failed to upload images: ${uploadError.response?.data?.message || uploadError.message}`);
          setLoading(false);
          return;
        }
      }

      console.log("📤 Sending dispute to API with", imageUrls.length, "images");
      
      // ✅ Send dispute with image URLs
      const response = await paymentAPI.openDispute(rental._id, {
        reason: disputeReason.trim(),
        disputedBy: isOwner ? "owner" : "renter",
        images: imageUrls
      });

      console.log("✅ Dispute response:", response.data);

      if (response.data.success) {
        alert("⚠️ Dispute opened successfully.\n\nOur team will review your case within 24 hours and contact both parties. Your payment is secure.");
        setShowDisputeModal(false);
        setDisputeReason("");
        setDisputeImages([]);
        setDisputeImagePreviews([]);
        if (onUpdate) onUpdate();
      }
    } catch (error) {
      console.error("❌ Full dispute error:", error);
      console.error("❌ Error response:", error.response?.data);
      
      const errorMsg = error.response?.data?.message || error.message || "Failed to open dispute";
      setDisputeError(errorMsg);
      alert(`❌ Error: ${errorMsg}`);
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
          DISPUTE BUTTON
          ======================================== */}
      {(rental.status === "active" ||
        rental.status === "completed" ||
        rental.status === "released") &&
        rental.payment?.status !== "completed" &&
        rental.status !== "disputed" &&
        (isOwner || isRenter) && (
          <div className="action-card" style={{ marginTop: "15px" }}>
            <button
              onClick={() => setShowDisputeModal(true)}
              className="btn-warning"
              style={{
                width: "100%",
                backgroundColor: "#fb923c",
                color: "white",
                padding: "12px",
                borderRadius: "8px",
                border: "none",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              ⚠️ Open Dispute
            </button>
          </div>
        )}

      {/* Show if already disputed */}
      {rental.status === "disputed" && (isOwner || isRenter) && (
        <div
          className="action-card"
          style={{ backgroundColor: "#fff7ed", border: "2px solid #fb923c" }}
        >
          <h3 style={{ color: "#ea580c" }}>⚠️ Dispute Active</h3>
          <p>
            <strong>Reason:</strong> {rental.disputeReason}
          </p>
          <p style={{ fontSize: "14px", color: "#6b7280" }}>
            Our admin team is reviewing this case. Both parties will be
            contacted soon.
          </p>
          {rental.disputedBy && (
            <p style={{ fontSize: "12px", color: "#9ca3af", marginTop: "8px" }}>
              Opened by:{" "}
              <strong style={{ textTransform: "capitalize" }}>
                {rental.disputedBy}
              </strong>
            </p>
          )}
        </div>
      )}

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
              {actionType === "complete"
                ? "✅ Mark Job as Complete"
                : "✅ Confirm Completion & Rate"}
            </h3>

            {actionType === "confirm" && <StarRating />}

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                actionType === "complete"
                  ? "Describe the work completed, any issues encountered, equipment condition, etc. (minimum 10 characters)"
                  : "Share your experience with this rental. How was the equipment? Any feedback? (minimum 10 characters)"
              }
              rows={5}
              className="note-input"
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                fontSize: "14px",
                fontFamily: "inherit",
                resize: "vertical",
                marginBottom: "15px",
              }}
            />

            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => {
                  setShowNoteModal(false);
                  setNote("");
                  setRating(0);
                }}
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-semibold text-gray-700 transition disabled:opacity-50"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitAction}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-xl transition"
                disabled={
                  loading ||
                  !note.trim() ||
                  (actionType === "confirm" && rating === 0)
                }
              >
                {loading
                  ? "Submitting..."
                  : actionType === "complete"
                  ? "Mark Complete"
                  : "Confirm & Submit Rating"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================
          DISPUTE MODAL
          ======================================== */}
      {showDisputeModal && (
        <div
          className="modal-overlay"
          onClick={() => !loading && setShowDisputeModal(false)}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: "90vh", overflowY: "auto" }}
          >
            <h3 style={{ color: "#ea580c", marginBottom: "15px" }}>
              ⚠️ Open Dispute
            </h3>

            <p style={{ marginBottom: "15px", color: "#374151" }}>
              If there's an issue with this rental, please provide details
              below. Our team will review and resolve fairly.
            </p>

            <div
              style={{
                backgroundColor: "#dbeafe",
                border: "1px solid #3b82f6",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "15px",
                fontSize: "13px",
              }}
            >
              💡 <strong>Note:</strong> Your payment of $
              {rental.pricing?.totalPrice?.toFixed(2)}
              is secure in escrow. No funds will be released until the dispute
              is resolved.
            </div>

            <label
              style={{
                display: "block",
                fontWeight: "600",
                marginBottom: "8px",
                color: "#374151",
              }}
            >
              What went wrong? <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder={
                isOwner
                  ? "Example: Machine was returned damaged, hydraulic system not working..."
                  : "Example: Machine broke down after 2 hours, job not completed, owner unresponsive..."
              }
              rows={5}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "2px solid #d1d5db",
                fontSize: "14px",
                fontFamily: "inherit",
                resize: "vertical",
                marginBottom: "8px",
              }}
              maxLength={1000}
            />
            <small
              style={{
                fontSize: "12px",
                color: "#6b7280",
                display: "block",
                marginBottom: "15px",
              }}
            >
              {disputeReason.length}/1000 characters (minimum 20 required)
            </small>

            {/* ✅ IMAGE UPLOAD SECTION */}
            <div style={{ marginBottom: "15px" }}>
              <label
                style={{
                  display: "block",
                  fontWeight: "600",
                  marginBottom: "8px",
                  color: "#374151",
                }}
              >
                📷 Upload Proof Images (Optional)
              </label>
              <p
                style={{
                  fontSize: "12px",
                  color: "#6b7280",
                  marginBottom: "8px",
                }}
              >
                Upload photos showing the damage or issue (max 5 images, 10MB
                each)
              </p>

              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleDisputeImageUpload}
                disabled={disputeImages.length >= 5}
                style={{ display: "none" }}
                id="dispute-image-upload"
              />

              <label
                htmlFor="dispute-image-upload"
                style={{
                  display: "inline-block",
                  padding: "10px 20px",
                  backgroundColor:
                    disputeImages.length >= 5 ? "#e5e7eb" : "#3b82f6",
                  color: "white",
                  borderRadius: "8px",
                  cursor: disputeImages.length >= 5 ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  fontWeight: "600",
                  marginBottom: "10px",
                }}
              >
                📁{" "}
                {disputeImages.length >= 5
                  ? "Max images reached"
                  : "Choose Images"}
              </label>

              {/* Image Previews */}
              {disputeImagePreviews.length > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "10px",
                    marginTop: "10px",
                  }}
                >
                  {disputeImagePreviews.map((preview, index) => (
                    <div key={index} style={{ position: "relative" }}>
                      <img
                        src={preview}
                        alt={`Proof ${index + 1}`}
                        style={{
                          width: "100%",
                          height: "80px",
                          objectFit: "cover",
                          borderRadius: "8px",
                          border: "2px solid #d1d5db",
                        }}
                      />
                      <button
                        onClick={() => removeDisputeImage(index)}
                        style={{
                          position: "absolute",
                          top: "-8px",
                          right: "-8px",
                          backgroundColor: "#ef4444",
                          color: "white",
                          border: "none",
                          borderRadius: "50%",
                          width: "24px",
                          height: "24px",
                          cursor: "pointer",
                          fontSize: "14px",
                          fontWeight: "bold",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {disputeError && (
              <div
                style={{
                  backgroundColor: "#fee2e2",
                  border: "1px solid #ef4444",
                  borderRadius: "8px",
                  padding: "12px",
                  marginBottom: "15px",
                  color: "#991b1b",
                  fontSize: "14px",
                }}
              >
                {disputeError}
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => {
                  setShowDisputeModal(false);
                  setDisputeReason("");
                  setDisputeError("");
                  setDisputeImages([]);
                  setDisputeImagePreviews([]);
                }}
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-semibold text-gray-700 transition disabled:opacity-50"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={handleOpenDispute}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-xl transition"
                disabled={loading || disputeReason.trim().length < 20}
              >
                {loading ? "Submitting..." : "Submit Dispute"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RentalActionsComponent;
