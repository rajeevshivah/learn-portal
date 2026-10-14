import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import Toast from '../components/Toast';
import { getRzpConfig, payWithRazorpay, PAYMENT_HELP_TEXT } from '../lib/razorpay';

const API = import.meta.env.VITE_API_URL;

export default function Payment() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [utr, setUtr] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [rzpOn, setRzpOn] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [payHelp, setPayHelp] = useState(false);

  useEffect(() => {
    axios.get(`${API}/payments/info/${slug}`)
      .then(({ data }) => {
        setInfo(data);
        if (data.existing?.status === 'active') navigate(`/courses/${slug}`, { replace: true });
        if (data.existing?.status === 'pending') setSubmitted(true);
      })
      .catch(err => setError(err.response?.data?.message || 'Could not load payment page'));
    getRzpConfig().then(c => setRzpOn(Boolean(c.enabled)));
  }, [slug, navigate]);

  const payOnline = async () => {
    setPaying(true);
    setPayHelp(false);
    try {
      await payWithRazorpay({ kind: 'course', id: info.course.id });
      setPaid(true);
    } catch (err) {
      if (err.message === 'stuck') setPayHelp(true);
      else if (err.message !== 'cancelled') setToast(err.response?.data?.message || err.message);
    } finally {
      setPaying(false);
    }
  };

  const submit = async () => {
    if (!utr.trim()) { setToast('Enter the UTR / transaction ID from your UPI app'); return; }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('courseId', info.course.id);
      form.append('utr', utr.trim());
      if (screenshot) form.append('screenshot', screenshot);
      await axios.post(`${API}/payments/submit`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSubmitted(true);
    } catch (err) {
      setToast(err.response?.data?.message || 'Could not submit — try again');
    } finally {
      setSubmitting(false);
    }
  };

  if (error) return (
    <div className="page"><div className="container section" style={{ maxWidth: 520 }}>
      <div className="card" style={{ textAlign: 'center' }}>
        <p style={{ color: 'var(--danger)' }}>{error}</p>
        <Link to="/courses" className="btn btn-ghost" style={{ marginTop: 14 }}>Back to courses</Link>
      </div>
    </div></div>
  );
  if (!info) return <div className="spinner-page">Loading payment page…</div>;

  const upiLink =
    `upi://pay?pa=${encodeURIComponent(info.upiId)}` +
    `&pn=${encodeURIComponent(info.upiName)}` +
    `&am=${info.course.price}` +
    `&cu=INR&tn=${encodeURIComponent(info.course.title.slice(0, 40))}`;

  if (paid) return (
    <div className="page"><div className="container section" style={{ maxWidth: 520 }}>
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 42, marginBottom: 12 }}>🎉</div>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Payment successful</h1>
        <p className="muted small" style={{ marginBottom: 22 }}>
          <strong>{info.course.title}</strong> is unlocked. Start learning right away.
        </p>
        <Link to={`/courses/${slug}`} className="btn btn-primary">Start the course →</Link>
      </div>
    </div></div>
  );

  if (submitted) return (
    <div className="page"><div className="container section" style={{ maxWidth: 520 }}>
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 42, marginBottom: 12 }}>⏳</div>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Payment under verification</h1>
        <p className="muted small" style={{ marginBottom: 6 }}>
          We've received your payment details for <strong>{info.course.title}</strong>.
        </p>
        <p className="muted small" style={{ marginBottom: 22 }}>
          Access unlocks after verification — usually within a few hours. You'll see it on your dashboard.
        </p>
        <Link to="/dashboard" className="btn btn-primary">Go to dashboard</Link>
      </div>
    </div></div>
  );

  return (
    <div className="page">
      <div className="container section" style={{ maxWidth: 560 }}>
        <Link to={`/courses/${slug}`} className="small muted">← Back to course</Link>
        <h1 style={{ fontSize: 22, margin: '12px 0 4px' }}>Complete your purchase</h1>
        <p className="muted small" style={{ marginBottom: 20 }}>{info.course.title}</p>

        {info.existing?.status === 'expired' && (
          <div className="card" style={{ borderColor: 'var(--warning)', marginBottom: 16 }}>
            <strong style={{ color: 'var(--warning)' }} className="small">Renewing access</strong>
            <p className="small muted" style={{ marginTop: 4 }}>Your previous access period has ended. Pay again to renew — your progress is saved.</p>
          </div>
        )}

        {info.existing?.status === 'rejected' && (
          <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: 16 }}>
            <strong style={{ color: 'var(--danger)' }} className="small">Previous payment was not verified</strong>
            <p className="small muted" style={{ marginTop: 4 }}>{info.existing.rejectReason || 'Please pay again or submit the correct UTR.'}</p>
          </div>
        )}

        {rzpOn && (
          <div className="card" style={{ textAlign: 'center', marginBottom: 16, borderColor: 'var(--accent)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700, marginBottom: 4 }}>
              ₹{info.course.price}
              {info.course.mrp > info.course.price && (
                <span className="small muted" style={{ textDecoration: 'line-through', marginLeft: 10, fontWeight: 400 }}>₹{info.course.mrp}</span>
              )}
            </div>
            <p className="small muted" style={{ marginBottom: 18 }}>
              UPI · Cards · Netbanking · Wallets — international cards accepted
            </p>
            <p className="small muted" style={{ marginBottom: 12, lineHeight: 1.5 }}>
              Paying by UPI? Open your UPI app and approve the request within 5 minutes.
              Outside India? Choose <strong>Card</strong>.
            </p>
            <button className="btn btn-primary btn-block" onClick={payOnline} disabled={paying}>
              {paying ? 'Opening secure payment…' : `Pay ₹${info.course.price} & unlock now`}
            </button>
            <p className="small muted" style={{ marginTop: 12 }}>
              🔒 Secured by Razorpay · Access unlocks instantly
            </p>
            {payHelp && (
              <p className="small" style={{ marginTop: 10, color: 'var(--warning)', lineHeight: 1.5 }}>
                {PAYMENT_HELP_TEXT}
              </p>
            )}
            {!showManual && info.upiId && (
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setShowManual(true)}>
                Prefer scanning a UPI QR manually?
              </button>
            )}
          </div>
        )}

        {(!rzpOn || showManual) && (<>
        <div className="card" style={{ textAlign: 'center', marginBottom: 16 }}>
          {rzpOn && <p className="small muted" style={{ marginBottom: 10 }}>Manual UPI — access unlocks after we verify your payment</p>}
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700, marginBottom: 4 }}>
            ₹{info.course.price}
            {info.course.mrp > info.course.price && (
              <span className="small muted" style={{ textDecoration: 'line-through', marginLeft: 10, fontWeight: 400 }}>₹{info.course.mrp}</span>
            )}
          </div>
          <p className="small muted" style={{ marginBottom: 18 }}>Step 1 — scan with any UPI app{info.paymentQrUrl ? "" : " (amount is pre-filled)"}</p>

          <div className="qr-box">
            {info.paymentQrUrl
              ? <img src={info.paymentQrUrl} alt="Payment QR" style={{ width: 200, height: 200, objectFit: 'contain', display: 'block' }} />
              : <QRCodeSVG value={upiLink} size={200} level="M" />}
          </div>

          <p className="small" style={{ marginTop: 14 }}>
            or pay to UPI ID:{' '}
            <strong style={{ color: 'var(--accent)', userSelect: 'all' }}>{info.upiId}</strong>
          </p>
          <a className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} href={upiLink}>
            Open in UPI app (mobile)
          </a>
        </div>

        <div className="card">
          <p className="small muted" style={{ marginBottom: 14 }}>Step 2 — after paying, submit your transaction details</p>

          <div className="field">
            <label className="label">UTR / Transaction ID *</label>
            <input className="input" value={utr} onChange={e => setUtr(e.target.value)}
              placeholder="12-digit UTR from GPay / PhonePe / Paytm" />
          </div>

          <div className="field">
            <label className="label">Payment screenshot (optional, speeds up verification)</label>
            <input className="input" type="file" accept="image/*"
              onChange={e => setScreenshot(e.target.files[0] || null)} />
          </div>

          <button className="btn btn-primary btn-block" onClick={submit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit for verification'}
          </button>
          <p className="small muted" style={{ marginTop: 12, textAlign: 'center' }}>{info.note}</p>
        </div>
        </>)}
      </div>
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
