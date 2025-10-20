// src/components/PaymentModal.jsx - CORRECTED ENDPOINTS
import { useState } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { X } from 'lucide-react';

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

  // ✅ METHOD 1: Stripe Checkout (CORRECTED - Uses create-checkout-session)
  const handleCheckout = async () => {
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      
      console.log('🔄 Creating checkout session for rental:', rental._id);
      
      // ✅ CORRECT ENDPOINT
      const response = await fetch('http://localhost:3001/api/payments/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ rentalId: rental._id })
      });

      console.log('📦 Response status:', response.status);
      const data = await response.json();
      console.log('📦 Response data:', data);

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

  // ✅ METHOD 2: Inline Payment (CORRECTED - Uses create-payment)
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

      console.log('🔄 Creating payment method...');

      // Create payment method with Stripe
      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      });

      if (pmError) {
        throw new Error(pmError.message);
      }

      console.log('✅ Payment method created:', paymentMethod.id);
      console.log('🔄 Processing payment...');

      // ✅ CORRECT ENDPOINT - create-payment
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

      console.log('📦 Payment response status:', response.status);
      const data = await response.json();
      console.log('📦 Payment response data:', data);

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

          {/* OPTION 1: Stripe Checkout - RECOMMENDED */}
          <div className="mb-4">
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
                  Opening Checkout...
                </span>
              ) : (
                `💳 Pay $${rental.pricing?.totalPrice?.toFixed(2)} with Stripe`
              )}
            </button>
            <p className="text-xs text-gray-500 text-center mt-2">
              ✅ Recommended • Secure checkout page
            </p>
          </div>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-500">Or pay with card</span>
            </div>
          </div>

          {/* OPTION 2: Inline Card Form */}
          <div>
            <div className="mb-4">
              <label className="block text-sm font-bold text-gray-700 mb-3">
                💳 Card Information
              </label>
              <div className="border-2 border-gray-300 rounded-xl p-4 bg-white focus-within:border-blue-500 transition">
                <CardElement
                  options={CARD_ELEMENT_OPTIONS}
                  onChange={(e) => {
                    setCardComplete(e.complete);
                    if (e.error) {
                      setError(e.error.message);
                    } else {
                      setError('');
                    }
                  }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                🔒 Secured by Stripe • Never stored on our servers
              </p>
            </div>

            {/* Test Card Info */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-xs font-bold text-amber-900 mb-1">🧪 Test Card</p>
              <div className="grid grid-cols-2 gap-2 text-xs text-amber-800">
                <div>
                  <span className="font-semibold">Number:</span>
                  <p className="font-mono">4242 4242 4242 4242</p>
                </div>
                <div>
                  <span className="font-semibold">Expiry:</span>
                  <p>Any future date</p>
                </div>
                <div>
                  <span className="font-semibold">CVC:</span>
                  <p>Any 3 digits</p>
                </div>
                <div>
                  <span className="font-semibold">ZIP:</span>
                  <p>Any 5 digits</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleInlinePayment}
              disabled={loading || !stripe || !cardComplete}
              className={`w-full py-4 rounded-xl font-bold text-lg transition ${
                loading || !stripe || !cardComplete
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:shadow-lg'
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                  Processing...
                </span>
              ) : (
                `Pay $${rental.pricing?.totalPrice?.toFixed(2)}`
              )}
            </button>
          </div>

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