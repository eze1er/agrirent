import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import Auth from './components/Auth';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AdminEscrowDashboard from './components/AdminEscrowDashboard';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true); // ✅ Add loading state

  // Handle OAuth callback token
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const error = urlParams.get('error');
    
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
  }, []);

  // Check authentication
  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (token && user) {
      try {
        const userData = JSON.parse(user);
        setIsAuthenticated(true);
        setCurrentUser(userData);
        
        // Fetch real user data if temp user
        if (userData.email === 'loading@example.com') {
          fetch('http://localhost:3001/api/users/me', {
            headers: { 'Authorization': `Bearer ${token}` }
          })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              localStorage.setItem('user', JSON.stringify(data.data));
              setCurrentUser(data.data);
            }
          })
          .catch(err => console.error('Error fetching user:', err))
          .finally(() => setLoading(false)); // ✅ Set loading false after fetch
        } else {
          setLoading(false); // ✅ Set loading false if no fetch needed
        }
      } catch (e) {
        localStorage.clear();
        setLoading(false); // ✅ Set loading false on error
      }
    } else {
      setLoading(false); // ✅ Set loading false if no token
    }
  }, []);

  const handleLoginSuccess = (user) => {
    setIsAuthenticated(true);
    setCurrentUser(user);
    setLoading(false); // ✅ Ensure loading is false after login
  };

  const handleLogout = () => {
    localStorage.clear();
    setIsAuthenticated(false);
    setCurrentUser(null);
  };

  // ✅ Show loading screen while checking authentication
  if (loading) {
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
      
      {/* ✅ Admin Escrow Dashboard Route - Protected */}
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