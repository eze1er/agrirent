import { useState, useEffect } from 'react';
import RenterConfirmCompletion from '../components/RenterConfirmCompletion';  // ← Import

export default function RenterDashboard({ user }) {
  const [rentals, setRentals] = useState([]);
  
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const fetchRentals = async () => {
  try {
    console.log('🔄 Fetching rentals...'); // ADD THIS
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/rentals`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    console.log('📊 Rentals data:', data); // ADD THIS
    
    if (data.success) {
      const myRentals = data.data.filter(r => 
        r.renterId?._id === user.id || r.renterId === user.id
      );
      console.log('✅ My rentals:', myRentals.length); // ADD THIS
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
      <h1 className="text-3xl font-bold mb-6">My Rentals</h1>
      
      <div className="space-y-4">
        {rentals.map(rental => (
          <div key={rental._id} className="bg-white rounded-xl shadow-lg p-6">
            {/* Rental Info */}
            <div className="mb-4">
              <h3 className="text-xl font-bold">{rental.machineId?.name}</h3>
              <p className="text-gray-600">{rental.machineId?.category}</p>
              <p className="text-sm text-gray-500">
                Status: <span className="font-semibold">{rental.status}</span>
              </p>
              <p className="text-sm text-gray-500">
                Amount: <span className="font-bold">${rental.pricing?.totalPrice?.toFixed(2)}</span>
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

            {/* ✅ ADD RENTER CONFIRMATION COMPONENT HERE */}
            <RenterConfirmCompletion 
              rental={rental} 
              onSuccess={() => fetchRentals()}  // Refresh list after confirmation
            />
            {/* ✅ END */}

            {/* Other rental actions can go below */}
            <div className="mt-4 flex gap-3">
              <button className="px-4 py-2 bg-gray-200 rounded-lg">
                View Details
              </button>
              {/* Other buttons... */}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}