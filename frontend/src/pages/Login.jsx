import { GoogleLogin } from '@react-oauth/google';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState('');

  // After login, send the user wherever they were trying to go (e.g. a shared webinar)
  const redirect = params.get('redirect');
  const dest = redirect && redirect.startsWith('/') ? redirect : '/dashboard';

  const onSuccess = async (cred) => {
    try {
      await loginWithGoogle(cred.credential);
      navigate(dest);
    } catch {
      setError('Login failed — please try again.');
    }
  };

  return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" style={{ maxWidth: 400, width: '100%', textAlign: 'center', padding: '40px 32px' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, marginBottom: 6 }}>
          code<span style={{ color: 'var(--accent)' }}>With</span>Shivah
        </div>
        <p className="muted small" style={{ marginBottom: 28 }}>
          Short, outcome-focused courses.<br />Sign in to start learning.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <GoogleLogin onSuccess={onSuccess} onError={() => setError('Login failed — please try again.')} theme="filled_black" shape="pill" />
        </div>
        {error && <p className="small" style={{ color: 'var(--danger)', marginTop: 16 }}>{error}</p>}
      </div>
    </div>
  );
}
