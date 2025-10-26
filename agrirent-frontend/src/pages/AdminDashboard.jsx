// src/pages/AdminDashboard.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Tractor, 
  Calendar, 
  DollarSign, 
  Clock, 
  CheckCircle,
  AlertCircle,
  Phone,
  Mail,
  Download,
  Search,
  LogOut,
  Shield,
  Menu,
  X,
  User  // ✅ ADDED: User icon for user display
} from 'lucide-react';

export default function AdminDashboard({ user, onLogout }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [activeRentals, setActiveRentals] = useState([]);
  const [pendingRentals, setPendingRentals] = useState([]);
  const [allRentals, setAllRentals] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // ✅ FIXED: Base API URL without the specific endpoints
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  useEffect(() => {
    // Verify admin access
    if (user?.role !== 'admin') {
      alert('⚠️ Access denied. Admin privileges required.');
      navigate('/');
      return;
    }
    fetchDashboardData();
  }, [user, navigate]);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // ✅ FIXED: Correct API endpoints
      const [overviewRes, activeRes, pendingRes] = await Promise.all([
        fetch(`${API_BASE}/admin/dashboard/overview`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API_BASE}/admin/rentals/active`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API_BASE}/admin/rentals/pending`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      const overview = await overviewRes.json();
      const active = await activeRes.json();
      const pending = await pendingRes.json();

      if (overview.success) setStats(overview.data);
      if (active.success) setActiveRentals(active.data);
      if (pending.success) setPendingRentals(pending.data);

      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      alert('Failed to load admin dashboard data. Please refresh the page.');
      setLoading(false);
    }
  };

  const fetchAllRentals = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_BASE}/admin/rentals/all?status=${selectedStatus}&search=${searchTerm}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      const data = await response.json();
      if (data.success) {
        setAllRentals(data.data.rentals);
      }
    } catch (error) {
      console.error('Error fetching rentals:', error);
    }
  };

  const fetchAllUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_BASE}/admin/users/all?search=${searchTerm}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      const data = await response.json();
      if (data.success) {
        setUsers(data.data.users);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const exportRentals = async (format = 'csv') => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_BASE}/admin/export/rentals?format=${format}&status=${selectedStatus}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (format === 'csv') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rentals-${Date.now()}.csv`;
        a.click();
      } else {
        const data = await response.json();
        console.log('Exported data:', data);
      }
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'rentals') {
      fetchAllRentals();
    } else if (activeTab === 'users') {
      fetchAllUsers();
    }
  }, [activeTab, searchTerm, selectedStatus]);

  const handleLogoutClick = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      onLogout();
      navigate('/');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-gray-50 to-blue-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-semibold">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Admin Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 text-white shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield size={32} className="text-white" />
              <div>
                <h1 className="text-2xl font-bold">AgriRent Admin</h1>
                <p className="text-sm text-blue-100">System Management Dashboard</p>
              </div>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-4">
              <button
                onClick={() => navigate('/admin/escrow')}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition font-semibold"
              >
                💰 Escrow Management
              </button>
              <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-lg">
                <User size={20} />
                <span className="font-semibold">{user?.email}</span>
              </div>
              <button
                onClick={handleLogoutClick}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg transition font-semibold"
              >
                <LogOut size={20} />
                Logout
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button 
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="md:hidden p-2 hover:bg-white/10 rounded-lg transition"
            >
              {showMobileMenu ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          {/* Mobile Menu */}
          {showMobileMenu && (
            <div className="md:hidden mt-4 pb-4 space-y-2">
              <button
                onClick={() => {
                  navigate('/admin/escrow');
                  setShowMobileMenu(false);
                }}
                className="w-full px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition font-semibold text-left"
              >
                💰 Escrow Management
              </button>
              <div className="px-4 py-2 bg-white/10 rounded-lg">
                <span className="text-sm">{user?.email}</span>
              </div>
              <button
                onClick={handleLogoutClick}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg transition font-semibold"
              >
                <LogOut size={20} />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation Tabs */}
        <div className="bg-white rounded-xl shadow-sm mb-6">
          <div className="flex overflow-x-auto border-b">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-6 py-4 font-semibold transition whitespace-nowrap ${
                activeTab === 'overview'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('rentals')}
              className={`px-6 py-4 font-semibold transition whitespace-nowrap ${
                activeTab === 'rentals'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All Rentals
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`px-6 py-4 font-semibold transition whitespace-nowrap ${
                activeTab === 'users'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Users
            </button>
          </div>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <StatCard
                icon={<Users className="text-blue-600" size={32} />}
                title="Total Users"
                value={stats?.users?.total || 0}
                subtitle={`${stats?.users?.owners || 0} owners, ${stats?.users?.renters || 0} renters`}
                bgColor="bg-blue-50"
              />
              <StatCard
                icon={<Tractor className="text-green-600" size={32} />}
                title="Total Machines"
                value={stats?.machines?.total || 0}
                subtitle={`${stats?.machines?.available || 0} available`}
                bgColor="bg-green-50"
              />
              <StatCard
                icon={<Calendar className="text-purple-600" size={32} />}
                title="Active Rentals"
                value={stats?.rentals?.active || 0}
                subtitle={`${stats?.rentals?.pending || 0} pending`}
                bgColor="bg-purple-50"
              />
              <StatCard
                icon={<DollarSign className="text-amber-600" size={32} />}
                title="Total Revenue"
                value={`$${stats?.revenue?.total?.toFixed(2) || '0.00'}`}
                subtitle={`$${stats?.revenue?.escrow?.toFixed(2) || '0.00'} in escrow`}
                bgColor="bg-amber-50"
              />
            </div>

            {/* Pending Rentals */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Pending Approvals</h2>
                <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-semibold">
                  {pendingRentals.length} pending
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pendingRentals.length > 0 ? (
                  pendingRentals.map((rental) => (
                    <RentalCard key={rental._id} rental={rental} />
                  ))
                ) : (
                  <div className="col-span-full text-center py-12 bg-white rounded-xl">
                    <CheckCircle className="mx-auto text-green-600 mb-3" size={48} />
                    <p className="text-gray-600 font-semibold">All caught up! No pending approvals.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Active Rentals */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Active Rentals</h2>
                <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
                  {activeRentals.length} active
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeRentals.length > 0 ? (
                  activeRentals.map((rental) => (
                    <RentalCard key={rental._id} rental={rental} />
                  ))
                ) : (
                  <div className="col-span-full text-center py-12 bg-white rounded-xl">
                    <Calendar className="mx-auto text-gray-400 mb-3" size={48} />
                    <p className="text-gray-600 font-semibold">No active rentals at the moment.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Rentals Tab */}
        {activeTab === 'rentals' && (
          <div>
            {/* Filters and Export */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="text"
                    placeholder="Search by machine, renter, or owner..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <button
                  onClick={() => exportRentals('csv')}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
                >
                  <Download size={20} />
                  Export CSV
                </button>
              </div>
            </div>

            {/* Rentals Table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Machine</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Renter</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Owner</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {allRentals.length > 0 ? (
                      allRentals.map((rental) => (
                        <tr key={rental._id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-gray-900">{rental.machineId?.name}</div>
                            <div className="text-sm text-gray-500">{rental.machineId?.category}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-gray-900">
                              {rental.renterId?.firstName} {rental.renterId?.lastName}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <Mail size={14} />
                              {rental.renterId?.email}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <Phone size={14} />
                              {rental.renterId?.phoneNumber}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-gray-900">
                              {rental.ownerId?.firstName} {rental.ownerId?.lastName}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <Mail size={14} />
                              {rental.ownerId?.email}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <Phone size={14} />
                              {rental.ownerId?.phoneNumber}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <StatusBadge status={rental.status} />
                          </td>
                          <td className="px-6 py-4 font-semibold text-gray-900">
                            ${rental.pricing?.totalPrice?.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {new Date(rental.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="px-6 py-12 text-center">
                          <p className="text-gray-500">No rentals found</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div>
            {/* Search */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Search users by name, email, or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Users Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {users.length > 0 ? (
                users.map((user) => (
                  <UserCard key={user._id} user={user} />
                ))
              ) : (
                <div className="col-span-full text-center py-12 bg-white rounded-xl">
                  <Users className="mx-auto text-gray-400 mb-3" size={48} />
                  <p className="text-gray-600 font-semibold">No users found</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({ icon, title, value, subtitle, bgColor }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition">
      <div className="flex items-center gap-4">
        <div className={`${bgColor} p-3 rounded-lg`}>
          {icon}
        </div>
        <div className="flex-1">
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

// Rental Card Component
function RentalCard({ rental }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-lg transition">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-bold text-gray-900">{rental.machineId?.name}</h3>
          <p className="text-sm text-gray-500">{rental.machineId?.category}</p>
        </div>
        <StatusBadge status={rental.status} />
      </div>
      
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-600 font-semibold mb-1">Renter:</p>
          <p className="text-gray-900">
            {rental.renterId?.firstName} {rental.renterId?.lastName}
          </p>
          <div className="flex items-center gap-1 text-gray-500 mt-1">
            <Mail size={12} />
            <span className="text-xs truncate">{rental.renterId?.email}</span>
          </div>
          <div className="flex items-center gap-1 text-gray-500 mt-1">
            <Phone size={12} />
            <span className="text-xs">{rental.renterId?.phoneNumber}</span>
          </div>
        </div>
        
        <div>
          <p className="text-gray-600 font-semibold mb-1">Owner:</p>
          <p className="text-gray-900">
            {rental.ownerId?.firstName} {rental.ownerId?.lastName}
          </p>
          <div className="flex items-center gap-1 text-gray-500 mt-1">
            <Mail size={12} />
            <span className="text-xs truncate">{rental.ownerId?.email}</span>
          </div>
          <div className="flex items-center gap-1 text-gray-500 mt-1">
            <Phone size={12} />
            <span className="text-xs">{rental.ownerId?.phoneNumber}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t flex justify-between items-center">
        <span className="text-lg font-bold text-blue-600">
          ${rental.pricing?.totalPrice?.toFixed(2)}
        </span>
        {rental.daysRemaining !== undefined && (
          <span className={`text-sm ${rental.isOverdue ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
            {rental.isOverdue ? 'Overdue!' : `${rental.daysRemaining} days left`}
          </span>
        )}
      </div>
    </div>
  );
}

