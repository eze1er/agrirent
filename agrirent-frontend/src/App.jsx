import { Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import Dashboard from "./pages/Dashboard";
import Auth from "./components/Auth";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AdminEscrowDashboard from "./pages/AdminEscrowDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import PhoneVerificationPage from "./pages/PhoneVerificationPage";
import PaymentSuccess from "./pages/PaymentSuccess";
import { userAPI } from "./services/api";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

// ✅ Stripe initialization with fallback
const stripePromise = loadStripe(
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ||
    "pk_test_51KboKABDLHxkeofTUamlwYkVGxInxOfSq11BWBCiMCK3ri4qxqqkgjBZaBilLfoc2BHXN1dShWpdb7pycHJsZ7Wt009atQICnp"
);

// Clear invalid tokens helper
const clearInvalidTokens = () => {
  const token = localStorage.getItem("token");
  if (token) {
    const tokenParts = token.split(".");
    if (token.length < 10 || tokenParts.length !== 3) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      return true;
    }
  }
  return false;
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // ✅ Protected Route Component
  const ProtectedRoute = ({ children, adminOnly = false }) => {
    // Still loading
    if (loading) {
      return (
        <div className="flex items-center justify-center h-screen bg-gradient-to-br from-gray-50 to-blue-50">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600 font-semibold">Loading...</p>
          </div>
        </div>
      );
    }

    // Not authenticated
    if (!isAuthenticated || !currentUser) {
      return <Navigate to="/" replace />;
    }

    // Admin-only route check
    if (adminOnly && currentUser.role !== "admin") {
      alert("⚠️ Access denied. Admin privileges required.");
      return <Navigate to="/" replace />;
    }

    // All checks passed
    return children;
  };

  // ✅ FIXED: Use useCallback to memoize checkAuth function
  const checkAuth = useCallback(async () => {
    if (clearInvalidTokens()) {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setLoading(false);
      return;
    }

    const token = localStorage.getItem("token");
    const user = localStorage.getItem("user");

    if (!token || !user) {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setLoading(false);
      return;
    }

    try {
      const userData = JSON.parse(user);
      setIsAuthenticated(true);
      setCurrentUser(userData);

      // Fetch real user data if needed
      if (
        userData.email === "loading@example.com" ||
        !userData.hasOwnProperty("isPhoneVerified")
      ) {
        try {
          const response = await userAPI.getProfile();
          if (response.data.success) {
            const updatedUser = response.data.data;
            localStorage.setItem("user", JSON.stringify(updatedUser));
            setCurrentUser(updatedUser);
          }
        } catch (err) {
          console.error("Error fetching user profile:", err);
          if (err.response?.status === 401) {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            setIsAuthenticated(false);
            setCurrentUser(null);
          }
        }
      }
    } catch (e) {
      console.error("Error parsing user data:", e);
      localStorage.clear();
      setIsAuthenticated(false);
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  }, []); // ✅ Empty dependency array - function doesn't depend on anything

  // Handle OAuth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");
    const error = urlParams.get("error");

    // ⚠️ Skip if this is phone verification page
    if (window.location.pathname === "/verify-phone") {
      setLoading(false);
      return;
    }

    // Handle OAuth token
    if (token) {
      if (localStorage.getItem("processingToken")) {
        return;
      }

      localStorage.setItem("processingToken", "true");
      localStorage.setItem("token", token);

      const basicUser = {
        id: "temp-" + Date.now(),
        email: "loading@example.com",
        firstName: "Loading",
        lastName: "...",
        role: "renter",
      };

      localStorage.setItem("user", JSON.stringify(basicUser));
      localStorage.removeItem("processingToken");

      window.history.replaceState({}, "", "/");
      window.location.href = "/";
      return;
    }

    if (error) {
      alert("Authentication failed. Please try again.");
      window.history.replaceState({}, "", "/");
    }

    // ✅ Call checkAuth only once on mount
    checkAuth();
  }, [checkAuth]); // ✅ checkAuth is now memoized, won't change

  const handleLoginSuccess = (user) => {
    setIsAuthenticated(true);
    setCurrentUser(user);
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.clear();
    setIsAuthenticated(false);
    setCurrentUser(null);
  };

  // Show loading screen only when not on verification page
  if (loading && window.location.pathname !== "/verify-phone") {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-gray-50 to-blue-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-semibold">Loading AgriRent...</p>
        </div>
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <Routes>
        {/* ============= PUBLIC ROUTES ============= */}
        
        {/* Main Route - Auth or Dashboard based on authentication & role */}
        <Route
          path="/"
          element={
            isAuthenticated ? (
              // If admin, redirect to admin dashboard, otherwise user dashboard
              currentUser?.role === "admin" ? (
                <Navigate to="/admin/dashboard" replace />
              ) : (
                <Dashboard user={currentUser} onLogout={handleLogout} />
              )
            ) : (
              <Auth onLoginSuccess={handleLoginSuccess} />
            )
          }
        />

        {/* Authentication Pages */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-phone" element={<PhoneVerificationPage />} />

        {/* ============= USER PROTECTED ROUTES ============= */}
        
        {/* User Dashboard - For owners and renters */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard user={currentUser} onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />

        {/* Payment Success Page */}
        <Route
          path="/rentals/:rentalId/success"
          element={
            <ProtectedRoute>
              <PaymentSuccess />
            </ProtectedRoute>
          }
        />

        {/* ============= ADMIN ONLY ROUTES ============= */}
        
        {/* Admin Main Dashboard */}
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute adminOnly={true}>
              <AdminDashboard user={currentUser} onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />

        {/* Admin Escrow Management */}
        <Route
          path="/admin/escrow"
          element={
            <ProtectedRoute adminOnly={true}>
              <AdminEscrowDashboard user={currentUser} onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />

        {/* Admin Root - Redirect to dashboard */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute adminOnly={true}>
              <Navigate to="/admin/dashboard" replace />
            </ProtectedRoute>
          }
        />

        {/* ============= FALLBACK ROUTES ============= */}
        
        {/* Catch all - redirect to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Elements>
  );
}

export default App;