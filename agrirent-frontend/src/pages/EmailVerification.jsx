import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { authAPI } from '../services/api';

export default function EmailVerification() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [resending, setResending] = useState(false);

  useEffect(() => {
    processVerification();
  }, [searchParams]);

const processVerification = async () => {
  const verified = searchParams.get('verified');
  const error = searchParams.get('error');
  const userEmail = searchParams.get('email');
  const token = searchParams.get('token');
  const userId = searchParams.get('userId');

  console.log('📧 Verification params:', { verified, error, email: userEmail, hasToken: !!token });

  setEmail(userEmail || '');

  // ✅ SUCCESS: Email verified with token
  if (verified === 'true' && token && userEmail) {
    console.log('✅ Email verified successfully with token');
    
    setStatus('success');
    setMessage('✅ Email verified successfully! Loading your account...');
    
    // Store the token immediately
    localStorage.setItem('token', token);
    
    try {
      // ✅ CRITICAL FIX: Fetch real user data from backend before redirecting
      const response = await fetch('http://localhost:3001/api/users/profile', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const userData = await response.json();
        
        // Store real user data
        localStorage.setItem('user', JSON.stringify(userData.data));
        
        console.log('✅ Real user data loaded:', userData.data);
        
        setMessage('✅ Email verified! Redirecting to dashboard...');
        
        // Redirect to dashboard with real user data
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      } else {
        // Fallback: use basic data if profile fetch fails
        const basicUserData = {
          id: userId,
          email: userEmail,
          firstName: userEmail.split('@')[0], // Use email prefix as temporary name
          lastName: '',
          role: 'owner',
          isEmailVerified: true
        };
        
        localStorage.setItem('user', JSON.stringify(basicUserData));
        
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
      
      // Fallback: use basic data
      const basicUserData = {
        id: userId,
        email: userEmail,
        firstName: userEmail.split('@')[0],
        lastName: '',
        role: 'owner',
        isEmailVerified: true
      };
      
      localStorage.setItem('user', JSON.stringify(basicUserData));
      
      setTimeout(() => {
        window.location.href = '/';
      }, 1500);
    }
    
    return;
  }

  // ✅ SUCCESS: Email verified but no token (manual verification)
  if (verified === 'true' && userEmail) {
    setStatus('success');
    setMessage('✅ Email verified successfully! Please log in to continue.');
    
    // Clear any old sessions
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // Redirect to login with pre-filled email
    setTimeout(() => {
      navigate('/auth', { 
        state: { 
          email: userEmail,
          message: 'Email verified! Please log in.' 
        } 
      });
    }, 3000);
    return;
  }

  // ❌ ERROR: Verification failed
  if (verified === 'false') {
    setStatus('error');
    switch (error) {
      case 'invalid_token':
        setMessage('❌ Invalid or expired verification link. Please request a new one.');
        break;
      case 'server_error':
        setMessage('❌ Server error during verification. Please try again.');
        break;
      default:
        setMessage('❌ Verification failed. Please try again.');
    }
    return;
  }

  // ℹ️ INFO: User navigated here directly
  setStatus('info');
  setMessage('Please check your email for the verification link.');
};

  const handleResendVerification = async () => {
    if (!email) {
      setMessage('❌ No email address found. Please try registering again.');
      return;
    }

    setResending(true);
    try {
      const response = await authAPI.resendVerification({ email });
      
      if (response.data.success) {
        if (response.data.alreadyVerified) {
          setStatus('success');
          setMessage('✅ Your email is already verified! Please log in.');
          setTimeout(() => navigate('/auth', { state: { email } }), 2000);
        } else {
          setMessage('✅ New verification email sent! Please check your inbox.');
        }
      } else {
        setMessage('❌ ' + response.data.message);
      }
    } catch (err) {
      console.error('Resend error:', err);
      setMessage('❌ Failed to resend verification email. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const handleGoToLogin = () => {
    navigate('/auth', { state: { email } });
  };

  const handleGoToRegister = () => {
    navigate('/auth');
  };

  const handleForceDashboard = () => {
    // Force redirect to dashboard (useful if verification worked but UI is stuck)
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            {status === 'loading' && <Loader className="text-indigo-600 animate-spin" size={32} />}
            {status === 'success' && <CheckCircle className="text-green-600" size={32} />}
            {status === 'error' && <AlertCircle className="text-red-600" size={32} />}
            {status === 'info' && <Mail className="text-indigo-600" size={32} />}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {status === 'loading' && 'Verifying Email...'}
            {status === 'success' && 'Email Verified!'}
            {status === 'error' && 'Verification Failed'}
            {status === 'info' && 'Verify Your Email'}
          </h1>
          <p className="text-gray-600">
            {email && `for ${email}`}
          </p>
        </div>

        <div className="text-center mb-6">
          <p className={`text-sm ${
            status === 'success' ? 'text-green-700' :
            status === 'error' ? 'text-red-700' :
            'text-gray-700'
          }`}>
            {message}
          </p>
        </div>

        <div className="space-y-4">
          {status === 'error' && (
            <button
              onClick={handleResendVerification}
              disabled={resending || !email}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition disabled:opacity-50"
            >
              {resending ? 'Sending...' : 'Resend Verification Email'}
            </button>
          )}

          {status === 'success' && (
            <div className="space-y-3">
              <button
                onClick={handleForceDashboard}
                className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 transition"
              >
                Go to Dashboard
              </button>
              <button
                onClick={handleGoToLogin}
                className="w-full border-2 border-green-600 text-green-600 py-3 rounded-xl font-semibold hover:bg-green-50 transition"
              >
                Go to Login
              </button>
            </div>
          )}

          {(status === 'error' || status === 'info') && (
            <button
              onClick={handleGoToRegister}
              className="w-full border-2 border-gray-300 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-50 transition"
            >
              Back to Registration
            </button>
          )}

          {/* Debug button - remove in production */}
          {process.env.NODE_ENV === 'development' && (
            <button
              onClick={() => {
                localStorage.clear();
                alert('Storage cleared. Please refresh.');
              }}
              className="w-full bg-gray-500 text-white py-2 rounded-xl text-sm"
            >
              Clear Storage (Debug)
            </button>
          )}

          <div className="text-center text-sm text-gray-600">
            <p>Having trouble?</p>
            <p className="mt-1">
              Contact support at{' '}
              <a href="mailto:support@agrirent.com" className="text-indigo-600 hover:text-indigo-700">
                support@agrirent.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}