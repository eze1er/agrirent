// src/components/PaymentModal.jsx
import { useState, useEffect } from "react";
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
import { useStripe, useElements, CardElement } from "@stripe/react-stripe-js";

export default function PaymentModal({ rental, onClose, onPaymentSuccess }) {
  const stripe = useStripe();
  const elements = useElements();

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

  // ✅ EMBEDDED STRIPE PAYMENT (your handleSubmit logic)
  const handleStripePayment = async (e) => {
    e.preventDefault();

    if (!stripe || !elements) {
      setError("Stripe is not ready. Please try again.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const cardElement = elements.getElement(CardElement);

      // 1. Create Payment Method
      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        type: "card",
        card: cardElement,
      });

      if (pmError) {
        setError(pmError.message);
        setLoading(false);
        return;
      }

      console.log("💳 Payment method created:", paymentMethod.id);

      // 2. Create Payment Intent on backend
      const intentResponse = await paymentAPI.createIntent({
        rentalId: rental._id,
        amount: rental.pricing?.totalPrice || 0,
        currency: "usd",
      });

      console.log("🔐 Payment intent created:", intentResponse.data.data.paymentIntentId);

      // 3. Confirm payment with Stripe
      const { error: confirmError } = await stripe.confirmCardPayment(
        intentResponse.data.data.clientSecret,
        {
          payment_method: paymentMethod.id,
        }
      );

      if (confirmError) {
        setError(confirmError.message);
        setLoading(false);
        return;
      }

      // 4. Confirm on your backend (update rental status, escrow, etc.)
      const confirmResponse = await paymentAPI.confirmPayment({
        paymentIntentId: intentResponse.data.data.paymentIntentId,
        rentalId: rental._id,
      });

      console.log("✅ Payment confirmed:", confirmResponse.data);

      if (confirmResponse.data.success) {
        setSuccess(true);
        setTimeout(() => {
          onPaymentSuccess({
            method: "stripe",
            transactionId: intentResponse.data.data.paymentIntentId,
            amount: rental.pricing?.totalPrice,
          });
          onClose();
        }, 1500);
      }
    } catch (err) {
      console.error("❌ Payment error:", err);
      setError(
        err.response?.data?.message || "Payment failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // PayPal (redirect)
  const handlePayPalPayment = async () => {
    setLoading(true);
    setError("");
    setStep(3);

    try {
      const response = await paymentAPI.createPayPalOrder({
        amount: rental.pricing.totalPrice,
        rentalId: rental._id,
      });

      if (response.data?.approvalUrl) {
        window.location.href = response.data.approvalUrl;
      } else {
        throw new Error("PayPal URL missing");
      }
    } catch (err) {
      setError(err.response?.data?.message || "PayPal payment failed");
      setStep(2);
      setLoading(false);
    }
  };

  // Mobile Money
  const handleMobileMoneyPayment = async () => {
    const { provider, phoneNumber } = mobileMoneyDetails;
    if (!provider || !phoneNumber) {
      setError("Please fill in all mobile money details");
      return;
    }

    setLoading(true);
    setError("");
    setStep(3);

    try {
      const response = await paymentAPI.initiateMobileMoney({
        provider,
        phoneNumber,
        amount: rental.pricing.totalPrice,
        rentalId: rental._id,
      });

      setSuccess(true);
      setTimeout(() => {
        onPaymentSuccess({
          method: provider,
          transactionId: response.data?.transactionId,
          amount: rental.pricing.totalPrice,
        });
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.message || "Mobile money payment failed");
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = (e) => {
    if (selectedMethod === "stripe") {
      handleStripePayment(e);
    } else if (selectedMethod === "paypal") {
      handlePayPalPayment();
    } else if (["orange", "mtn", "moov"].includes(selectedMethod)) {
      handleMobileMoneyPayment();
    }
  };

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  if (success) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl text-center p-8">
          <CheckCircle size={64} className="mx-auto text-emerald-600 mb-4" />
          <h3 className="text-xl font-bold text-gray-800 mb-2">Payment Successful!</h3>
          <p className="text-gray-600 mb-6">
            Your rental is confirmed. You’ll receive a confirmation email shortly.
          </p>
          <button
            onClick={onClose}
            className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

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
            disabled={loading}
            className="text-white hover:bg-white/20 rounded-full p-1 transition disabled:opacity-50"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6">
          {/* ... (Rental Summary & Escrow Banner - keep as-is) ... */}
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
                  📏 {rental.pricing?.numberOfHectares || 0} hectares
                </p>
              </>
            )}
            <div className="mt-3 pt-3 border-t border-blue-200">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-gray-700">Total Amount:</span>
                <span className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  ${rental.pricing?.totalPrice?.toFixed(2) || "0.00"}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-6">
            <div className="flex items-start gap-2">
              <Shield size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-gray-800 mb-1">🔒 Your Payment is Protected</p>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li>✓ Funds held securely in escrow</li>
                  <li>✓ Released only after service completion</li>
                  <li>✓ Full refund if service not delivered</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Step 1: Select Method */}
          {step === 1 && (
            <div>
              <h3 className="font-bold text-gray-800 mb-4">Choose Payment Method</h3>
              <div className="space-y-3">
                {paymentMethods.map((method) => (
                  <button
                    key={method.id}
                    onClick={() => handleMethodSelect(method.id)}
                    className={`w-full border-2 rounded-xl p-4 flex items-center gap-4 hover:border-emerald-500 hover:bg-emerald-50 transition relative ${
                      method.recommended ? "border-emerald-200 bg-emerald-50/50" : "border-gray-200"
                    }`}
                  >
                    {method.recommended && (
                      <span className="absolute top-2 right-2 bg-emerald-500 text-white text-xs px-2 py-1 rounded-full font-semibold">
                        Recommended
                      </span>
                    )}
                    <div className={`text-${method.color}-600`}>{method.icon}</div>
                    <div className="text-left flex-1">
                      <p className="font-semibold text-gray-800">{method.name}</p>
                      <p className="text-xs text-gray-500">{method.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Stripe Embedded Form */}
          {step === 2 && selectedMethod === "stripe" && (
            <div>
              <button
                onClick={() => setStep(1)}
                className="text-emerald-600 text-sm font-semibold mb-4 hover:underline"
              >
                ← Change payment method
              </button>

              <form onSubmit={handleStripePayment}>
                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-4 mb-4 border border-blue-100">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Card Details
                  </label>
                  <div className="border border-gray-300 rounded-xl p-3 bg-white">
                    <CardElement
                      options={{
                        style: {
                          base: {
                            fontSize: "16px",
                            color: "#424770",
                            "::placeholder": {
                              color: "#aab7c4",
                            },
                          },
                          invalid: {
                            color: "#9e2146",
                          },
                        },
                      }}
                    />
                  </div>
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm flex items-center gap-2">
                    <AlertCircle size={16} /> {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!stripe || loading}
                  className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-4 rounded-xl font-bold hover:shadow-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Processing...
                    </span>
                  ) : (
                    `Pay $${rental.pricing?.totalPrice?.toFixed(2)}`
                  )}
                </button>

                <div className="mt-4 text-center">
                  <p className="text-xs text-gray-500">
                    Secured by{" "}
                    <span className="font-semibold text-blue-600">Stripe</span>
                  </p>
                </div>
              </form>
            </div>
          )}

          {/* Step 2: PayPal */}
          {step === 2 && selectedMethod === "paypal" && (
            <div>
              <button
                onClick={() => setStep(1)}
                className="text-indigo-600 text-sm font-semibold mb-4"
              >
                ← Change payment method
              </button>
              <h3 className="font-bold text-gray-800 mb-4">PayPal Payment</h3>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                <p className="text-sm text-gray-700">
                  You will be redirected to PayPal to complete your payment securely.
                </p>
              </div>
              {error && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm flex items-center gap-2">
                  <AlertCircle size={16} /> {error}
                </div>
              )}
              <button
                onClick={handlePayPalPayment}
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
              <h3 className="font-bold text-gray-800 mb-4">Mobile Money Payment</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Provider</label>
                  <select
                    value={mobileMoneyDetails.provider}
                    onChange={(e) =>
                      setMobileMoneyDetails({ ...mobileMoneyDetails, provider: e.target.value })
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
                  <label className="block text-sm font-semibold mb-2">Phone Number</label>
                  <input
                    type="tel"
                    value={mobileMoneyDetails.phoneNumber}
                    onChange={(e) =>
                      setMobileMoneyDetails({
                        ...mobileMoneyDetails,
                        phoneNumber: e.target.value.replace(/\D/g, ""),
                      })
                    }
                    placeholder="e.g. 0712345678"
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-orange-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Account Name</label>
                  <input
                    type="text"
                    value={mobileMoneyDetails.name}
                    onChange={(e) =>
                      setMobileMoneyDetails({ ...mobileMoneyDetails, name: e.target.value })
                    }
                    placeholder="John Doe"
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm text-gray-700">
                  You will receive a prompt on your phone to authorize this payment.
                </p>
              </div>
              {error && (
                <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm flex items-center gap-2">
                  <AlertCircle size={16} /> {error}
                </div>
              )}
              <button
                onClick={handleMobileMoneyPayment}
                disabled={loading}
                className="w-full mt-6 bg-gradient-to-r from-orange-600 to-amber-600 text-white py-4 rounded-xl font-bold hover:shadow-xl transition disabled:opacity-50"
              >
                Send Payment Request
              </button>
            </div>
          )}

          {/* Step 3: Processing (for PayPal/Mobile redirect simulation) */}
          {step === 3 && loading && (
            <div className="text-center py-8">
              <div className="w-16 h-16 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Processing...</h3>
              <p className="text-gray-600 text-sm">Please wait</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}