import { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import Toast from '../components/Toast';

const API = import.meta.env.VITE_API_URL;

// Your account: who you are, and how you sign in.
export default function Account() {
  const { user, logout } = useAuth();
  const [f, setF] = useState({ current: '', next: '', phone: user.phone || '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const body = { next: f.next };
      if (user.hasPassword) body.current = f.current;
      if (f.phone !== (user.phone || '')) body.phone = f.phone;
      const { data } = await axios.post(`${API}/auth/password`, body);
      setToast(data.message); setDone(true); setF({ current: '', next: '', phone: f.phone });
      // the user object is refreshed on next load; reflect the important bit now
      user.hasPassword = true; if (body.phone) user.phone = f.phone.replace(/\D/g, '').slice(-10);
    } catch (e2) { setErr(e2.response?.data?.message || 'Could not save'); }
    finally { setBusy(false); }
  };

  return (
    <div className="page">
      <div className="container section ac">
        <h1>Your account</h1>
        <p className="muted ac-lead">How you sign in to codeWithShivah. Only one device can be signed in at a time.</p>

        <section className="ac-card">
          <h2>You</h2>
          <dl className="ac-rows">
            <div><dt>Name</dt><dd>{user.name}</dd></div>
            <div><dt>Email</dt><dd>{user.email}</dd></div>
            <div><dt>Mobile</dt><dd>{user.phone || <span className="muted">Not added</span>}</dd></div>
            <div><dt>Sign in with</dt><dd>{[user.avatar || !user.hasPassword ? 'Google' : null, user.hasPassword ? 'Email or mobile + password' : null].filter(Boolean).join(', or ')}</dd></div>
          </dl>
          <p className="small muted">To change your name or email, message Rajeev sir.</p>
        </section>

        <form className="ac-card" onSubmit={save}>
          <h2>{user.hasPassword ? 'Change password' : 'Add a password'}</h2>
          {!user.hasPassword && <p className="muted small" style={{ marginBottom: 12 }}>So you can sign in with your email or mobile number when Google is being difficult.</p>}
          {user.hasPassword && (
            <div className="au-field">
              <label htmlFor="ac-current">Current password</label>
              <input id="ac-current" type={show ? 'text' : 'password'} value={f.current} onChange={set('current')} autoComplete="current-password" required />
            </div>
          )}
          <div className="au-field">
            <label htmlFor="ac-next">New password</label>
            <span className="au-pw">
              <input id="ac-next" type={show ? 'text' : 'password'} value={f.next} onChange={set('next')} autoComplete="new-password" minLength={6} required placeholder="At least 6 characters" />
              <button type="button" className="au-eye" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide passwords' : 'Show passwords'}>{show ? 'Hide' : 'Show'}</button>
            </span>
          </div>
          <div className="au-field">
            <label htmlFor="ac-phone">Mobile number</label>
            <input id="ac-phone" type="tel" inputMode="numeric" value={f.phone} onChange={set('phone')} placeholder="10 digits" autoComplete="tel" />
            <small>You can sign in with this instead of your email.</small>
          </div>
          {err && <p className="au-error" role="alert">{err}</p>}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : user.hasPassword ? 'Change password' : 'Add password'}</button>
          {done && <p className="small muted" style={{ marginTop: 10 }}>Saved. Use it the next time you sign in.</p>}
        </form>

        <button className="btn btn-ghost ac-out" onClick={logout}>Log out</button>
      </div>
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
