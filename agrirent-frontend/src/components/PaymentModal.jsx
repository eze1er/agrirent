// src/components/PaymentModal.jsx
import { useState } from "react";
import {
  X,
  CreditCard,
  Smartphone,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { paymentAPI } from "../services/api";

export default function PaymentModal({ rental, onClose, onPaymentSuccess }) {
  const [selectedMethod, setSelectedMethod] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [step, setStep] = useState(1);

  // Stripe payment state
  const [cardDetails, setCardDetails] = useState({
    cardNumber: "",
    expiry: "",
    cvc: "",
    name: "",
  });

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

  const formatCardNumber = (value) => {
    const v = value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
    const parts = [];
    for (let i = 0; i < v.length; i += 4) {
      parts.push(v.substring(i, i + 4));
    }
    return parts.join(" ").substring(0, 19);
  };

  const formatExpiry = (value) => {
    const v = value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
    if (v.length >= 2) {
      return v.slice(0, 2) + "/" + v.slice(2, 4);
    }
    return v;
  };
  // the good one
  //  const handleStripePayment = async () => {
  //   if (!cardDetails.cardNumber || !cardDetails.expiry || !cardDetails.cvc || !cardDetails.name) {
  //     setError("Please fill in all card details");
  //     return;
  //   }

  //   setLoading(true);
  //   setError("");
  //   setStep(3);

  //   try {
  //     // Step 1: Create payment intent
  //     const createResponse = await paymentAPI.createStripePayment({
  //       amount: rental.pricing.totalPrice,
  //       currency: "usd",
  //       rentalId: rental._id,
  //     });

  //     console.log('Create payment response:', createResponse.data); // Debug log

  //     // ✅ Check if we got the payment intent ID
  //     if (!createResponse.data?.data?.clientSecret) {
  //       throw new Error('No payment intent created');
  //     }

  //     // For demo/testing: simulate successful payment
  //     // In production, you'd use Stripe.js here to actually process the card

  //     // Step 2: Confirm payment (simulate success)
  //     // Extract payment intent ID from client secret
  //     const clientSecret = createResponse.data.data.clientSecret;
  //     const paymentIntentId = clientSecret.split('_secret_')[0];

  //     console.log('Payment intent ID:', paymentIntentId); // Debug log

  //     // ✅ Make sure paymentIntentId exists before confirming
  //     if (!paymentIntentId) {
  //       throw new Error('Invalid payment intent ID');
  //     }

  //     const confirmResponse = await paymentAPI.confirmStripePayment(paymentIntentId);

  //     setSuccess(true);
  //     setTimeout(() => {
  //       onPaymentSuccess({
  //         method: "stripe",
  //         transactionId: paymentIntentId,
  //         amount: rental.pricing.totalPrice,
  //       });
  //     }, 1500);
  //   } catch (err) {
  //     console.error('Payment error:', err); // Debug log
  //     setError(err.response?.data?.message || err.message || "Payment failed");
  //     setStep(2);
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  // In PaymentModal.js - TESTING ONLY
  const handleStripePayment = async () => {
    if (
      !cardDetails.cardNumber ||
      !cardDetails.expiry ||
      !cardDetails.cvc ||
      !cardDetails.name
    ) {
      setError("Please fill in all card details");
      return;
    }

    setLoading(true);
    setError("");
    setStep(3);

    try {
      // FOR TESTING: Skip Stripe and directly mark as paid
      const testMode = !import.meta.env.STRIPE_PUBLISHABLE_KEY;

      if (testMode) {
        // Simulate payment success
        await new Promise((resolve) => setTimeout(resolve, 2000));

        setSuccess(true);
        setTimeout(() => {
          onPaymentSuccess({
            method: "stripe",
            transactionId: "test_" + Date.now(),
            amount: rental.pricing.totalPrice,
          });
        }, 1500);
        return;
      }

      // Real Stripe flow
      const createResponse = await paymentAPI.createStripePayment({
        amount: rental.pricing.totalPrice,
        currency: "usd",
        rentalId: rental._id,
      });

      if (!createResponse.data?.data?.paymentIntentId) {
        throw new Error("No payment intent ID received");
      }

      const paymentIntentId = createResponse.data.data.paymentIntentId;

      const confirmResponse = await paymentAPI.confirmStripePayment(
        paymentIntentId
      );

      setSuccess(true);
      setTimeout(() => {
        onPaymentSuccess({
          method: "stripe",
          transactionId: paymentIntentId,
          amount: rental.pricing.totalPrice,
        });
      }, 1500);
    } catch (err) {
      console.error("Payment error:", err);
      setError(err.response?.data?.message || err.message || "Payment failed");
      setStep(2);
    } finally {
      setLoading(false);
    }
  };
// backend/routes/paymentRoutes.js
// router.post('/debug-payment', protect, async (req, res) => {
//   try {
//     const { rentalId } = req.body;
    
//     const rental = await Rental.findById(rentalId);
//     const payment = await Payment.findOne({ rentalId });
    
//     res.json({
//       rental: {
//         id: rental?._id,
//         status: rental?.status,
//         payment: rental?.payment,
//       },
//       payment: payment ? {
//         id: payment._id,
//         transactionId: payment.transactionId,
//         escrowStatus: payment.escrowStatus,
//       } : null
//     });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

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
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-cyan-600 text-white p-4 rounded-t-2xl flex justify-between items-center">
          <h2 className="text-xl font-bold">Complete Payment</h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-full p-1 transition"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6">
          {/* Rental Summary */}
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-4 mb-6">
            <h3 className="font-bold text-gray-800 mb-2">Rental Summary</h3>
            <p className="text-sm text-gray-600 mb-1">
              {rental.machineId?.name || "Machine"}
            </p>
            {rental.rentalType === "daily" ? (
              <p className="text-sm text-gray-600">
                {new Date(rental.startDate).toLocaleDateString()} -{" "}
                {new Date(rental.endDate).toLocaleDateString()}
              </p>
            ) : (
              <p className="text-sm text-gray-600">
                {rental.pricing?.numberOfHectares} Ha
              </p>
            )}
            <div className="mt-3 pt-3 border-t border-blue-200">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-gray-700">
                  Total Amount:
                </span>
                <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                  ${rental.pricing?.totalPrice?.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Step 1: Select Payment Method */}
          {step === 1 && (
            <div>
              <h3 className="font-bold text-gray-800 mb-4">
                Select Payment Method
              </h3>
              <div className="space-y-3">
                {paymentMethods.map((method) => (
                  <button
                    key={method.id}
                    onClick={() => handleMethodSelect(method.id)}
                    className="w-full border-2 border-gray-200 rounded-xl p-4 flex items-center gap-4 hover:border-blue-500 hover:bg-blue-50 transition"
                  >
                    <div className="text-blue-600">{method.icon}</div>
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

          {/* Step 2: Payment Details */}
          {step === 2 && selectedMethod === "stripe" && (
            <div>
              <button
                onClick={() => setStep(1)}
                className="text-blue-600 text-sm font-semibold mb-4"
              >
                ← Change payment method
              </button>
              <h3 className="font-bold text-gray-800 mb-4">Card Details</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Cardholder Name
                  </label>
                  <input
                    type="text"
                    value={cardDetails.name}
                    onChange={(e) =>
                      setCardDetails({ ...cardDetails, name: e.target.value })
                    }
                    placeholder="John Doe"
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Card Number
                  </label>
                  <input
                    type="text"
                    value={cardDetails.cardNumber}
                    onChange={(e) =>
                      setCardDetails({
                        ...cardDetails,
                        cardNumber: formatCardNumber(e.target.value),
                      })
                    }
                    placeholder="1234 5678 9012 3456"
                    maxLength="19"
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold mb-2">
                      Expiry Date
                    </label>
                    <input
                      type="text"
                      value={cardDetails.expiry}
                      onChange={(e) =>
                        setCardDetails({
                          ...cardDetails,
                          expiry: formatExpiry(e.target.value),
                        })
                      }
                      placeholder="MM/YY"
                      maxLength="5"
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">
                      CVC
                    </label>
                    <input
                      type="text"
                      value={cardDetails.cvc}
                      onChange={(e) =>
                        setCardDetails({
                          ...cardDetails,
                          cvc: e.target.value.replace(/\D/g, "").slice(0, 4),
                        })
                      }
                      placeholder="123"
                      maxLength="4"
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
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
                className="w-full mt-6 bg-gradient-to-r from-blue-600 to-cyan-600 text-white py-4 rounded-xl font-bold hover:shadow-xl transition disabled:opacity-50"
              >
                Pay ${rental.pricing?.totalPrice?.toFixed(2)}
              </button>
            </div>
          )}

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

          {/* Step 3: Processing/Success */}
          {step === 3 && (
            <div className="text-center py-8">
              {loading && !success && (
                <div>
                  <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <h3 className="text-xl font-bold text-gray-800 mb-2">
                    Processing Payment...
                  </h3>
                  <p className="text-gray-600">
                    Please wait while we process your payment
                  </p>
                </div>
              )}
              {success && (
                <div>
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
          )}
        </div>
      </div>
    </div>
  );
}
