import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import Toast from '../../components/Toast';
import { ist } from '../Refunds';

const API = import.meta.env.VITE_API_URL;

const dur = (ms) => {
  const a = Math.abs(ms), h = Math.floor(a / 3600e3), m = Math.floor((a % 3600e3) / 60000);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${m}m` : `${m} min`;
};

// What the admin needs to decide, in one sentence
function verdict(r) {
  if (r.type === 'payment_issue') return { ok: true, text: 'Payment problem. Check the facts in your bank or Razorpay.' };
  const w = r.window || {};
  const what = w.rule === 'course' ? 'after the course unlocked' : w.rule === 'recordings' ? 'after their seat was confirmed' : 'after the class ended';
  return { ok: r.eligible, text: `Sent ${dur(r.msAfterOpen)} ${what}, with ${dur(r.msLeftAtSubmit)} of the window left.` };
}

const STATUS_LABEL = { pending: 'Pending', approved: 'Approved, send UPI', refunded: 'Refunded', rejected: 'Declined' };

export default function RefundsTab({ onChange }) {
  const [view, setView] = useState('open');
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [draft, setDraft] = useState({});   // per request: amount, refundRef, keepAccess

  const load = useCallback(() => axios.get(`${API}/refunds/admin`, { params: { status: view } })
    .then(({ data }) => setList(data)).catch(() => { setList([]); setToast('Could not load refund requests'); }), [view]);
  useEffect(() => { setList(null); load(); }, [load]);

  const d = (id) => draft[id] || {};
  const setD = (id, patch) => setDraft(x => ({ ...x, [id]: { ...d(id), ...patch } }));

  const run = async (id, fn, msg) => {
    setBusy(id);
    try { await fn(); setToast(msg); await load(); onChange?.(); }
    catch (e) { setToast(e.response?.data?.message || 'Something went wrong'); }
    finally { setBusy(''); }
  };

  const approve = (r, manual = false) => {
    const amount = Number(d(r._id).amount ?? r.amountPaid);
    const removeAccess = !d(r._id).keepAccess && r.type === 'guarantee' ? true : Boolean(d(r._id).removeAccess);
    const how = r.method === 'razorpay' && !manual ? `Refund ₹${amount} to ${r.user?.name} through Razorpay now?` : null;
    if (how && !window.confirm(how)) return;
    run(r._id, () => axios.put(`${API}/refunds/${r._id}/approve`, { amount, manual, refundRef: d(r._id).refundRef, removeAccess }),
      r.method === 'razorpay' ? `₹${amount} refunded` : 'Approved. Send the UPI refund, then mark it paid');
  };
  const paid = (r) => run(r._id, () => axios.put(`${API}/refunds/${r._id}/paid`, { refundRef: d(r._id).refundRef }), 'Marked as refunded');
  const reject = (r) => {
    const why = window.prompt('Reason (the student sees this):',
      r.eligible ? '' : 'Your request arrived after the refund window had closed, so it isn’t covered by the refund policy.');
    if (!why) return;
    run(r._id, () => axios.put(`${API}/refunds/${r._id}/reject`, { reason: why }), 'Declined');
  };

  return (
    <div className="rfa">
      <div className="dq-chips" role="group" aria-label="Show">
        {[['open', 'To do'], ['refunded', 'Refunded'], ['rejected', 'Declined'], ['all', 'All']].map(([k, l]) => (
          <button key={k} type="button" className={`dq-chip ${view === k ? 'on' : ''}`} onClick={() => setView(k)}>{l}</button>
        ))}
      </div>

      {!list ? <div className="spinner-page">Loading…</div> : list.length === 0 ? (
        <div className="today-empty" style={{ marginTop: 14 }}>{view === 'open' ? 'No refund requests waiting.' : 'Nothing here.'}</div>
      ) : (
        <div className="today-list" style={{ marginTop: 14 }}>
          {list.map(r => {
            const v = verdict(r);
            return (
              <div key={r._id} className={`today-row today-row-wrap rfa-row ${r.status === 'pending' && !v.ok ? 'is-dup' : ''}`}>
                <div className="today-main">
                  <div className="today-title">
                    {r.user?.name || 'Student'} <span className="today-amt">₹{r.amountPaid}</span>
                    <span className={`rfa-st rfa-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                  </div>
                  <div className="today-meta">{r.title} · {r.type === 'guarantee' ? 'Not for me' : 'Payment problem'} · {r.user?.email}</div>
                  <div className="today-meta">
                    Requested {ist(r.createdAt)} · {r.method === 'razorpay' ? <>Razorpay <code>{r.paymentRef}</code></> : <>UPI, UTR <code>{r.paymentRef}</code>, refund to <code>{r.upiId}</code></>}
                  </div>
                  {r.status === 'pending' && (
                    <div className={v.ok ? 'rfa-ok' : 'today-dup'}>{v.ok ? 'Within the policy. ' : 'Outside the policy. '}{v.text}</div>
                  )}
                  {r.window?.text && <div className="today-meta">Window: {r.window.text}</div>}
                  {r.reason && <div className="rfa-reason">“{r.reason}”</div>}
                  {r.status === 'refunded' && <div className="today-meta">₹{r.refundAmount} refunded {ist(r.refundedAt)}{r.refundRef ? `, ref ${r.refundRef}` : ''}{r.accessRemoved ? ', access removed' : ''}</div>}
                  {r.status === 'rejected' && <div className="today-meta">Declined: {r.adminNote}</div>}

                  {r.status === 'pending' && (
                    <div className="rfa-controls">
                      <label className="small">Amount ₹
                        <input className="input rfa-amt" type="number" min="1" max={r.amountPaid}
                          value={d(r._id).amount ?? r.amountPaid} onChange={e => setD(r._id, { amount: e.target.value })} />
                      </label>
                      {r.type === 'guarantee' ? (
                        <label className="checkbox-row small">
                          <input type="checkbox" checked={!d(r._id).keepAccess} onChange={e => setD(r._id, { keepAccess: !e.target.checked })} />
                          Remove their access
                        </label>
                      ) : (
                        <label className="checkbox-row small">
                          <input type="checkbox" checked={Boolean(d(r._id).removeAccess)} onChange={e => setD(r._id, { removeAccess: e.target.checked })} />
                          Remove their access
                        </label>
                      )}
                    </div>
                  )}
                  {r.status === 'approved' && (
                    <div className="rfa-controls">
                      <input className="input" placeholder="UTR of your refund transfer (optional)" value={d(r._id).refundRef || ''}
                        onChange={e => setD(r._id, { refundRef: e.target.value })} />
                    </div>
                  )}
                </div>
                <div className="today-actions">
                  {r.status === 'pending' && r.method === 'razorpay' && (
                    <>
                      {r.canAutoRefund && <button className="btn btn-primary btn-sm" disabled={busy === r._id} onClick={() => approve(r)}>Refund via Razorpay</button>}
                      <button className="btn btn-ghost btn-sm" disabled={busy === r._id} onClick={() => approve(r, true)} title="Use if you already refunded from the Razorpay dashboard">Mark refunded</button>
                    </>
                  )}
                  {r.status === 'pending' && r.method === 'upi' && (
                    <button className="btn btn-primary btn-sm" disabled={busy === r._id} onClick={() => approve(r)}>Approve</button>
                  )}
                  {r.status === 'approved' && (
                    <button className="btn btn-primary btn-sm" disabled={busy === r._id} onClick={() => paid(r)}>I’ve sent ₹{r.refundAmount}</button>
                  )}
                  {r.status === 'pending' && <button className="btn btn-ghost btn-sm" disabled={busy === r._id} onClick={() => reject(r)}>Decline</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
