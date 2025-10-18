import React, { useState, useRef } from "react";
import { Mail, Lock, Phone, AlertCircle } from "lucide-react";
import { authAPI } from "../services/api";
import { Link } from "react-router-dom";

export default function Auth({ onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [phoneError, setPhoneError] = useState("");

  // Use refs instead of state - NO RE-RENDERS!
  const firstNameRef = useRef(null);
  const lastNameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const phoneRef = useRef(null);
  const roleRef = useRef(null);

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
            email: emailRef.current.value,
            password: passwordRef.current.value,
          }
        : {
            firstName: firstNameRef.current.value,
            lastName: lastNameRef.current.value,
            email: emailRef.current.value,
            password: passwordRef.current.value,
            phone: phoneRef.current.value,
            role: roleRef.current.value,
          };

      const response = isLogin
        ? await authAPI.login(formData)
        : await authAPI.register(formData);

      if (response.data.success) {
        if (isLogin) {
          localStorage.setItem("token", response.data.token);
          localStorage.setItem("user", JSON.stringify(response.data.user));

          if (response.data.requiresVerification && !response.data.user.isPhoneVerified) {
            window.location.href = `/verify-phone?email=${encodeURIComponent(formData.email)}&phone=${encodeURIComponent(response.data.user.phone)}`;
          } else {
            onLoginSuccess(response.data.user);
          }
        } else {
          localStorage.setItem("token", response.data.token);
          localStorage.setItem("user", JSON.stringify(response.data.user));
          
          if (response.data.user.isPhoneVerified) {
            onLoginSuccess(response.data.user);
          } else {
            window.location.href = `/verify-phone?email=${encodeURIComponent(formData.email)}&phone=${encodeURIComponent(formData.phone)}`;
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
    window.location.href = "http://localhost:3001/api/auth/google";
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    setError("");
    setPhoneError("");
    
    if (firstNameRef.current) firstNameRef.current.value = "";
    if (lastNameRef.current) lastNameRef.current.value = "";
    if (emailRef.current) emailRef.current.value = "";
    if (passwordRef.current) passwordRef.current.value = "";
    if (phoneRef.current) phoneRef.current.value = "";
    if (roleRef.current) roleRef.current.value = "renter";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8">
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
          {!isLogin && (
            <>
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

              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-700">
                  Phone Number *
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
                    placeholder="+16472377070"
                    className={`w-full border-2 rounded-xl pl-12 pr-4 py-3 focus:outline-none transition ${
                      phoneError
                        ? "border-rose-500 focus:border-rose-500"
                        : "border-gray-200 focus:border-indigo-500"
                    }`}
                  />
                </div>
                {phoneError && (
                  <p className="text-rose-500 text-xs mt-1 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {phoneError}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-700">
                  I am a: *
                </label>
                <select
                  ref={roleRef}
                  required
                  defaultValue="renter"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-indigo-500 focus:outline-none transition"
                >
                  <option value="renter">Renter (looking for equipment)</option>
                  <option value="owner">Owner (renting out equipment)</option>
                  <option value="both">Both</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-700">
              Email *
            </label>
            <div className="relative">
              <Mail
                className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"
                size={20}
              />
              <input
                ref={emailRef}
                type="email"
                required
                className="w-full border-2 border-gray-200 rounded-xl pl-12 pr-4 py-3 focus:border-indigo-500 focus:outline-none transition"
                placeholder="your@email.com"
              />
            </div>
          </div>

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
          className="w-full border-2 border-gray-200 py-3 rounded-xl font-semibold hover:bg-gray-50 transition flex items-center justify-center gap-3"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google
        </button>

        {isLogin && (
          <div className="mt-4 text-center">
            <Link to="/forgot-password" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
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