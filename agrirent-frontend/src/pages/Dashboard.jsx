import { useState, useEffect } from "react";
import {
  Tractor,
  Calendar,
  User,
  Home,
  Search,
  Plus,
  Star,
} from "lucide-react";
import {
  machineAPI,
  rentalAPI,
  uploadAPI,
  paymentAPI,
  userAPI,
} from "../services/api";
import BookingModal from "../components/BookingModal";
import PaymentModal from "../components/PaymentModal";
import RentalActionsComponent from "../components/RentalActionsComponent";

// ============== REUSABLE BACK BUTTON ==============
const BackButton = ({ onClick, label = "Back" }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-2 text-blue-600 font-semibold hover:text-blue-700 transition mb-4"
  >
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 19l-7-7 7-7"
      />
    </svg>
    {label}
  </button>
);
export default function Dashboard({ user: currentUser, onLogout }) {
  const [currentView, setCurrentView] = useState("home");
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [showAddMachineForm, setShowAddMachineForm] = useState(false);
  const [showEditMachineForm, setShowEditMachineForm] = useState(false);
  const [editingMachine, setEditingMachine] = useState(null);
  const [machines, setMachines] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [loadingMachines, setLoadingMachines] = useState(false);
  const [loadingRentals, setLoadingRentals] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingMachine, setBookingMachine] = useState(null);

  // ✅ FIXED: Define localUser properly at the component level
  const [localUser, setLocalUser] = useState(() => {
    if (currentUser) return currentUser;
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });

  // Payment and completion states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentRental, setPaymentRental] = useState(null);
  const [showConfirmCompletionModal, setShowConfirmCompletionModal] =
    useState(false);
  const [confirmingRental, setConfirmingRental] = useState(null);
  const [completionNote, setCompletionNote] = useState("");
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputingRental, setDisputingRental] = useState(null);
  const [disputeReason, setDisputeReason] = useState("");

  // Review states
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewingRental, setReviewingRental] = useState(null);
  const [reviewData, setReviewData] = useState({ rating: 5, comment: "" });

  // ✅ FIXED: Function to check verification status
  const checkVerificationStatus = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        console.log("⚠️ No token found");
        return false;
      }

      const response = await userAPI.getVerificationStatus();

      if (response.data.success) {
        console.log("📊 Verification check result:", response.data.data);

        // Update local user state
        const updatedUser = {
          ...localUser,
          isEmailVerified: response.data.data.isEmailVerified,
        };
        setLocalUser(updatedUser);

        // Also update localStorage
        const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
        const newStoredUser = {
          ...storedUser,
          isEmailVerified: response.data.data.isEmailVerified,
        };
        localStorage.setItem("user", JSON.stringify(newStoredUser));

        return response.data.data.isEmailVerified;
      }

      return false;
    } catch (error) {
      console.error("❌ Error checking verification status:", error);
      // If we get a 401, the token is invalid - redirect to login
      if (error.response?.status === 401) {
        console.log("⚠️ Invalid token, redirecting to login");
        localStorage.clear();
        window.location.href = "/auth";
      }
      return false;
    }
  };

  // ✅ FIXED: Main useEffect with proper authentication check
  useEffect(() => {
    // Check authentication first
    const token = localStorage.getItem("token");
    const user = localStorage.getItem("user");

    if (!token || !user) {
      console.log("❌ No valid authentication found, redirecting to login");
      window.location.href = "/auth";
      return;
    }

    // ✅ CRITICAL: Only check import.meta.env (NOT process.env)
    const bypassMode =
      import.meta.env.VITE_BYPASS_PHONE_VERIFICATION === "true";

    console.log("🔧 Bypass mode?", bypassMode);

    // Initialize data ONCE
    const initializeData = async () => {
      try {
        await fetchMachines();
        await fetchRentals();

        // ✅ ONLY start polling if bypass mode is OFF AND user is not verified
        if (!bypassMode && !localUser?.isPhoneVerified) {
          console.log("🔄 Starting verification polling...");
          const pollInterval = setInterval(async () => {
            try {
              const isVerified = await checkVerificationStatus();
              if (isVerified) {
                console.log("✅ Verified! Stopping poll.");
                clearInterval(pollInterval);
              }
            } catch (error) {
              console.error("❌ Poll error:", error);
              clearInterval(pollInterval);
            }
          }, 10000);

          // Cleanup on unmount
          return () => clearInterval(pollInterval);
        }
      } catch (error) {
        console.error("Error initializing dashboard data:", error);
      }
    };

    initializeData();
  }, []); // ✅ Empty dependency array - run ONCE on mount

  const fetchMachines = async () => {
    setLoadingMachines(true);
    try {
      const response = await machineAPI.getAll();
      if (response.data.success) {
        setMachines(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching machines:", error);
    } finally {
      setLoadingMachines(false);
    }
  };

  const fetchRentals = async () => {
    setLoadingRentals(true);
    try {
      const response = await rentalAPI.getAll();
      if (response.data.success) {
        setRentals(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching rentals:", error);
    } finally {
      setLoadingRentals(false);
    }
  };

  const handleBookMachine = async (bookingData) => {
    try {
      const response = await rentalAPI.create({
        machineId: bookingMachine._id,
        ...bookingData,
      });
      if (response.data.success) {
        alert(
          "✅ Booking request sent successfully! The owner will review your request."
        );
        await fetchRentals();
        await fetchMachines(); // ✅ Refresh machines to update availability
        setShowBookingModal(false);
        setBookingMachine(null);
        setCurrentView("machines"); // ✅ Return to machines view
      }
    } catch (error) {
      throw error;
    }
  };

  const handlePaymentSuccess = async (paymentData) => {
    console.log("💰 Payment success callback:", paymentData);

    // Refresh rentals to get updated status
    await fetchRentals();
    await fetchMachines(); // Also refresh machines

    setShowPaymentModal(false);
    setPaymentRental(null);

    alert(
      `✅ Payment successful! Your funds are secured in escrow.\n\n` +
        `Transaction ID: ${paymentData.transactionId}\n\n` +
        `The rental is now ACTIVE. The owner can proceed with the service.\n\n` +
        `Once completed, you'll confirm to release the payment.`
    );

    // Navigate to rentals view to see the updated status
    setCurrentView("rentals");
  };

  const handleConfirmCompletion = async () => {
    if (!completionNote.trim() || completionNote.length < 10) {
      alert("Please provide details about the service (minimum 10 characters)");
      return;
    }

    try {
      const response = await paymentAPI.confirmCompletion(
        confirmingRental._id,
        {
          confirmationNote: completionNote,
        }
      );

      if (response.data.success) {
        alert(
          "✅ Thank you! You've confirmed the rental is complete.\n\nAgriRent will verify and release the payment to the owner within 24-48 hours."
        );
        setShowConfirmCompletionModal(false);
        setConfirmingRental(null);
        setCompletionNote("");
        await fetchRentals();
      }
    } catch (error) {
      alert(error.response?.data?.message || "Failed to confirm completion");
    }
  };

  const handleOpenDispute = async () => {
    if (!disputeReason.trim() || disputeReason.length < 20) {
      alert(
        "Please provide a detailed reason for the dispute (minimum 20 characters)"
      );
      return;
    }

    try {
      const response = await paymentAPI.openDispute(disputingRental._id, {
        reason: disputeReason,
      });

      if (response.data.success) {
        alert(
          "⚠️ Dispute opened successfully.\n\nOur team will review your case within 24 hours and contact both parties. Your payment is secure."
        );
        setShowDisputeModal(false);
        setDisputingRental(null);
        setDisputeReason("");
        await fetchRentals();
      }
    } catch (error) {
      alert(error.response?.data?.message || "Failed to open dispute");
    }
  };

  const isOwner =
    localUser?.role === "owner" ||
    localUser?.role === "both" ||
    currentUser?.role === "owner" ||
    currentUser?.role === "both";

  // ============== VERIFICATION BANNER ==============
  const VerificationBanner = () => {
    const [dismissed, setDismissed] = useState(false);
    const [resending, setResending] = useState(false);
    const [checking, setChecking] = useState(false);

    // Don't show if user is verified OR banner was dismissed OR user is not owner
    if (!localUser || localUser.isEmailVerified || dismissed) return null;
    if (localUser.role !== "owner" && localUser.role !== "both") return null;

    const handleResendEmail = async () => {
      setResending(true);
      try {
        const response = await fetch(
          "http://localhost:3001/api/auth/resend-verification",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: localUser.email }),
          }
        );

        const data = await response.json();

        console.log("📧 Resend response:", data);

        if (data.success) {
          if (data.alreadyVerified) {
            // ✅ Email is verified, update state
            const updatedUser = { ...localUser, isEmailVerified: true };
            setLocalUser(updatedUser);
            localStorage.setItem("user", JSON.stringify(updatedUser));
            alert(
              "✅ Your email is already verified! You can now list machines."
            );
          } else {
            alert("✅ Verification email sent! Please check your inbox.");
          }
        } else {
          alert("❌ " + data.message);
        }
      } catch (err) {
        console.error("❌ Resend error:", err);
        alert("❌ Failed to resend email. Please try again.");
      } finally {
        setResending(false);
      }
    };

    const handleRedirectToVerification = () => {
      // Redirect to the new verification page
      window.location.href = "/verify-email";
    };

    return (
      <div className="bg-amber-100 border-l-4 border-amber-500 text-amber-800 p-4 m-4 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="font-semibold">📧 Email Verification Required</p>
            <p className="text-sm mt-1">
              You must verify your email before you can list equipment for rent.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleResendEmail}
                disabled={resending}
                className="text-sm bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition disabled:opacity-50"
              >
                {resending ? "Sending..." : "Resend Email"}
              </button>
              <button
                onClick={handleRedirectToVerification}
                className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
              >
                Verify Email
              </button>
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-amber-600 hover:text-amber-800 ml-4"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  // ============== HOME SCREEN ==============
  const HomeScreen = () => {
    const activeMachines = machines.filter((m) => m.isActive).length;
    const activeRentals = rentals.filter((r) => r.status === "active").length;
    const totalMachines = machines.length;
    const myMachines = machines.filter(
      (m) => m.ownerId?._id === currentUser?.id || m.ownerId === currentUser?.id
    ).length;

    return (
      <div className="p-6">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 bg-clip-text text-transparent mb-2">
          Welcome, {localUser?.firstName || currentUser?.firstName}!
        </h2>
        <p className="text-gray-600 mb-8">
          Find and rent agricultural equipment
        </p>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl p-5 text-white shadow-lg">
            <Tractor size={32} className="mb-3 opacity-80" />
            <p className="text-3xl font-bold">{activeMachines}</p>
            <p className="text-sm text-blue-100">Available Machines</p>
          </div>

          <div className="bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl p-5 text-white shadow-lg">
            <Calendar size={32} className="mb-3 opacity-80" />
            <p className="text-3xl font-bold">{rentals.length}</p>
            <p className="text-sm text-emerald-100">Your Rentals</p>
          </div>

          {isOwner && (
            <>
              <div className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl p-5 text-white shadow-lg">
                <Tractor size={32} className="mb-3 opacity-80" />
                <p className="text-3xl font-bold">{myMachines}</p>
                <p className="text-sm text-purple-100">Your Machines</p>
              </div>

              <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-5 text-white shadow-lg">
                <Calendar size={32} className="mb-3 opacity-80" />
                <p className="text-3xl font-bold">
                  {
                    rentals.filter(
                      (r) =>
                        (r.ownerId?._id === currentUser?.id ||
                          r.ownerId === currentUser?.id) &&
                        r.status === "pending"
                    ).length
                  }
                </p>
                <p className="text-sm text-amber-100">Pending Requests</p>
              </div>
            </>
          )}
        </div>

        {/* Quick Actions */}
        {/* Quick Actions */}
        <div className="mb-8">
          <h3 className="text-xl font-bold mb-4 text-gray-800">
            Quick Actions
          </h3>
          <div className="space-y-3">
            <button
              onClick={() => setCurrentView("machines")}
              className="w-full bg-white rounded-2xl p-5 shadow-lg hover:shadow-xl transition flex items-center gap-4 group"
            >
              <div className="bg-gradient-to-br from-blue-500 to-cyan-500 p-3 rounded-xl group-hover:scale-110 transition">
                <Search size={24} className="text-white" />
              </div>
              <div className="flex-1 text-left">
                <h4 className="font-bold text-gray-800">Browse Machines</h4>
                <p className="text-sm text-gray-500">
                  Find equipment for your needs
                </p>
              </div>
              <span className="text-gray-400">→</span>
            </button>

            {isOwner && (
              <>
                <button
                  onClick={() => setShowAddMachineForm(true)}
                  className="w-full bg-white rounded-2xl p-5 shadow-lg hover:shadow-xl transition flex items-center gap-4 group"
                >
                  <div className="bg-gradient-to-br from-emerald-500 to-teal-500 p-3 rounded-xl group-hover:scale-110 transition">
                    <Plus size={24} className="text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <h4 className="font-bold text-gray-800">
                      List Your Machine
                    </h4>
                    <p className="text-sm text-gray-500">
                      Add equipment to rent out
                    </p>
                  </div>
                  <span className="text-gray-400">→</span>
                </button>

                <button
                  onClick={() => setCurrentView("myMachines")}
                  className="w-full bg-white rounded-2xl p-5 shadow-lg hover:shadow-xl transition flex items-center gap-4 group"
                >
                  <div className="bg-gradient-to-br from-purple-500 to-pink-500 p-3 rounded-xl group-hover:scale-110 transition">
                    <Tractor size={24} className="text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <h4 className="font-bold text-gray-800">My Machines</h4>
                    <p className="text-sm text-gray-500">
                      Manage your equipment
                    </p>
                  </div>
                  <span className="text-gray-400">→</span>
                </button>

                <button
                  onClick={() => setCurrentView("requests")}
                  className="w-full bg-white rounded-2xl p-5 shadow-lg hover:shadow-xl transition flex items-center gap-4 group"
                >
                  <div className="bg-gradient-to-br from-amber-500 to-orange-500 p-3 rounded-xl group-hover:scale-110 transition">
                    <Calendar size={24} className="text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <h4 className="font-bold text-gray-800">Rental Requests</h4>
                    <p className="text-sm text-gray-500">
                      Approve or decline rentals
                    </p>
                  </div>
                  {rentals.filter(
                    (r) =>
                      (r.ownerId?._id === currentUser?.id ||
                        r.ownerId === currentUser?.id) &&
                      r.status === "pending"
                  ).length > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                      {
                        rentals.filter(
                          (r) =>
                            (r.ownerId?._id === currentUser?.id ||
                              r.ownerId === currentUser?.id) &&
                            r.status === "pending"
                        ).length
                      }
                    </span>
                  )}
                  <span className="text-gray-400">→</span>
                </button>
              </>
            )}

            <button
              onClick={() => setCurrentView("rentals")}
              className="w-full bg-white rounded-2xl p-5 shadow-lg hover:shadow-xl transition flex items-center gap-4 group"
            >
              <div className="bg-gradient-to-br from-indigo-500 to-purple-500 p-3 rounded-xl group-hover:scale-110 transition">
                <Calendar size={24} className="text-white" />
              </div>
              <div className="flex-1 text-left">
                <h4 className="font-bold text-gray-800">My Rentals</h4>
                <p className="text-sm text-gray-500">
                  View your active rentals
                </p>
              </div>
              <span className="text-gray-400">→</span>
            </button>

            {/* 🛡️ ADMIN BUTTON - Only for admin users */}
            {(localUser?.role === "admin" || currentUser?.role === "admin") && (
              <button
                onClick={() => (window.location.href = "/admin/escrow")}
                className="w-full bg-gradient-to-r from-rose-500 to-red-600 rounded-2xl p-5 shadow-lg hover:shadow-xl transition flex items-center gap-4 group"
              >
                <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl group-hover:scale-110 transition">
                  <svg
                    className="w-6 h-6 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <h4 className="font-bold text-white">Admin Dashboard</h4>
                  <p className="text-sm text-rose-100">
                    Manage escrow payments
                  </p>
                </div>
                {rentals.filter(
                  (r) =>
                    r.renterConfirmedCompletion &&
                    r.payment?.status === "held_in_escrow"
                ).length > 0 && (
                  <span className="bg-white text-rose-600 text-xs font-bold px-2 py-1 rounded-full">
                    {
                      rentals.filter(
                        (r) =>
                          r.renterConfirmedCompletion &&
                          r.payment?.status === "held_in_escrow"
                      ).length
                    }
                  </span>
                )}
                <span className="text-white/80">→</span>
              </button>
            )}
          </div>
        </div>

        {/* Featured Machines */}
        {machines.length > 0 && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-800">
                Featured Machines
              </h3>
              <button
                onClick={() => setCurrentView("machines")}
                className="text-blue-600 font-semibold text-sm hover:text-blue-700"
              >
                View All →
              </button>
            </div>
            <div className="space-y-4">
              {machines.slice(0, 3).map((machine) => (
                <div
                  key={machine._id}
                  onClick={() => {
                    setSelectedMachine(machine);
                    setCurrentView("machineDetail");
                  }}
                  className="bg-white rounded-2xl shadow-lg overflow-hidden cursor-pointer hover:shadow-xl transition"
                >
                  <div className="flex gap-4">
                    <img
                      src={
                        machine.images?.[0] ||
                        "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400"
                      }
                      alt={machine.name}
                      className="w-24 h-24 object-cover"
                    />
                    <div className="flex-1 py-3 pr-3">
                      <h4 className="font-bold text-gray-800">
                        {machine.name}
                      </h4>
                      <p className="text-sm text-gray-500 capitalize">
                        {machine.category}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <Star
                          size={14}
                          className="text-amber-400 fill-amber-400"
                        />
                        <span className="text-sm font-semibold">
                          {(machine.rating?.average || 0).toFixed(1)}
                        </span>
                      </div>
                      <p className="text-blue-600 font-bold mt-1">
                        {machine.pricingType === "daily" &&
                          `$${machine.pricePerDay}/day`}
                        {machine.pricingType === "per_hectare" &&
                          `$${machine.pricePerHectare}/Ha`}
                        {machine.pricingType === "both" &&
                          `$${machine.pricePerDay}/day`}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============== MACHINES SCREEN ==============
  const MachinesScreen = () => {
    const [locationFilter, setLocationFilter] = useState("");

    const filteredMachines = machines.filter((m) => {
      if (selectedFilter !== "All" && m.category !== selectedFilter)
        return false;

      if (locationFilter) {
        const location =
          `${m.address?.city} ${m.address?.commune} ${m.address?.quartier} ${m.address?.province}`.toLowerCase();
        if (!location.includes(locationFilter.toLowerCase())) return false;
      }

      return true;
    });

    if (loadingMachines) {
      return (
        <div className="p-4 flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading machines...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="p-4">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            Available Machines
          </h1>
          {isOwner && (
            <button
              onClick={() => setShowAddMachineForm(true)}
              className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white p-3 rounded-xl shadow-lg hover:shadow-xl transition"
            >
              <Plus size={20} />
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl p-3 mb-4 shadow-md flex gap-2 overflow-x-auto">
          {["All", "tractor", "harvester", "planter"].map((filter) => (
            <button
              key={filter}
              onClick={() => setSelectedFilter(filter)}
              className={`px-5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition capitalize ${
                selectedFilter === filter
                  ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {filter === "All" ? "All" : `${filter}s`}
            </button>
          ))}
        </div>
        <div className="mb-4">
          <div className="relative">
            <input
              type="text"
              placeholder="🔍 Search by city, commune, or quartier..."
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="w-full px-4 py-3 pl-12 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl">
              📍
            </span>
            {locationFilter && (
              <button
                onClick={() => setLocationFilter("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        {/* Location Search */}
        {/* <div className="mb-4">
          <div className="relative">
            <input
              type="text"
              placeholder="🔍 Search by city, commune, or quartier..."
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="w-full px-4 py-3 pl-12 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl">
              📍
            </span>
          </div>
        </div> */}

        {filteredMachines.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-lg">
            <Tractor size={48} className="mx-auto text-gray-400 mb-3" />
            <p className="text-gray-600">No machines found</p>
            {isOwner && (
              <button
                onClick={() => setShowAddMachineForm(true)}
                className="mt-4 px-6 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl font-semibold"
              >
                Add Your First Machine
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredMachines.map((machine) => (
              <div
                key={machine._id}
                onClick={() => {
                  setSelectedMachine(machine);
                  setCurrentView("machineDetail");
                }}
                className="bg-white rounded-2xl shadow-lg overflow-hidden cursor-pointer hover:shadow-2xl transition hover:scale-[1.02]"
              >
                <div className="relative">
                  <img
                    src={
                      machine.images?.[0] ||
                      "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400"
                    }
                    alt={machine.name}
                    className="w-full h-48 object-cover"
                  />
                  <span
                    className={`absolute top-3 right-3 px-4 py-2 rounded-xl text-xs font-bold shadow-lg ${
                      machine.availability === "available"
                        ? "bg-emerald-500 text-white"
                        : machine.availability === "pending"
                        ? "bg-amber-500 text-white"
                        : machine.availability === "rented"
                        ? "bg-blue-500 text-white"
                        : "bg-rose-500 text-white"
                    }`}
                  >
                    {machine.availability === "available" && "✅ Available"}
                    {machine.availability === "pending" && "⏳ Pending"}
                    {machine.availability === "rented" && "🔒 Rented"}
                    {machine.availability === "unavailable" && "❌ Unavailable"}
                  </span>
                </div>
                <div className="p-4">
                  <h3 className="text-lg font-bold text-gray-800">
                    {machine.name}
                  </h3>

                  {/* LOCATION - PROMINENT AND BOLD */}
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3 my-3">
                    <div className="flex items-start gap-2">
                      <span className="text-blue-600 text-xl mt-0.5">📍</span>
                      <div className="flex-1">
                        <p className="text-lg font-bold text-blue-900 leading-tight">
                          {machine.address?.city || "Location N/A"}
                          {machine.address?.commune &&
                            `, ${machine.address.commune}`}
                        </p>
                        {machine.address?.quartier && (
                          <p className="text-sm font-semibold text-blue-700 mt-0.5">
                            Quartier: {machine.address.quartier}
                          </p>
                        )}
                        <p className="text-xs text-blue-600 font-medium mt-1">
                          {machine.address?.province || "Province N/A"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-gray-500 mt-1 capitalize">
                    {machine.category} • {machine.brand}
                  </p>
                  <div className="flex items-center gap-1 mt-2">
                    <Star size={16} className="text-amber-400 fill-amber-400" />
                    <span className="text-sm font-semibold">
                      {(machine.rating?.average || 0).toFixed(1)}
                    </span>
                    {machine.rating?.count > 0 && (
                      <span className="text-xs text-gray-500">
                        ({machine.rating.count} review
                        {machine.rating.count !== 1 ? "s" : ""})
                      </span>
                    )}
                  </div>
                  <div className="mt-4">
                    {machine.pricingType === "daily" && (
                      <div className="flex justify-between items-center">
                        <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                          ${machine.pricePerDay}/day
                        </span>
                        <span className="text-sm text-gray-600 font-medium">
                          {machine.specifications?.horsepower || 0} HP
                        </span>
                      </div>
                    )}
                    {machine.pricingType === "per_hectare" && (
                      <div className="flex justify-between items-center">
                        <span className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                          ${machine.pricePerHectare}/Ha
                        </span>
                        <span className="text-sm text-gray-600 font-medium">
                          Min {machine.minimumHectares} Ha
                        </span>
                      </div>
                    )}
                    {machine.pricingType === "both" && (
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                            ${machine.pricePerDay}/day
                          </span>
                          <span className="text-sm text-gray-600 font-medium">
                            {machine.specifications?.horsepower || 0} HP
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 italic">
                          or ${machine.pricePerHectare}/hectare (min{" "}
                          {machine.minimumHectares} Ha)
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ============== MACHINE DETAIL SCREEN ==============
  const MachineDetailScreen = () => {
    const [machineReviews, setMachineReviews] = useState([]);
    const [loadingReviews, setLoadingReviews] = useState(true);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    useEffect(() => {
      const fetchReviews = async () => {
        if (!selectedMachine?._id) return;
        try {
          const response = await rentalAPI.getReviewsByMachine(
            selectedMachine._id
          );
          if (response.data.success) {
            setMachineReviews(response.data.data || []);
          }
        } catch (err) {
          console.error("Failed to load reviews:", err);
          setMachineReviews([]);
        } finally {
          setLoadingReviews(false);
        }
      };
      fetchReviews();
    }, [selectedMachine?._id]);

    if (!selectedMachine) return null;

    const images =
      selectedMachine.images && selectedMachine.images.length > 0
        ? selectedMachine.images
        : [
            "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400",
          ];

    const nextImage = () => {
      setCurrentImageIndex((prev) => (prev + 1) % images.length);
    };

    const prevImage = () => {
      setCurrentImageIndex(
        (prev) => (prev - 1 + images.length) % images.length
      );
    };

    const isOwnMachine =
      selectedMachine.ownerId?._id === currentUser?.id ||
      selectedMachine.ownerId === currentUser?.id;

    return (
      <div className="p-4">
        <button
          onClick={() => setCurrentView("machines")}
          className="mb-4 text-blue-600 font-semibold"
        >
          ← Back
        </button>

        <div className="relative mb-4">
          <img
            src={images[currentImageIndex]}
            alt={selectedMachine.name}
            className="w-full h-64 object-cover rounded-2xl"
          />
          {images.length > 1 && (
            <>
              <button
                onClick={prevImage}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 backdrop-blur-sm p-2 rounded-full shadow-lg hover:bg-white transition"
              >
                ←
              </button>
              <button
                onClick={nextImage}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 backdrop-blur-sm p-2 rounded-full shadow-lg hover:bg-white transition"
              >
                →
              </button>
            </>
          )}
        </div>

        {images.length > 1 && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            {images.map((img, idx) => (
              <img
                key={idx}
                src={img}
                alt={`${selectedMachine.name} ${idx + 1}`}
                onClick={() => setCurrentImageIndex(idx)}
                className={`w-20 h-20 object-cover rounded-lg cursor-pointer transition ${
                  idx === currentImageIndex
                    ? "ring-2 ring-blue-500"
                    : "opacity-60 hover:opacity-100"
                }`}
              />
            ))}
          </div>
        )}

        <div className="bg-white rounded-2xl p-5 shadow-lg">
          <h1 className="text-2xl font-bold">{selectedMachine.name}</h1>
          <p className="text-gray-600 capitalize">
            {selectedMachine.brand} • {selectedMachine.year}
          </p>

          {selectedMachine.description && (
            <p className="text-gray-600 mt-3">{selectedMachine.description}</p>
          )}

          <div className="mt-4">
            <div className="flex items-center gap-1 mb-4">
              <Star size={20} className="text-amber-400 fill-amber-400" />
              <span className="font-semibold">
                {selectedMachine.rating?.average || 0}
              </span>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-4 mb-4">
              {selectedMachine.pricingType === "daily" && (
                <div>
                  <p className="text-sm text-gray-600 mb-1">Daily Rate</p>
                  <div className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                    ${selectedMachine.pricePerDay}/day
                  </div>
                </div>
              )}
              {selectedMachine.pricingType === "per_hectare" && (
                <div>
                  <p className="text-sm text-gray-600 mb-1">Per Hectare Rate</p>
                  <div className="text-4xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                    ${selectedMachine.pricePerHectare}/Ha
                  </div>
                  <p className="text-sm text-gray-600 mt-2">
                    Minimum {selectedMachine.minimumHectares} hectares
                  </p>
                </div>
              )}
              {selectedMachine.pricingType === "both" && (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Daily Rate</p>
                    <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                      ${selectedMachine.pricePerDay}/day
                    </div>
                  </div>
                  <div className="border-t border-gray-200 pt-3">
                    <p className="text-sm text-gray-600 mb-1">
                      Per Hectare Rate
                    </p>
                    <div className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                      ${selectedMachine.pricePerHectare}/Ha
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Minimum {selectedMachine.minimumHectares} hectares
                    </p>
                  </div>
                </div>
              )}
            </div>

            <p className="text-gray-600 mt-2">
              {selectedMachine.specifications?.horsepower || 0} HP
            </p>
          </div>

          {!isOwnMachine && selectedMachine.availability === "available" && (
            <button
              onClick={() => {
                setBookingMachine(selectedMachine);
                setShowBookingModal(true);
              }}
              className="w-full mt-6 bg-gradient-to-r from-blue-600 to-cyan-600 text-white py-4 rounded-xl font-bold hover:shadow-xl transition"
            >
              Book Now
            </button>
          )}

          {isOwnMachine && (
            <div className="mt-6 bg-blue-50 text-blue-700 p-4 rounded-xl text-center">
              This is your machine
            </div>
          )}

          {selectedMachine.availability !== "available" && !isOwnMachine && (
            <div className="mt-6 bg-gray-100 text-gray-600 p-4 rounded-xl text-center">
              Currently unavailable
            </div>
          )}
        </div>
      </div>
    );
  };

  // ============== RENTALS SCREEN ==============
  const RentalsScreen = () => {
    if (loadingRentals) {
      return (
        <div className="p-4 flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading rentals...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="p-4">
        <BackButton onClick={() => setCurrentView("home")} />
        <h1 className="text-2xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
          My Rentals
        </h1>

        {rentals.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 shadow-lg text-center">
            <Calendar size={48} className="mx-auto text-gray-400 mb-3" />
            <p className="text-gray-600">No rentals yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {rentals.map((rental) => {
              const isOwner =
                rental.ownerId?._id === currentUser?.id ||
                rental.ownerId === currentUser?.id;
              const isRenter =
                rental.renterId?._id === currentUser?.id ||
                rental.renterId === currentUser?.id;

              return (
                <div
                  key={rental._id}
                  className="bg-white rounded-2xl p-5 shadow-lg"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold">
                        {rental.machineId?.name || "Machine"}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {isOwner
                          ? `Renter: ${rental.renterId?.firstName} ${rental.renterId?.lastName}`
                          : `Owner: ${rental.ownerId?.firstName} ${rental.ownerId?.lastName}`}
                      </p>
                    </div>
                    <span
                      className={`px-4 py-2 rounded-xl text-xs font-bold capitalize ${
                        rental.status === "pending"
                          ? "bg-amber-100 text-amber-800"
                          : rental.status === "approved"
                          ? "bg-blue-100 text-blue-800"
                          : rental.status === "active"
                          ? "bg-emerald-100 text-emerald-800"
                          : rental.status === "completed"
                          ? "bg-purple-100 text-purple-800"
                          : rental.status === "rejected"
                          ? "bg-rose-100 text-rose-800"
                          : rental.status === "disputed"
                          ? "bg-orange-100 text-orange-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {rental.status}
                    </span>
                  </div>

                  {/* Rental Details */}
                  {rental.rentalType === "daily" ? (
                    <>
                      <p className="text-sm text-gray-600">
                        Start: {new Date(rental.startDate).toLocaleDateString()}
                      </p>
                      <p className="text-sm text-gray-600">
                        End: {new Date(rental.endDate).toLocaleDateString()}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-gray-600">
                        Work Date:{" "}
                        {new Date(rental.workDate).toLocaleDateString()}
                      </p>
                      <p className="text-sm text-gray-600">
                        Hectares: {rental.pricing?.numberOfHectares} Ha
                      </p>
                      <p className="text-sm text-gray-600">
                        Location: {rental.fieldLocation}
                      </p>
                    </>
                  )}
                  <p className="text-lg font-bold mt-2 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                    ${rental.pricing?.totalPrice?.toFixed(2) || 0}
                  </p>

                  {/* PAYMENT STATUS INDICATOR */}
                  {rental.payment?.status && (
                    <div className="mt-3 p-3 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-blue-200">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-700">
                          Payment Status:
                        </span>
                        <span
                          className={`text-sm font-bold ${
                            rental.payment.status === "held_in_escrow"
                              ? "text-blue-600"
                              : rental.payment.status === "completed"
                              ? "text-emerald-600"
                              : "text-gray-600"
                          }`}
                        >
                          {rental.payment.status === "held_in_escrow"
                            ? "🔒 Secured in Escrow"
                            : rental.payment.status === "completed"
                            ? "✅ Released to Owner"
                            : rental.payment.status}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* ✅ NEW: WORKFLOW BUTTONS COMPONENT */}
                  <RentalActionsComponent
                    rental={rental}
                    currentUser={currentUser || localUser}
                    onUpdate={fetchRentals}
                  />

                  {/* KEEP YOUR EXISTING PAY BUTTON FOR APPROVED RENTALS */}
                  {rental.status === "approved" &&
                    isRenter &&
                    (!rental.payment?.status ||
                      rental.payment?.status === "pending") && (
                      <button
                        onClick={() => {
                          setPaymentRental(rental);
                          setShowPaymentModal(true);
                        }}
                        className="w-full mt-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-3 rounded-xl font-bold hover:shadow-xl transition"
                      >
                        💳 Pay Now - ${rental.pricing?.totalPrice?.toFixed(2)}
                      </button>
                    )}

                  {/* Review UI - Only after payment released */}
                  {rental.status === "completed" &&
                    rental.payment?.status === "completed" &&
                    isRenter && (
                      <>
                        {rental.isReviewed ? (
                          <div className="mt-4 bg-amber-50 border-l-4 border-amber-500 p-3 rounded">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-sm font-semibold text-amber-800">
                                  ⭐ You rated this: {rental.review?.rating}{" "}
                                  stars
                                </p>
                                {rental.review?.comment && (
                                  <p className="text-sm text-gray-700 mt-1 italic">
                                    "{rental.review.comment}"
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  setReviewingRental(rental);
                                  setReviewData({
                                    rating: rental.review?.rating || 5,
                                    comment: rental.review?.comment || "",
                                  });
                                  setShowReviewModal(true);
                                }}
                                className="text-xs text-blue-600 font-semibold hover:underline"
                              >
                                Edit
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setReviewingRental(rental);
                              setReviewData({ rating: 5, comment: "" });
                              setShowReviewModal(true);
                            }}
                            className="w-full mt-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white py-2 rounded-xl font-semibold hover:shadow-lg transition"
                          >
                            ⭐ Leave a Review
                          </button>
                        )}
                      </>
                    )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ============== MY MACHINES SCREEN ==============
  const MyMachinesScreen = () => {
    const [myMachines, setMyMachines] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
      fetchMyMachines();
    }, []);

    const fetchMyMachines = async () => {
      setLoading(true);
      try {
        const response = await machineAPI.getMyMachines();
        if (response.data.success) {
          setMyMachines(response.data.data);
        }
      } catch (error) {
        console.error("Error fetching my machines:", error);
      } finally {
        setLoading(false);
      }
    };

    const handleDeleteMachine = async (machineId) => {
      if (!window.confirm("Are you sure you want to delete this machine?"))
        return;
      try {
        await machineAPI.delete(machineId);
        alert("Machine deleted successfully");
        fetchMyMachines();
      } catch (error) {
        alert(error.response?.data?.message || "Failed to delete machine");
      }
    };

    if (loading) {
      return (
        <div className="p-4 flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading your machines...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="p-4">
        <BackButton onClick={() => setCurrentView("home")} />
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            My Machines
          </h1>
          <button
            onClick={() => setShowAddMachineForm(true)}
            className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-4 py-2 rounded-xl shadow-lg hover:shadow-xl transition"
          >
            <Plus size={20} className="inline mr-1" /> Add
          </button>
        </div>

        {myMachines.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 shadow-lg text-center">
            <Tractor size={48} className="mx-auto text-gray-400 mb-3" />
            <p className="text-gray-600 mb-4">
              You haven't listed any machines yet
            </p>
            <button
              onClick={() => setShowAddMachineForm(true)}
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl font-semibold"
            >
              Add Your First Machine
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {myMachines.map((machine) => (
              <div
                key={machine._id}
                className="bg-white rounded-2xl shadow-lg p-4"
              >
                <div className="flex gap-4">
                  <img
                    src={
                      machine.images?.[0] ||
                      "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400"
                    }
                    alt={machine.name}
                    className="w-24 h-24 rounded-xl object-cover"
                  />
                  <div className="flex-1">
                    <h3 className="font-bold text-lg">{machine.name}</h3>
                    <p className="text-sm text-gray-500 capitalize">
                      {machine.category} • {machine.brand}
                    </p>
                    {machine.pricingType === "daily" && (
                      <p className="text-blue-600 font-semibold mt-1">
                        ${machine.pricePerDay}/day
                      </p>
                    )}
                    {machine.pricingType === "per_hectare" && (
                      <p className="text-emerald-600 font-semibold mt-1">
                        ${machine.pricePerHectare}/Ha
                      </p>
                    )}
                    {machine.pricingType === "both" && (
                      <div className="text-sm mt-1">
                        <p className="text-blue-600 font-semibold">
                          ${machine.pricePerDay}/day
                        </p>
                        <p className="text-emerald-600 font-semibold">
                          ${machine.pricePerHectare}/Ha
                        </p>
                      </div>
                    )}
                    <span
                      className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold ${
                        machine.availability === "available"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {machine.availability}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => {
                      setEditingMachine(machine);
                      setShowEditMachineForm(true);
                    }}
                    className="flex-1 bg-blue-100 text-blue-700 py-2 rounded-xl font-semibold hover:bg-blue-200 transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteMachine(machine._id)}
                    className="flex-1 bg-rose-100 text-rose-700 py-2 rounded-xl font-semibold hover:bg-rose-200 transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ============== RENTAL REQUESTS SCREEN ==============
  const RentalRequestsScreen = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [selectedRental, setSelectedRental] = useState(null);
    const [rejectionReason, setRejectionReason] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
      fetchRequests();
    }, []);

    const fetchRequests = async () => {
      setLoading(true);
      try {
        const response = await rentalAPI.getAll();
        if (response.data.success) {
          const myRequests = response.data.data.filter(
            (rental) =>
              rental.ownerId?._id === currentUser?.id ||
              rental.ownerId === currentUser?.id
          );
          setRequests(myRequests);
        }
      } catch (error) {
        console.error("Error fetching requests:", error);
      } finally {
        setLoading(false);
      }
    };

    const handleApprove = async (rentalId) => {
      if (!window.confirm("Are you sure you want to approve this rental?"))
        return;
      try {
        await rentalAPI.updateStatus(rentalId, { status: "approved" });
        alert("✅ Rental approved successfully! Notification sent to renter.");
        fetchRequests();
      } catch (error) {
        alert(error.response?.data?.message || "Failed to approve rental");
      }
    };

    const openRejectModal = (rental) => {
      setSelectedRental(rental);
      setShowRejectModal(true);
      setRejectionReason("");
      setError("");
    };

    const closeRejectModal = () => {
      setShowRejectModal(false);
      setSelectedRental(null);
      setRejectionReason("");
      setError("");
    };

    const handleReject = async () => {
      if (!rejectionReason.trim()) {
        setError("Please provide a reason for rejection");
        return;
      }
      if (rejectionReason.trim().length < 10) {
        setError("Rejection reason must be at least 10 characters");
        return;
      }
      try {
        setLoading(true);
        setError("");
        await rentalAPI.updateStatus(selectedRental._id, {
          status: "rejected",
          rejectionReason: rejectionReason.trim(),
        });
        alert("✅ Rental rejected. Notification sent to renter.");
        closeRejectModal();
        fetchRequests();
      } catch (err) {
        setError(err.response?.data?.message || "Failed to reject rental");
      } finally {
        setLoading(false);
      }
    };

    if (loading && !showRejectModal) {
      return (
        <div className="p-4 flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading requests...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="p-4">
        <BackButton onClick={() => setCurrentView("home")} />
        <h1 className="text-2xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
          Rental Requests
        </h1>

        {requests.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 shadow-lg text-center">
            <Calendar size={48} className="mx-auto text-gray-400 mb-3" />
            <p className="text-gray-600">No rental requests yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((rental) => (
              <div
                key={rental._id}
                className="bg-white rounded-2xl p-5 shadow-lg"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold">{rental.machineId?.name}</h3>
                    <p className="text-sm text-gray-600">
                      Renter: {rental.renterId?.firstName}{" "}
                      {rental.renterId?.lastName}
                    </p>
                    <p className="text-sm text-gray-600">
                      Email: {rental.renterId?.email}
                    </p>
                  </div>
                  <span
                    className={`px-4 py-2 rounded-xl text-xs font-bold capitalize ${
                      rental.status === "pending"
                        ? "bg-amber-100 text-amber-800"
                        : rental.status === "approved"
                        ? "bg-emerald-100 text-emerald-800"
                        : rental.status === "rejected"
                        ? "bg-rose-100 text-rose-800"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {rental.status}
                  </span>
                </div>

                {rental.rentalType === "daily" ? (
                  <>
                    <p className="text-sm text-gray-600">
                      Start: {new Date(rental.startDate).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-gray-600">
                      End: {new Date(rental.endDate).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-gray-600">
                      Days: {rental.pricing?.numberOfDays}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-600">
                      Work Date:{" "}
                      {new Date(rental.workDate).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-gray-600">
                      Hectares: {rental.pricing?.numberOfHectares} Ha
                    </p>
                    <p className="text-sm text-gray-600">
                      Location: {rental.fieldLocation}
                    </p>
                  </>
                )}
                <p className="text-lg font-bold mt-2 text-blue-600">
                  Total: ${rental.pricing?.totalPrice?.toFixed(2)}
                </p>

                {/* Show rejection reason if rejected */}
                {rental.status === "rejected" && rental.rejectionReason && (
                  <div className="mt-4 bg-rose-50 border-l-4 border-rose-500 p-3 rounded">
                    <h4 className="font-semibold text-rose-800 text-sm mb-1">
                      📝 Reason for Decline:
                    </h4>
                    <p className="text-gray-700 text-sm">
                      {rental.rejectionReason}
                    </p>
                  </div>
                )}

                {/* Approve/Reject for pending */}
                {rental.status === "pending" && (
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => handleApprove(rental._id)}
                      className="flex-1 bg-emerald-500 text-white py-2 rounded-xl font-semibold hover:bg-emerald-600 transition"
                    >
                      ✅ Approve
                    </button>
                    <button
                      onClick={() => openRejectModal(rental)}
                      className="flex-1 bg-rose-500 text-white py-2 rounded-xl font-semibold hover:bg-rose-600 transition"
                    >
                      ❌ Reject
                    </button>
                  </div>
                )}

                {/* Complete for approved/active */}
                {["approved", "active"].includes(rental.status) && (
                  <button
                    onClick={async () => {
                      if (!window.confirm("Mark this rental as completed?"))
                        return;
                      try {
                        await rentalAPI.complete(rental._id);
                        alert("✅ Rental completed!");
                        fetchRequests();
                      } catch (err) {
                        alert(
                          err.response?.data?.message ||
                            "Failed to complete rental"
                        );
                      }
                    }}
                    className="mt-3 w-full py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl font-semibold text-sm"
                  >
                    ✅ Complete Rental
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Reject Modal */}
        {showRejectModal && selectedRental && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-rose-600 to-red-600 bg-clip-text text-transparent">
                Reject Rental Request
              </h2>
              <p className="text-gray-600 mb-4 text-sm">
                Please provide a reason for rejecting this rental request. The
                renter will receive your message via email and SMS.
              </p>
              <div className="mb-4">
                <label className="block font-semibold mb-2 text-sm">
                  Rejection Reason *
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g., Machine is scheduled for maintenance during your requested dates..."
                  rows={4}
                  className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-rose-500 focus:outline-none text-sm"
                  maxLength={500}
                />
                <small className="text-gray-500 text-xs">
                  {rejectionReason.length}/500 characters (minimum 10)
                </small>
              </div>
              {error && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm">
                  {error}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={closeRejectModal}
                  disabled={loading}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-semibold text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={loading || rejectionReason.trim().length < 10}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-rose-500 to-red-500 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Rejecting..." : "Reject Rental"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============== PROFILE SCREEN ==============
  const ProfileScreen = () => (
    <div className="p-4">
      <BackButton onClick={() => setCurrentView("home")} />
      <h1 className="text-2xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
        Profile
      </h1>
      <div className="bg-white rounded-2xl p-6 shadow-lg">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
            {currentUser?.firstName?.charAt(0)}
            {currentUser?.lastName?.charAt(0)}
          </div>
          <div>
            <h3 className="text-xl font-bold">
              {currentUser?.firstName} {currentUser?.lastName}
            </h3>
            <p className="text-gray-600">{currentUser?.email}</p>
            <p className="text-sm text-gray-500 capitalize mt-1">
              Role: {currentUser?.role}
            </p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full py-3 bg-rose-600 text-white rounded-xl font-semibold hover:bg-rose-700 transition"
        >
          Log Out
        </button>
      </div>
    </div>
  );

  // ============== ADD MACHINE FORM ==============
  // ============== ADD MACHINE FORM ==============
  const AddMachineForm = () => {
    const [formData, setFormData] = useState({
      name: "",
      category: "",
      brand: "",
      year: "",
      pricingType: "daily",
      pricePerDay: "",
      pricePerHectare: "",
      minimumHectares: "1",
      horsepower: "",
      description: "",
      province: "",
      city: "",
      commune: "",
      quartier: "",
    });
    const [imageFiles, setImageFiles] = useState([]);
    const [localUploadedImages, setLocalUploadedImages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleChange = (e) => {
      setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleKeyDown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
      }
    };

    const handleImageUpload = (e) => {
      const files = Array.from(e.target.files);
      setImageFiles([...imageFiles, ...files]);
      const previewUrls = files.map((file) => URL.createObjectURL(file));
      setLocalUploadedImages([...localUploadedImages, ...previewUrls]);
    };

    const removeImage = (index) => {
      setImageFiles(imageFiles.filter((_, i) => i !== index));
      setLocalUploadedImages(localUploadedImages.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      setLoading(true);
      setError("");

      try {
        let imageUrls = [];
        if (imageFiles.length > 0) {
          const uploadResponse = await uploadAPI.uploadImages(imageFiles);
          imageUrls = uploadResponse.data.images.map((img) => img.url);
        }

        const machineData = {
          name: formData.name,
          category: formData.category.toLowerCase(),
          brand: formData.brand,
          year: parseInt(formData.year),
          pricingType: formData.pricingType,
          specifications: {
            horsepower: parseInt(formData.horsepower || 0),
          },
          description: formData.description,
          address: {
            province: formData.province,
            city: formData.city,
            commune: formData.commune,
            quartier: formData.quartier,
          },
          location: {
            type: "Point",
            coordinates: [-79.5, 43.8],
          },
          images:
            imageUrls.length > 0
              ? imageUrls
              : [
                  "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400",
                ],
        };

        if (
          formData.pricingType === "daily" ||
          formData.pricingType === "both"
        ) {
          machineData.pricePerDay = parseFloat(formData.pricePerDay);
        }
        if (
          formData.pricingType === "per_hectare" ||
          formData.pricingType === "both"
        ) {
          machineData.pricePerHectare = parseFloat(formData.pricePerHectare);
          machineData.minimumHectares = parseFloat(formData.minimumHectares);
        }

        const response = await machineAPI.create(machineData);
        if (response.data.success) {
          setShowAddMachineForm(false);
          setLocalUploadedImages([]);
          setImageFiles([]);
          await fetchMachines();
          setCurrentView("machines");
          alert("Machine added successfully!");
        }
      } catch (err) {
        console.error("Error adding machine:", err);

        if (
          err.response?.status === 403 &&
          err.response?.data?.requiresVerification
        ) {
          setError(
            "⚠️ Email verification required! Please verify your email before listing machines."
          );

          const updatedUser = { ...localUser, isEmailVerified: false };
          setLocalUser(updatedUser);
          localStorage.setItem("user", JSON.stringify(updatedUser));
        } else {
          setError(err.response?.data?.message || "Failed to add machine");
        }
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
        <div className="bg-white rounded-2xl p-6 max-w-md w-full my-8 shadow-2xl max-h-[90vh] overflow-y-auto">
          <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            Add New Machine
          </h2>
          {error && (
            <div className="bg-rose-100 border border-rose-300 text-rose-700 px-4 py-3 rounded-xl mb-4 text-sm">
              {error}
            </div>
          )}
          <form
            onSubmit={handleSubmit}
            onKeyDown={handleKeyDown}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-semibold mb-2">
                Machine Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="e.g., John Deere 8R 370"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Category *
              </label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                required
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select Category</option>
                <option value="tractor">Tractor</option>
                <option value="harvester">Harvester</option>
                <option value="planter">Planter</option>
                <option value="sprayer">Sprayer</option>
                <option value="desherbeuse">Desherbeuse</option>
                <option value="excavator">Excavator</option>
                <option value="cultivator">Cultivator</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Brand *
                </label>
                <input
                  type="text"
                  name="brand"
                  value={formData.brand}
                  onChange={handleChange}
                  required
                  placeholder="John Deere"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Year *
                </label>
                <input
                  type="number"
                  name="year"
                  value={formData.year}
                  onChange={handleChange}
                  required
                  placeholder="2024"
                  onKeyDown={handleKeyDown}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Pricing Type *
              </label>
              <select
                name="pricingType"
                value={formData.pricingType}
                onChange={handleChange}
                required
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
              >
                <option value="daily">Daily Rental</option>
                <option value="per_hectare">Per Hectare</option>
                <option value="both">Both (Daily & Per Hectare)</option>
              </select>
            </div>

            {(formData.pricingType === "daily" ||
              formData.pricingType === "both") && (
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Price per Day ($) *
                </label>
                <input
                  type="number"
                  name="pricePerDay"
                  value={formData.pricePerDay}
                  onChange={handleChange}
                  required
                  placeholder="450"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}

            {(formData.pricingType === "per_hectare" ||
              formData.pricingType === "both") && (
              <>
                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Price per Hectare ($) *
                  </label>
                  <input
                    type="number"
                    name="pricePerHectare"
                    value={formData.pricePerHectare}
                    onChange={handleChange}
                    required
                    placeholder="75"
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Minimum Hectares
                  </label>
                  <input
                    type="number"
                    name="minimumHectares"
                    value={formData.minimumHectares}
                    onChange={handleChange}
                    placeholder="1"
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-semibold mb-2">
                Horsepower
              </label>
              <input
                type="number"
                name="horsepower"
                value={formData.horsepower}
                onChange={handleChange}
                placeholder="370"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Describe your machine..."
                rows="3"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* LOCATION SECTION */}
            <div>
              <label className="block text-sm font-semibold mb-2 text-red-600">
                📍 Location (Very Important!)
              </label>
              <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 space-y-3">
                <p className="text-xs text-gray-700 font-semibold">
                  ⚠️ Renters will see this location to know if your machine is
                  nearby
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Province *
                    </label>
                    <select
                      name="province"
                      value={formData.province}
                      onChange={handleChange}
                      required
                      className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-yellow-500 focus:outline-none"
                    >
                      <option value="">Select Province</option>
                      <option value="Kinshasa">Kinshasa</option>
                      <option value="Kongo-Central">Kongo-Central</option>
                      <option value="Haut-Katanga">Haut-Katanga</option>
                      <option value="Lualaba">Lualaba</option>
                      <option value="Nord-Kivu">Nord-Kivu</option>
                      <option value="Sud-Kivu">Sud-Kivu</option>
                      <option value="Équateur">Équateur</option>
                      <option value="Tshopo">Tshopo</option>
                      <option value="Kasaï">Kasaï</option>
                      <option value="Kasaï-Central">Kasaï-Central</option>
                      <option value="Kasaï-Oriental">Kasaï-Oriental</option>
                      <option value="Lomami">Lomami</option>
                      <option value="Sankuru">Sankuru</option>
                      <option value="Maniema">Maniema</option>
                      <option value="Tanganyika">Tanganyika</option>
                      <option value="Haut-Lomami">Haut-Lomami</option>
                      <option value="Ituri">Ituri</option>
                      <option value="Bas-Uélé">Bas-Uélé</option>
                      <option value="Haut-Uélé">Haut-Uélé</option>
                      <option value="Mongala">Mongala</option>
                      <option value="Nord-Ubangi">Nord-Ubangi</option>
                      <option value="Sud-Ubangi">Sud-Ubangi</option>
                      <option value="Tshuapa">Tshuapa</option>
                      <option value="Mai-Ndombe">Mai-Ndombe</option>
                      <option value="Kwango">Kwango</option>
                      <option value="Kwilu">Kwilu</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      City/Town *
                    </label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      required
                      placeholder="e.g., Lubumbashi"
                      className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-yellow-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Commune
                    </label>
                    <input
                      type="text"
                      name="commune"
                      value={formData.commune}
                      onChange={handleChange}
                      placeholder="e.g., Limete"
                      className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-yellow-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Quartier
                    </label>
                    <input
                      type="text"
                      name="quartier"
                      value={formData.quartier}
                      onChange={handleChange}
                      placeholder="e.g., Kingabwa"
                      className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-yellow-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Upload Images
              </label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
                id="imageUpload"
              />
              <label
                htmlFor="imageUpload"
                className="border-2 border-dashed border-blue-300 rounded-xl p-6 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition block"
              >
                <Plus size={32} className="mx-auto text-blue-400 mb-2" />
                <p className="text-sm text-gray-600">Click to upload images</p>
              </label>
              {localUploadedImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {localUploadedImages.map((img, idx) => (
                    <div key={idx} className="relative">
                      <img
                        src={img}
                        alt={`Preview ${idx}`}
                        className="w-full h-20 object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowAddMachineForm(false);
                  setLocalUploadedImages([]);
                  setImageFiles([]);
                }}
                className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50"
              >
                {loading ? "Saving..." : "Add Machine"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // ============== EDIT MACHINE FORM ==============
  const EditMachineForm = () => {
    const [formData, setFormData] = useState({
      name: editingMachine?.name || "",
      category: editingMachine?.category || "",
      brand: editingMachine?.brand || "",
      year: editingMachine?.year || "",
      pricingType: editingMachine?.pricingType || "daily",
      pricePerDay: editingMachine?.pricePerDay || "",
      pricePerHectare: editingMachine?.pricePerHectare || "",
      minimumHectares: editingMachine?.minimumHectares || "1",
      horsepower: editingMachine?.specifications?.horsepower || "",
      description: editingMachine?.description || "",
      availability: editingMachine?.availability || "available",
      province: editingMachine?.province || "",
      city: editingMachine?.city || "",
      commune: editingMachine?.commune || "",
      quartier: editingMachine?.quartier || "",
    });
    const [imageFiles, setImageFiles] = useState([]);
    const [existingImages, setExistingImages] = useState(
      editingMachine?.images || []
    );
    const [newImagePreviews, setNewImagePreviews] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [locationFilter, setLocationFilter] = useState("");

    const filteredMachines = machines.filter((m) => {
      // Category filter
      if (selectedFilter !== "All" && m.category !== selectedFilter)
        return false;

      // Location filter
      if (locationFilter.trim()) {
        const locationText = `${m.address?.city || ""} ${
          m.address?.commune || ""
        } ${m.address?.quartier || ""} ${
          m.address?.province || ""
        }`.toLowerCase();
        if (!locationText.includes(locationFilter.toLowerCase().trim()))
          return false;
      }

      return true;
    });

    const handleChange = (e) => {
      setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleKeyDown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
      }
    };

    const handleImageUpload = (e) => {
      const files = Array.from(e.target.files);
      setImageFiles([...imageFiles, ...files]);
      const previewUrls = files.map((file) => URL.createObjectURL(file));
      setNewImagePreviews([...newImagePreviews, ...previewUrls]);
    };

    const removeExistingImage = (index) => {
      setExistingImages(existingImages.filter((_, i) => i !== index));
    };

    const removeNewImage = (index) => {
      setImageFiles(imageFiles.filter((_, i) => i !== index));
      setNewImagePreviews(newImagePreviews.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      setLoading(true);
      setError("");

      try {
        let newImageUrls = [];
        if (imageFiles.length > 0) {
          const uploadResponse = await uploadAPI.uploadImages(imageFiles);
          newImageUrls = uploadResponse.data.images.map((img) => img.url);
        }

        const allImages = [...existingImages, ...newImageUrls];

        const machineData = {
          name: formData.name,
          category: formData.category.toLowerCase(),
          brand: formData.brand,
          year: parseInt(formData.year),
          pricingType: formData.pricingType,
          availability: formData.availability,
          specifications: {
            horsepower: parseInt(formData.horsepower || 0),
          },
          description: formData.description,
          images:
            allImages.length > 0
              ? allImages
              : [
                  "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400",
                ],
        };

        if (
          formData.pricingType === "daily" ||
          formData.pricingType === "both"
        ) {
          machineData.pricePerDay = parseFloat(formData.pricePerDay);
        }
        if (
          formData.pricingType === "per_hectare" ||
          formData.pricingType === "both"
        ) {
          machineData.pricePerHectare = parseFloat(formData.pricePerHectare);
          machineData.minimumHectares = parseFloat(formData.minimumHectares);
        }

        const response = await machineAPI.update(
          editingMachine._id,
          machineData
        );
        if (response.data.success) {
          setShowEditMachineForm(false);
          setEditingMachine(null);
          setNewImagePreviews([]);
          setImageFiles([]);
          await fetchMachines();
          alert("✅ Machine updated successfully!");
        }
      } catch (err) {
        console.error("Error updating machine:", err);
        setError(err.response?.data?.message || "Failed to update machine");
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
        <div className="bg-white rounded-2xl p-6 max-w-2xl w-full my-8 shadow-2xl max-h-[95vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              Edit Machine
            </h2>
            <button
              onClick={() => {
                setShowEditMachineForm(false);
                setEditingMachine(null);
              }}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>

          {/* Machine Info Summary */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-6">
            <h3 className="font-semibold text-blue-800 mb-2">
              📋 Current Information
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-600">Category:</span>
                <span className="font-semibold ml-2 capitalize">
                  {editingMachine?.category}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Brand:</span>
                <span className="font-semibold ml-2">
                  {editingMachine?.brand}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Year:</span>
                <span className="font-semibold ml-2">
                  {editingMachine?.year}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Status:</span>
                <span
                  className={`font-semibold ml-2 capitalize ${
                    editingMachine?.availability === "available"
                      ? "text-green-600"
                      : "text-orange-600"
                  }`}
                >
                  {editingMachine?.availability}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Pricing:</span>
                <span className="font-semibold ml-2 capitalize">
                  {editingMachine?.pricingType}
                </span>
              </div>
              {editingMachine?.rating?.count > 0 && (
                <div>
                  <span className="text-gray-600">Rating:</span>
                  <span className="font-semibold ml-2">
                    ⭐ {editingMachine?.rating?.average?.toFixed(1)} (
                    {editingMachine?.rating?.count})
                  </span>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-rose-100 border border-rose-300 text-rose-700 px-4 py-3 rounded-xl mb-4 text-sm">
              {error}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            onKeyDown={handleKeyDown}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-semibold mb-2">
                Machine Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Category *
                </label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  required
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select Category</option>
                  <option value="tractor">Tractor</option>
                  <option value="harvester">Harvester</option>
                  <option value="planter">Planter</option>
                  <option value="sprayer">Sprayer</option>
                  <option value="desherbeuse">Desherbeuse</option>
                  <option value="excavator">Excavator</option>
                  <option value="cultivator">Cultivator</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">
                  Brand *
                </label>
                <input
                  type="text"
                  name="brand"
                  value={formData.brand}
                  onChange={handleChange}
                  required
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Year *
                </label>
                <input
                  type="number"
                  name="year"
                  value={formData.year}
                  onChange={handleChange}
                  required
                  onKeyDown={handleKeyDown}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Horsepower
                </label>
                <input
                  type="number"
                  name="horsepower"
                  value={formData.horsepower}
                  onChange={handleChange}
                  onKeyDown={handleKeyDown}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Availability Status *
              </label>
              <select
                name="availability"
                value={formData.availability}
                onChange={handleChange}
                required
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
              >
                <option value="available">✅ Available</option>
                <option value="rented">🔒 Currently Rented</option>
                <option value="unavailable">❌ Unavailable</option>
                <option value="maintenance">🔧 Under Maintenance</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Pricing Type *
              </label>
              <select
                name="pricingType"
                value={formData.pricingType}
                onChange={handleChange}
                required
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
              >
                <option value="daily">Daily Rental</option>
                <option value="per_hectare">Per Hectare</option>
                <option value="both">Both (Daily & Per Hectare)</option>
              </select>
            </div>

            {(formData.pricingType === "daily" ||
              formData.pricingType === "both") && (
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Price per Day ($) *
                </label>
                <input
                  type="number"
                  name="pricePerDay"
                  value={formData.pricePerDay}
                  onChange={handleChange}
                  required
                  onKeyDown={handleKeyDown}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}

            {(formData.pricingType === "per_hectare" ||
              formData.pricingType === "both") && (
              <>
                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Price per Hectare ($) *
                  </label>
                  <input
                    type="number"
                    name="pricePerHectare"
                    value={formData.pricePerHectare}
                    onChange={handleChange}
                    required
                    onKeyDown={handleKeyDown}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Minimum Hectares
                  </label>
                  <input
                    type="number"
                    name="minimumHectares"
                    value={formData.minimumHectares}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-semibold mb-2">
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Describe your machine..."
                rows="3"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {existingImages.length > 0 && (
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Current Images ({existingImages.length})
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {existingImages.map((img, idx) => (
                    <div key={idx} className="relative">
                      <img
                        src={img}
                        alt={`Current ${idx}`}
                        className="w-full h-24 object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => removeExistingImage(idx)}
                        className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-rose-600"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold mb-2">
                Add New Images
              </label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
                id="editImageUpload"
              />
              <label
                htmlFor="editImageUpload"
                className="border-2 border-dashed border-blue-300 rounded-xl p-4 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition block"
              >
                <Plus size={24} className="mx-auto text-blue-400 mb-1" />
                <p className="text-sm text-gray-600">
                  Click to upload new images
                </p>
              </label>
              {newImagePreviews.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mt-3">
                  {newImagePreviews.map((img, idx) => (
                    <div key={idx} className="relative">
                      <img
                        src={img}
                        alt={`New ${idx}`}
                        className="w-full h-24 object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => removeNewImage(idx)}
                        className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-rose-600"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t">
              <button
                type="button"
                onClick={() => {
                  setShowEditMachineForm(false);
                  setEditingMachine(null);
                  setNewImagePreviews([]);
                  setImageFiles([]);
                }}
                className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-300 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50 hover:shadow-lg transition"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Updating...
                  </span>
                ) : (
                  "💾 Save Changes"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // ============== REVIEW MODAL ==============
  const ReviewModal = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [hoveredRating, setHoveredRating] = useState(0);
    const [localRating, setLocalRating] = useState(reviewData.rating);
    const [localComment, setLocalComment] = useState(reviewData.comment);

    const handleSubmitReview = async () => {
      if (!localRating || localRating < 1 || localRating > 5) {
        setError("Please select a valid rating (1-5)");
        return;
      }
      if (localComment.length > 500) {
        setError("Review must be 500 characters or less");
        return;
      }

      try {
        setLoading(true);
        setError("");

        const reviewPayload = { rating: localRating, comment: localComment };

        if (reviewingRental.isReviewed && reviewingRental.review?.rating) {
          await rentalAPI.updateReview(reviewingRental._id, reviewPayload);
        } else {
          await rentalAPI.submitReview(reviewingRental._id, reviewPayload);
        }

        alert("✅ Review saved successfully!");
        setShowReviewModal(false);
        setReviewingRental(null);
        setReviewData({ rating: 5, comment: "" });
        fetchRentals();
      } catch (err) {
        setError(err.response?.data?.message || "Failed to save review");
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
          <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
            Rate Your Experience
          </h2>
          <div className="mb-4">
            <p className="text-gray-700 font-medium mb-2">
              How was your experience with {reviewingRental?.machineId?.name}?
            </p>
          </div>

          {/* Star Rating */}
          <div className="mb-6">
            <label className="block font-semibold mb-3 text-center">
              Your Rating
            </label>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setLocalRating(star);
                  }}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="text-5xl focus:outline-none transition-transform hover:scale-110 cursor-pointer"
                >
                  {star <= (hoveredRating || localRating) ? (
                    <span className="text-amber-400">⭐</span>
                  ) : (
                    <span className="text-gray-300">☆</span>
                  )}
                </button>
              ))}
            </div>
            <p className="text-center text-sm text-gray-600 mt-2">
              {localRating === 1 && "Poor"}
              {localRating === 2 && "Fair"}
              {localRating === 3 && "Good"}
              {localRating === 4 && "Very Good"}
              {localRating === 5 && "Excellent"}
            </p>
          </div>

          {/* Comment */}
          <div className="mb-4">
            <label className="block font-semibold mb-2">
              Your Review (Optional)
            </label>
            <textarea
              value={localComment}
              onChange={(e) => setLocalComment(e.target.value)}
              placeholder="Share your experience with this machine..."
              rows={4}
              maxLength={500}
              className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-amber-500 focus:outline-none text-sm resize-none"
              autoComplete="off"
            />
            <small className="text-gray-500 text-xs">
              {localComment.length}/500 characters
            </small>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowReviewModal(false);
                setReviewingRental(null);
                setReviewData({ rating: 5, comment: "" });
              }}
              disabled={loading}
              className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-semibold text-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitReview}
              disabled={loading || !localRating}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Saving..." : "Save Review"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ============== CONFIRMATION MODAL ==============
  const ConfirmCompletionModal = () => {
    const [localNote, setLocalNote] = useState(completionNote || "");

    const handleConfirm = async () => {
      if (!localNote.trim() || localNote.length < 10) {
        alert(
          "Please provide details about the service (minimum 10 characters)"
        );
        return;
      }

      try {
        const response = await paymentAPI.confirmCompletion(
          confirmingRental._id,
          {
            confirmationNote: localNote,
          }
        );

        if (response.data.success) {
          alert(
            "✅ Thank you! You've confirmed the rental is complete.\n\nAgriRent will verify and release the payment to the owner within 24-48 hours."
          );
          setShowConfirmCompletionModal(false);
          setConfirmingRental(null);
          setCompletionNote("");
          await fetchRentals();
        }
      } catch (error) {
        alert(error.response?.data?.message || "Failed to confirm completion");
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
          <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
            Confirm Service Completion
          </h2>
          <p className="text-gray-700 mb-4">
            Please confirm that{" "}
            <strong>{confirmingRental?.machineId?.name}</strong> service was
            completed satisfactorily.
          </p>
          <div className="mb-4">
            <label className="block font-semibold mb-2 text-sm">
              How was the service? (Optional)
            </label>
            <textarea
              value={localNote}
              onChange={(e) => setLocalNote(e.target.value)}
              placeholder="The tractor worked perfectly, job completed on time..."
              rows={4}
              className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none text-sm"
              maxLength={500}
              autoComplete="off"
            />
            <small className="text-gray-500 text-xs">
              {localNote.length}/500 characters (minimum 10)
            </small>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
            <p className="text-xs text-gray-700">
              ✅ Once confirmed, AgriRent will verify and release $
              {confirmingRental?.pricing?.totalPrice?.toFixed(2)} to the owner
              within 24-48 hours.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowConfirmCompletionModal(false);
                setConfirmingRental(null);
                setCompletionNote("");
              }}
              className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-semibold text-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={localNote.length < 10}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Confirm & Release Payment
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ============== DISPUTE MODAL ==============
  const DisputeModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
        <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
          Open Dispute
        </h2>
        <p className="text-gray-700 mb-4">
          If there was an issue with the service, please provide details below.
          Our team will review and resolve fairly.
        </p>
        <div className="mb-4">
          <label className="block font-semibold mb-2 text-sm">
            What went wrong? *
          </label>
          <textarea
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            placeholder="The machine broke down after 2 hours, incomplete work..."
            rows={5}
            className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none text-sm"
            maxLength={1000}
          />
          <small className="text-gray-500 text-xs">
            {disputeReason.length}/1000 characters (minimum 20)
          </small>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
          <p className="text-xs text-gray-700">
            ⚠️ Your payment of $
            {disputingRental?.pricing?.totalPrice?.toFixed(2)} is secure. Our
            team will investigate and resolve within 24-48 hours.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setShowDisputeModal(false);
              setDisputingRental(null);
              setDisputeReason("");
            }}
            className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-semibold text-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleOpenDispute}
            disabled={disputeReason.length < 20}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Submit Dispute
          </button>
        </div>
      </div>
    </div>
  );

  // ============== MAIN RENDER ==============
  return (
    <div className="bg-gradient-to-br from-gray-50 to-blue-50 min-h-screen pb-20 max-w-md mx-auto">
      {/* Debug Info - Remove in production */}
      {process.env.NODE_ENV === "development" && (
        <div className="bg-gray-800 text-white text-xs p-2">
          User: {localUser?.email || currentUser?.email || "Not logged in"} |
          Role: {localUser?.role || currentUser?.role} | Verified:{" "}
          {localUser?.isEmailVerified || currentUser?.isEmailVerified
            ? "✅"
            : "❌"}{" "}
          | View: {currentView}
        </div>
      )}
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 text-white p-5 shadow-xl">
        <h1 className="text-2xl font-bold">AgriRent</h1>
        <p className="text-sm text-blue-100">Location d'equipement Agricole</p>
      </div>

      {/* Verification Banner */}
      <VerificationBanner user={currentUser} />

      {/* Current View */}
      {currentView === "home" && <HomeScreen />}
      {currentView === "machines" && <MachinesScreen />}
      {currentView === "machineDetail" && <MachineDetailScreen />}
      {currentView === "rentals" && <RentalsScreen />}
      {currentView === "profile" && <ProfileScreen />}
      {currentView === "myMachines" && <MyMachinesScreen />}
      {currentView === "requests" && <RentalRequestsScreen />}

      {/* All Modals */}
      {showAddMachineForm && <AddMachineForm />}
      {showEditMachineForm && editingMachine && <EditMachineForm />}
      {showBookingModal && bookingMachine && (
        <BookingModal
          machine={bookingMachine}
          onClose={() => {
            setShowBookingModal(false);
            setBookingMachine(null);
          }}
          onBook={handleBookMachine}
        />
      )}
      {showReviewModal && reviewingRental && (
        <ReviewModal key={reviewingRental._id} />
      )}
      {showPaymentModal && paymentRental && (
        <PaymentModal
          rental={paymentRental}
          onClose={() => {
            setShowPaymentModal(false);
            setPaymentRental(null);
          }}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}
      {showConfirmCompletionModal && confirmingRental && (
        <ConfirmCompletionModal />
      )}
      {showDisputeModal && disputingRental && <DisputeModal />}

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t px-4 py-3 flex justify-around shadow-lg max-w-md mx-auto">
        <button
          onClick={() => setCurrentView("home")}
          className={`flex flex-col items-center gap-1 p-2 ${
            currentView === "home" ? "text-blue-600" : "text-gray-400"
          }`}
        >
          <Home size={24} />
          <span className="text-xs">Home</span>
        </button>
        <button
          onClick={() => setCurrentView("machines")}
          className={`flex flex-col items-center gap-1 p-2 ${
            currentView === "machines" || currentView === "machineDetail"
              ? "text-cyan-600"
              : "text-gray-400"
          }`}
        >
          <Search size={24} />
          <span className="text-xs">Browse</span>
        </button>
        <button
          onClick={() => setCurrentView("rentals")}
          className={`flex flex-col items-center gap-1 p-2 ${
            currentView === "rentals" ? "text-teal-600" : "text-gray-400"
          }`}
        >
          <Calendar size={24} />
          <span className="text-xs">Rentals</span>
        </button>
        <button
          onClick={() => setCurrentView("profile")}
          className={`flex flex-col items-center gap-1 p-2 ${
            currentView === "profile" ? "text-emerald-600" : "text-gray-400"
          }`}
        >
          <User size={24} />
          <span className="text-xs">Profile</span>
        </button>
      </div>
    </div>
  );
}
