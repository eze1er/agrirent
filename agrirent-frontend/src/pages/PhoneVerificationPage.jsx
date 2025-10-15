import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import PhoneVerification from '../components/PhoneVerification';

export default function PhoneVerificationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const email = searchParams.get('email');
  const phone = searchParams.get('phone');

  const handleSuccess = () => {
    // After phone verification, go to email verification
    navigate(`/verify-email?email=${encodeURIComponent(email)}`);
  };

  const handleSkip = () => {
    // Skip phone verification, go straight to email verification
    navigate(`/verify-email?email=${encodeURIComponent(email)}`);
  };

  return (
    <PhoneVerification
      userEmail={email}
      userPhone={phone}
      onSuccess={handleSuccess}
      onSkip={handleSkip}
    />
  );
}