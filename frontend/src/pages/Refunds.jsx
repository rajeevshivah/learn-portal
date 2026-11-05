import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import Toast from '../components/Toast';

const API = import.meta.env.VITE_API_URL;

export const ist = (d) => new Date(d).toLocaleString('en-IN', {
  timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
});
const left = (d) => {
  const ms = new Date(d) - Date.now();
  if (ms <= 0) return '';
  const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60000);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h left` : h > 0 ? `${h}h ${m}m left` : `${m} min left`;
};

const STATUS = {
  pending:  { label: 'Waiting for review', cls: 'rf-st-wait' },
  approved: { label: 'Approved, money on its way', cls: 'rf-st-ok' },
  refunded: { label: 'Refunded', cls: 'rf-st-ok' },
  rejected: { label: 'Declined', cls: 'rf-st-no' },
};

function windowLine(p) {
  const w = p.window;
  if (p.status === 'refunded') return { tone: 'muted', text: 'Refunded. Access to this has ended.' };
  if (p.status === 'rejected') return { tone: 'muted', text: 'This payment wasn’t confirmed. If money left your account, report a payment problem.' };
  if (w.rule === 'single') return { tone: 'muted', text: 'Single-class workshop: final once you register.' };
  if (w.state === 'open') return { tone: 'open', text: `Refund window open until ${ist(w.closesAt)}`, sub: left(w.closesAt) };
  if (w.state === 'early') {
    return { tone: 'muted', text: `Refund window opens ${ist(w.opensAt)}${w.rule === 'live' ? `, when Class ${w.classNumber} ends` : ''}, for 24 hours.` };
  }
  return { tone: 'muted', text: `Refund window closed on ${ist(w.closesAt)}.` };
}

function RequestForm({ p, onDone, onCancel }) {
  const guaranteeOpen = p.status === 'active' && p.window.state === 'open';
  const issueOpen = p.issue.state === 'open';
  const [type, setType] = useState(guaranteeOpen ? 'guarantee' : 'payment_issue');
  const [reason, setReason] = useState('');
  const [upiId, setUpiId] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    setError('');
    if (type === 'guarantee' && !agree) { setError('Please confirm you understand your access ends with the refund.'); return; }
    setBusy(true);
    try {
      await axios.post(`${API}/refunds`, { kind: p.kind, id: p.id, type, reason, upiId });
      onDone();
    } catch (e) { setError(e.response?.data?.message || 'Could not send your request. Try again.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="rf-form">
      <fieldset className="rf-types">
        <legend>What’s this about?</legend>
        <label className={!guaranteeOpen ? 'off' : ''}>
          <input type="radio" name={`t-${p.id}`} checked={type === 'guarantee'} disabled={!guaranteeOpen} onChange={() => setType('guarantee')} />
          <span>
            <strong>{p.kind === 'event' ? 'This program isn’t for me' : 'This course isn’t for me'}</strong>
            <em>{guaranteeOpen ? `Full refund of ₹${p.amountPaid}. Allowed until ${ist(p.window.closesAt)}.` : 'Only while the refund window is open.'}</em>
          </span>
        </label>
        <label className={!issueOpen ? 'off' : ''}>
          <input type="radio" name={`t-${p.id}`} checked={type === 'payment_issue'} disabled={!issueOpen} onChange={() => setType('payment_issue')} />
          <span>
            <strong>There was a problem with my payment</strong>
            <em>{issueOpen ? 'Charged twice, paid the wrong amount, or money left your account but the payment was rejected.' : 'Payment problems can be reported within 30 days of paying.'}</em>
          </span>
        </label>
      </fieldset>

      <label className="rf-label" htmlFor={`r-${p.id}`}>
        {type === 'payment_issue' ? 'What went wrong? Include amounts and dates.' : 'What didn’t work for you? (optional, never affects your refund)'}
      </label>
      <textarea id={`r-${p.id}`} className="textarea" rows={3} maxLength={1500} value={reason} onChange={e => setReason(e.target.value)} />

      {p.method === 'upi' && (
        <>
          <label className="rf-label" htmlFor={`u-${p.id}`}>UPI ID you paid from. The refund goes here.</label>
          <input id={`u-${p.id}`} className="input" placeholder="name@okaxis" value={upiId} onChange={e => setUpiId(e.target.value)} autoComplete="off" />
        </>
      )}

      {type === 'guarantee' && (
        <label className="checkbox-row small rf-agree">
          <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
          I understand my access to {p.kind === 'event' ? 'the classes, recordings and notes' : 'this course'} ends when the refund is processed.
        </label>
      )}
      {error && <p className="rf-error" role="alert">{error}</p>}
      <div className="rf-form-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send refund request'}</button>
      </div>
    </div>
  );
}

export default function Refunds() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState('');
  const [toast, setToast] = useState('');

  const load = () => axios.get(`${API}/refunds/mine`)
    .then(({ data }) => { setData(data); setError(''); })
    .catch(() => setError('Could not load your purchases. Check your internet and refresh.'));
  useEffect(() => { load(); }, []);

  const withdraw = async (id) => {
    if (!window.confirm('Withdraw this refund request?')) return;
    try { await axios.delete(`${API}/refunds/${id}`); setToast('Request withdrawn'); load(); }
    catch (e) { setToast(e.response?.data?.message || 'Could not withdraw'); }
  };

  return (
    <div className="page container section rf-page">
      <h1 className="rf-title">Refunds</h1>
      <p className="rf-sub">
        Ask for a refund here. The time you send the request is the time that counts.
        {' '}<Link to="/refund-policy">Read the refund policy</Link>
      </p>

      {error && <div className="dq-empty">{error}</div>}
      {!data && !error && <div className="spinner-page">Loading…</div>}

      {data && (
        <>
          <section className="rf-sec">
            <h2 className="db-h3">Your purchases</h2>
            {data.purchases.length === 0 ? (
              <div className="dq-empty">You haven’t paid for anything yet, so there’s nothing to refund.</div>
            ) : (
              <div className="rf-list">
                {data.purchases.map(p => {
                  const line = windowLine(p);
                  const canAsk = !p.openRequest && ((p.status === 'active' && p.window.state === 'open') || p.issue.state === 'open');
                  const key = `${p.kind}-${p.id}`;
                  return (
                    <article key={key} className="rf-item">
                      <div className="rf-item-head">
                        <div className="rf-item-main">
                          <div className="rf-item-title">{p.title}</div>
                          <div className="rf-item-meta">
                            {p.kind === 'event' ? 'Live program' : 'Course'} · ₹{p.amountPaid} · paid {ist(p.paidAt)} · {p.method === 'razorpay' ? 'online' : 'UPI'}
                          </div>
                        </div>
                      </div>
                      <div className={`rf-window rf-${line.tone}`}>
                        <span>{line.text}</span>
                        {line.sub && <span className="rf-left">{line.sub}</span>}
                      </div>
                      {p.openRequest ? (
                        <div className="rf-item-foot">Refund request sent. See below.</div>
                      ) : open === key ? (
                        <RequestForm p={p} onCancel={() => setOpen('')}
                          onDone={() => { setOpen(''); setToast('Request sent. We reply within 2 working days.'); load(); }} />
                      ) : (
                        <div className="rf-item-foot">
                          <button type="button" className={`btn btn-sm ${p.status === 'active' && p.window.state === 'open' ? 'btn-primary' : 'btn-ghost'}`}
                            disabled={!canAsk} onClick={() => setOpen(key)}>
                            {p.status === 'active' && p.window.state === 'open' ? 'Request a refund' : 'Report a payment problem'}
                          </button>
                          {!canAsk && <span className="small muted">Nothing can be requested for this right now.</span>}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rf-sec">
            <h2 className="db-h3">Your refund requests</h2>
            {data.requests.length === 0 ? (
              <div className="dq-empty">No refund requests yet.</div>
            ) : (
              <div className="rf-list">
                {data.requests.map(r => (
                  <article key={r._id} className="rf-item">
                    <div className="rf-item-head">
                      <div className="rf-item-main">
                        <div className="rf-item-title">{r.title}</div>
                        <div className="rf-item-meta">
                          {r.type === 'guarantee' ? 'Not for me' : 'Payment problem'} · sent {ist(r.createdAt)}
                        </div>
                      </div>
                      <span className={`rf-st ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                    </div>
                    {r.status === 'pending' && (
                      <div className="rf-item-foot">
                        <span className="small muted">We reply within 2 working days.</span>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => withdraw(r._id)}>Withdraw</button>
                      </div>
                    )}
                    {r.status === 'approved' && <p className="rf-note">₹{r.refundAmount} will reach {r.upiId || 'your account'} within 5 to 7 working days.</p>}
                    {r.status === 'refunded' && (
                      <p className="rf-note">
                        ₹{r.refundAmount} refunded on {ist(r.refundedAt)}{r.refundRef ? ` (reference ${r.refundRef})` : ''}.
                        {r.method === 'razorpay' && ' Your bank may take 5 to 7 working days to show it.'}
                      </p>
                    )}
                    {r.status === 'rejected' && <p className="rf-note rf-note-no">{r.adminNote}</p>}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
