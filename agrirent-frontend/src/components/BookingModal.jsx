import { useState } from 'react';
import { X } from 'lucide-react';

export default function BookingModal({ machine, onClose, onBook }) {
  const [rentalType, setRentalType] = useState(
    machine.pricingType === "daily" ? "daily" : 
    machine.pricingType === "per_hectare" ? "per_hectare" : 
    "daily"
  );
  
  const [formData, setFormData] = useState({
    startDate: "",
    endDate: "",
    hectares: "",
    workDate: "",
    fieldLocation: "",  // ✅ Required for BOTH types
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const bookingData = {
        rentalType,
      };

      // ✅ DAILY RENTAL - Include field location
      if (rentalType === "daily") {
        if (!formData.startDate || !formData.endDate) {
          setError("Please select start and end dates");
          setLoading(false);
          return;
        }
        if (!formData.fieldLocation || !formData.fieldLocation.trim()) {
          setError("Field location is required");
          setLoading(false);
          return;
        }
        bookingData.startDate = formData.startDate;
        bookingData.endDate = formData.endDate;
        bookingData.fieldLocation = formData.fieldLocation.trim();  // ✅ Added
      } 
      // ✅ PER HECTARE - Include field location
      else if (rentalType === "per_hectare") {
        if (!formData.hectares || !formData.workDate || !formData.fieldLocation) {
          setError("Please fill in all fields");
          setLoading(false);
          return;
        }
        bookingData.hectares = parseFloat(formData.hectares);
        bookingData.workDate = formData.workDate;
        bookingData.fieldLocation = formData.fieldLocation.trim();  // ✅ Added
      }

      await onBook(bookingData);
      onClose();
    } catch (err) {
      console.error("Booking error:", err);
      setError(err.response?.data?.message || "Failed to create booking");
    } finally {
      setLoading(false);
    }
  };

  const calculatePrice = () => {
    if (rentalType === "daily" && formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      if (days > 0) {
        const subtotal = days * machine.pricePerDay;
        const serviceFee = subtotal * 0.1;
        return {
          days,
          subtotal,
          serviceFee,
          total: subtotal + serviceFee,
        };
      }
    } else if (rentalType === "per_hectare" && formData.hectares) {
      const hectares = parseFloat(formData.hectares);
      if (hectares >= (machine.minimumHectares || 1)) {
        const subtotal = hectares * machine.pricePerHectare;
        const serviceFee = subtotal * 0.1;
        return {
          hectares,
          subtotal,
          serviceFee,
          total: subtotal + serviceFee,
        };
      }
    }
    return null;
  };

  const priceBreakdown = calculatePrice();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            Book {machine.name}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition p-1 hover:bg-gray-100 rounded-full"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6">
          {/* Rental Type Selection */}
          {machine.pricingType === "both" && (
            <div className="mb-6">
              <label className="block text-sm font-semibold mb-2 text-gray-700">
                Rental Type *
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setRentalType("daily");
                    setFormData({ 
                      startDate: "", 
                      endDate: "", 
                      hectares: "", 
                      workDate: "", 
                      fieldLocation: formData.fieldLocation
                    });
                  }}
                  className={`p-4 rounded-xl border-2 font-semibold transition ${
                    rentalType === "daily"
                      ? "bg-blue-50 border-blue-500 text-blue-700 shadow-sm"
                      : "border-gray-200 text-gray-700 hover:border-blue-300"
                  }`}
                >
                  <div className="text-2xl mb-1">📅</div>
                  <div>Daily Rental</div>
                  <div className="text-xs text-gray-500 mt-1">${machine.pricePerDay}/day</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRentalType("per_hectare");
                    setFormData({ 
                      startDate: "", 
                      endDate: "", 
                      hectares: "", 
                      workDate: "", 
                      fieldLocation: formData.fieldLocation
                    });
                  }}
                  className={`p-4 rounded-xl border-2 font-semibold transition ${
                    rentalType === "per_hectare"
                      ? "bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm"
                      : "border-gray-200 text-gray-700 hover:border-emerald-300"
                  }`}
                >
                  <div className="text-2xl mb-1">🌾</div>
                  <div>Per Hectare</div>
                  <div className="text-xs text-gray-500 mt-1">${machine.pricePerHectare}/Ha</div>
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm flex items-start gap-2">
              <span className="text-lg">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* DAILY RENTAL FIELDS */}
            {rentalType === "daily" && (
              <>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) =>
                      setFormData({ ...formData, startDate: e.target.value })
                    }
                    min={new Date().toISOString().split("T")[0]}
                    required
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700">
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) =>
                      setFormData({ ...formData, endDate: e.target.value })
                    }
                    min={formData.startDate || new Date().toISOString().split("T")[0]}
                    required
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition"
                  />
                </div>
              </>
            )}

            {/* PER HECTARE FIELDS */}
            {rentalType === "per_hectare" && (
              <>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700">
                    Number of Hectares *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={machine.minimumHectares || 1}
                    value={formData.hectares}
                    onChange={(e) =>
                      setFormData({ ...formData, hectares: e.target.value })
                    }
                    placeholder={`Minimum ${machine.minimumHectares || 1} Ha`}
                    required
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none transition"
                  />
                  <small className="text-gray-500 text-xs mt-1 block">
                    Minimum: {machine.minimumHectares || 1} hectares
                  </small>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700">
                    Work Date *
                  </label>
                  <input
                    type="date"
                    value={formData.workDate}
                    onChange={(e) =>
                      setFormData({ ...formData, workDate: e.target.value })
                    }
                    min={new Date().toISOString().split("T")[0]}
                    required
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none transition"
                  />
                </div>
              </>
            )}

            {/* ✅ FIELD LOCATION - SHOWN FOR BOTH TYPES */}
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-700">
                {rentalType === "daily" ? "Delivery/Field Location *" : "Field Location *"}
              </label>
              <input
                type="text"
                value={formData.fieldLocation}
                onChange={(e) =>
                  setFormData({ ...formData, fieldLocation: e.target.value })
                }
                placeholder="e.g., Kinshasa, Limete, Kingabwa"
                required
                className={`w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none transition ${
                  rentalType === "daily" ? "focus:border-blue-500" : "focus:border-emerald-500"
                }`}
              />
              <small className="text-gray-500 text-xs mt-1 block">
                {rentalType === "daily" 
                  ? "Where should the machine be delivered?" 
                  : "Where will the work be performed?"}
              </small>
            </div>

            {/* PRICE BREAKDOWN */}
            {priceBreakdown && (
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-4 border-2 border-blue-200">
                <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <span className="text-lg">💰</span>
                  Price Breakdown
                </h3>
                <div className="space-y-2 text-sm">
                  {rentalType === "daily" && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">
                        {priceBreakdown.days} day{priceBreakdown.days !== 1 ? "s" : ""} × ${machine.pricePerDay}
                      </span>
                      <span className="font-semibold text-gray-900">
                        ${priceBreakdown.subtotal.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {rentalType === "per_hectare" && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">
                        {priceBreakdown.hectares} Ha × ${machine.pricePerHectare}
                      </span>
                      <span className="font-semibold text-gray-900">
                        ${priceBreakdown.subtotal.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Service Fee (10%)</span>
                    <span className="font-semibold text-gray-900">
                      ${priceBreakdown.serviceFee.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t-2 border-blue-300">
                    <span className="font-bold text-gray-800">Total Amount</span>
                    <span className="font-bold text-blue-600 text-xl">
                      ${priceBreakdown.total.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* SUBMIT BUTTONS */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-semibold text-gray-700 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !priceBreakdown}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Booking...
                  </span>
                ) : (
                  "Confirm Booking"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}