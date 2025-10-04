import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    
    if (token) {
      // Store token in localStorage
      localStorage.setItem('token', token);
      
      // Redirect to dashboard
      navigate('/dashboard');
    } else {
      // Handle error
      const error = searchParams.get('error');
      navigate('/login?error=' + (error || 'unknown'));
    }
  }, [searchParams, navigate]);

  return <div>Logging you in...</div>;
}

export default AuthCallback;