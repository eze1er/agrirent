// TEST PAGE - Check if your data has the required fields
// Replace AdminEscrowDashboard.jsx temporarily with this to debug

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function AdminEscrowDashboard({ user, onLogout }) {
  const navigate = useNavigate();
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState({});

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  useEffect(() => {
    if (user?.role !== 'admin') {
      alert('⚠️ Access denied. Admin privileges required.');
      navigate('/');
      return;
    }
    fetchData();
  }, [user, navigate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      // Try escrow endpoint first
      let response = await fetch(`${API_BASE}/admin/escrow/overview`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      let data = await response.json();
      
      if (!data.success) {
        // Fallback to regular rentals
        response = await fetch(`${API_BASE}/rentals`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        data = await response.json();
        
        if (data.success) {
          setRentals(data.data);
        }
      } else {
        setRentals(data.data.rentals || []);
      }

      // Debug info
      const debug = {
        totalRentals: rentals.length,
        rentalsWithPayment: rentals.filter(r => r.payment).length,
        rentalsInEscrow: rentals.filter(r => r.payment?.status === 'held_in_escrow').length,
        renterConfirmed: rentals.filter(r => r.renterConfirmedCompletion).length,
        withRenterNote: rentals.filter(r => r.renterConfirmationNote).length,
        withOwnerNote: rentals.filter(r => r.ownerNote).length,
        withDispute: rentals.filter(r => r.disputeReason).length
      };
      setDebugInfo(debug);

    } catch (error) {
      console.error('Fetch error:', error);
      alert('Failed to load data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold mb-4">🔍 Admin Escrow Debug Page</h1>
          <button
            onClick={() => navigate('/admin/dashboard')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg mb-4"
          >
            ← Back to Dashboard
          </button>

          {/* Debug Stats */}
          <div className="bg-blue-50 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">📊 Debug Information</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Total Rentals:</p>
                <p className="text-2xl font-bold">{debugInfo.totalRentals}</p>
              </div>
              <div>
                <p className="text-gray-600">With Payment Field:</p>
                <p className="text-2xl font-bold">{debugInfo.rentalsWithPayment}</p>
              </div>
              <div>
                <p className="text-gray-600">In Escrow:</p>
                <p className="text-2xl font-bold">{debugInfo.rentalsInEscrow}</p>
              </div>
              <div>
                <p className="text-gray-600">Renter Confirmed:</p>
                <p className="text-2xl font-bold">{debugInfo.renterConfirmed}</p>
              </div>
              <div>
                <p className="text-gray-600">With Renter Note:</p>
                <p className="text-2xl font-bold">{debugInfo.withRenterNote}</p>
              </div>
              <div>
                <p className="text-gray-600">With Owner Note:</p>
                <p className="text-2xl font-bold">{debugInfo.withOwnerNote}</p>
              </div>
            </div>
          </div>

          {/* Rentals List */}
          <h2 className="text-2xl font-bold mb-4">📋 All Rentals (Debug View)</h2>
          
          {rentals.length === 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <p className="text-yellow-800 font-semibold">⚠️ No rentals found!</p>
              <p className="text-sm text-yellow-700 mt-2">
                You need to create some rentals with payments first.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {rentals.map((rental, index) => (
                <div key={rental._id || index} className="border-2 border-gray-200 rounded-xl p-6 bg-white">
                  {/* Basic Info */}
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-gray-900">
                      Rental #{index + 1}: {rental.machineId?.name || 'Unknown Machine'}
                    </h3>
                    <p className="text-sm text-gray-500">
                      Status: {rental.status} | ID: {rental._id}
                    </p>
                  </div>

                  {/* Payment Info */}
                  <div className="bg-purple-50 rounded-lg p-4 mb-4">
                    <h4 className="font-bold mb-2">💰 Payment Information</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-gray-600">Has payment field:</p>
                        <p className="font-bold">{rental.payment ? '✅ YES' : '❌ NO'}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Payment status:</p>
                        <p className="font-bold">{rental.payment?.status || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Total price:</p>
                        <p className="font-bold">${rental.pricing?.totalPrice?.toFixed(2) || '0.00'}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">In escrow:</p>
                        <p className="font-bold">
                          {rental.payment?.status === 'held_in_escrow' ? '✅ YES' : '❌ NO'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Confirmation Info */}
                  <div className="bg-green-50 rounded-lg p-4 mb-4">
                    <h4 className="font-bold mb-2">✅ Confirmation Information</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-gray-600">Renter confirmed:</p>
                        <p className="font-bold">
                          {rental.renterConfirmedCompletion ? '✅ YES' : '❌ NO'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">Confirmed at:</p>
                        <p className="font-bold">
                          {rental.renterConfirmedAt 
                            ? new Date(rental.renterConfirmedAt).toLocaleDateString()
                            : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Comments Info */}
                  <div className="bg-blue-50 rounded-lg p-4 mb-4">
                    <h4 className="font-bold mb-2">💬 Comments Information</h4>
                    
                    {/* Renter Note */}
                    <div className="mb-3">
                      <p className="text-sm font-semibold text-gray-700">Renter Confirmation Note:</p>
                      {rental.renterConfirmationNote ? (
                        <p className="text-sm bg-white p-2 rounded border border-green-200 mt-1">
                          "{rental.renterConfirmationNote}"
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500 italic">❌ No renter note</p>
                      )}
                    </div>

                    {/* Owner Note */}
                    <div className="mb-3">
                      <p className="text-sm font-semibold text-gray-700">Owner Note:</p>
                      {rental.ownerNote ? (
                        <p className="text-sm bg-white p-2 rounded border border-blue-200 mt-1">
                          "{rental.ownerNote}"
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500 italic">❌ No owner note</p>
                      )}
                    </div>

                    {/* Dispute */}
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Dispute Reason:</p>
                      {rental.disputeReason ? (
                        <p className="text-sm bg-white p-2 rounded border border-orange-200 mt-1">
                          "{rental.disputeReason}"
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500 italic">❌ No dispute</p>
                      )}
                    </div>
                  </div>

                  {/* Should Show Buttons? */}
                  <div className="bg-yellow-50 rounded-lg p-4">
                    <h4 className="font-bold mb-2">🎯 Should Show Action Buttons?</h4>
                    <div className="space-y-2 text-sm">
                      <p>
                        <strong>Requirements:</strong>
                      </p>
                      <p>
                        1. Payment in escrow: {
                          rental.payment?.status === 'held_in_escrow' 
                            ? '✅ YES' 
                            : `❌ NO (status: ${rental.payment?.status || 'none'})`
                        }
                      </p>
                      <p>
                        2. Renter confirmed: {
                          rental.renterConfirmedCompletion 
                            ? '✅ YES' 
                            : '❌ NO'
                        }
                      </p>
                      <p className="font-bold text-lg mt-3">
                        {rental.payment?.status === 'held_in_escrow' && rental.renterConfirmedCompletion
                          ? '🎉 YES! Should show Release/Reject buttons'
                          : '⚠️ NO - Missing requirements above'}
                      </p>
                    </div>
                  </div>

                  {/* Raw Data */}
                  <details className="mt-4">
                    <summary className="cursor-pointer font-semibold text-sm text-gray-600 hover:text-gray-900">
                      🔍 View Raw Data (Click to expand)
                    </summary>
                    <pre className="mt-2 p-4 bg-gray-900 text-green-400 rounded text-xs overflow-auto max-h-96">
                      {JSON.stringify(rental, null, 2)}
                    </pre>
                  </details>
                </div>
              ))}
            </div>
          )}

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-6">
            <h3 className="font-bold text-lg mb-3">📝 What This Debug Page Shows:</h3>
            <ul className="space-y-2 text-sm">
              <li>✅ <strong>Total Rentals:</strong> How many rentals exist</li>
              <li>✅ <strong>With Payment:</strong> Rentals that have payment.status field</li>
              <li>✅ <strong>In Escrow:</strong> Rentals with payment.status = 'held_in_escrow'</li>
              <li>✅ <strong>Renter Confirmed:</strong> Rentals with renterConfirmedCompletion = true</li>
              <li>✅ <strong>Comments:</strong> Shows if renterConfirmationNote, ownerNote exist</li>
            </ul>
            <div className="mt-4 p-3 bg-yellow-50 rounded">
              <p className="font-bold text-yellow-800">⚠️ For buttons to show, a rental needs:</p>
              <ol className="list-decimal ml-5 mt-2 text-sm">
                <li>payment.status = 'held_in_escrow'</li>
                <li>renterConfirmedCompletion = true</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}