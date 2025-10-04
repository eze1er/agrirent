import React, { useState } from "react";
import { Mail, Lock, Phone, UserCircle, AlertCircle } from "lucide-react";
import { authAPI } from "../services/api";

export default function Auth({ onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    phoneNumber: "",
    role: "renter",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = isLogin
        ? await authAPI.login({
            email: formData.email,
            password: formData.password,
          })
        : await authAPI.register(formData);

      if (response.data.success) {
        localStorage.setItem("token", response.data.token);
        localStorage.setItem("user", JSON.stringify(response.data.user));
        onLoginSuccess(response.data.user);
      } else {
        setError(response.data.message || "Authentication failed");
      }
    } catch (err) {
      console.error("Auth error:", err);
      setError(
        err.response?.data?.message ||
          "Connection error. Make sure backend is running on port 3001"
      );
    } finally {
      setLoading(false);
    }
  };
  const handleGoogleLogin = () => {
    window.location.href = "http://localhost:3001/api/auth/google";
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError(""); // Clear error when user types
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
            AgriRent
          </h1>
          <p className="text-gray-600">Agricultural Equipment Rental</p>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => {
              setIsLogin(true);
              setError("");
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
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    required={!isLogin}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-indigo-500 focus:outline-none"
                    placeholder="John"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    required={!isLogin}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-indigo-500 focus:outline-none"
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-700">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleChange}
                  required={!isLogin}
                  placeholder="+1 (416) 555-0123"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-700">
                  I am a: *
                </label>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-indigo-500 focus:outline-none"
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
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                autoComplete="email"
                className="w-full border-2 border-gray-200 rounded-xl pl-12 pr-4 py-3 focus:border-indigo-500 focus:outline-none"
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
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={6}
                autoComplete={isLogin ? "current-password" : "new-password"}
                className="w-full border-2 border-gray-200 rounded-xl pl-12 pr-4 py-3 focus:border-indigo-500 focus:outline-none"
                placeholder="••••••••"
              />
            </div>
            {!isLogin && (
              <p className="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
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
            <button
              type="button"
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Forgot password?
            </button>
          </div>
        )}

        <div className="mt-6 text-center text-sm text-gray-600">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError("");
            }}
            className="text-indigo-600 font-semibold hover:text-indigo-700"
          >
            {isLogin ? "Sign up" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
