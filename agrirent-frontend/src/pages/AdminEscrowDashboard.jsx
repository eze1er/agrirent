import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertTriangle,
  DollarSign,
  Calendar,
  User,
  Shield,
  LogOut,
  LayoutDashboard,
  Menu,
  X,
  TrendingUp,
  Clock,
  Percent,
  MessageSquare,
  Eye,
  UserCheck,
} from "lucide-react";

// Helper function to safely format currency
const formatCurrency = (value) => {
  const num = parseFloat(value);
  return isNaN(num) ? "0.00" : num.toFixed(2);
};

export default function AdminEscrowDashboard({ user, onLogout }) {
  const navigate = useNavigate();
  const [escrowData, setEscrowData] = useState({
    totalInEscrow: 0,
    pendingApproval: 0,
    completedPayments: 0,
    disputedPayments: 0,
    totalRevenue: 0,
    platformFees: 0,
    ownerPayouts: 0,
    rentals: [],
  });
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [selectedRental, setSelectedRental] = useState(null);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [adminNote, setAdminNote] = useState("");
  const [processing, setProcessing] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

  useEffect(() => {
    if (user?.role !== "admin") {
      alert("⚠️ Access denied. Admin privileges required.");
      navigate("/");
      return;
    }
    fetchEscrowData();
  }, [user, navigate]);

  const fetchEscrowData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");

      const response = await fetch(
        `${API_BASE}/payments/admin/pending-payments`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json();
      console.log("📊 Raw API response:", data);

      if (data.success) {
        const rentalData = data.data || [];
        console.log("📋 Rentals received:", rentalData.length);

        setRentals(rentalData);

        const stats = calculateStats(rentalData);
        console.log("📊 Calculated stats:", stats);

        setEscrowData(stats);
      } else {
        console.error("❌ API returned error:", data.message);
        setRentals([]);
        setEscrowData({
          totalInEscrow: 0,
          pendingApproval: 0,
          completedPayments: 0,
          disputedPayments: 0,
          totalRevenue: 0,
          platformFees: 0,
          ownerPayouts: 0,
          rentals: [],
        });
      }
    } catch (error) {
      console.error("❌ Fetch error:", error);
      alert("Failed to load escrow data. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (rentals) => {
    const stats = {
      totalInEscrow: 0,
      pendingApproval: 0,
      completedPayments: 0,
      disputedPayments: 0,
      totalRevenue: 0,
      platformFees: 0,
      ownerPayouts: 0,
      rentals: rentals,
    };

    if (!rentals || !Array.isArray(rentals)) return stats;

    rentals.forEach((rental) => {
      const amount = Number(
        rental.pricing?.totalPrice || rental.payment?.amount || 0
      );
      const platformFee = amount * 0.1;
      const ownerPayout = amount - platformFee;

      if (rental.payment?.status === "held_in_escrow") {
        stats.totalInEscrow += amount;

        if (
          rental.status === "released" &&
          rental.ownerConfirmedCompletion &&
          rental.renterConfirmedCompletion
        ) {
          stats.pendingApproval += 1;
        }
      }

      if (
        rental.payment?.status === "completed" ||
        rental.status === "closed"
      ) {
        stats.completedPayments += 1;
        stats.totalRevenue += amount;
        stats.platformFees += rental.payment?.platformFee || platformFee;
        stats.ownerPayouts += rental.payment?.ownerPayout || ownerPayout;
      }

      if (rental.status === "disputed") {
        stats.disputedPayments += 1;
      }
    });

    return stats;
  };

  const handleReleasePayment = async () => {
    if (!adminNote.trim() || adminNote.length < 10) {
      alert(
        "❌ Please provide detailed verification notes (minimum 10 characters)"
      );
      return;
    }

    const amount = selectedRental.pricing?.totalPrice || 0;
    const platformFee = amount * 0.1;
    const ownerPayout = amount - platformFee;

    if (
      !window.confirm(
        `🔐 CONFIRM PAYMENT RELEASE:\n\n` +
          `Total Amount: $${amount.toFixed(2)}\n` +
          `Platform Fee (10%): $${platformFee.toFixed(2)}\n` +
          `Owner Receives: $${ownerPayout.toFixed(2)}\n\n` +
          `✅ Renter confirmed: YES\n` +
          `✅ Owner confirmed: YES\n\n` +
          `This action cannot be undone. Continue?`
      )
    ) {
      return;
    }

    try {
      setProcessing(true);
      const token = localStorage.getItem("token");

      const response = await fetch(
        `${API_BASE}/payments/admin/release/${selectedRental._id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            adminNote: adminNote,
            platformFee: platformFee,
            ownerPayout: ownerPayout,
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        alert(
          `✅ Payment Released Successfully!\n\n` +
            `Owner receives: $${ownerPayout.toFixed(2)}\n` +
            `Platform earned: $${platformFee.toFixed(2)}\n\n` +
            `Owner has been notified.`
        );
        setShowReleaseModal(false);
        setSelectedRental(null);
        setAdminNote("");
        await fetchEscrowData();
      } else {
        throw new Error(data.message || "Failed to release payment");
      }
    } catch (error) {
      console.error("Release error:", error);
      alert(`❌ Failed to release payment: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectRelease = async () => {
    if (!adminNote.trim() || adminNote.length < 20) {
      alert(
        "❌ Please provide a detailed reason for rejection (minimum 20 characters)"
      );
      return;
    }

    try {
      setProcessing(true);
      const token = localStorage.getItem("token");

      const response = await fetch(
        `${API_BASE}/payments/admin/reject/${selectedRental._id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            reason: adminNote,
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        alert("❌ Release Rejected. Both parties have been notified.");
        setShowRejectModal(false);
        setSelectedRental(null);
        setAdminNote("");
        await fetchEscrowData();
      } else {
        throw new Error(data.message || "Failed to reject release");
      }
    } catch (error) {
      console.error("Reject error:", error);
      alert(`❌ Failed to reject release: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const getFilteredRentals = () => {
    if (!escrowData.rentals || !Array.isArray(escrowData.rentals)) return [];

    switch (filter) {
      case "pending":
        return escrowData.rentals.filter(
          (r) =>
            r.status === "released" &&
            r.payment?.status === "held_in_escrow" &&
            r.ownerConfirmedCompletion === true &&
            r.renterConfirmedCompletion === true
        );

      case "waiting":
        return escrowData.rentals.filter((r) => {
          if (r.status === "approved" && r.payment?.status === "pending")
            return true;

          if (r.payment?.status === "held_in_escrow") {
            return !r.ownerConfirmedCompletion || !r.renterConfirmedCompletion;
          }

          return false;
        });

      case "escrow":
        return escrowData.rentals.filter(
          (r) => r.payment?.status === "held_in_escrow"
        );

      case "disputed":
        return escrowData.rentals.filter((r) => r.status === "disputed");

      case "completed":
        return escrowData.rentals.filter(
          (r) => r.payment?.status === "completed" || r.status === "closed"
        );

      case "all":
        return escrowData.rentals;

      default:
        return escrowData.rentals;
    }
  };

  const filteredRentals = getFilteredRentals();

  const handleLogoutClick = () => {
    if (window.confirm("Are you sure you want to logout?")) {
      onLogout();
      navigate("/");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-rose-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-semibold">
            Loading escrow dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-rose-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4 border-b border-white/20">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/admin/dashboard")}
                className="p-2 hover:bg-white/20 rounded-xl transition"
              >
                <ArrowLeft size={24} />
              </button>
              <div className="flex items-center gap-2">
                <Shield size={32} />
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold">
                    💰 Escrow Management
                  </h1>
                  <p className="text-xs sm:text-sm text-rose-100">
                    Payment verification & release
                  </p>
                </div>
              </div>
            </div>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-3">
              <button
                onClick={() => navigate("/admin/dashboard")}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition font-semibold"
              >
                <LayoutDashboard size={20} />
                Dashboard
              </button>
              <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-lg">
                <User size={20} />
                <span className="font-semibold text-sm">{user?.email}</span>
              </div>
              <button
                onClick={handleLogoutClick}
                className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 rounded-lg transition font-semibold"
              >
                <LogOut size={20} />
                Logout
              </button>
            </div>

            {/* Mobile Menu */}
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="md:hidden p-2 hover:bg-white/10 rounded-lg"
            >
              {showMobileMenu ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          {showMobileMenu && (
            <div className="md:hidden py-4 space-y-2 border-b border-white/20">
              <button
                onClick={() => {
                  navigate("/admin/dashboard");
                  setShowMobileMenu(false);
                }}
                className="w-full flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition font-semibold"
              >
                <LayoutDashboard size={20} />
                Dashboard
              </button>
              <div className="px-4 py-2 bg-white/10 rounded-lg">
                <span className="text-sm">{user?.email}</span>
              </div>
              <button
                onClick={handleLogoutClick}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 rounded-lg transition font-semibold"
              >
                <LogOut size={20} />
                Logout
              </button>
            </div>
          )}

          {/* Money Stats */}
          <div className="py-6">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard
                icon={<DollarSign size={20} />}
                label="In Escrow"
                value={`$${formatCurrency(escrowData?.totalInEscrow)}`}
                sublabel="Held funds"
                color="yellow"
              />
              <StatCard
                icon={<AlertTriangle size={20} />}
                label="Pending"
                value={escrowData?.pendingApproval || 0}
                sublabel="Both confirmed"
                color="yellow"
              />
              <StatCard
                icon={<CheckCircle size={20} />}
                label="Completed"
                value={escrowData?.completedPayments || 0}
                sublabel="Released"
                color="green"
              />
              <StatCard
                icon={<TrendingUp size={20} />}
                label="Revenue"
                value={`$${formatCurrency(escrowData?.totalRevenue)}`}
                sublabel="All time"
                color="green"
              />
              <StatCard
                icon={<Percent size={20} />}
                label="Platform Fees"
                value={`$${formatCurrency(escrowData?.platformFees)}`}
                sublabel="10% earned"
                color="blue"
              />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              <StatCard
                icon={<DollarSign size={18} />}
                label="Owner Payouts"
                value={`$${formatCurrency(escrowData?.ownerPayouts)}`}
                sublabel="90% paid"
                color="white"
              />
              <StatCard
                icon={<XCircle size={18} />}
                label="Disputed"
                value={escrowData?.disputedPayments || 0}
                sublabel="Need resolution"
                color="white"
              />
              <StatCard
                icon={<Clock size={18} />}
                label="Transactions"
                value={rentals?.length || 0}
                sublabel="All payments"
                color="white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 mt-6">
        <div className="bg-white rounded-2xl p-2 shadow-lg flex gap-2 overflow-x-auto">
          {[
            {
              key: "pending",
              label: "✅ Ready to Release",
              count: rentals.filter(
                (r) =>
                  r.ownerConfirmedCompletion &&
                  r.renterConfirmedCompletion &&
                  r.payment?.status === "held_in_escrow"
              ).length,
            },
            {
              key: "waiting",
              label: "⏳ Waiting Confirmations",
              count: rentals.filter((r) => {
                if (r.status === "approved" && r.payment?.status === "pending")
                  return true;

                if (r.payment?.status === "held_in_escrow") {
                  return (
                    !r.ownerConfirmedCompletion || !r.renterConfirmedCompletion
                  );
                }

                return false;
              }).length,
            },
            {
              key: "escrow",
              label: "💰 All in Escrow",
              count: rentals.filter(
                (r) =>
                  r.payment?.status === "held_in_escrow" ||
                  (r.status === "approved" && r.payment?.status === "pending")
              ).length,
            },
            {
              key: "disputed",
              label: "⚠️ Disputed",
              count: rentals.filter((r) => r.status === "disputed").length,
            },
            {
              key: "completed",
              label: "✅ Completed",
              count: rentals.filter(
                (r) =>
                  r.payment?.status === "completed" || r.status === "closed"
              ).length,
            },
            {
              key: "all",
              label: "📋 All Payments",
              count: rentals.length,
            },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-6 py-3 rounded-xl font-semibold whitespace-nowrap transition ${
                filter === tab.key
                  ? "bg-gradient-to-r from-rose-500 to-red-500 text-white shadow-lg"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {tab.label} ({tab.count || 0})
            </button>
          ))}
        </div>
      </div>

      {/* Rentals List */}
      <div className="max-w-7xl mx-auto px-4 mt-6">
        {filteredRentals.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <div className="space-y-4">
            {filteredRentals.map((rental) => (
              <RentalCard
                key={rental._id}
                rental={rental}
                onRelease={() => {
                  setSelectedRental(rental);
                  setShowReleaseModal(true);
                  setAdminNote("");
                }}
                onReject={() => {
                  setSelectedRental(rental);
                  setShowRejectModal(true);
                  setAdminNote("");
                }}
                onViewDetails={() => {
                  setSelectedRental(rental);
                  setShowDetailsModal(true);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showReleaseModal && selectedRental && (
        <ReleaseModal
          rental={selectedRental}
          adminNote={adminNote}
          setAdminNote={setAdminNote}
          processing={processing}
          onConfirm={handleReleasePayment}
          onCancel={() => {
            setShowReleaseModal(false);
            setSelectedRental(null);
            setAdminNote("");
          }}
        />
      )}

      {showRejectModal && selectedRental && (
        <RejectModal
          rental={selectedRental}
          adminNote={adminNote}
          setAdminNote={setAdminNote}
          processing={processing}
          onConfirm={handleRejectRelease}
          onCancel={() => {
            setShowRejectModal(false);
            setSelectedRental(null);
            setAdminNote("");
          }}
        />
      )}

      {showDetailsModal && selectedRental && (
        <DetailsModal
          rental={selectedRental}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedRental(null);
          }}
        />
      )}
    </div>
  );
}

// Stat Card Component
function StatCard({ icon, label, value, sublabel, color }) {
  const colorClasses = {
    yellow: "text-yellow-300",
    green: "text-green-300",
    blue: "text-blue-300",
    white: "text-white",
  };

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={colorClasses[color]}>{icon}</div>
        <span className="text-xs sm:text-sm font-semibold text-white">
          {label}
        </span>
      </div>
      <p className="text-2xl sm:text-3xl font-bold text-white">{value}</p>
      <p className="text-xs text-rose-100 mt-1">{sublabel}</p>
    </div>
  );
}

// ✅ ENHANCED Rental Card Component - Dispute-style design
function RentalCard({ rental, onRelease, onReject, onViewDetails }) {
  const amount = rental.pricing?.totalPrice || 0;
  const platformFee = amount * 0.1;
  const ownerPayout = amount - platformFee;

  const bothConfirmed =
    rental.renterConfirmedCompletion && rental.ownerConfirmedCompletion;
  const showActions =
    bothConfirmed && rental.payment?.status === "held_in_escrow";

  return (
    <div className={`bg-white rounded-2xl shadow-sm p-6 border-2 ${
      bothConfirmed && rental.payment?.status === "held_in_escrow"
        ? "border-green-200"
        : "border-gray-200"
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-xl font-bold text-gray-900">
              🚜 {rental.machineId?.name || "Machine"}
            </h3>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
              rental.payment?.status === "held_in_escrow"
                ? "bg-amber-100 text-amber-800"
                : rental.payment?.status === "completed"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-gray-100 text-gray-800"
            }`}>
              {rental.payment?.status?.replace("_", " ").toUpperCase() || "PENDING"}
            </span>
          </div>
          <p className="text-sm text-gray-600">{rental.machineId?.category}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-blue-600">
            ${formatCurrency(amount)}
          </p>
          <p className="text-sm text-gray-600">Total Amount</p>
        </div>
      </div>

      {/* Parties Info */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-sm font-semibold text-blue-900 mb-1">👤 Renter</p>
          <p className="font-bold text-blue-900">
            {rental.renterId?.firstName} {rental.renterId?.lastName}
          </p>
          <p className="text-sm text-blue-700">{rental.renterId?.email}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-sm font-semibold text-green-900 mb-1">🏠 Owner</p>
          <p className="font-bold text-green-900">
            {rental.ownerId?.firstName} {rental.ownerId?.lastName}
          </p>
          <p className="text-sm text-green-700">{rental.ownerId?.email}</p>
        </div>
      </div>

      {/* Payment Breakdown */}
      <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-lg p-4 mb-4">
        <p className="font-semibold text-gray-900 mb-3">💵 Payment Breakdown</p>
        <div className="text-xs text-gray-600 space-y-1">
          <div className="flex justify-between">
            <span>Total Amount:</span>
            <span className="font-semibold">${formatCurrency(amount)}</span>
          </div>
          <div className="flex justify-between">
            <span>Platform Fee (10%):</span>
            <span className="font-semibold text-orange-600">-${formatCurrency(platformFee)}</span>
          </div>
          <div className="flex justify-between pt-1 border-t border-gray-300">
            <span className="font-bold">Owner Payout (90%):</span>
            <span className="font-bold text-green-600">${formatCurrency(ownerPayout)}</span>
          </div>
        </div>
      </div>

      {/* Confirmation Status */}
      <div className="mb-4 space-y-3">
        {/* Renter Confirmation */}
        <div className={`p-4 rounded-xl border-2 ${
          rental.renterConfirmedCompletion
            ? "bg-green-50 border-green-200"
            : "bg-gray-50 border-gray-200"
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {rental.renterConfirmedCompletion ? (
              <CheckCircle size={20} className="text-green-600" />
            ) : (
              <Clock size={20} className="text-gray-400" />
            )}
            <span className={`font-bold ${
              rental.renterConfirmedCompletion
                ? "text-green-800"
                : "text-gray-600"
            }`}>
              Renter Confirmation
            </span>
          </div>
          {rental.renterConfirmedCompletion ? (
            <>
              <p className="text-sm text-gray-700 italic">
                "{rental.renterConfirmationNote}"
              </p>
              <p className="text-xs text-gray-500 mt-2">
                ✓ Confirmed: {new Date(rental.renterConfirmedAt).toLocaleString()}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-600">
              ⏳ Waiting for renter to confirm completion...
            </p>
          )}
        </div>

        {/* Owner Confirmation */}
        <div className={`p-4 rounded-xl border-2 ${
          rental.ownerConfirmedCompletion
            ? "bg-green-50 border-green-200"
            : "bg-gray-50 border-gray-200"
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {rental.ownerConfirmedCompletion ? (
              <CheckCircle size={20} className="text-green-600" />
            ) : (
              <Clock size={20} className="text-gray-400" />
            )}
            <span className={`font-bold ${
              rental.ownerConfirmedCompletion
                ? "text-green-800"
                : "text-gray-600"
            }`}>
              Owner Confirmation
            </span>
          </div>
          {rental.ownerConfirmedCompletion ? (
            <>
              <p className="text-sm text-gray-700 italic">
                "{rental.ownerConfirmationNote}"
              </p>
              <p className="text-xs text-gray-500 mt-2">
                ✓ Confirmed: {new Date(rental.ownerConfirmedAt).toLocaleString()}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-600">
              ⏳ Waiting for owner to confirm completion...
            </p>
          )}
        </div>
      </div>

      {/* Rating Display */}
      {rental.renterReview?.rating && (
        <div className="mb-4 bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-300 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">⭐</span>
            <h4 className="font-bold text-gray-900">Renter's Rating</h4>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-3xl font-bold text-yellow-600">
              {"⭐".repeat(rental.renterReview.rating)}
            </span>
            <span className="text-xl font-semibold text-gray-700">
              ({rental.renterReview.rating}/5)
            </span>
          </div>
          {rental.renterReview.comment && (
            <p className="text-sm text-gray-700 italic mt-2">
              "{rental.renterReview.comment}"
            </p>
          )}
        </div>
      )}

      {/* View Details Button */}
      {(rental.renterConfirmationNote ||
        rental.ownerConfirmationNote ||
        rental.disputeReason) && (
        <div className="mb-4">
          <button
            onClick={onViewDetails}
            className="w-full flex items-center justify-between p-4 bg-blue-50 hover:bg-blue-100 rounded-xl transition border-2 border-blue-200"
          >
            <div className="flex items-center gap-2">
              <MessageSquare size={20} className="text-blue-600" />
              <span className="font-semibold text-blue-900">
                View All Comments & Details
              </span>
            </div>
            <Eye size={20} className="text-blue-600" />
          </button>
        </div>
      )}

      {/* Actions */}
      {showActions && (
        <>
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <UserCheck size={24} className="text-green-600" />
              <span className="font-bold text-green-800 text-lg">
                ✅ Ready to Release
              </span>
            </div>
            <p className="text-sm text-gray-700">
              Both renter and owner have confirmed completion. You can now
              release the payment.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onRelease}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-3 rounded-xl font-bold hover:shadow-xl transition flex items-center justify-center gap-2"
            >
              <CheckCircle size={20} />
              Release ${ownerPayout.toFixed(2)} to Owner
            </button>
            <button
              onClick={onReject}
              className="flex-1 bg-gradient-to-r from-rose-500 to-red-500 text-white py-3 rounded-xl font-bold hover:shadow-xl transition flex items-center justify-center gap-2"
            >
              <XCircle size={20} />
              Reject Release
            </button>
          </div>
        </>
      )}

      {/* Not Ready Yet */}
      {!showActions && rental.payment?.status === "held_in_escrow" && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 text-center">
          <AlertTriangle size={24} className="mx-auto text-amber-600 mb-2" />
          <p className="font-semibold text-amber-800">
            ⏳ Waiting for Confirmations
          </p>
          <p className="text-sm text-gray-700 mt-1">
            Cannot release until BOTH renter and owner confirm completion.
          </p>
        </div>
      )}

      {rental.payment?.status === "completed" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
          <p className="text-emerald-800 font-semibold text-sm">
            ✅ Released on{" "}
            {new Date(rental.payment.releasedAt).toLocaleDateString()}
            <br />
            <span className="text-xs">
              Owner: ${ownerPayout.toFixed(2)} • Platform: $
              {platformFee.toFixed(2)}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

// Empty State, Modals remain unchanged...
function EmptyState({ filter }) {
  const messages = {
    pending: { icon: CheckCircle, title: "No payments ready", subtitle: "Waiting for confirmations" },
    waiting: { icon: Clock, title: "All confirmed", subtitle: "No pending confirmations" },
    escrow: { icon: DollarSign, title: "No funds in escrow", subtitle: "No held funds" },
    disputed: { icon: AlertTriangle, title: "No disputes", subtitle: "All clear" },
    completed: { icon: CheckCircle, title: "No completed payments", subtitle: "No releases yet" },
    all: { icon: Calendar, title: "No payments", subtitle: "Create rentals first" },
  };

  const msg = messages[filter] || messages.all;
  const Icon = msg.icon;

  return (
    <div className="bg-white rounded-2xl p-12 text-center shadow-lg">
      <Icon size={48} className="mx-auto text-gray-400 mb-3" />
      <p className="text-gray-600 font-semibold text-lg">{msg.title}</p>
      <p className="text-gray-500 text-sm mt-2">{msg.subtitle}</p>
      <button
        onClick={() => (window.location.href = "/admin/dashboard")}
        className="mt-4 flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition mx-auto"
      >
        <span>←</span>
        <span>Back to Admin Dashboard</span>
      </button>
    </div>
  );
}

function ReleaseModal({ rental, adminNote, setAdminNote, processing, onConfirm, onCancel }) {
  const amount = rental.pricing?.totalPrice || 0;
  const platformFee = amount * 0.1;
  const ownerPayout = amount - platformFee;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          💰 Release Payment
        </h2>

        <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <UserCheck size={24} className="text-green-600" />
            <h3 className="font-bold text-green-800">Both Parties Confirmed</h3>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-green-600" />
              <span className="text-gray-700">
                <strong>Renter:</strong> "{rental.renterConfirmationNote}"
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-green-600" />
              <span className="text-gray-700">
                <strong>Owner:</strong> "{rental.ownerConfirmationNote}"
              </span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-6 mb-4 border-2 border-emerald-200">
          <h3 className="font-bold text-gray-900 mb-4 text-lg">Payment Breakdown</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-700">Total Rental Amount:</span>
              <span className="font-bold text-xl">${amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-blue-600">
              <span>Platform Fee (10%):</span>
              <span className="font-bold">-${platformFee.toFixed(2)}</span>
            </div>
            <div className="border-t-2 border-emerald-300 pt-3 flex justify-between">
              <span className="font-bold text-gray-900 text-lg">Owner Receives:</span>
              <span className="font-bold text-emerald-600 text-2xl">${ownerPayout.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 mb-4">
          <p className="text-sm text-gray-600 mb-2">Payment will be released to:</p>
          <p className="font-bold text-gray-900 text-lg">
            {rental.ownerId?.firstName} {rental.ownerId?.lastName}
          </p>
          <p className="text-sm text-gray-600">{rental.ownerId?.email}</p>
        </div>

        <div className="mb-4">
          <label className="block font-semibold mb-2 text-gray-900">
            Admin Verification Note <span className="text-red-500">*</span>
          </label>
          <textarea
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="Verified both confirmations. Releasing payment..."
            rows={4}
            maxLength={500}
            className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none"
          />
          <small className="text-gray-500 text-xs">
            {adminNote.length}/500 characters (minimum 10)
          </small>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={processing}
            className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-semibold disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={processing || adminNote.length < 10}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold disabled:opacity-50 hover:shadow-xl transition"
          >
            {processing ? "Processing..." : `✅ Release $${ownerPayout.toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function RejectModal({ rental, adminNote, setAdminNote, processing, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          ⚠️ Reject Payment Release
        </h2>

        <p className="text-gray-700 mb-4">
          Reject release for <strong>${rental.pricing?.totalPrice?.toFixed(2)}</strong>?
        </p>

        <div className="mb-4">
          <label className="block font-semibold mb-2 text-gray-900">
            Rejection Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="Explain why you're rejecting this release (minimum 20 characters)..."
            rows={5}
            maxLength={500}
            className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none"
          />
          <small className="text-gray-500 text-xs">
            {adminNote.length}/500 characters (minimum 20)
          </small>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={processing}
            className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-semibold disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={processing || adminNote.length < 20}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-semibold disabled:opacity-50 hover:shadow-xl transition"
          >
            {processing ? "Processing..." : "⚠️ Reject Release"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailsModal({ rental, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Complete Rental Details</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={24} />
          </button>
        </div>

        {rental.renterConfirmationNote && (
          <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-4 rounded-lg">
            <div className="flex items-start gap-3">
              <MessageSquare size={20} className="text-green-600 mt-1" />
              <div className="flex-1">
                <p className="font-semibold text-green-800 mb-2">✅ Renter Confirmation</p>
                <p className="text-gray-700 italic">"{rental.renterConfirmationNote}"</p>
                <p className="text-xs text-gray-500 mt-2">
                  By: {rental.renterId?.firstName} {rental.renterId?.lastName} •{" "}
                  {new Date(rental.renterConfirmedAt).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {rental.ownerConfirmationNote && (
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4 rounded-lg">
            <div className="flex items-start gap-3">
              <MessageSquare size={20} className="text-blue-600 mt-1" />
              <div className="flex-1">
                <p className="font-semibold text-blue-800 mb-2">✅ Owner Confirmation</p>
                <p className="text-gray-700 italic">"{rental.ownerConfirmationNote}"</p>
                <p className="text-xs text-gray-500 mt-2">
                  By: {rental.ownerId?.firstName} {rental.ownerId?.lastName} •{" "}
                  {new Date(rental.ownerConfirmedAt).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {rental.disputeReason && (
          <div className="bg-orange-50 border-l-4 border-orange-500 p-4 mb-4 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-orange-600 mt-1" />
              <div className="flex-1">
                <p className="font-semibold text-orange-800 mb-2">⚠️ Dispute Reason</p>
                <p className="text-gray-700">"{rental.disputeReason}"</p>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full px-4 py-3 bg-gray-200 hover:bg-gray-300 rounded-xl font-semibold transition"
        >
          Close
        </button>
      </div>
    </div>
  );
}