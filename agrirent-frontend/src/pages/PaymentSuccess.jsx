import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { paymentAPI, rentalAPI } from '../services/api';
import { CheckCircle, AlertCircle, Loader } from 'lucide-react';

export default function PaymentSuccess() {
  const { rentalId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session_id');

  const [status, setStatus] = useState('verifying'); // verifying, success, error
  const [message, setMessage] = useState('Verifying your payment...');
  const [rental, setRental] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const verifyPayment = async () => {
      try {
        if (!sessionId) {
          setStatus('error');
          setMessage('No session ID found');
          setError('Payment session not found. Please try again.');
          return;
        }

        console.log('Verifying session:', sessionId);

        // Step 1: Verify the session with Stripe
        const verifyResponse = await paymentAPI.verifySession(sessionId);
        console.log('Verify session response:', verifyResponse.data);

        if (!verifyResponse.data.success || !verifyResponse.data.paid) {
          setStatus('error');
          setMessage('Payment verification failed');
          setError('Your payment could not be verified. Please contact support.');
          return;
        }

        console.log('Payment verified successfully');

        // Step 2: Fetch the rental to confirm status updated
        const rentalResponse = await rentalAPI.getById(rentalId);
        console.log('Rental after payment:', rentalResponse.data);

        const updatedRental = rentalResponse.data.data || rentalResponse.data.rental;

        if (updatedRental.status === 'active') {
          setRental(updatedRental);
          setStatus('success');
          setMessage('Payment received and confirmed!');

          // Wait 3 seconds then redirect
          setTimeout(() => {
            navigate(`/rentals/${rentalId}`);
          }, 3000);
        } else {
          console.warn('Rental status is:', updatedRental.status);
          setRental(updatedRental);
          setStatus('success');
          setMessage('Payment received! Updating rental...');

          // If status is still 'approved', manually call an endpoint to update it
          if (updatedRental.status === 'approved') {
            console.log('Status is still approved, forcing update...');
            // This shouldn't happen, but as a fallback
            setTimeout(() => {
              navigate(`/rentals/${rentalId}`);
            }, 3000);
          }
        }
      } catch (err) {
        console.error('Payment verification error:', err);
        setStatus('error');
        setMessage('Payment verification failed');
        setError(
          err.response?.data?.message ||
          err.message ||
          'An error occurred while verifying your payment. Please contact support.'
        );
      }
    };

    verifyPayment();
  }, [sessionId, rentalId, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8">
        <div className="text-center">
          {status === 'verifying' && (
            <>
              <Loader size={64} className="mx-auto text-blue-600 animate-spin mb-4" />
              <h1 className="text-2xl font-bold text-gray-800 mb-2">
                Verifying Payment
              </h1>
              <p className="text-gray-600 mb-4">{message}</p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-700">
                  Please wait while we confirm your payment with Stripe...
                </p>
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle size={64} className="mx-auto text-green-600 mb-4" />
              <h1 className="text-2xl font-bold text-gray-800 mb-2">
                Payment Successful!
              </h1>
              <p className="text-gray-600 mb-4">{message}</p>
              {rental && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-green-700 font-semibold">
                    Rental Status: {rental.status?.toUpperCase()}
                  </p>
                  <p className="text-xs text-green-600 mt-2">
                    Amount: ${rental.payment?.amount?.toFixed(2)}
                  </p>
                </div>
              )}
              <p className="text-sm text-gray-500">
                Redirecting you back to your rental...
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <AlertCircle size={64} className="mx-auto text-red-600 mb-4" />
              <h1 className="text-2xl font-bold text-gray-800 mb-2">
                Verification Failed
              </h1>
              <p className="text-gray-600 mb-4">{message}</p>
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition"
                >
                  Go to Dashboard
                </button>
                <button
                  onClick={() => navigate(`/rentals/${rentalId}`)}
                  className="flex-1 bg-gray-600 text-white py-2 rounded-lg hover:bg-gray-700 transition"
                >
                  Try Again
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}