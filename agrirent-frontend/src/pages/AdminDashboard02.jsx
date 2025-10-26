import { useState, useEffect } from 'react';
import { DollarSign, Clock, CheckCircle, TrendingUp, AlertCircle, ArrowLeft } from 'lucide-react';

export default function AdminEscrowDashboard() {
  const [stats, setStats] = useState(null);
  const [pendingReleases, setPendingReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState(null);
  const [error, setError] = useState('');

  // Fetch dashboard stats
  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/payments/admin/dashboard-stats', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
      setError('Failed to load dashboard stats');
    }
  };

  // Fetch pending releases
  const fetchPendingReleases = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/payments/admin/pending-releases', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setPendingReleases(data.data);
      }
    } catch (error) {
      console.error('Error fetching pending releases:', error);
      setError('Failed to load pending releases');
    } finally {
      setLoading(false);
    }
  };

  // Release payment
  const handleRelease = async (paymentId) => {
    if (!confirm('Are you sure you want to release this payment to the owner?')) return;
    
    setReleasing(paymentId);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3001/api/payments/admin/release-payment/${paymentId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          adminNote: 'Payment released by admin - service confirmed complete'
        })
      });
      
      const data = await response.json();
      if (data.success) {
        alert('✅ Payment released successfully!\n\nOwner will receive: $' + data.data.ownerPayout.toFixed(2) + '\nPlatform fee: $' + data.data.platformFee.toFixed(2));
        fetchStats();
        fetchPendingReleases();
      } else {
        alert('❌ Error: ' + data.message);
      }
    } catch (error) {
      console.error('Error releasing payment:', error);
      alert('❌ Failed to release payment. Please try again.');
    } finally {
      setReleasing(null);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchPendingReleases();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchStats();
      fetchPendingReleases();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const platformFeePercent = 10;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-xl text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-2 text-blue-600 font-semibold hover:text-blue-700 transition mb-4"
          >
            <ArrowLeft size={20} />
            Back to Dashboard
          </button>
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 bg-clip-text text-transparent">
            Admin Escrow Dashboard
          </h1>
          <p className="text-gray-600 mt-2">Manage payments and releases</p>
        </div>

        {error && (
          <div className="mb-6 bg-rose-100 border border-rose-300 text-rose-700 px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 mb-8">
          {/* Money in Escrow */}
          <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">In Escrow</p>
                <p className="text-3xl font-bold text-orange-600 mt-1">
                  ${stats?.escrow?.totalHeld?.toFixed(2) || '0.00'}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  {stats?.escrow?.count || 0} active payment{stats?.escrow?.count !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="bg-orange-100 p-3 rounded-xl">
                <Clock className="w-8 h-8 text-orange-500" />
              </div>
            </div>
          </div>

          {/* Pending Releases */}
          <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Pending Release</p>
                <p className="text-3xl font-bold text-yellow-600 mt-1">
                  {stats?.pendingReleases || 0}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Need your action
                </p>
              </div>
              <div className="bg-yellow-100 p-3 rounded-xl">
                <AlertCircle className="w-8 h-8 text-yellow-500" />
              </div>
            </div>
          </div>

          {/* Total Released */}
          <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Total Released</p>
                <p className="text-3xl font-bold text-green-600 mt-1">
                  ${stats?.released?.totalReleased?.toFixed(2) || '0.00'}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  {stats?.released?.count || 0} transaction{stats?.released?.count !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="bg-green-100 p-3 rounded-xl">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </div>
          </div>

          {/* Platform Fees */}
          <div className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Platform Fees</p>
                <p className="text-3xl font-bold text-blue-600 mt-1">
                  ${stats?.released?.totalFees?.toFixed(2) || '0.00'}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  {platformFeePercent}% commission
                </p>
              </div>
              <div className="bg-blue-100 p-3 rounded-xl">
                <TrendingUp className="w-8 h-8 text-blue-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Pending Releases Section */}
        <div className="bg-white rounded-2xl shadow-lg mb-8">
          <div className="px-6 py-5 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900">
              Pending Payment Releases
              {pendingReleases.length > 0 && (
                <span className="ml-3 px-3 py-1 bg-yellow-100 text-yellow-800 text-sm font-bold rounded-full">
                  {pendingReleases.length}
                </span>
              )}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Renters have confirmed completion. Review and release payments.
            </p>
          </div>

          {pendingReleases.length === 0 ? (
            <div className="p-12 text-center">
              <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <p className="text-gray-600 text-lg font-medium">All caught up!</p>
              <p className="text-gray-500 text-sm mt-2">No pending releases at the moment</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                      Rental Details
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                      Owner
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                      Renter
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                      Confirmed
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {pendingReleases.map((payment) => {
                    const platformFee = (payment.amount * platformFeePercent) / 100;
                    const ownerPayout = payment.amount - platformFee;
                    
                    return (
                      <tr key={payment._id} className="hover:bg-blue-50 transition">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {payment.rentalId?.machineId?.images?.[0] && (
                              <img 
                                src={payment.rentalId.machineId.images[0]} 
                                alt="Machine"
                                className="w-12 h-12 rounded-lg object-cover"
                              />
                            )}
                            <div>
                              <p className="font-semibold text-gray-900">
                                {payment.rentalId?.machineId?.name || 'Machine'}
                              </p>
                              <p className="text-sm text-gray-500">
                                ID: {payment.rentalId?._id?.slice(-8) || 'N/A'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {payment.ownerId?.firstName} {payment.ownerId?.lastName}
                            </p>
                            <p className="text-xs text-gray-500">
                              {payment.ownerId?.email}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {payment.userId?.firstName} {payment.userId?.lastName}
                            </p>
                            <p className="text-xs text-gray-500">
                              {payment.userId?.email}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            <p className="text-sm font-bold text-gray-900">
                              ${payment.amount.toFixed(2)}
                            </p>
                            <p className="text-xs text-gray-500">
                              Fee: ${platformFee.toFixed(2)}
                            </p>
                            <p className="text-xs text-green-600 font-semibold">
                              Owner: ${ownerPayout.toFixed(2)}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            <div className="flex items-center gap-1 text-green-600 font-medium mb-1">
                              <CheckCircle size={14} />
                              Renter Confirmed
                            </div>
                            <p className="text-xs text-gray-500">
                              {new Date(payment.confirmations?.renterConfirmedAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </p>
                            {payment.confirmations?.renterConfirmationNote && (
                              <p className="text-xs text-gray-600 italic mt-1 line-clamp-2">
                                "{payment.confirmations.renterConfirmationNote}"
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleRelease(payment._id)}
                            disabled={releasing === payment._id}
                            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                              releasing === payment._id
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-lg hover:scale-105'
                            }`}
                          >
                            {releasing === payment._id ? 'Releasing...' : '💰 Release Payment'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Summary Card */}
        <div className="bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 rounded-2xl shadow-2xl p-8 text-white">
          <h3 className="text-2xl font-bold mb-6">Platform Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5">
              <p className="text-blue-100 text-sm mb-1">Total Processed</p>
              <p className="text-4xl font-bold">
                ${((stats?.escrow?.totalHeld || 0) + (stats?.released?.totalReleased || 0)).toFixed(2)}
              </p>
              <p className="text-blue-100 text-xs mt-2">All time</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5">
              <p className="text-blue-100 text-sm mb-1">Total Transactions</p>
              <p className="text-4xl font-bold">
                {(stats?.escrow?.count || 0) + (stats?.released?.count || 0)}
              </p>
              <p className="text-blue-100 text-xs mt-2">
                {stats?.escrow?.count || 0} active, {stats?.released?.count || 0} complete
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5">
              <p className="text-blue-100 text-sm mb-1">Total Revenue</p>
              <p className="text-4xl font-bold">
                ${stats?.released?.totalFees?.toFixed(2) || '0.00'}
              </p>
              <p className="text-blue-100 text-xs mt-2">Platform fees (10%)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}