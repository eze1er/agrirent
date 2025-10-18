window.addEventListener('beforeunload', (e) => {
  console.trace('🔴 PAGE RELOAD DETECTED - Stack trace:');
  debugger; // This will pause execution
});
import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import Auth from './components/Auth';
import TestForm from './components/TestForm';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AdminEscrowDashboard from './components/AdminEscrowDashboard';
import PhoneVerificationPage from './pages/PhoneVerificationPage'; 
import { userAPI } from './services/api';

// Clear invalid tokens
const clearInvalidTokens = () => {
  const token = localStorage.getItem('token');
  if (token) {
    const tokenParts = token.split('.');
    if (token.length < 10 || tokenParts.length !== 3) {
      console.log('🔄 Clearing malformed token');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      return true;
    }
  }
  return false;
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Handle OAuth callback only
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const error = urlParams.get('error');
    
    // ⚠️ Skip if this is phone verification page
    if (window.location.pathname === '/verify-phone') {
      setLoading(false);
      return;
    }
    
    // Handle OAuth token
    if (token) {
      if (localStorage.getItem('processingToken')) {
        return;
      }
      
      localStorage.setItem('processingToken', 'true');
      localStorage.setItem('token', token);
      
      const basicUser = {
        id: 'temp-' + Date.now(),
        email: 'loading@example.com',
        firstName: 'Loading',
        lastName: '...',
        role: 'renter'
      };
      
      localStorage.setItem('user', JSON.stringify(basicUser));
      localStorage.removeItem('processingToken');
      
      window.history.replaceState({}, '', '/');
      window.location.href = '/';
      return;
    }
    
    if (error) {
      alert('Authentication failed. Please try again.');
      window.history.replaceState({}, '', '/');
    }
    
    checkAuth();
  }, []);

  // Check authentication
  const checkAuth = async () => {
    if (clearInvalidTokens()) {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setLoading(false);
      return;
    }

    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
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
      if (userData.email === 'loading@example.com' || !userData.hasOwnProperty('isPhoneVerified')) {
        try {
          const response = await userAPI.getProfile();
          if (response.data.success) {
            const updatedUser = response.data.data;
            localStorage.setItem('user', JSON.stringify(updatedUser));
            setCurrentUser(updatedUser);
          }
        } catch (err) {
          console.error('Error fetching user profile:', err);
          if (err.response?.status === 401) {
            console.log('🔄 Invalid token detected, clearing storage');
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setIsAuthenticated(false);
            setCurrentUser(null);
          }
        }
      }
    } catch (e) {
      console.error('Error parsing user data:', e);
      localStorage.clear();
      setIsAuthenticated(false);
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  };

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
  if (loading && window.location.pathname !== '/verify-phone') {
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
    <Routes>
      <Route 
        path="/" 
        element={
          isAuthenticated ? (
            <Dashboard user={currentUser} onLogout={handleLogout} />
          ) : (
            <Auth onLoginSuccess={handleLoginSuccess} />
          )
        } 
      />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      
      {/* ✅ Phone Verification Route - PUBLIC */}
      <Route path="/verify-phone" element={<PhoneVerificationPage />} />
      
      {/* Admin Escrow Dashboard - Protected */}
      <Route 
        path="/admin/escrow" 
        element={
          isAuthenticated && currentUser?.role === 'admin' ? (
            <AdminEscrowDashboard user={currentUser} onLogout={handleLogout} />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      
      <Route path="*" element={<Navigate to="/" replace />} />
      
    </Routes>
  );
}

export default App;