import { GoogleLogin } from '@react-oauth/google';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth, SIGNED_OUT_KEY } from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL;

// One labelled input. The hint is linked with aria-describedby, not folded into the label.
function Field({ id, label, hint, bad, children }) {
  return (
    <div className={`au-field ${bad ? 'is-bad' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}

export default function Login() {
  const { loginWithGoogle, loginWithPassword, register, finishSignIn, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get('mode') === 'signup' ? 'signup' : 'signin');   // signin | signup | forgot | reset | saved
  const [opts, setOpts] = useState({ google: true, password: true, mail: false });
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', id: '', code: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errField, setErrField] = useState('');
  const [hint, setHint] = useState('');          // e.g. "code sent to vi••••@gmail.com"
  const [saved, setSaved] = useState(null);      // credentials to screenshot after sign-up
  const [copied, setCopied] = useState(false);
  const firstInput = useRef(null);

  // Why we signed them out (e.g. signed in on another device), shown once
  const [notice] = useState(() => { try { return sessionStorage.getItem(SIGNED_OUT_KEY) || ''; } catch { return ''; } });
  useEffect(() => { try { sessionStorage.removeItem(SIGNED_OUT_KEY); } catch { /* private mode */ } }, []);
  useEffect(() => { axios.get(`${API}/auth/options`).then(r => setOpts(r.data)).catch(() => {}); }, []);
  useEffect(() => { setError(''); setErrField(''); firstInput.current?.focus(); }, [mode]);

  // After login, send the user wherever they were trying to go (e.g. a shared webinar)
  const redirect = params.get('redirect');
  const dest = redirect && redirect.startsWith('/') ? redirect : '/dashboard';
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const fail = (err, fallback) => {
    setError(err.response?.data?.message || fallback);
    setErrField(err.response?.data?.field || '');
  };

  const onGoogle = async (cred) => {
    try { await loginWithGoogle(cred.credential); navigate(dest); }
    catch { setError('Google sign-in didn’t work. Try again, or use your email and password.'); }
  };

  const submitSignin = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await loginWithPassword(form.id, form.password); navigate(dest); }
    catch (err) { fail(err, 'Could not sign you in. Check your details.'); }
    finally { setBusy(false); }
  };

  const submitSignup = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const u = await register({ name: form.name, phone: form.phone, email: form.email, password: form.password });
      setSaved({ ...u, password: form.password });
      setMode('saved');
    } catch (err) {
      fail(err, 'Could not create your account. Check the details and try again.');
      if (err.response?.data?.code === 'GOOGLE_ACCOUNT') setForm(f => ({ ...f, id: f.email }));
    } finally { setBusy(false); }
  };

  const submitForgot = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const { data } = await axios.post(`${API}/auth/forgot`, { id: form.id });
      setHint(data.to ? `We’ve emailed a 6-digit code to ${data.to}. It works for 15 minutes.` : data.message);
      setMode('reset');
    } catch (err) { fail(err, 'Could not send the code.'); }
    finally { setBusy(false); }
  };

  const submitReset = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await resetPassword(form.id, form.code, form.password); navigate(dest); }
    catch (err) { fail(err, 'Could not change the password.'); }
    finally { setBusy(false); }
  };

  const copySaved = async () => {
    try {
      await navigator.clipboard.writeText(`codeWithShivah login\nEmail: ${saved.email}\nMobile: ${saved.phone}\nPassword: ${saved.password}\nhttps://learn.rajeevshivah.me/login`);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  };

  const pwField = (label = 'Password', hintText) => (
    <Field id="au-password" label={label} hint={hintText} bad={errField === 'password'}>
      <span className="au-pw">
        <input id="au-password" type={show ? 'text' : 'password'} value={form.password} onChange={set('password')} aria-describedby={hintText ? 'au-password-hint' : undefined}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={6} required placeholder={mode === 'signin' ? '' : 'At least 6 characters'} />
        <button type="button" className="au-eye" onClick={() => setShow(s => !s)} aria-pressed={show} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
      </span>
    </Field>
  );

  return (
    <div className="au">
      {/* Left: the board — what this is, in one breath */}
      <aside className="au-board" aria-hidden="true">
        <Link to="/" className="au-brand">code<span>With</span>Shivah</Link>
        <div className="au-board-text">
          <p className="au-board-big">Live classes in Hinglish.<br />Doubts solved on the spot.</p>
          <p className="au-board-sub">Python, ML, placements. Taught by Rajeev sir to students across UP and beyond.</p>
        </div>
        <ul className="au-board-list">
          <li>Join every class from one button on your home screen</li>
          <li>Recordings, notes and your doubts, in one place</li>
          <li>Tech news and hackathons picked for your goal</li>
        </ul>
      </aside>

      {/* Right: the form */}
      <main className="au-main">
        <Link to="/" className="au-brand au-brand-mobile">code<span>With</span>Shivah</Link>

        {notice && <div className="au-notice" role="status">{notice} Your account can be open on one device at a time.</div>}

        {mode === 'signin' && (
          <form className="au-card" onSubmit={submitSignin}>
            <h1>Sign in</h1>
            <p className="au-lead">Welcome back. Use Google, or your email or mobile with your password.</p>
            {opts.google && (
              <div className="au-google">
                <GoogleLogin onSuccess={onGoogle} onError={() => setError('Google sign-in didn’t work. Try again, or use your email and password.')} theme="outline" shape="pill" size="large" width="320" text="continue_with" />
              </div>
            )}
            {opts.google && opts.password && <div className="au-or"><span>or</span></div>}
            {opts.password && (
              <>
                <Field id="au-email-or-mobile-number" label="Email or mobile number">
                <input id="au-email-or-mobile-number" ref={firstInput} type="text" inputMode="email" autoComplete="username" value={form.id} onChange={set('id')} required placeholder="you@gmail.com or 98765 43210" />
            </Field>
                {pwField()}
                <div className="au-row">
                  <button type="button" className="au-link" onClick={() => setMode('forgot')}>Forgot password?</button>
                </div>
                {error && <p className="au-error" role="alert">{error}</p>}
                <button className="btn btn-primary au-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
                <p className="au-switch">New here? <button type="button" className="au-link" onClick={() => setMode('signup')}>Create an account</button></p>
              </>
            )}
            {!opts.password && error && <p className="au-error" role="alert">{error}</p>}
          </form>
        )}

        {mode === 'signup' && (
          <form className="au-card" onSubmit={submitSignup}>
            <h1>Create your account</h1>
            <p className="au-lead">Takes a minute. You’ll see your login details on the next screen to save.</p>
            {opts.google && (
              <>
                <div className="au-google">
                  <GoogleLogin onSuccess={onGoogle} onError={() => setError('Google sign-in didn’t work. Fill the form instead.')} theme="outline" shape="pill" size="large" width="320" text="signup_with" />
                </div>
                <div className="au-or"><span>or fill this in</span></div>
              </>
            )}
            <Field id="au-name" label="Your name" bad={errField === 'name'}>
                <input id="au-name" ref={firstInput} type="text" autoComplete="name" value={form.name} onChange={set('name')} required placeholder="As you’d like it on your certificate" />
            </Field>
            <Field id="au-phone" label="Mobile number" bad={errField === 'phone'}>
                <input id="au-phone" type="tel" inputMode="numeric" autoComplete="tel" value={form.phone} onChange={set('phone')} required placeholder="10 digits, your WhatsApp number" />
            </Field>
            <Field id="au-email" label="Email" hint="Your login details are sent here too." bad={errField === 'email'}>
                <input id="au-email" aria-describedby="au-email-hint" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set('email')} required placeholder="you@gmail.com" />
            </Field>
            {pwField('Choose a password', 'Something you’ll remember. You can sign in with email or mobile + this.')}
            {error && (
              <p className="au-error" role="alert">
                {error}{' '}
                {/^This email already/.test(error) && <button type="button" className="au-link" onClick={() => { setForm(f => ({ ...f, id: f.email })); setMode('signin'); }}>Sign in</button>}
              </p>
            )}
            <button className="btn btn-primary au-submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
            <p className="au-switch">Already have one? <button type="button" className="au-link" onClick={() => setMode('signin')}>Sign in</button></p>
          </form>
        )}

        {mode === 'forgot' && (
          <form className="au-card" onSubmit={submitForgot}>
            <h1>Forgot your password?</h1>
            <p className="au-lead">Enter your email or mobile. We’ll email you a 6-digit code to set a new one.</p>
            <Field id="au-email-or-mobile-number" label="Email or mobile number">
                <input id="au-email-or-mobile-number" ref={firstInput} type="text" inputMode="email" autoComplete="username" value={form.id} onChange={set('id')} required placeholder="you@gmail.com or 98765 43210" />
            </Field>
            {error && <p className="au-error" role="alert">{error}</p>}
            <button className="btn btn-primary au-submit" disabled={busy}>{busy ? 'Sending…' : 'Email me a code'}</button>
            <p className="au-switch">
              <button type="button" className="au-link" onClick={() => setMode('signin')}>Back to sign in</button>
              {' · '}
              <button type="button" className="au-link" onClick={() => setMode('reset')}>I already have a code</button>
            </p>
          </form>
        )}

        {mode === 'reset' && (
          <form className="au-card" onSubmit={submitReset}>
            <h1>Set a new password</h1>
            <p className="au-lead">{hint || 'Enter the 6-digit code from the email and choose a new password.'}</p>
            {!hint && (
              <Field id="au-email-or-mobile-number" label="Email or mobile number">
                <input id="au-email-or-mobile-number" type="text" inputMode="email" autoComplete="username" value={form.id} onChange={set('id')} required />
            </Field>
            )}
            <Field id="au-digit-code" label="6-digit code">
                <input id="au-digit-code" ref={firstInput} className="au-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={form.code} onChange={set('code')} required placeholder="000000" />
            </Field>
            {pwField('New password')}
            {error && <p className="au-error" role="alert">{error}</p>}
            <button className="btn btn-primary au-submit" disabled={busy}>{busy ? 'Saving…' : 'Change password and sign in'}</button>
            <p className="au-switch"><button type="button" className="au-link" onClick={() => setMode('forgot')}>Send the code again</button></p>
          </form>
        )}

        {mode === 'saved' && saved && (
          <div className="au-card au-saved">
            <h1>You’re in, {saved.name.split(' ')[0]}</h1>
            <p className="au-lead">Take a screenshot of this. It’s how you sign in next time{saved.mailed ? ', and it’s in your email too' : ''}.</p>
            <dl className="au-cred">
              <div><dt>Email</dt><dd>{saved.email}</dd></div>
              <div><dt>Mobile</dt><dd>{saved.phone}</dd></div>
              <div><dt>Password</dt><dd className="au-cred-pw">{saved.password}</dd></div>
            </dl>
            <p className="au-fine">Sign in with your email <b>or</b> mobile number, plus this password. Only one device at a time.</p>
            <div className="au-saved-actions">
              <button type="button" className="btn btn-ghost" onClick={copySaved}>{copied ? 'Copied' : 'Copy details'}</button>
              <button type="button" className="btn btn-primary" onClick={() => { finishSignIn(saved); navigate(dest); }}>Continue</button>
            </div>
          </div>
        )}

        <p className="au-foot"><Link to="/">See what’s on offer first</Link></p>
      </main>
    </div>
  );
}
