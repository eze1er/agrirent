import React, { useState, useEffect } from "react";
import { paymentAPI } from "../services/api";

const AdminDisputeResolution = () => {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);

  // Resolution form state
  const [resolutionType, setResolutionType] = useState(""); // "owner", "renter", "split"
  const [ownerAmount, setOwnerAmount] = useState(0);
  const [renterAmount, setRenterAmount] = useState(0);
  const [adminNotes, setAdminNotes] = useState("");
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchDisputes();
  }, []);

  const fetchDisputes = async () => {
    try {
      setLoading(true);
      const response = await paymentAPI.getDisputes();
      setDisputes(response.data.data || []);
    } catch (error) {
      console.error("Failed to fetch disputes:", error);
    } finally {
      setLoading(false);
    }
  };

  const openResolveModal = (dispute) => {
    setSelectedDispute(dispute);
    setShowResolveModal(true);
    setResolutionType("");
    setOwnerAmount(0);
    setRenterAmount(0);
    setAdminNotes("");
    setError("");
  };

  const handleResolutionTypeChange = (type) => {
    setResolutionType(type);
    const totalAmount = selectedDispute.pricing?.totalPrice || 0;

    if (type === "owner") {
      setOwnerAmount(totalAmount);
      setRenterAmount(0);
    } else if (type === "renter") {
      setOwnerAmount(0);
      setRenterAmount(totalAmount);
    } else if (type === "split") {
      setOwnerAmount(totalAmount / 2);
      setRenterAmount(totalAmount / 2);
    }
  };

  const handleResolveDispute = async () => {
    if (!resolutionType) {
      setError("Please select a resolution type");
      return;
    }

    if (!adminNotes.trim() || adminNotes.trim().length < 20) {
      setError("Please provide detailed admin notes (minimum 20 characters)");
      return;
    }

    const totalAmount = selectedDispute.pricing?.totalPrice || 0;
    const distributedAmount =
      parseFloat(ownerAmount) + parseFloat(renterAmount);

    if (Math.abs(distributedAmount - totalAmount) > 0.01) {
      setError(
        `Total distributed amount ($${distributedAmount.toFixed(
          2
        )}) must equal rental amount ($${totalAmount.toFixed(2)})`
      );
      return;
    }

    if (
      !window.confirm(
        `⚠️ Resolve this dispute?\n\n` +
          `Owner receives: $${parseFloat(ownerAmount).toFixed(2)}\n` +
          `Renter refund: $${parseFloat(renterAmount).toFixed(2)}\n\n` +
          `This action cannot be undone.`
      )
    ) {
      return;
    }

    setResolving(true);
    setError("");

    try {
      const response = await paymentAPI.resolveDispute(selectedDispute._id, {
        resolutionType,
        ownerAmount: parseFloat(ownerAmount),
        renterAmount: parseFloat(renterAmount),
        adminNotes: adminNotes.trim(),
      });

      if (response.data.success) {
        alert(
          "✅ Dispute resolved successfully!\n\n" +
            `Owner receives: $${parseFloat(ownerAmount).toFixed(2)}\n` +
            `Renter refund: $${parseFloat(renterAmount).toFixed(2)}\n\n` +
            "Both parties have been notified. Escrow updated."
        );
        setShowResolveModal(false);
        setSelectedDispute(null);
        fetchDisputes();
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    } catch (error) {
      setError(error.response?.data?.message || "Failed to resolve dispute");
    } finally {
      setResolving(false);
    }
  };

  // Fermer la lightbox avec la touche Echap
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && lightboxImage) {
        setLightboxImage(null);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [lightboxImage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading disputes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          ⚠️ Dispute Management
        </h1>
        <p className="text-gray-600">Review and resolve rental disputes</p>
      </div>

      {disputes.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
          <span className="text-6xl mb-4 block">✅</span>
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            No Active Disputes
          </h3>
          <p className="text-gray-600">
            All disputes have been resolved. Great work!
          </p>
          <button
            onClick={() => (window.location.href = "/admin/dashboard")}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition mx-auto"
          >
            <span>←</span>
            <span>Back to Admin Dashboard</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {disputes.map((dispute) => (
            <div
              key={dispute._id}
              className="bg-white rounded-2xl shadow-sm border-2 border-orange-200 p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-gray-900">
                      {dispute.machineId?.name || "Unknown Machine"}
                    </h3>
                    <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm font-semibold">
                      DISPUTED
                    </span>
                  </div>
                  <p className="text-gray-600 text-sm">
                    Opened by:{" "}
                    <strong className="capitalize">{dispute.disputedBy}</strong>{" "}
                    on {new Date(dispute.disputedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-orange-600">
                    ${dispute.pricing?.totalPrice?.toFixed(2)}
                  </p>
                  <p className="text-sm text-gray-600">In Escrow</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-sm font-semibold text-blue-900 mb-1">
                    👤 Renter
                  </p>
                  <p className="font-bold text-blue-900">
                    {dispute.renterId?.firstName} {dispute.renterId?.lastName}
                  </p>
                  <p className="text-sm text-blue-700">
                    {dispute.renterId?.email}
                  </p>
                </div>
                <div className="bg-green-50 rounded-xl p-4">
                  <p className="text-sm font-semibold text-green-900 mb-1">
                    🏠 Owner
                  </p>
                  <p className="font-bold text-green-900">
                    {dispute.ownerId?.firstName} {dispute.ownerId?.lastName}
                  </p>
                  <p className="text-sm text-green-700">
                    {dispute.ownerId?.email}
                  </p>
                </div>
              </div>

              <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4 mb-4">
                <p className="font-semibold text-orange-900 mb-2">
                  📝 Dispute Reason:
                </p>
                <p className="text-gray-700">{dispute.disputeReason}</p>
              </div>

              {/* Evidence Images - PARTIE CORRIGÉE */}
              {dispute.disputeImages && dispute.disputeImages.length > 0 && (
                <div className="mb-4 bg-gray-50 rounded-xl p-4">
                  <p className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <span>📷</span>
                    <span>
                      Evidence Photos ({dispute.disputeImages.length})
                    </span>
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {dispute.disputeImages.map((img, idx) => (
                      <div
                        key={idx}
                        className="relative group cursor-pointer"
                        onClick={() => {
                          console.log(
                            "🖼️ Image clicked, opening lightbox:",
                            img
                          );
                          setLightboxImage(img);
                          setSelectedDispute(dispute); // Important pour la navigation
                        }}
                      >
                        <img
                          src={img}
                          alt={`Evidence ${idx + 1}`}
                          className="w-full h-32 object-cover rounded-lg border-2 border-gray-300 group-hover:border-orange-500 transition-all duration-300 group-hover:scale-105 cursor-zoom-in"
                          onError={(e) => {
                            e.target.src =
                              "https://via.placeholder.com/200x150?text=Image+Not+Found";
                            e.target.className =
                              "w-full h-32 object-cover rounded-lg border-2 border-red-300 cursor-not-allowed";
                          }}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 rounded-lg flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 text-white font-bold text-xs bg-black/70 px-2 py-1 rounded transform group-hover:scale-110 transition-all">
                            🔍 Click to enlarge
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2 italic">
                    💡 Click any image to view full size • Press ESC to close
                  </p>
                </div>
              )}

              {dispute.ownerConfirmationNote && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-2">
                  <p className="text-xs font-semibold text-green-900 mb-1">
                    🏠 Owner's Completion Note:
                  </p>
                  <p className="text-sm text-gray-700">
                    {dispute.ownerConfirmationNote}
                  </p>
                </div>
              )}

              {dispute.renterConfirmationNote && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
                  <p className="text-xs font-semibold text-blue-900 mb-1">
                    👤 Renter's Confirmation Note:
                  </p>
                  <p className="text-sm text-gray-700">
                    {dispute.renterConfirmationNote}
                  </p>
                </div>
              )}

              <button
                onClick={() => openResolveModal(dispute)}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl font-semibold hover:shadow-lg transition"
              >
                🔧 Resolve Dispute
              </button>
            </div>
          ))}

          <button
            onClick={() => (window.location.href = "/admin/dashboard")}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition"
          >
            <span>←</span>
            <span>Back to Admin Dashboard</span>
          </button>
        </div>
      )}

      {/* Resolution Modal */}
      {showResolveModal && selectedDispute && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              🔧 Resolve Dispute
            </h2>

            <div className="bg-gray-50 rounded-xl p-4 mb-6">
              <p className="text-sm text-gray-600 mb-2">
                <strong>Machine:</strong> {selectedDispute.machineId?.name}
              </p>
              <p className="text-sm text-gray-600 mb-2">
                <strong>Total Amount:</strong> $
                {selectedDispute.pricing?.totalPrice?.toFixed(2)}
              </p>
              <p className="text-sm text-gray-600">
                <strong>Disputed by:</strong>{" "}
                <span className="capitalize">{selectedDispute.disputedBy}</span>
              </p>
            </div>

            {/* Resolution Type Selection */}
            <div className="mb-6">
              <label className="block font-semibold mb-3 text-gray-900">
                Resolution Type <span className="text-red-500">*</span>
              </label>
              <div className="space-y-3">
                <label className="flex items-center p-4 border-2 rounded-xl cursor-pointer hover:bg-green-50 transition">
                  <input
                    type="radio"
                    name="resolutionType"
                    value="owner"
                    checked={resolutionType === "owner"}
                    onChange={(e) => handleResolutionTypeChange(e.target.value)}
                    className="w-5 h-5 text-green-600"
                  />
                  <div className="ml-3 flex-1">
                    <p className="font-semibold text-gray-900">
                      ✅ Release to Owner
                    </p>
                    <p className="text-sm text-gray-600">
                      Owner completed the work satisfactorily. Release full
                      payment.
                    </p>
                  </div>
                </label>

                <label className="flex items-center p-4 border-2 rounded-xl cursor-pointer hover:bg-blue-50 transition">
                  <input
                    type="radio"
                    name="resolutionType"
                    value="renter"
                    checked={resolutionType === "renter"}
                    onChange={(e) => handleResolutionTypeChange(e.target.value)}
                    className="w-5 h-5 text-blue-600"
                  />
                  <div className="ml-3 flex-1">
                    <p className="font-semibold text-gray-900">
                      💰 Refund to Renter
                    </p>
                    <p className="text-sm text-gray-600">
                      Service not completed. Refund full payment to renter.
                    </p>
                  </div>
                </label>

                <label className="flex items-center p-4 border-2 rounded-xl cursor-pointer hover:bg-purple-50 transition">
                  <input
                    type="radio"
                    name="resolutionType"
                    value="split"
                    checked={resolutionType === "split"}
                    onChange={(e) => handleResolutionTypeChange(e.target.value)}
                    className="w-5 h-5 text-purple-600"
                  />
                  <div className="ml-3 flex-1">
                    <p className="font-semibold text-gray-900">
                      ⚖️ Split Payment
                    </p>
                    <p className="text-sm text-gray-600">
                      Partial completion. Distribute amount between both
                      parties.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Amount Distribution */}
            {resolutionType && (
              <div className="mb-6 bg-purple-50 rounded-xl p-4">
                <p className="font-semibold text-gray-900 mb-4">
                  💵 Amount Distribution
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Owner Receives:
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-3 text-gray-500">
                        $
                      </span>
                      <input
                        type="number"
                        value={ownerAmount}
                        onChange={(e) => setOwnerAmount(e.target.value)}
                        step="0.01"
                        min="0"
                        max={selectedDispute.pricing?.totalPrice}
                        className="w-full pl-8 pr-3 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none"
                        disabled={resolutionType !== "split"}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Renter Refund:
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-3 text-gray-500">
                        $
                      </span>
                      <input
                        type="number"
                        value={renterAmount}
                        onChange={(e) => setRenterAmount(e.target.value)}
                        step="0.01"
                        min="0"
                        max={selectedDispute.pricing?.totalPrice}
                        className="w-full pl-8 pr-3 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                        disabled={resolutionType !== "split"}
                      />
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-2 text-center">
                  Total: $
                  {(parseFloat(ownerAmount) + parseFloat(renterAmount)).toFixed(
                    2
                  )}{" "}
                  / ${selectedDispute.pricing?.totalPrice?.toFixed(2)}
                </p>
              </div>
            )}

            {/* Admin Notes */}
            <div className="mb-6">
              <label className="block font-semibold mb-2 text-gray-900">
                Admin Decision Notes <span className="text-red-500">*</span>
              </label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Explain the reasoning for this decision. This will be shared with both parties. (minimum 20 characters)"
                rows={5}
                maxLength={1000}
                className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none resize-none"
              />
              <small className="text-gray-500 text-xs">
                {adminNotes.length}/1000 characters
              </small>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowResolveModal(false);
                  setSelectedDispute(null);
                }}
                disabled={resolving}
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-semibold text-gray-700 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleResolveDispute}
                disabled={
                  resolving || !resolutionType || adminNotes.trim().length < 20
                }
                className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-xl transition"
              >
                {resolving ? "Resolving..." : "✅ Resolve Dispute"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal - VERSION CORRIGÉE */}
      {lightboxImage && (
        <div
          className="fixed inset-0 bg-black/95 z-[1000] flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLightboxImage(null);
            }}
            className="absolute top-6 right-6 w-12 h-12 rounded-full bg-red-500 text-white flex items-center justify-center text-2xl font-bold hover:bg-red-600 hover:scale-110 transition-all duration-200 z-10 shadow-lg"
          >
            ×
          </button>

          {/* Container pour l'image */}
          <div className="relative max-w-[95vw] max-h-[95vh] flex items-center justify-center">
            <img
              src={lightboxImage}
              alt="Evidence photo"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src =
                  "https://via.placeholder.com/800x600?text=Image+Failed+to+Load";
                e.target.className =
                  "max-w-full max-h-full object-contain rounded-lg shadow-2xl bg-white p-8";
              }}
            />
          </div>

          {/* Indicateur de fermeture */}
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-6 py-3 rounded-full text-sm">
            ✕ Click outside to close • Press ESC
          </div>

          {/* Boutons de navigation si plusieurs images */}
          {selectedDispute?.disputeImages &&
            selectedDispute.disputeImages.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const currentIndex =
                      selectedDispute.disputeImages.indexOf(lightboxImage);
                    const prevIndex =
                      (currentIndex -
                        1 +
                        selectedDispute.disputeImages.length) %
                      selectedDispute.disputeImages.length;
                    setLightboxImage(selectedDispute.disputeImages[prevIndex]);
                  }}
                  className="absolute left-6 top-1/2 transform -translate-y-1/2 w-12 h-12 rounded-full bg-white/20 text-white flex items-center justify-center text-2xl font-bold hover:bg-white/30 transition-all duration-200 z-10"
                >
                  ‹
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const currentIndex =
                      selectedDispute.disputeImages.indexOf(lightboxImage);
                    const nextIndex =
                      (currentIndex + 1) % selectedDispute.disputeImages.length;
                    setLightboxImage(selectedDispute.disputeImages[nextIndex]);
                  }}
                  className="absolute right-6 top-1/2 transform -translate-y-1/2 w-12 h-12 rounded-full bg-white/20 text-white flex items-center justify-center text-2xl font-bold hover:bg-white/30 transition-all duration-200 z-10"
                >
                  ›
                </button>

                {/* Indicateur de position */}
                <div className="absolute top-6 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full text-sm">
                  {selectedDispute.disputeImages.indexOf(lightboxImage) + 1} /{" "}
                  {selectedDispute.disputeImages.length}
                </div>
              </>
            )}
        </div>
      )}
    </div>
  );
};

export default AdminDisputeResolution;
