import React, { useState, useRef, useEffect } from "react";
import { Mail, Lock, Phone, AlertCircle, User, Wallet } from "lucide-react";
import { authAPI } from "../services/api";
import { Link } from "react-router-dom";

export default function Auth({ onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [selectedRole, setSelectedRole] = useState("renter"); // ✅ NEW: Track selected role

  const firstNameRef = useRef(null);
  const lastNameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const phoneRef = useRef(null);
  const roleRef = useRef(null);
  const usernameRef = useRef(null);

  // ✅ NEW: Mobile Money refs
  const mobileMoneyProviderRef = useRef(null);
  const mobileMoneyNumberRef = useRef(null);
  const mobileMoneyNameRef = useRef(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");
    const userParam = urlParams.get("user");
    const error = urlParams.get("error");
    const email = urlParams.get("email");

    if (error) {
      console.log("❌ Auth error:", error);

      if (error === "user_not_found") {
        setError(
          `Email "${email}" is not registered. Please create an account first.`
        );
      } else if (error === "auth_failed") {
        setError("Google authentication failed. Please try again.");
      } else {
        setError("Authentication failed. Please try again.");
      }

      window.history.replaceState({}, document.title, window.location.pathname);
      setLoading(false);
      return;
    }

    if (token && userParam) {
      console.log("✅ Google login successful");
      try {
        const user = JSON.parse(decodeURIComponent(userParam));
        localStorage.setItem("token", token);
        localStorage.setItem("user", JSON.stringify(user));
        onLoginSuccess(user);
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
      } catch (err) {
        console.error("Error parsing user data:", err);
        setError("Error processing login. Please try again.");
      }
      return;
    }
  }, []);

  const handlePhoneInput = (e) => {
    let value = e.target.value.replace(/[^\d+]/g, "");

    if (value && !value.startsWith("+")) {
      value = "+" + value;
    }

    if (value.length > 16) {
      value = value.slice(0, 16);
    }

    e.target.value = value;

    if (value && value.length < 10) {
      setPhoneError("Phone number is too short");
    } else if (value && !/^\+\d{10,15}$/.test(value)) {
      setPhoneError("Please enter a valid phone number");
    } else {
      setPhoneError("");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setPhoneError("");

    try {
      const formData = isLogin
        ? {
            email: emailRef.current.value, // This now accepts email OR username
            password: passwordRef.current.value,
          }
        : {
            firstName: firstNameRef.current.value,
            lastName: lastNameRef.current.value,
            email: emailRef.current.value,
            username: usernameRef.current.value, // ✅ ADD username for registration
            password: passwordRef.current.value,
            phone: phoneRef.current.value,
            role: roleRef.current.value,
          };

      // ✅ Add mobile money info if user is owner or both
      if (
        !isLogin &&
        (roleRef.current.value === "owner" || roleRef.current.value === "both")
      ) {
        if (mobileMoneyProviderRef.current?.value) {
          formData.mobileMoneyInfo = {
            provider: mobileMoneyProviderRef.current.value,
            accountNumber: mobileMoneyNumberRef.current.value,
            accountName: mobileMoneyNameRef.current.value,
          };
        }
      }

      const response = isLogin
        ? await authAPI.login(formData)
        : await authAPI.register(formData);

      if (response.data.success) {
        if (isLogin) {
          localStorage.setItem("token", response.data.token);
          localStorage.setItem("user", JSON.stringify(response.data.user));

          if (
            response.data.requiresVerification &&
            !response.data.user.isPhoneVerified
          ) {
            window.location.href = `/verify-phone?email=${encodeURIComponent(
              formData.email
            )}&phone=${encodeURIComponent(response.data.user.phone)}`;
          } else {
            onLoginSuccess(response.data.user);
          }
        } else {
          localStorage.setItem("token", response.data.token);
          localStorage.setItem("user", JSON.stringify(response.data.user));

          if (response.data.user.isPhoneVerified) {
            onLoginSuccess(response.data.user);
          } else {
            window.location.href = `/verify-phone?email=${encodeURIComponent(
              formData.email
            )}&phone=${encodeURIComponent(formData.phone)}`;
          }
        }
      } else {
        setError(response.data.message || "Authentication failed");
        setLoading(false);
      }
    } catch (err) {
      console.error("Auth error:", err);
      setError(
        err.response?.data?.message ||
          "Connection error. Make sure backend is running on port 3001"
      );
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    setLoading(true);
    window.location.href = "http://localhost:3001/api/auth/google";
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    setError("");
    setPhoneError("");
    setSelectedRole("renter");

    if (firstNameRef.current) firstNameRef.current.value = "";
    if (lastNameRef.current) lastNameRef.current.value = "";
    if (emailRef.current) emailRef.current.value = "";
    if (usernameRef.current) usernameRef.current.value = "";
    if (passwordRef.current) passwordRef.current.value = "";
    if (phoneRef.current) phoneRef.current.value = "";
    if (roleRef.current) roleRef.current.value = "renter";
    if (mobileMoneyProviderRef.current)
      mobileMoneyProviderRef.current.value = "";
    if (mobileMoneyNumberRef.current) mobileMoneyNumberRef.current.value = "";
    if (mobileMoneyNameRef.current) mobileMoneyNameRef.current.value = "";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 max-h-[95vh] overflow-y-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
            AgriRent
          </h1>
          <p className="text-gray-600">Location d'équipement Agricole</p>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => {
              setIsLogin(true);
              setError("");
              setPhoneError("");
            }}
            className={`flex-1 py-3 rounded-xl font-semibold transition ${
              isLogin
                ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => {
              setIsLogin(false);
              setError("");
              setPhoneError("");
            }}
            className={`flex-1 py-3 rounded-xl font-semibold transition ${
              !isLogin
                ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            Register
          </button>
        </div>

        {error && (
          <div className="bg-rose-100 border border-rose-300 text-rose-700 px-4 py-3 rounded-xl mb-4 flex items-start gap-2">
            <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
            <span className="text-sm">{error}</span>
          </div>
        )}

<form onSubmit={handleSubmit} className="space-y-4">
  {/* ===== REGISTRATION ONLY FIELDS ===== */}
  {!isLogin && (
    <>
      {/* First Name & Last Name */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold mb-2 text-gray-700">
            First Name *
          </label>
          <input
            ref={firstNameRef}
            type="text"
            required
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-indigo-500 focus:outline-none transition"
            placeholder="John"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-2 text-gray-700">
            Last Name *
          </label>
          <input
            ref={lastNameRef}
            type="text"
            required
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-indigo-500 focus:outline-none transition"
            placeholder="Doe"
          />
        </div>
      </div>

      {/* Phone Number */}
      <div>
        <label className="block text-sm font-semibold mb-2 text-gray-700">
          Phone Number (International Format) *
        </label>
        <div className="relative">
          <Phone
            className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"
            size={20}
          />
          <input
            ref={phoneRef}
            type="tel"
            onInput={handlePhoneInput}
            required
            placeholder="+243812345678 or +16472377070"
            className={`w-full border-2 rounded-xl pl-12 pr-4 py-3 focus:outline-none transition ${
              phoneError
                ? "border-rose-500 focus:border-rose-500"
                : "border-gray-200 focus:border-indigo-500"
            }`}
          />
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Examples: +243... (DRC), +1... (US/Canada), +33... (France)
        </p>
        {phoneError && (
          <p className="text-rose-500 text-xs mt-1 flex items-center gap-1">
            <AlertCircle size={12} />
            {phoneError}
          </p>
        )}
      </div>

      {/* Role */}
      <div>
        <label className="block text-sm font-semibold mb-2 text-gray-700">
          I am a: *
        </label>
        <select
          ref={roleRef}
          required
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-indigo-500 focus:outline-none transition"
        >
          <option value="renter">Renter (looking for equipment)</option>
          <option value="owner">Owner (renting out equipment)</option>
          <option value="both">Both</option>
        </select>
      </div>

      {/* Mobile Money - Only for owners */}
      {(selectedRole === 'owner' || selectedRole === 'both') && (
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="text-emerald-600" size={20} />
            <h3 className="font-semibold text-gray-800">Payment Information</h3>
          </div>
          <p className="text-xs text-gray-600 mb-3">
            We'll use this to send your rental earnings
          </p>

          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-700">
              Mobile Money Provider *
            </label>
            <select
              ref={mobileMoneyProviderRef}
              required
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-emerald-500 focus:outline-none transition"
            >
              <option value="">Select provider</option>
              <option value="mtn">MTN Mobile Money</option>
              <option value="orange">Orange Money</option>
              <option value="moov">Moov Money</option>
              <option value="airtel">Airtel Money</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-700">
              Mobile Money Number *
            </label>
            <input
              ref={mobileMoneyNumberRef}
              type="tel"
              required
              placeholder="+237123456789"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-emerald-500 focus:outline-none transition"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-700">
              Account Name *
            </label>
            <input
              ref={mobileMoneyNameRef}
              type="text"
              required
              placeholder="Full name on account"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-emerald-500 focus:outline-none transition"
            />
          </div>
        </div>
      )}

      {/* Email - OPTIONAL for registration */}
      <div>
        <label className="block text-sm font-semibold mb-2 text-gray-700">
          Email (optional)
        </label>
        <div className="relative">
          <Mail
            className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"
            size={20}
          />
          <input
            ref={emailRef}
            type="email"
            autoComplete="off"
            className="w-full border-2 border-gray-200 rounded-xl pl-12 pr-4 py-3 focus:border-indigo-500 focus:outline-none transition"
            placeholder="your@email.com (optional)"
          />
        </div>
      </div>

      {/* Username - OPTIONAL for registration */}
      <div>
        <label className="block text-sm font-semibold mb-2 text-gray-700">
          Username (optional)
        </label>
        <div className="relative">
          <User
            className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"
            size={20}
          />
          <input
            ref={usernameRef}
            type="text"
            autoComplete="off"
            minLength={3}
            maxLength={30}
            pattern="[a-zA-Z0-9_-]+"
            className="w-full border-2 border-gray-200 rounded-xl pl-12 pr-4 py-3 focus:border-indigo-500 focus:outline-none transition"
            placeholder="johndoe123 (optional)"
          />
        </div>
        <p className="text-xs text-gray-500 mt-1">
          3-30 characters, letters, numbers, _ and - only
        </p>
      </div>

      {/* Registration Info Message */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
        <p className="text-xs text-blue-800">
          💡 Provide at least email or username to create your account
        </p>
      </div>
    </>
  )}

  {/* ===== LOGIN ONLY FIELDS ===== */}
  {isLogin && (
    <>
      <div>
        <label className="block text-sm font-semibold mb-2 text-gray-700">
          Email or Username *
        </label>
        <div className="relative">
          <Mail
            className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"
            size={20}
          />
          <input
            ref={emailRef}
            type="text"
            autoComplete="off"
            required
            className="w-full border-2 border-gray-200 rounded-xl pl-12 pr-4 py-3 focus:border-indigo-500 focus:outline-none transition"
            placeholder="email@example.com or username"
          />
        </div>
      </div>

      {/* Login Info Message */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-3">
        <p className="text-xs text-green-800">
          💡 You can login with either your email or username
        </p>
      </div>
    </>
  )}

  {/* ===== PASSWORD - SHOW FOR BOTH ===== */}
  <div>
    <label className="block text-sm font-semibold mb-2 text-gray-700">
      Password *
    </label>
    <div className="relative">
      <Lock
        className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"
        size={20}
      />
      <input
        ref={passwordRef}
        type="password"
        required
        minLength={6}
        className="w-full border-2 border-gray-200 rounded-xl pl-12 pr-4 py-3 focus:border-indigo-500 focus:outline-none transition"
        placeholder="••••••••"
      />
    </div>
    {!isLogin && (
      <p className="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
    )}
  </div>

  {/* Submit Button */}
  <button
    type="submit"
    disabled={loading || phoneError}
    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 rounded-xl font-bold hover:shadow-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {loading ? (
      <span className="flex items-center justify-center gap-2">
        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        Processing...
      </span>
    ) : isLogin ? (
      "Sign In"
    ) : (
      "Create Account"
    )}
  </button>
</form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-white text-gray-500">
              Or continue with
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full border-2 border-gray-200 py-3 rounded-xl font-semibold hover:bg-gray-50 transition flex items-center justify-center gap-3 disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Sign in with Google
        </button>

        {isLogin && (
          <div className="mt-4 text-center">
            <Link
              to="/forgot-password"
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Forgot password?
            </Link>
          </div>
        )}

        <div className="mt-6 text-center text-sm text-gray-600">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button
            type="button"
            onClick={switchMode}
            className="text-indigo-600 font-semibold hover:text-indigo-700"
          >
            {isLogin ? "Sign up" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
