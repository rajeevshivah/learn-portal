import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import Toast from '../components/Toast';

const API = import.meta.env.VITE_API_URL;

export default function EventDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();

  const [event, setEvent]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState('');

  // registration form
  const [form, setForm] = useState({ phone: '', college: '', expectation: '', utr: '' });
  const [screenshot, setScreenshot] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // the reply shown after a successful submit
  const [reply, setReply] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/events/${slug}`);
      setEvent(data);
    } catch (e) {
      setToast(e.response?.data?.message || 'Could not load this event');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.phone.trim()) return setToast('Please add your WhatsApp number');
    if (event.isPaid && !form.utr.trim()) return setToast('Please enter the UTR / transaction ID');

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('phone', form.phone);
      fd.append('college', form.college);
      fd.append('expectation', form.expectation);
      if (event.isPaid) fd.append('utr', form.utr);
      if (screenshot) fd.append('screenshot', screenshot);

      const { data } = await axios.post(`${API}/events/${event._id}/register`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setReply(data);       // confirmation reply with the WhatsApp link
      load();               // refresh so the page reflects the new status
      // jump the student to the confirmation card
      setTimeout(() => document.getElementById('reg-status')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      setToast(err.response?.data?.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="spinner-page">Loading…</div>;
  if (!event)  return <div className="spinner-page">Event not found.</div>;

  const reg        = event.myRegistration;
  const isActive   = reg?.status === 'active';
  const isPending  = reg?.status === 'pending';
  const isRejected = reg?.status === 'rejected';
  const multi      = event.sessions?.length > 1;
  const dayCount   = event.sessions?.length || 0;

  const fmt = (d) => new Date(d).toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
  const fmtShort = (d) => new Date(d).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });

  // The WhatsApp link comes either from the fresh reply or from the loaded event
  const whatsappLink = reply?.whatsappLink || event.whatsappLink;

  const firstSession = event.sessions?.length
    ? event.sessions.reduce((min, s) => (!min || new Date(s.startsAt) < new Date(min.startsAt) ? s : min), null)
    : null;

  // Real social proof ONLY if the backend sends it (see note in chat). No fake numbers.
  const confirmedCount = typeof event.confirmedCount === 'number' ? event.confirmedCount : null;

  const discountPct = (event.mrp > 0 && event.mrp > event.price)
    ? Math.round(((event.mrp - event.price) / event.mrp) * 100)
    : 0;

  const upiLink = event.payment?.upiId
    ? `upi://pay?pa=${encodeURIComponent(event.payment.upiId)}&pn=${encodeURIComponent(event.payment.upiName || '')}&am=${event.price}&cu=INR&tn=${encodeURIComponent(event.title)}`
    : '';

  const canRegister = !isActive && !isPending && event.registrationOpen;
  const seatsLow = event.seatLimit > 0 && typeof event.seatsLeft === 'number' && event.seatsLeft > 0 && event.seatsLeft <= 8;
  const seatsFull = event.seatLimit > 0 && event.seatsLeft === 0;

  const scrollToRegister = () =>
    document.getElementById('register-block')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="page event-detail">
      {/* ══════════ HERO ══════════ */}
      <div className="ed-hero">
        <div className="ed-hero-glow" />
        <div className="container" style={{ maxWidth: 1080, position: 'relative' }}>
          <Link to="/events" className="ed-back">← All live sessions</Link>

          <div className="ed-hero-grid">
            {/* Left: the pitch */}
            <div className="ed-hero-main">
              <div className="ed-chips">
                <span className="badge badge-accent">
                  {event.type === 'workshop' ? '🎯 Workshop' : '🎥 Live class'}
                </span>
                {multi && <span className="badge badge-muted">{dayCount} days</span>}
                {event.course && (
                  <Link to={`/courses/${event.course.slug}`} className="badge badge-muted" style={{ textDecoration: 'none' }}>
                    {event.course.title}
                  </Link>
                )}
                {isActive   && <span className="badge badge-success">✓ You're registered</span>}
                {isPending  && <span className="badge badge-warning">Payment under review</span>}
              </div>

              <h1 className="ed-title">{event.title}</h1>

              {event.description && (
                <p className="ed-desc">{event.description}</p>
              )}

              {/* Quick facts strip */}
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
                {confirmedCount !== null && confirmedCount > 0 && (
                  <div className="ed-fact">
                    <span className="ed-fact-ico">🔥</span>
                    <div>
                      <div className="ed-fact-label">Already joined</div>
                      <div className="ed-fact-value">{confirmedCount} students</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Social proof line */}
              {confirmedCount !== null && confirmedCount >= 10 && (
                <div className="ed-proof">
                  <div className="ed-avatars">
                    {[0,1,2,3].map(i => <span key={i} className="ed-avatar" />)}
                  </div>
                  <span><strong>{confirmedCount} students</strong> have already registered for this session.</span>
                </div>
              )}
            </div>

            {/* Right: the sticky buy card */}
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

                  {seatsLow && (
                    <div className="ed-seats ed-seats--low">🔥 Only {event.seatsLeft} seats left</div>
                  )}
                  {seatsFull && !isActive && (
                    <div className="ed-seats ed-seats--full">All seats are full</div>
                  )}
                  {!seatsLow && !seatsFull && event.seatLimit > 0 && typeof event.seatsLeft === 'number' && !isActive && (
                    <div className="ed-seats">{event.seatsLeft} seats available</div>
                  )}

                  {isActive ? (
                    <a href="#reg-status" className="btn btn-success btn-block" style={{ marginTop: 4 }}
                      onClick={(e) => { e.preventDefault(); document.getElementById('reg-status')?.scrollIntoView({ behavior: 'smooth' }); }}>
                      ✓ You're in — view details
                    </a>
                  ) : isPending ? (
                    <a href="#reg-status" className="btn btn-ghost btn-block" style={{ marginTop: 4 }}
                      onClick={(e) => { e.preventDefault(); document.getElementById('reg-status')?.scrollIntoView({ behavior: 'smooth' }); }}>
                      ⏳ Payment under review
                    </a>
                  ) : event.registrationOpen ? (
                    <button className="btn btn-primary btn-block ed-cta" onClick={scrollToRegister} style={{ marginTop: 4 }}>
                      {event.isPaid ? `Register for ₹${event.price} →` : 'Register free →'}
                    </button>
                  ) : (
                    <button className="btn btn-ghost btn-block" disabled style={{ marginTop: 4 }}>
                      Registration closed
                    </button>
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

            {/* ── Registration status / confirmation ── */}
            {(isActive || reply || isPending) && (
              <div id="reg-status" className="card" style={{
                marginBottom: 20,
                borderLeft: `3px solid var(--${isActive ? 'success' : 'warning'})`,
              }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
                  {isActive ? '✅ You are registered' : '⏳ Payment submitted'}
                </div>
                <p className="small" style={{ lineHeight: 1.65, marginBottom: 14, color: 'var(--text-2)' }}>
                  {reply?.message || event.confirmationMsg}
                </p>

                {whatsappLink ? (
                  <>
                    <a href={whatsappLink} target="_blank" rel="noreferrer"
                      className="btn btn-block"
                      style={{ background: '#25D366', borderColor: '#25D366', color: '#03260F' }}>
                      💬 Join the WhatsApp group
                    </a>
                    <p className="small muted" style={{ marginTop: 10, textAlign: 'center' }}>
                      All reminders, joining links and materials are shared in the group.
                    </p>
                  </>
                ) : isPending ? (
                  <p className="small muted">
                    The WhatsApp group link will appear here as soon as your payment is verified.
                    This usually takes a few hours.
                  </p>
                ) : null}
              </div>
            )}

            {/* ── Rejected notice ── */}
            {isRejected && (
              <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--danger)' }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Payment could not be verified</div>
                <p className="small muted">{reg.rejectReason}</p>
                <p className="small muted" style={{ marginTop: 8 }}>
                  You can submit your payment details again below.
                </p>
              </div>
            )}

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
                      {isActive && s.joinUrl && (
                        <a href={s.joinUrl} target="_blank" rel="noreferrer"
                          className="btn btn-primary btn-sm" style={{ marginTop: 8, display: 'inline-block' }}>
                          Join this session →
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Registration form ── */}
            {canRegister && (
              <div id="register-block" className="card ed-register">
                <h2 className="ed-section-title" style={{ marginBottom: 4 }}>
                  {isRejected ? 'Resubmit your registration' : 'Register now'}
                </h2>
                <p className="small muted" style={{ marginBottom: 18 }}>
                  {event.isPaid
                    ? `Pay ₹${event.price}, then fill this form. Your seat is confirmed after we verify the payment.`
                    : 'Fill this and you will get the WhatsApp group link right away.'}
                </p>

                {/* Payment block for paid events */}
                {event.isPaid && event.payment?.upiId && (
                  <div className="ed-pay">
                    <div className="small muted" style={{ marginBottom: 6 }}>Pay ₹{event.price} to</div>
                    <div className="ed-pay-upi">{event.payment.upiId}</div>
                    {event.payment.upiName && <div className="small muted">{event.payment.upiName}</div>}
                    {event.payment.note && (
                      <p className="small muted" style={{ marginTop: 8 }}>{event.payment.note}</p>
                    )}

                    <div style={{ textAlign: 'center', marginTop: 14 }}>
                      <p className="small muted" style={{ marginBottom: 10 }}>
                        Scan with any UPI app{event.payment.qrUrl ? '' : ' (amount pre-filled)'}
                      </p>
                      <div className="qr-box" style={{ display: 'inline-block' }}>
                        {event.payment.qrUrl
                          ? <img src={event.payment.qrUrl} alt="Payment QR" style={{ width: 180, height: 180, objectFit: 'contain', display: 'block' }} />
                          : <QRCodeSVG
                              value={upiLink}
                              size={180}
                              level="M"
                            />}
                      </div>
                    </div>

                    <a href={upiLink} className="btn btn-primary btn-sm btn-block" style={{ marginTop: 14 }}>
                      Or pay ₹{event.price} via UPI app (on mobile)
                    </a>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label className="label">WhatsApp number *</label>
                    <input className="input" type="tel" placeholder="10-digit number"
                      value={form.phone}
                      onChange={e => setForm({ ...form, phone: e.target.value })} />
                  </div>

                  <div>
                    <label className="label">College / Organisation</label>
                    <input className="input" type="text" placeholder="Optional"
                      value={form.college}
                      onChange={e => setForm({ ...form, college: e.target.value })} />
                  </div>

                  <div>
                    <label className="label">What do you want solved in this session?</label>
                    <textarea className="input" rows={3}
                      placeholder="The topic or error you are stuck on — I'll prioritise these."
                      value={form.expectation}
                      onChange={e => setForm({ ...form, expectation: e.target.value })}
                      style={{ resize: 'vertical' }} />
                  </div>

                  {event.isPaid && (
                    <>
                      <div>
                        <label className="label">UTR / Transaction ID *</label>
                        <input className="input" type="text" placeholder="From your UPI app"
                          value={form.utr}
                          onChange={e => setForm({ ...form, utr: e.target.value })} />
                      </div>
                      <div>
                        <label className="label">Payment screenshot (optional, speeds up verification)</label>
                        <input type="file" accept="image/*"
                          onChange={e => setScreenshot(e.target.files[0])}
                          className="small" style={{ width: '100%' }} />
                      </div>
                    </>
                  )}

                  <button className="btn btn-primary btn-block ed-cta"
                    disabled={submitting} onClick={submit}>
                    {submitting
                      ? 'Submitting…'
                      : event.isPaid ? `Submit payment & register` : 'Register free →'}
                  </button>
                  <p className="small muted" style={{ textAlign: 'center' }}>
                    Takes under a minute · No spam, just this session
                  </p>
                </div>
              </div>
            )}

            {!canRegister && !isActive && !isPending && (
              <div className="empty-state">Registration is closed for this event.</div>
            )}
          </div>

          {/* Spacer column keeps body aligned with hero grid on desktop */}
          <div className="ed-body-side" aria-hidden="true" />
        </div>
      </div>

      {/* ══════════ MOBILE STICKY BAR ══════════ */}
      {canRegister && (
        <div className="ed-mobile-bar">
          <div className="ed-mobile-price">
            {event.isPaid ? (
              <>
                <span className="ed-price" style={{ fontSize: 20 }}>₹{event.price}</span>
                {discountPct > 0 && <span className="ed-mrp">₹{event.mrp}</span>}
              </>
            ) : <span className="ed-price ed-price--free" style={{ fontSize: 20 }}>Free</span>}
          </div>
          <button className="btn btn-primary ed-cta" onClick={scrollToRegister}>
            {event.isPaid ? 'Register →' : 'Register free →'}
          </button>
        </div>
      )}

      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
