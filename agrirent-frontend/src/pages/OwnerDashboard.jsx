import { useState, useEffect } from 'react';
import OwnerConfirmCompletion from '../components/OwnerConfirmCompletion'; // ✅ Import

export default function OwnerDashboard({ user }) {
  const [rentals, setRentals] = useState([]);
  
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  const fetchRentals = async () => {
    try {
      console.log('🔄 Fetching owner rentals...');
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/rentals`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      console.log('📊 Rentals data:', data);
      
      if (data.success) {
        // Filter for rentals where current user is the owner
        const myRentals = data.data.filter(r => 
          r.ownerId?._id === user.id || r.ownerId === user.id
        );
        console.log('✅ My owner rentals:', myRentals.length);
        setRentals(myRentals);
      }
    } catch (error) {
      console.error('❌ Fetch error:', error);
    }
  };

  useEffect(() => {
    fetchRentals();
  }, []);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">My Rentals (Owner)</h1>
      
      <div className="space-y-4">
        {rentals.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <p className="text-gray-600">No rentals found</p>
          </div>
        ) : (
          rentals.map(rental => (
            <div key={rental._id} className="bg-white rounded-xl shadow-lg p-6">
              {/* Rental Info */}
              <div className="mb-4">
                <h3 className="text-xl font-bold">{rental.machineId?.name}</h3>
                <p className="text-gray-600">{rental.machineId?.category}</p>
                <p className="text-sm text-gray-500">
                  Status: <span className="font-semibold capitalize">{rental.status}</span>
                </p>
                <p className="text-sm text-gray-500">
                  Amount: <span className="font-bold">${rental.pricing?.totalPrice?.toFixed(2)}</span>
                </p>
                <p className="text-sm text-gray-500">
                  Renter: <span className="font-semibold">
                    {rental.renterId?.firstName} {rental.renterId?.lastName}
                  </span>
                </p>
              </div>

              {/* Payment Status */}
              {rental.payment?.status && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm">
                    <strong>Payment Status:</strong> {rental.payment.status.replace('_', ' ').toUpperCase()}
                  </p>
                </div>
              )}

              {/* Confirmation Status */}
              {rental.ownerConfirmedCompletion && (
                <div className="mb-4 p-3 bg-green-50 border-2 border-green-200 rounded-lg">
                  <p className="text-sm text-green-800 font-semibold">
                    ✅ You confirmed completion on {new Date(rental.ownerConfirmedAt).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    Note: "{rental.ownerConfirmationNote}"
                  </p>
                  {!rental.renterConfirmedCompletion && (
                    <p className="text-xs text-amber-600 mt-2">
                      ⏳ Waiting for renter to confirm...
                    </p>
                  )}
                </div>
              )}

              {rental.renterConfirmedCompletion && rental.ownerConfirmedCompletion && (
                <div className="mb-4 p-3 bg-cyan-50 border-2 border-cyan-200 rounded-lg">
                  <p className="text-sm text-cyan-800 font-semibold">
                    🎉 Both parties confirmed! Admin will release payment soon.
                  </p>
                </div>
              )}

              {/* ✅ OWNER CONFIRMATION COMPONENT */}
              <OwnerConfirmCompletion 
                rental={rental} 
                onSuccess={() => fetchRentals()}
              />

              {/* Other rental actions */}
              <div className="mt-4 flex gap-3">
                <button className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition">
                  View Details
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}