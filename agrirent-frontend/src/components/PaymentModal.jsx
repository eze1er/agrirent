// src/components/PaymentModal.jsx - WITH MOBILE MONEY OPTIONS
import { useState } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { X, CreditCard, Smartphone } from 'lucide-react';

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: '#1f2937',
      letterSpacing: '0.025em',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      '::placeholder': {
        color: '#9ca3af',
      },
    },
    invalid: {
      color: '#ef4444',
    },
  },
  hidePostalCode: false,
};

export default function PaymentModal({ rental, onClose, onPaymentSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cardComplete, setCardComplete] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('stripe'); // 'stripe', 'orange', 'mtn', 'moov'
  const [phone, setPhone] = useState('');

  // ============================================
  // STRIPE CHECKOUT
  // ============================================
  const handleCheckout = async () => {
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      
      console.log('🔄 Creating checkout session for rental:', rental._id);
      
      const response = await fetch('http://localhost:3001/api/payments/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ rentalId: rental._id })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Server error: ${response.status}`);
      }

      if (data.success && data.data.url) {
        console.log('✅ Redirecting to Stripe checkout...');
        window.location.href = data.data.url;
      } else {
        throw new Error('No checkout URL received from server');
      }
    } catch (err) {
      console.error('❌ Checkout error:', err);
      setError(err.message || 'Failed to create checkout session');
      setLoading(false);
    }
  };

  // ============================================
  // STRIPE INLINE PAYMENT
  // ============================================
  const handleInlinePayment = async () => {
    if (!stripe || !elements) {
      setError('Payment system is still loading...');
      return;
    }

    if (!cardComplete) {
      setError('Please complete your card information');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const cardElement = elements.getElement(CardElement);

      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      });

      if (pmError) {
        throw new Error(pmError.message);
      }

      const response = await fetch('http://localhost:3001/api/payments/create-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          rentalId: rental._id,
          paymentMethod: paymentMethod.id
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Payment failed: ${response.status}`);
      }

      if (data.success) {
        console.log('✅ Payment successful!');
        
        if (onPaymentSuccess) {
          onPaymentSuccess({
            transactionId: data.data.transactionId,
            rental: data.data.rental,
            payment: data.data.payment
          });
        }
      } else {
        throw new Error(data.message || 'Payment was not successful');
      }
    } catch (err) {
      console.error('❌ Payment error:', err);
      setError(err.message || 'Payment failed. Please try again.');
      setLoading(false);
    }
  };

  // ============================================
  // ORANGE MONEY PAYMENT
  // ============================================
  const handleOrangeMoneyPayment = async () => {
    if (!phone) {
      setError('Please enter your Orange Money phone number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');

      console.log('🔄 Initiating Orange Money payment...');

      const response = await fetch(`http://localhost:3001/api/payments/orange-money/init-payment/${rental._id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          phone: phone
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to initiate Orange Money payment');
      }

      if (data.success && data.data.paymentUrl) {
        console.log('✅ Redirecting to Orange Money...');
        window.location.href = data.data.paymentUrl;
      } else {
        throw new Error('No payment URL received');
      }
    } catch (err) {
      console.error('❌ Orange Money error:', err);
      setError(err.message || 'Failed to process Orange Money payment');
      setLoading(false);
    }
  };

  // ============================================
  // MTN MONEY PAYMENT (PLACEHOLDER - YOU'LL NEED TO IMPLEMENT BACKEND)
  // ============================================
  const handleMTNPayment = async () => {
    if (!phone) {
      setError('Please enter your MTN Mobile Money phone number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');

      const response = await fetch(`http://localhost:3001/api/payments/mtn-money/init-payment/${rental._id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          phone: phone
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to initiate MTN payment');
      }

      if (data.success) {
        // Handle MTN payment success
        if (onPaymentSuccess) {
          onPaymentSuccess(data.data);
        }
      }
    } catch (err) {
      console.error('❌ MTN Money error:', err);
      setError(err.message || 'MTN Money payment is not yet configured. Please contact support.');
      setLoading(false);
    }
  };

  // ============================================
  // MOOV MONEY PAYMENT (PLACEHOLDER - YOU'LL NEED TO IMPLEMENT BACKEND)
  // ============================================
  const handleMoovPayment = async () => {
    if (!phone) {
      setError('Please enter your Moov Money phone number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');

      const response = await fetch(`http://localhost:3001/api/payments/moov-money/init-payment/${rental._id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          phone: phone
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to initiate Moov payment');
      }

      if (data.success) {
        if (onPaymentSuccess) {
          onPaymentSuccess(data.data);
        }
      }
    } catch (err) {
      console.error('❌ Moov Money error:', err);
      setError(err.message || 'Moov Money payment is not yet configured. Please contact support.');
      setLoading(false);
    }
  };

  // ============================================
  // HANDLE PAYMENT BASED ON SELECTED METHOD
  // ============================================
  const handlePayment = () => {
    switch (paymentMethod) {
      case 'stripe':
        return handleCheckout();
      case 'stripe-inline':
        return handleInlinePayment();
      case 'orange':
        return handleOrangeMoneyPayment();
      case 'mtn':
        return handleMTNPayment();
      case 'moov':
        return handleMoovPayment();
      default:
        setError('Please select a payment method');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white p-6 rounded-t-2xl sticky top-0 z-10">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Complete Payment</h2>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 p-2 rounded-lg transition"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Rental Summary */}
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-4 mb-6">
            <h3 className="font-bold text-gray-900 mb-3">
              {rental.machineId?.name || 'Machine Rental'}
            </h3>
            
            {rental.rentalType === 'daily' ? (
              <div className="text-sm text-gray-700 space-y-2">
                <div className="flex justify-between">
                  <span>📅 Start:</span>
                  <span className="font-semibold">{new Date(rental.startDate).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>📅 End:</span>
                  <span className="font-semibold">{new Date(rental.endDate).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>⏱️ Duration:</span>
                  <span className="font-semibold">{rental.pricing?.numberOfDays} days</span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-700 space-y-2">
                <div className="flex justify-between">
                  <span>📅 Date:</span>
                  <span className="font-semibold">{new Date(rental.workDate).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>📏 Area:</span>
                  <span className="font-semibold">{rental.pricing?.numberOfHectares} Ha</span>
                </div>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-blue-200 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-semibold">${rental.pricing?.subtotal?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Service Fee (10%):</span>
                <span className="font-semibold">${rental.pricing?.serviceFee?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xl font-bold pt-2 border-t border-blue-200">
                <span className="text-gray-900">Total:</span>
                <span className="text-blue-600">${rental.pricing?.totalPrice?.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg mb-4">
              <p className="text-sm font-semibold text-red-800">❌ {error}</p>
            </div>
          )}

          {/* Payment Method Selection */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-700 mb-3">
              Select Payment Method
            </label>
            
            <div className="space-y-3">
              {/* Stripe Card Payment */}
              <button
                onClick={() => setPaymentMethod('stripe')}
                className={`w-full p-4 rounded-xl border-2 transition flex items-center gap-3 ${
                  paymentMethod === 'stripe'
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-300 hover:border-blue-400'
                }`}
              >
                <CreditCard className={paymentMethod === 'stripe' ? 'text-blue-600' : 'text-gray-600'} size={24} />
                <div className="text-left flex-1">
                  <div className="font-bold text-gray-900">Credit/Debit Card</div>
                  <div className="text-xs text-gray-500">Visa, Mastercard, Amex</div>
                </div>
                {paymentMethod === 'stripe' && (
                  <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-white"></div>
                  </div>
                )}
              </button>

              {/* Orange Money */}
              <button
                onClick={() => setPaymentMethod('orange')}
                className={`w-full p-4 rounded-xl border-2 transition flex items-center gap-3 ${
                  paymentMethod === 'orange'
                    ? 'border-orange-600 bg-orange-50'
                    : 'border-gray-300 hover:border-orange-400'
                }`}
              >
                <Smartphone className={paymentMethod === 'orange' ? 'text-orange-600' : 'text-gray-600'} size={24} />
                <div className="text-left flex-1">
                  <div className="font-bold text-gray-900">Orange Money</div>
                  <div className="text-xs text-gray-500">Pay with your Orange Money account</div>
                </div>
                {paymentMethod === 'orange' && (
                  <div className="w-5 h-5 rounded-full bg-orange-600 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-white"></div>
                  </div>
                )}
              </button>

              {/* MTN Money */}
              <button
                onClick={() => setPaymentMethod('mtn')}
                className={`w-full p-4 rounded-xl border-2 transition flex items-center gap-3 ${
                  paymentMethod === 'mtn'
                    ? 'border-yellow-600 bg-yellow-50'
                    : 'border-gray-300 hover:border-yellow-400'
                }`}
              >
                <Smartphone className={paymentMethod === 'mtn' ? 'text-yellow-600' : 'text-gray-600'} size={24} />
                <div className="text-left flex-1">
                  <div className="font-bold text-gray-900">MTN Mobile Money</div>
                  <div className="text-xs text-gray-500">Pay with your MTN account</div>
                </div>
                {paymentMethod === 'mtn' && (
                  <div className="w-5 h-5 rounded-full bg-yellow-600 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-white"></div>
                  </div>
                )}
              </button>

              {/* Moov Money */}
              <button
                onClick={() => setPaymentMethod('moov')}
                className={`w-full p-4 rounded-xl border-2 transition flex items-center gap-3 ${
                  paymentMethod === 'moov'
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-300 hover:border-blue-400'
                }`}
              >
                <Smartphone className={paymentMethod === 'moov' ? 'text-blue-600' : 'text-gray-600'} size={24} />
                <div className="text-left flex-1">
                  <div className="font-bold text-gray-900">Moov Money</div>
                  <div className="text-xs text-gray-500">Pay with your Moov account</div>
                </div>
                {paymentMethod === 'moov' && (
                  <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-white"></div>
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Payment Form Based on Selected Method */}
          {paymentMethod === 'stripe' && (
            <div>
              <button
                onClick={handleCheckout}
                disabled={loading}
                className={`w-full py-4 rounded-xl font-bold text-lg transition shadow-lg ${
                  loading
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:shadow-xl hover:scale-[1.02]'
                }`}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                    Processing...
                  </span>
                ) : (
                  `💳 Pay $${rental.pricing?.totalPrice?.toFixed(2)}`
                )}
              </button>
            </div>
          )}

          {/* Mobile Money Phone Number Input */}
          {(paymentMethod === 'orange' || paymentMethod === 'mtn' || paymentMethod === 'moov') && (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                📱 Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+243 XXX XXX XXX"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none mb-4"
              />
              
              <button
                onClick={handlePayment}
                disabled={loading || !phone}
                className={`w-full py-4 rounded-xl font-bold text-lg transition shadow-lg ${
                  loading || !phone
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : paymentMethod === 'orange'
                    ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:shadow-xl hover:scale-[1.02]'
                    : paymentMethod === 'mtn'
                    ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-white hover:shadow-xl hover:scale-[1.02]'
                    : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:shadow-xl hover:scale-[1.02]'
                }`}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                    Processing...
                  </span>
                ) : (
                  `📱 Pay $${rental.pricing?.totalPrice?.toFixed(2)}`
                )}
              </button>
            </div>
          )}

          {/* Security Notice */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
            <p className="text-xs text-blue-900 text-center leading-relaxed">
              🔒 Your payment is held securely in escrow until service completion.<br/>
              Funds are released only after you confirm the job is done.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}