// User Card Component
function UserCard({ user }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-bold text-xl">
          {user.firstName?.[0]}{user.lastName?.[0]}
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-gray-900">
            {user.firstName} {user.lastName}
          </h3>
          <span className={`inline-block px-2 py-1 text-xs font-semibold rounded mt-1 ${
            user.role === 'admin' 
              ? 'bg-purple-100 text-purple-800'
              : user.role === 'owner'
              ? 'bg-blue-100 text-blue-800'
              : 'bg-green-100 text-green-800'
          }`}>
            {user.role}
          </span>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-gray-600">
          <Mail size={16} />
          <span className="truncate">{user.email}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-600">
          <Phone size={16} />
          <span>{user.phoneNumber || 'N/A'}</span>
        </div>
      </div>

      {user.stats && (
        <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xl font-bold text-gray-900">{user.stats.totalRentalsAsRenter}</div>
            <div className="text-xs text-gray-500">Rentals</div>
          </div>
          <div>
            <div className="text-xl font-bold text-gray-900">{user.stats.totalRentalsAsOwner}</div>
            <div className="text-xs text-gray-500">As Owner</div>
          </div>
          <div>
            <div className="text-xl font-bold text-gray-900">{user.stats.activeMachines}</div>
            <div className="text-xs text-gray-500">Machines</div>
          </div>
        </div>
      )}
    </div>
  );
}

// Status Badge Component
function StatusBadge({ status }) {
  const styles = {
    pending: 'bg-amber-100 text-amber-800',
    approved: 'bg-blue-100 text-blue-800',
    active: 'bg-green-100 text-green-800',
    completed: 'bg-gray-100 text-gray-800',
    cancelled: 'bg-red-100 text-red-800',
    disputed: 'bg-orange-100 text-orange-800'
  };

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}