import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import Toast from '../../components/Toast';

const API = import.meta.env.VITE_API_URL;

export default function PaymentsTab({ onChange }) {
  const [view, setView] = useState('pending');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const url = view === 'pending' ? `${API}/payments/pending`
      : view === 'online' ? `${API}/rzp/admin/payments`
      : `${API}/payments/all`;
    axios.get(url).then(({ data }) => setRows(data)).catch(() => setToast('Could not load payments')).finally(() => setLoading(false));
  }, [view]);

  useEffect(() => { load(); }, [load]);

  const act = async (id, action) => {
    let reason = '';
    if (action === 'reject') {
      reason = window.prompt('Reason for rejection (student will see this):', 'Payment could not be verified — please check the UTR and resubmit.');
      if (reason === null) return;
    }
    setBusy(id);
    try {
      await axios.put(`${API}/payments/${id}/${action}`, action === 'reject' ? { reason } : {});
      setToast(action === 'approve' ? 'Approved — access unlocked' : 'Rejected');
      load();
      onChange?.();
    } catch (err) {
      setToast(err.response?.data?.message || 'Action failed');
    } finally {
      setBusy('');
    }
  };

  const badge = (s) => s === 'active' ? 'badge-success' : s === 'pending' ? 'badge-warning' : 'badge-danger';

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`btn btn-sm ${view === 'pending' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('pending')}>Pending queue</button>
        <button className={`btn btn-sm ${view === 'all' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('all')}>History</button>
        <button className={`btn btn-sm ${view === 'online' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('online')}>Online (Razorpay)</button>
      </div>

      {view === 'online' && !loading && (() => {
        const paid = rows.filter(r => r.status === 'paid');
        const total = paid.reduce((sum, r) => sum + (r.amount || 0), 0);
        return (
          <p className="small muted" style={{ marginBottom: 12 }}>
            {paid.length} paid · ₹{total.toLocaleString('en-IN')} collected online (last 300 attempts shown).
            Abandoned checkouts show as "created".
          </p>
        );
      })()}

      {loading ? <div className="spinner-page">Loading…</div> :
       view === 'online' ? (
        rows.length === 0 ? <div className="empty-state">No online payments yet.</div> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Student</th><th>For</th><th>Amount</th><th>Payment ID</th><th>Method</th><th>When</th><th>Status</th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r._id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.user?.name}</div>
                      <div className="small muted">{r.user?.email}</div>
                    </td>
                    <td>
                      <span className="badge badge-muted" style={{ marginRight: 6 }}>{r.kind === 'event' ? 'Webinar' : 'Course'}</span>
                      {r.kind === 'event' ? r.event?.title : r.course?.title}
                    </td>
                    <td style={{ fontWeight: 600 }}>₹{r.amount}</td>
                    <td><code style={{ fontSize: 12.5, userSelect: 'all' }}>{r.paymentId || '—'}</code></td>
                    <td className="small">{r.method || '—'}{r.international ? ' · 🌍' : ''}</td>
                    <td className="small muted">{new Date(r.paidAt || r.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td>
                      <span className={`badge ${r.status === 'paid' ? 'badge-success' : r.status === 'failed' ? 'badge-danger' : 'badge-muted'}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
       ) :
       rows.length === 0 ? <div className="empty-state">{view === 'pending' ? 'No pending payments. All clear ✓' : 'No payments yet.'}</div> : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Student</th><th>Course</th><th>Amount</th><th>UTR</th><th>Proof</th><th>When</th>
                {view === 'pending' ? <th>Action</th> : <th>Status</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r._id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.user?.name}</div>
                    <div className="small muted">{r.user?.email}</div>
                  </td>
                  <td>{r.course?.title}</td>
                  <td style={{ fontWeight: 600 }}>₹{r.amount}</td>
                  <td><code style={{ fontSize: 12.5, userSelect: 'all' }}>{r.utr}</code></td>
                  <td>{r.screenshotUrl ? <a href={r.screenshotUrl} target="_blank" rel="noreferrer">View</a> : <span className="muted small">—</span>}</td>
                  <td className="small muted">{new Date(r.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  {view === 'pending' ? (
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-success btn-sm" disabled={busy === r._id} onClick={() => act(r._id, 'approve')}>Approve</button>
                        <button className="btn btn-danger btn-sm" disabled={busy === r._id} onClick={() => act(r._id, 'reject')}>Reject</button>
                      </div>
                    </td>
                  ) : (
                    <td><span className={`badge ${badge(r.status)}`}>{r.status}</span></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
