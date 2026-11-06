import { GoogleLogin } from '@react-oauth/google';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth, SIGNED_OUT_KEY } from '../context/AuthContext';

export default function Login() {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState('');
  // Why we signed them out (e.g. signed in on another device), shown once
  const [notice] = useState(() => {
    try { return sessionStorage.getItem(SIGNED_OUT_KEY) || ''; } catch { return ''; }
  });
  useEffect(() => { try { sessionStorage.removeItem(SIGNED_OUT_KEY); } catch { /* private mode */ } }, []);

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
        {notice && (
          <div className="small" role="status" style={{ background: 'var(--surface-2, rgba(255,255,255,.04))', border: '1px solid var(--warning)', borderRadius: 10, padding: '10px 12px', marginBottom: 18, textAlign: 'left' }}>
            {notice} Your account can be open on one device at a time.
          </div>
        )}
        <p className="muted small" style={{ marginBottom: 28 }}>
          Live classes and short courses in Hinglish.<br />Sign in with Google to continue.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <GoogleLogin onSuccess={onSuccess} onError={() => setError('Login failed — please try again.')} theme="filled_black" shape="pill" />
        </div>
        {error && <p className="small" style={{ color: 'var(--danger)', marginTop: 16 }}>{error}</p>}
        <p className="small" style={{ marginTop: 24 }}><Link to="/" className="muted">See what’s on offer first</Link></p>
      </div>
    </div>
  );
}
