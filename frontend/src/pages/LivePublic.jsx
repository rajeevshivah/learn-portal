import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../context/AuthContext';
import Toast from '../components/Toast';

const API = import.meta.env.VITE_API_URL;

// Isolated axios instance with NO shared defaults, so the global Authorization
// header (which may hold a stale token) can never attach to this public call.
const publicApi = axios.create();

// PUBLIC webinar landing page — shareable on Instagram bio, WhatsApp, anywhere.
// A logged-out visitor can see the full event and tap Register, which sends
// them through Google login and straight back here to complete registration.
export default function LivePublic() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [event, setEvent]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [errKind, setErrKind] = useState(null); // 'notfound' | 'network' | null
  const [toast, setToast]     = useState('');

  // If the visitor is ALREADY logged in, skip the public page entirely and
  // take them to the real registration page with join links etc.
  useEffect(() => {
    if (!authLoading && user) {
      navigate(`/events/${slug}`, { replace: true });
    }
  }, [authLoading, user, slug, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    setErrKind(null);
    try {
      // Anonymous request via the isolated instance — never sends a token.
      const { data } = await publicApi.get(`${API}/events/public/${slug}`);
      setEvent(data);
    } catch (e) {
      const status = e.response?.status;
      if (status === 404) setErrKind('notfound');
      else setErrKind('network');
      setToast(e.response?.data?.message || 'Could not load this session — please retry.');
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

  // Distinguish a genuinely missing event from a transient load failure so a
  // network blip never permanently reads as "Session not found."
  if (!event) {
    return (
      <div className="page">
        <div className="container section" style={{ maxWidth: 560, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, marginBottom: 10 }}>
            {errKind === 'notfound' ? 'Session not found' : 'Couldn’t load this session'}
          </h1>
          <p className="muted small" style={{ marginBottom: 18 }}>
            {errKind === 'notfound'
              ? 'This live session may have ended or the link is incorrect.'
              : 'Something went wrong loading this page. Please check your connection and try again.'}
          </p>
          {errKind !== 'notfound' && (
            <button className="btn btn-primary" onClick={load}>Retry</button>
          )}
        </div>
        <Toast message={toast} onDone={() => setToast('')} />
      </div>
    );
  }

  const multi    = event.sessions?.length > 1;
  const dayCount = event.sessions?.length || 0;

  const fmt = (d) => new Date(d).toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
  const fmtShort = (d) => new Date(d).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });

  const firstSession = event.sessions?.length
    ? event.sessions.reduce((min, s) => (!min || new Date(s.startsAt) < new Date(min.startsAt) ? s : min), null)
    : null;

  const discountPct = (event.mrp > 0 && event.mrp > event.price)
    ? Math.round(((event.mrp - event.price) / event.mrp) * 100)
    : 0;

  const upiLink = event.isPaid && event.payment?.upiId
    ? `upi://pay?pa=${encodeURIComponent(event.payment.upiId)}&pn=${encodeURIComponent(event.payment.upiName || '')}&am=${event.price}&cu=INR&tn=${encodeURIComponent(event.title)}`
    : '';

  const seatsLow  = event.seatLimit > 0 && typeof event.seatsLeft === 'number' && event.seatsLeft > 0 && event.seatsLeft <= 8;
  const seatsFull = event.seatLimit > 0 && event.seatsLeft === 0;
  const isOpen    = event.registrationOpen;

  const loginHref = `/login?redirect=${encodeURIComponent(`/events/${slug}`)}`;

  return (
    <div className="page event-detail">
      {/* ══════════ HERO ══════════ */}
      <div className="ed-hero">
        <div className="ed-hero-glow" />
        <div className="container" style={{ maxWidth: 1080, position: 'relative' }}>
          {/* Public brand header (no navbar on this page) */}
          <div className="ed-brand">
            code<span style={{ color: 'var(--accent)' }}>With</span>Shivah
          </div>

          <div className="ed-hero-grid">
            {/* Left: the pitch */}
            <div className="ed-hero-main">
              <div className="ed-chips">
                <span className="badge badge-accent">
                  {event.type === 'workshop' ? '🎯 Workshop' : '🎥 Live class'}
                </span>
                {multi && <span className="badge badge-muted">{dayCount} days</span>}
                {event.isPaid
                  ? <span className="badge badge-warning">₹{event.price}</span>
                  : <span className="badge badge-success">Free</span>}
              </div>

              <h1 className="ed-title">{event.title}</h1>

              {event.description && <p className="ed-desc">{event.description}</p>}

              <div className="ed-facts">
                {firstSession && (
                  <div className="ed-fact">
                    <span className="ed-fact-ico">📅</span>
                    <div>
                      <div className="ed-fact-label">Starts</div>
                      <div className="ed-fact-value">{fmtShort(firstSession.startsAt)}</div>
                    </div>
                  </div>
                )}
                <div className="ed-fact">
                  <span className="ed-fact-ico">🗓️</span>
                  <div>
                    <div className="ed-fact-label">Format</div>
                    <div className="ed-fact-value">{dayCount} {dayCount === 1 ? 'session' : 'sessions'}, live</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: the buy card */}
            <div className="ed-buy-wrap">
              <div className="ed-buy card-hover">
                {event.thumbnail
                  ? <img className="ed-buy-thumb" src={event.thumbnail} alt={event.title} />
                  : <div className="ed-buy-thumb ed-buy-thumb--empty">
                      {event.type === 'workshop' ? '🎯' : '🎥'}
                    </div>}

                <div className="ed-buy-body">
                  <div className="ed-price-row">
                    {event.isPaid ? (
                      <>
                        <span className="ed-price">₹{event.price}</span>
                        {discountPct > 0 && (
                          <>
                            <span className="ed-mrp">₹{event.mrp}</span>
                            <span className="badge badge-success">{discountPct}% off</span>
                          </>
                        )}
                      </>
                    ) : (
                      <span className="ed-price ed-price--free">Free</span>
                    )}
                  </div>

                  {seatsLow && <div className="ed-seats ed-seats--low">🔥 Only {event.seatsLeft} seats left</div>}
                  {seatsFull && <div className="ed-seats ed-seats--full">All seats are full</div>}
                  {!seatsLow && !seatsFull && event.seatLimit > 0 && typeof event.seatsLeft === 'number' && (
                    <div className="ed-seats">{event.seatsLeft} seats available</div>
                  )}

                  {isOpen ? (
                    <button className="btn btn-primary btn-block ed-cta" onClick={goRegister} style={{ marginTop: 4 }}>
                      {event.isPaid ? `Register for ₹${event.price} →` : 'Register free →'}
                    </button>
                  ) : (
                    <button className="btn btn-ghost btn-block" disabled style={{ marginTop: 4 }}>
                      Registration closed
                    </button>
                  )}

                  {isOpen && (
                    <p className="small muted" style={{ textAlign: 'center', marginTop: 10 }}>
                      Already have an account? <Link to={loginHref}>Sign in</Link>
                    </p>
                  )}

                  <ul className="ed-includes">
                    <li>Live, interactive sessions</li>
                    <li>WhatsApp group access</li>
                    {event.type === 'workshop' && <li>Practice-along, not just watching</li>}
                    <li>Ask doubts directly</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════ BODY ══════════ */}
      <div className="container section" style={{ maxWidth: 1080 }}>
        <div className="ed-body-grid">
          <div className="ed-body-main">

            {/* ── Schedule ── */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="ed-section-head">
                <h2 className="ed-section-title">What we'll cover</h2>
                <span className="small muted">{dayCount} {dayCount === 1 ? 'session' : 'sessions'}</span>
              </div>
              <div className="ed-schedule">
                {event.sessions.map((s, i) => (
                  <div key={s._id || i} className="ed-sched-row">
                    <div className="ed-sched-num">{i + 1}</div>
                    <div className="ed-sched-body">
                      <div className="ed-sched-title">{s.title}</div>
                      <div className="small muted">{fmt(s.startsAt)} · {s.durationMins} min</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Paid preview: what they'll pay + QR (they register after login) ── */}
            {event.isPaid && event.payment?.upiId && (
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="ed-section-head">
                  <h2 className="ed-section-title">Payment</h2>
                  <span className="badge badge-warning">₹{event.price}</span>
                </div>
                <div className="ed-pay">
                  <div style={{ textAlign: 'center' }}>
                    <div className="qr-box" style={{ display: 'inline-block' }}>
                      {event.payment.qrUrl
                        ? <img src={event.payment.qrUrl} alt="Payment QR" style={{ width: 180, height: 180, objectFit: 'contain', display: 'block' }} />
                        : <QRCodeSVG value={upiLink} size={180} level="M" />}
                    </div>
                    <p className="small muted" style={{ marginTop: 12 }}>
                      UPI: <strong style={{ color: 'var(--accent)', userSelect: 'all' }}>{event.payment.upiId}</strong>
                    </p>
                    <p className="small muted" style={{ marginTop: 6, maxWidth: 380, marginInline: 'auto' }}>
                      Sign in to register and submit your payment — you'll get the WhatsApp group link after verification.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Final CTA ── */}
            <div className="card ed-final-cta">
              {isOpen ? (
                <>
                  <h2 className="ed-section-title" style={{ marginBottom: 6 }}>
                    {event.isPaid ? 'Ready to join?' : 'Grab your free seat'}
                  </h2>
                  <p className="small muted" style={{ marginBottom: 16 }}>
                    {event.isPaid
                      ? 'Sign in to register for this session.'
                      : 'Sign in to grab your free seat — takes 5 seconds.'}
                  </p>
                  <button className="btn btn-primary btn-block ed-cta" onClick={goRegister}>
                    {event.isPaid ? `Register — ₹${event.price} →` : 'Register free →'}
                  </button>
                  <p className="small muted" style={{ marginTop: 12, textAlign: 'center' }}>
                    Already have an account? <Link to={loginHref}>Sign in</Link>
                  </p>
                </>
              ) : (
                <div className="empty-state">Registration is closed for this session.</div>
              )}
            </div>
          </div>

          <div className="ed-body-side" aria-hidden="true" />
        </div>
      </div>

      {/* ══════════ MOBILE STICKY BAR ══════════ */}
      {isOpen && (
        <div className="ed-mobile-bar">
          <div className="ed-mobile-price">
            {event.isPaid ? (
              <>
                <span className="ed-price" style={{ fontSize: 20 }}>₹{event.price}</span>
                {discountPct > 0 && <span className="ed-mrp">₹{event.mrp}</span>}
              </>
            ) : <span className="ed-price ed-price--free" style={{ fontSize: 20 }}>Free</span>}
          </div>
          <button className="btn btn-primary ed-cta" onClick={goRegister}>
            {event.isPaid ? 'Register →' : 'Register free →'}
          </button>
        </div>
      )}

      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
