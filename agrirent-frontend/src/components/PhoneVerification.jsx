import React, { useState, useEffect, useRef } from 'react';
import { Phone, CheckCircle, AlertCircle, Loader, X } from 'lucide-react';
import { authAPI } from '../services/api';

export default function PhoneVerification({ userEmail, userPhone, onSuccess, onSkip }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [codeSent, setCodeSent] = useState(false);
  
  // ✅ Use ref to prevent duplicate sends
  const hasSentCode = useRef(false);

  // Auto-send code on component mount - WITH DUPLICATE PREVENTION
  useEffect(() => {
    if (!hasSentCode.current && !codeSent && userEmail && userPhone) {
      hasSentCode.current = true; // Mark as sent immediately
      handleSendCode();
    }
  }, [userEmail, userPhone]); // Only depend on email and phone

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendCode = async () => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await authAPI.sendSMSVerification({
        email: userEmail,
        phone: userPhone
      });

      if (response.data.success) {
        if (response.data.alreadyVerified) {
          setMessage('✅ Phone already verified!');
          setTimeout(() => onSuccess(), 2000);
        } else {
          setCodeSent(true);
          setMessage('✅ Verification code sent to ' + userPhone);
          setCountdown(60);
        }
      } else {
        setError(response.data.message);
        hasSentCode.current = false; // Reset on error
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send verification code');
      hasSentCode.current = false; // Reset on error
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (code.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await authAPI.verifySMSCode({
        email: userEmail,
        phone: userPhone,
        code
      });

      if (response.data.success) {
        setMessage('✅ Phone verified successfully!');
        
        if (response.data.token) {
          localStorage.setItem('token', response.data.token);
          localStorage.setItem('user', JSON.stringify(response.data.user));
        }
        
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      } else {
        setError(response.data.message);
        setCode('');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid verification code');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(value);
    setError('');
  };

  const handleClearCode = () => {
    setCode('');
    setError('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && code.length === 6) {
      handleVerifyCode();
    }
  };

  // ✅ Manual resend - reset the ref
  const handleManualResend = () => {
    hasSentCode.current = false;
    handleSendCode();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-500 via-teal-500 to-blue-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            {loading ? (
              <Loader className="text-green-600 animate-spin" size={32} />
            ) : (
              <Phone className="text-green-600" size={32} />
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Verify Your Phone Number
          </h1>
          <p className="text-gray-600">
            {userPhone}
          </p>
        </div>

        {message && (
          <div className="bg-green-100 border border-green-300 text-green-700 px-4 py-3 rounded-xl mb-4 flex items-start gap-2">
            <CheckCircle size={20} className="flex-shrink-0 mt-0.5" />
            <span className="text-sm">{message}</span>
          </div>
        )}

        {error && (
          <div className="bg-rose-100 border border-rose-300 text-rose-700 px-4 py-3 rounded-xl mb-4 flex items-start gap-2">
            <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <div className="space-y-4">
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-xl">
            <p className="text-sm text-blue-800">
              📱 A 6-digit verification code has been sent to your phone via SMS.
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-700">
              Enter 6-Digit Code
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={handleCodeChange}
                onKeyPress={handleKeyPress}
                placeholder="000000"
                maxLength={6}
                autoFocus
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 pr-12 text-center text-2xl font-mono tracking-widest focus:border-green-500 focus:outline-none transition"
              />
              {code.length > 0 && (
                <button
                  onClick={handleClearCode}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                  type="button"
                >
                  <X size={20} />
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1 text-center">
              You can edit or clear the code using backspace or the X button
            </p>
          </div>

          <button
            onClick={handleVerifyCode}
            disabled={loading || code.length !== 6}
            className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Verifying...' : 'Verify Code'}
          </button>

          <button
            onClick={handleManualResend}
            disabled={loading || countdown > 0}
            className="w-full border-2 border-gray-300 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-50 transition disabled:opacity-50"
          >
            {countdown > 0 ? `Resend Code (${countdown}s)` : 'Resend Code'}
          </button>

          {onSkip && (
            <button
              onClick={onSkip}
              className="w-full text-gray-600 py-2 rounded-xl font-medium hover:text-gray-800 transition"
            >
              Skip for Now
            </button>
          )}
        </div>

        <div className="mt-6 text-center text-xs text-gray-500">
          <p>Didn't receive the code? Check your phone or try resending.</p>
        </div>
      </div>
    </div>
  );
}