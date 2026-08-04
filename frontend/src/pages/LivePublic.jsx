import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../context/AuthContext';
import Toast from '../components/Toast';

const API = import.meta.env.VITE_API_URL;

// PUBLIC webinar landing page — shareable on Instagram bio, WhatsApp, anywhere.
// A logged-out visitor can see the full event and tap Register, which sends
// them through Google login and straight back here to complete registration.
export default function LivePublic() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [event, setEvent]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState('');

  // If the visitor is ALREADY logged in, skip the public page entirely and
  // take them to the real registration page with join links etc.
  useEffect(() => {
    if (!authLoading && user) {
      navigate(`/events/${slug}`, { replace: true });
    }
  }, [authLoading, user, slug, navigate]);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/events/public/${slug}`);
      setEvent(data);
    } catch (e) {
      setToast(e.response?.data?.message || 'Could not load this session');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  // Send them to Google login, then bounce back to the real event page to register
  const goRegister = () => {
    navigate(`/login?redirect=${encodeURIComponent(`/events/${slug}`)}`);
  };

  if (authLoading || loading) return <div className="spinner-page">Loading…</div>;
  if (user) return <div className="spinner-page">Redirecting…</div>;
  if (!event)  return <div className="spinner-page">Session not found.</div>;

  const multi = event.sessions?.length > 1;

  const fmt = (d) => new Date(d).toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });

  const upiLink = event.isPaid && event.payment?.upiId
    ? `upi://pay?pa=${encodeURIComponent(event.payment.upiId)}&pn=${encodeURIComponent(event.payment.upiName || '')}&am=${event.price}&cu=INR&tn=${encodeURIComponent(event.title)}`
    : '';

  return (
    <div className="page">
      <div className="container section" style={{ maxWidth: 780 }}>
        {/* Simple brand header (no navbar — this is a public page) */}
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, marginBottom: 18 }}>
          code<span style={{ color: 'var(--accent)' }}>With</span>Shivah
        </div>

        {/* ── Header ── */}
        <div className="card" style={{ marginBottom: 20 }}>
          {event.thumbnail && (
            <img src={event.thumbnail} alt="" style={{ borderRadius: 10, marginBottom: 14, width: '100%', aspectRatio: '16/9', objectFit: 'cover' }} />
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <span className="badge badge-muted">
              {event.type === 'workshop' ? 'Workshop' : 'Live class'}
            </span>
            {multi && <span className="badge badge-muted">{event.sessions.length} days</span>}
            {event.isPaid
              ? <span className="badge badge-warning">₹{event.price}</span>
              : <span className="badge badge-accent">Free</span>}
          </div>

          <h1 style={{ fontSize: 26, marginBottom: 10 }}>{event.title}</h1>
          {event.description && (
            <p className="muted small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>
              {event.description}
            </p>
          )}

          {event.seatLimit > 0 && typeof event.seatsLeft === 'number' && (
            <p className="small" style={{ marginTop: 12, color: event.seatsLeft <= 5 ? 'var(--danger)' : 'var(--text-2)' }}>
              {event.seatsLeft > 0 ? `${event.seatsLeft} seats left` : 'All seats are full'}
            </p>
          )}
        </div>

        {/* ── Schedule ── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-2)' }}>
            Schedule
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {event.sessions.map((s, i) => (
              <div key={s._id || i} style={{
                display: 'flex', gap: 12, alignItems: 'flex-start',
                paddingBottom: 10,
                borderBottom: i < event.sessions.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--surface-2)', color: 'var(--text-2)',
                  fontWeight: 700, fontSize: 13,
                }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{s.title}</div>
                  <div className="small muted">{fmt(s.startsAt)} · {s.durationMins} min</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Paid preview: show them what they'll pay + QR (they still register after login) ── */}
        {event.isPaid && event.payment?.upiId && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="small muted" style={{ marginBottom: 6 }}>This is a paid session — ₹{event.price}</div>
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <div className="qr-box" style={{ display: 'inline-block' }}>
                <QRCodeSVG value={upiLink} size={170} level="M" />
              </div>
              <p className="small muted" style={{ marginTop: 10 }}>
                UPI: <strong style={{ color: 'var(--accent)', userSelect: 'all' }}>{event.payment.upiId}</strong>
              </p>
              <p className="small muted" style={{ marginTop: 4 }}>
                Sign in to register and submit your payment — you'll get the WhatsApp group link after verification.
              </p>
            </div>
          </div>
        )}

        {/* ── The one CTA ── */}
        <div className="card" style={{ textAlign: 'center' }}>
          {event.registrationOpen ? (
            <>
              <p className="small muted" style={{ marginBottom: 14 }}>
                {event.isPaid
                  ? 'Sign in to register for this session.'
                  : 'Sign in to grab your free seat — takes 5 seconds.'}
              </p>
              <button className="btn btn-primary btn-block" onClick={goRegister}>
                {event.isPaid ? `Register — ₹${event.price}` : 'Register free'}
              </button>
              <p className="small muted" style={{ marginTop: 12 }}>
                Already have an account? <Link to={`/login?redirect=${encodeURIComponent(`/events/${slug}`)}`}>Sign in</Link>
              </p>
            </>
          ) : (
            <div className="empty-state">Registration is closed for this session.</div>
          )}
        </div>
      </div>
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
