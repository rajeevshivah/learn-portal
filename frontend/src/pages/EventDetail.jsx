import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
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

      setReply(data);       // <- this is the confirmation reply with the WhatsApp link
      load();               // refresh so the page reflects the new status
    } catch (err) {
      setToast(err.response?.data?.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="spinner-page">Loading…</div>;
  if (!event)  return <div className="spinner-page">Event not found.</div>;

  const reg      = event.myRegistration;
  const isActive = reg?.status === 'active';
  const isPending= reg?.status === 'pending';
  const isRejected = reg?.status === 'rejected';
  const multi    = event.sessions?.length > 1;

  const fmt = (d) => new Date(d).toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });

  // The WhatsApp link comes either from the fresh reply or from the loaded event
  const whatsappLink = reply?.whatsappLink || event.whatsappLink;

  return (
    <div className="page">
      <div className="container section" style={{ maxWidth: 780 }}>
        <Link to="/events" className="small muted">← All live sessions</Link>

        {/* ── Header ── */}
        <div className="card" style={{ margin: '14px 0 20px' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <span className="badge badge-muted">
              {event.type === 'workshop' ? 'Workshop' : 'Live class'}
            </span>
            {multi && <span className="badge badge-muted">{event.sessions.length} days</span>}
            {event.course && (
              <Link to={`/courses/${event.course.slug}`} className="badge badge-muted" style={{ textDecoration: 'none' }}>
                {event.course.title}
              </Link>
            )}
            {event.isPaid
              ? <span className="badge badge-warning">₹{event.price}</span>
              : <span className="badge badge-accent">Free</span>}
            {isActive  && <span className="badge badge-success">You're registered</span>}
            {isPending && <span className="badge badge-warning">Payment under verification</span>}
          </div>

          <h1 style={{ fontSize: 24, marginBottom: 10 }}>{event.title}</h1>
          {event.description && (
            <p className="muted small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>
              {event.description}
            </p>
          )}

          {event.seatLimit > 0 && typeof event.seatsLeft === 'number' && !isActive && (
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
                  <div className="small muted">
                    {fmt(s.startsAt)} · {s.durationMins} min
                  </div>
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

        {/* ── THE REPLY: confirmation + WhatsApp link ── */}
        {(isActive || reply) && (
          <div className="card" style={{
            marginBottom: 20,
            borderLeft: `3px solid var(--${isActive ? 'success' : 'warning'})`,
          }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
              {isActive ? '✅ You are registered' : '⏳ Payment submitted'}
            </div>
            <p className="small" style={{ lineHeight: 1.65, marginBottom: 14 }}>
              {reply?.message || event.confirmationMsg}
            </p>

            {whatsappLink ? (
              <>
                <a href={whatsappLink} target="_blank" rel="noreferrer"
                  className="btn btn-primary btn-block"
                  style={{ background: '#25D366', borderColor: '#25D366' }}>
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

        {/* ── Registration form ── */}
        {!isActive && !isPending && (
          event.registrationOpen ? (
            <div className="card">
              <h2 style={{ fontSize: 17, marginBottom: 4 }}>
                {isRejected ? 'Resubmit your registration' : 'Register'}
              </h2>
              <p className="small muted" style={{ marginBottom: 18 }}>
                {event.isPaid
                  ? `Pay ₹${event.price}, then fill this form. Your seat is confirmed after we verify the payment.`
                  : 'Fill this and you will get the WhatsApp group link right away.'}
              </p>

              {/* Payment block for paid events */}
              {event.isPaid && event.payment?.upiId && (
                <div style={{
                  background: 'var(--surface-2)', borderRadius: 10,
                  padding: 16, marginBottom: 18,
                }}>
                  <div className="small muted" style={{ marginBottom: 6 }}>Pay ₹{event.price} to</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17 }}>
                    {event.payment.upiId}
                  </div>
                  {event.payment.upiName && (
                    <div className="small muted">{event.payment.upiName}</div>
                  )}
                  {event.payment.note && (
                    <p className="small muted" style={{ marginTop: 8 }}>{event.payment.note}</p>
                  )}
                  <a
                    href={`upi://pay?pa=${encodeURIComponent(event.payment.upiId)}&pn=${encodeURIComponent(event.payment.upiName || '')}&am=${event.price}&cu=INR&tn=${encodeURIComponent(event.title)}`}
                    className="btn btn-primary btn-sm btn-block"
                    style={{ marginTop: 12 }}>
                    Pay ₹{event.price} via UPI app
                  </a>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label className="small muted" style={{ display: 'block', marginBottom: 5 }}>
                    WhatsApp number *
                  </label>
                  <input className="input" type="tel" placeholder="10-digit number"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    style={{ width: '100%' }} />
                </div>

                <div>
                  <label className="small muted" style={{ display: 'block', marginBottom: 5 }}>
                    College / Organisation
                  </label>
                  <input className="input" type="text" placeholder="Optional"
                    value={form.college}
                    onChange={e => setForm({ ...form, college: e.target.value })}
                    style={{ width: '100%' }} />
                </div>

                <div>
                  <label className="small muted" style={{ display: 'block', marginBottom: 5 }}>
                    What do you want solved in this session?
                  </label>
                  <textarea className="input" rows={3}
                    placeholder="The topic or error you are stuck on — I'll prioritise these."
                    value={form.expectation}
                    onChange={e => setForm({ ...form, expectation: e.target.value })}
                    style={{ width: '100%', resize: 'vertical' }} />
                </div>

                {event.isPaid && (
                  <>
                    <div>
                      <label className="small muted" style={{ display: 'block', marginBottom: 5 }}>
                        UTR / Transaction ID *
                      </label>
                      <input className="input" type="text" placeholder="From your UPI app"
                        value={form.utr}
                        onChange={e => setForm({ ...form, utr: e.target.value })}
                        style={{ width: '100%' }} />
                    </div>
                    <div>
                      <label className="small muted" style={{ display: 'block', marginBottom: 5 }}>
                        Payment screenshot (optional, speeds up verification)
                      </label>
                      <input type="file" accept="image/*"
                        onChange={e => setScreenshot(e.target.files[0])}
                        className="small" style={{ width: '100%' }} />
                    </div>
                  </>
                )}

                <button className="btn btn-primary btn-block"
                  disabled={submitting} onClick={submit}>
                  {submitting
                    ? 'Submitting…'
                    : event.isPaid ? 'Submit payment & register' : 'Register free'}
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              Registration is closed for this event.
            </div>
          )
        )}
      </div>
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
