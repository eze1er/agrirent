// src/components/PaymentModal.jsx
import { useState } from "react";
import {
  X,
  CreditCard,
  Smartphone,
  CheckCircle,
  AlertCircle,
  Shield,
  Lock,
} from "lucide-react";
import { paymentAPI } from "../services/api";

export default function PaymentModal({ rental, onClose, onPaymentSuccess }) {
  const [selectedMethod, setSelectedMethod] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [step, setStep] = useState(1);

  // Mobile Money state
  const [mobileMoneyDetails, setMobileMoneyDetails] = useState({
    provider: "",
    phoneNumber: "",
    name: "",
  });

  const paymentMethods = [
    {
      id: "stripe",
      name: "Credit/Debit Card",
      icon: <CreditCard size={24} />,
      description: "Visa, Mastercard, Amex",
      color: "blue",
      recommended: true,
    },
    {
      id: "paypal",
      name: "PayPal",
      icon: <div className="text-2xl font-bold text-blue-600">P</div>,
      description: "Pay with PayPal account",
      color: "indigo",
    },
    {
      id: "orange",
      name: "Orange Money",
      icon: <Smartphone size={24} />,
      description: "Orange mobile payment",
      color: "orange",
    },
    {
      id: "mtn",
      name: "MTN Mobile Money",
      icon: <Smartphone size={24} />,
      description: "MTN mobile payment",
      color: "amber",
    },
    {
      id: "moov",
      name: "Moov Money",
      icon: <Smartphone size={24} />,
      description: "Moov mobile payment",
      color: "sky",
    },
  ];

  const handleMethodSelect = (methodId) => {
    setSelectedMethod(methodId);
    setError("");
    setStep(2);
  };

  // ✅ NEW: Stripe Checkout Session (Redirect Method)
  const handleStripePayment = async () => {
    setLoading(true);
    setError("");
    setStep(3);

    try {
      console.log('Creating checkout session for rental:', rental._id);

      // Create Stripe Checkout Session
      const response = await paymentAPI.createCheckoutSession({
        rentalId: rental._id
      });

      console.log('Checkout session response:', response.data);

      if (response.data.success && response.data.data.url) {
        // Redirect to Stripe Checkout page
        console.log('Redirecting to Stripe Checkout...');
        window.location.href = response.data.data.url;
      } else {
        throw new Error('Failed to create checkout session');
      }
    } catch (err) {
      console.error('Payment error:', err);
      setError(err.response?.data?.message || 'Failed to initiate payment. Please try again.');
      setStep(2);
      setLoading(false);
    }
  };

  const handlePayPalPayment = async () => {
    setLoading(true);
    setError("");
    setStep(3);

    try {
      const response = await paymentAPI.createPayPalOrder({
        amount: rental.pricing.totalPrice,
        rentalId: rental._id,
      });

      // Redirect to PayPal approval URL
      if (response.data.approvalUrl) {
        window.location.href = response.data.approvalUrl;
      }
    } catch (err) {
      setError(err.response?.data?.message || "PayPal payment failed");
      setStep(2);
      setLoading(false);
    }
  };

  const handleMobileMoneyPayment = async () => {
    if (!mobileMoneyDetails.phoneNumber || !mobileMoneyDetails.provider) {
      setError("Please fill in all mobile money details");
      return;
    }

    setLoading(true);
    setError("");
    setStep(3);

    try {
      const response = await paymentAPI.initiateMobileMoney({
        provider: mobileMoneyDetails.provider,
        phoneNumber: mobileMoneyDetails.phoneNumber,
        amount: rental.pricing.totalPrice,
        rentalId: rental._id,
      });

      setSuccess(true);
      setTimeout(() => {
        onPaymentSuccess({
          method: mobileMoneyDetails.provider,
          transactionId: response.data.transactionId,
          amount: rental.pricing.totalPrice,
        });
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.message || "Mobile money payment failed");
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = () => {
    if (selectedMethod === "stripe") {
      handleStripePayment();
    } else if (selectedMethod === "paypal") {
      handlePayPalPayment();
    } else if (["orange", "mtn", "moov"].includes(selectedMethod)) {
      handleMobileMoneyPayment();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-4 rounded-t-2xl flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Lock size={20} />
            <h2 className="text-xl font-bold">Secure Payment</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-full p-1 transition"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6">
          {/* Rental Summary */}
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-4 mb-6 border border-blue-100">
            <h3 className="font-bold text-gray-800 mb-2">Rental Summary</h3>
            <p className="text-sm text-gray-600 mb-1 font-semibold">
              {rental.machineId?.name || "Machine"}
            </p>
            {rental.rentalType === "daily" ? (
              <p className="text-sm text-gray-600">
                📅 {new Date(rental.startDate).toLocaleDateString()} -{" "}
                {new Date(rental.endDate).toLocaleDateString()}
              </p>
            ) : (
              <>
                <p className="text-sm text-gray-600">
                  📅 {new Date(rental.workDate).toLocaleDateString()}
                </p>
                <p className="text-sm text-gray-600">
                  📏 {rental.pricing?.numberOfHectares} hectares
                </p>
              </>
            )}
            <div className="mt-3 pt-3 border-t border-blue-200">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-gray-700">
                  Total Amount:
                </span>
                <span className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  ${rental.pricing?.totalPrice?.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Escrow Protection Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-6">
            <div className="flex items-start gap-2">
              <Shield size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-gray-800 mb-1">
                  🔒 Your Payment is Protected
                </p>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li>✓ Funds held securely in escrow</li>
                  <li>✓ Released only after service completion</li>
                  <li>✓ Full refund if service not delivered</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Step 1: Select Payment Method */}
          {step === 1 && (
            <div>
              <h3 className="font-bold text-gray-800 mb-4">
                Choose Payment Method
              </h3>
              <div className="space-y-3">
                {paymentMethods.map((method) => (
                  <button
                    key={method.id}
                    onClick={() => handleMethodSelect(method.id)}
                    className={`w-full border-2 rounded-xl p-4 flex items-center gap-4 hover:border-emerald-500 hover:bg-emerald-50 transition relative ${
                      method.recommended ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-200'
                    }`}
                  >
                    {method.recommended && (
                      <span className="absolute top-2 right-2 bg-emerald-500 text-white text-xs px-2 py-1 rounded-full font-semibold">
                        Recommended
                      </span>
                    )}
                    <div className={`text-${method.color}-600`}>{method.icon}</div>
                    <div className="text-left flex-1">
                      <p className="font-semibold text-gray-800">
                        {method.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {method.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Stripe - No card form needed, just confirm */}
          {step === 2 && selectedMethod === "stripe" && (
            <div>
              <button
                onClick={() => setStep(1)}
                className="text-emerald-600 text-sm font-semibold mb-4 hover:underline"
              >
                ← Change payment method
              </button>
              
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-6 mb-4 border border-blue-100">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-blue-600 text-white rounded-full p-3">
                    <CreditCard size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800">Card Payment</h3>
                    <p className="text-xs text-gray-600">Via Stripe</p>
                  </div>
                </div>
                
                <div className="space-y-2 text-sm text-gray-700">
                  <p className="flex items-center gap-2">
                    <span className="text-emerald-600">✓</span>
                    Secure payment processing
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="text-emerald-600">✓</span>
                    All major cards accepted
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="text-emerald-600">✓</span>
                    3D Secure authentication
                  </p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                <p className="text-xs text-gray-700">
                  You'll be redirected to Stripe's secure payment page to complete your transaction.
                </p>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm flex items-center gap-2">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              <button
                onClick={handlePayment}
                disabled={loading}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-4 rounded-xl font-bold hover:shadow-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Processing...
                  </span>
                ) : (
                  `Continue to Payment - $${rental.pricing?.totalPrice?.toFixed(2)}`
                )}
              </button>

              <div className="mt-4 text-center">
                <p className="text-xs text-gray-500">
                  Powered by <span className="font-semibold text-blue-600">Stripe</span>
                </p>
              </div>
            </div>
          )}

          {/* Step 2: PayPal */}
          {step === 2 && selectedMethod === "paypal" && (
            <div>
              <button
                onClick={() => setStep(1)}
                className="text-blue-600 text-sm font-semibold mb-4"
              >
                ← Change payment method
              </button>
              <h3 className="font-bold text-gray-800 mb-4">PayPal Payment</h3>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                <p className="text-sm text-gray-700">
                  You will be redirected to PayPal to complete your payment
                  securely.
                </p>
              </div>
              {error && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm flex items-center gap-2">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}
              <button
                onClick={handlePayment}
                disabled={loading}
                className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white py-4 rounded-xl font-bold hover:shadow-xl transition disabled:opacity-50"
              >
                Continue to PayPal
              </button>
            </div>
          )}

          {/* Step 2: Mobile Money */}
          {step === 2 && ["orange", "mtn", "moov"].includes(selectedMethod) && (
            <div>
              <button
                onClick={() => setStep(1)}
                className="text-blue-600 text-sm font-semibold mb-4"
              >
                ← Change payment method
              </button>
              <h3 className="font-bold text-gray-800 mb-4">
                Mobile Money Payment
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Provider
                  </label>
                  <select
                    value={mobileMoneyDetails.provider}
                    onChange={(e) =>
                      setMobileMoneyDetails({
                        ...mobileMoneyDetails,
                        provider: e.target.value,
                      })
                    }
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-orange-500 focus:outline-none capitalize"
                  >
                    <option value="">Select Provider</option>
                    <option value="orange">Orange Money</option>
                    <option value="mtn">MTN Mobile Money</option>
                    <option value="moov">Moov Money</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={mobileMoneyDetails.phoneNumber}
                    onChange={(e) =>
                      setMobileMoneyDetails({
                        ...mobileMoneyDetails,
                        phoneNumber: e.target.value.replace(/\D/g, ""),
                      })
                    }
                    placeholder="+1234567890"
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-orange-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Account Name
                  </label>
                  <input
                    type="text"
                    value={mobileMoneyDetails.name}
                    onChange={(e) =>
                      setMobileMoneyDetails({
                        ...mobileMoneyDetails,
                        name: e.target.value,
                      })
                    }
                    placeholder="John Doe"
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm text-gray-700">
                  You will receive a prompt on your phone to authorize this
                  payment.
                </p>
              </div>
              {error && (
                <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm flex items-center gap-2">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}
              <button
                onClick={handlePayment}
                disabled={loading}
                className="w-full mt-6 bg-gradient-to-r from-orange-600 to-amber-600 text-white py-4 rounded-xl font-bold hover:shadow-xl transition disabled:opacity-50"
              >
                Send Payment Request
              </button>
            </div>
          )}

          {/* Step 3: Processing */}
          {step === 3 && loading && (
            <div className="text-center py-8">
              <div className="w-16 h-16 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                Redirecting to Payment...
              </h3>
              <p className="text-gray-600 text-sm">
                Please wait, you'll be redirected to complete your payment securely
              </p>
            </div>
          )}

          {/* Success state (mobile money) */}
          {success && (
            <div className="text-center py-8">
              <CheckCircle
                size={64}
                className="mx-auto text-emerald-600 mb-4"
              />
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                Payment Successful!
              </h3>
              <p className="text-gray-600">
                Your rental has been confirmed. You'll receive a
                confirmation email shortly.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}