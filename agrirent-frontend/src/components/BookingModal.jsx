import { useState } from 'react';
import { Calendar, DollarSign, X, MapPin } from 'lucide-react';

export default function BookingModal({ machine, onClose, onBook }) {
  const [rentalType, setRentalType] = useState(
    machine.pricingType === 'both' ? 'daily' : machine.pricingType
  );
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [hectares, setHectares] = useState(machine.minimumHectares || 1);
  const [fieldLocation, setFieldLocation] = useState(''); // NEW
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const calculatePricing = () => {
    if (rentalType === 'daily' || rentalType === 'per_day') {
      if (!startDate || !endDate) return null;

      const start = new Date(startDate);
      const end = new Date(endDate);
      const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

      if (days <= 0) return null;

      const subtotal = days * machine.pricePerDay;
      const serviceFee = subtotal * 0.1;
      const total = subtotal + serviceFee;

      return { days, subtotal, serviceFee, total, type: 'daily' };
    } else {
      // Per hectare pricing
      if (!hectares || hectares < (machine.minimumHectares || 1)) return null;

      const subtotal = hectares * machine.pricePerHectare;
      const serviceFee = subtotal * 0.1;
      const total = subtotal + serviceFee;

      return { hectares, subtotal, serviceFee, total, type: 'per_hectare' };
    }
  };

  const pricing = calculatePricing();

const handleSubmit = async (e) => {
  e.preventDefault();
  setError('');

  if (!pricing) {
    setError(rentalType === 'daily' ? 'Please select valid dates' : 'Please enter valid hectares');
    return;
  }

  // Validation for per hectare bookings
  if (rentalType === 'per_hectare' && !fieldLocation.trim()) {
    setError('Field location is required for per-hectare rentals');
    return;
  }

  setLoading(true);

  try {
    const bookingData = {
      rentalType: rentalType, // FIXED: Send 'daily' or 'per_hectare' directly
      startDate,
    };

    if (rentalType === 'daily') {
      bookingData.endDate = endDate;
    } else if (rentalType === 'per_hectare') {
      bookingData.hectares = parseFloat(hectares);
      bookingData.workDate = startDate; // Backend expects 'workDate' not 'startDate' for per_hectare
      bookingData.fieldLocation = fieldLocation.trim();
    }

    console.log('Sending booking data:', bookingData); // Keep for debugging
    
    await onBook(bookingData);
    onClose();
  } catch (err) {
    console.error('Booking error:', err.response?.data); // Keep for debugging
    setError(err.response?.data?.message || 'Failed to create booking');
  } finally {
    setLoading(false);
  }
};

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            Book {machine.name}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Rental Type Selector (only if both options available) */}
          {machine.pricingType === 'both' && (
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-4 space-y-3">
              <label className="block text-sm font-semibold mb-2">Rental Type</label>
              
              <label className="flex items-center gap-3 cursor-pointer p-3 bg-white rounded-lg border-2 transition hover:border-blue-300">
                <input
                  type="radio"
                  value="daily"
                  checked={rentalType === 'daily'}
                  onChange={(e) => setRentalType(e.target.value)}
                  className="w-5 h-5 text-blue-600"
                />
                <div className="flex-1">
                  <div className="font-semibold">Daily Rental</div>
                  <div className="text-sm text-gray-600">${machine.pricePerDay}/day</div>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer p-3 bg-white rounded-lg border-2 transition hover:border-emerald-300">
                <input
                  type="radio"
                  value="per_hectare"
                  checked={rentalType === 'per_hectare'}
                  onChange={(e) => setRentalType(e.target.value)}
                  className="w-5 h-5 text-emerald-600"
                />
                <div className="flex-1">
                  <div className="font-semibold">Per Hectare</div>
                  <div className="text-sm text-gray-600">
                    ${machine.pricePerHectare}/Ha (min {machine.minimumHectares} Ha)
                  </div>
                </div>
              </label>
            </div>
          )}

          {/* Date inputs for daily rental */}
          {(rentalType === 'daily' || rentalType === 'per_day') && (
            <>
              <div>
                <label className="block text-sm font-semibold mb-2">Start Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    min={today}
                    required
                    className="w-full border-2 border-gray-200 rounded-xl pl-11 pr-4 py-3 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">End Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate || today}
                    required
                    className="w-full border-2 border-gray-200 rounded-xl pl-11 pr-4 py-3 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}

          {/* Hectare input for per hectare rental */}
          {rentalType === 'per_hectare' && (
            <>
              <div>
                <label className="block text-sm font-semibold mb-2">Work Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    min={today}
                    required
                    className="w-full border-2 border-gray-200 rounded-xl pl-11 pr-4 py-3 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Service will be completed on this date</p>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">
                  Hectares (minimum {machine.minimumHectares} Ha)
                </label>
                <input
                  type="number"
                  value={hectares}
                  onChange={(e) => setHectares(e.target.value)}
                  min={machine.minimumHectares || 1}
                  step="0.1"
                  required
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-emerald-500 focus:outline-none"
                  placeholder={`Min ${machine.minimumHectares || 1} hectares`}
                />
              </div>

              {/* NEW: Field Location Input */}
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Field Location *
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 text-gray-400" size={20} />
                  <textarea
                    value={fieldLocation}
                    onChange={(e) => setFieldLocation(e.target.value)}
                    required
                    rows="3"
                    className="w-full border-2 border-gray-200 rounded-xl pl-11 pr-4 py-3 focus:border-emerald-500 focus:outline-none"
                    placeholder="Enter the address or description of the field location"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Provide the exact location where the service will be performed
                </p>
              </div>
            </>
          )}

          {/* Pricing Summary */}
          {pricing && (
            <div className={`rounded-xl p-4 space-y-2 ${
              rentalType === 'per_hectare' ? 'bg-emerald-50' : 'bg-blue-50'
            }`}>
              <div className="flex justify-between text-sm">
                <span>
                  {pricing.type === 'daily' 
                    ? `$${machine.pricePerDay} × ${pricing.days} days`
                    : `$${machine.pricePerHectare} × ${pricing.hectares} Ha`
                  }
                </span>
                <span>${pricing.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Service Fee (10%)</span>
                <span>${pricing.serviceFee.toFixed(2)}</span>
              </div>
              <div className={`border-t pt-2 flex justify-between font-bold text-lg ${
                rentalType === 'per_hectare' ? 'border-emerald-200' : 'border-blue-200'
              }`}>
                <span>Total</span>
                <span className={rentalType === 'per_hectare' ? 'text-emerald-600' : 'text-blue-600'}>
                  ${pricing.total.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-300 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !pricing}
              className={`flex-1 text-white py-3 rounded-xl font-semibold disabled:opacity-50 hover:shadow-lg transition ${
                rentalType === 'per_hectare'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600'
                  : 'bg-gradient-to-r from-blue-600 to-cyan-600'
              }`}
            >
              {loading ? 'Booking...' : 'Confirm Booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}