import { GoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleSuccess = async (credentialResponse) => {
    try {
      const user = await loginWithGoogle(credentialResponse.credential);
      navigate(user.role === 'admin' ? '/admin' : '/episodes');
    } catch (err) {
      alert('Login failed. Please try again.');
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo / Brand */}
        <div style={styles.brand}>
          <span style={styles.brandAccent}>PyMaster</span>
          <span style={styles.brandWhite}> India</span>
        </div>
        <p style={styles.tagline}>Python A to Z — Beginner to Data Scientist</p>

        <div style={styles.divider} />

        <h2 style={styles.heading}>Access your notes & resources</h2>
        <p style={styles.sub}>
          Sign in with your Google account to download episode notes,
          PDFs, tasks and more — completely free.
        </p>

        <div style={styles.googleWrap}>
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={() => alert('Google login failed')}
            useOneTap
            theme="filled_blue"
            shape="rectangular"
            text="continue_with"
            size="large"
          />
        </div>

        <p style={styles.note}>
          No password needed. One click and you are in.
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0a0f1e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  card: {
    background: '#111827',
    border: '1px solid #1e3a5f',
    borderRadius: '16px',
    padding: '48px 40px',
    maxWidth: '420px',
    width: '100%',
    textAlign: 'center',
  },
  brand: {
    fontSize: '32px',
    fontWeight: '700',
    marginBottom: '8px',
    fontFamily: 'Arial, sans-serif',
  },
  brandAccent: { color: '#4A9EFF' },
  brandWhite:  { color: '#FFFFFF' },
  tagline: {
    color: '#6B8CAE',
    fontSize: '14px',
    marginBottom: '32px',
    fontFamily: 'Arial, sans-serif',
  },
  divider: {
    height: '1px',
    background: '#1e3a5f',
    marginBottom: '32px',
  },
  heading: {
    color: '#FFFFFF',
    fontSize: '20px',
    fontWeight: '600',
    marginBottom: '12px',
    fontFamily: 'Arial, sans-serif',
  },
  sub: {
    color: '#8899AA',
    fontSize: '14px',
    lineHeight: '1.6',
    marginBottom: '32px',
    fontFamily: 'Arial, sans-serif',
  },
  googleWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '20px',
  },
  note: {
    color: '#4A6A8A',
    fontSize: '12px',
    fontFamily: 'Arial, sans-serif',
  },
};
