import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { openClassBoard } from '../../lib/openBoard';
import Toast from '../../components/Toast';

const API = import.meta.env.VITE_API_URL;

// ── Today: everything that needs the admin, in one place ──
// Approvals (webinar seats + course payments), today's classes and their join
// links, recordings still missing, and unanswered doubts.

const endOf = (s) => new Date(s.startsAt).getTime() + (s.durationMins || 60) * 60000;
const fmtTime = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
const fmtDay = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const ago = (d) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(d)) / 60000));
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

export default function TodayTab({ goTo, onChange }) {
  const navigate = useNavigate();
  const [regs, setRegs] = useState([]);
  const [pays, setPays] = useState([]);
  const [doubts, setDoubts] = useState([]);
  const [events, setEvents] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [recDraft, setRecDraft] = useState({});

  const load = useCallback(async () => {
    const [r, p, d, e, rf] = await Promise.allSettled([
      axios.get(`${API}/events/admin/pending`),
      axios.get(`${API}/payments/pending`),
      axios.get(`${API}/questions/unanswered`),
      axios.get(`${API}/events/admin/all`),
      axios.get(`${API}/refunds/admin`, { params: { status: 'open' } }),
    ]);
    setRefunds(rf.status === 'fulfilled' ? rf.value.data : []);
    setRegs(r.status === 'fulfilled' ? r.value.data : []);
    setPays(p.status === 'fulfilled' ? p.value.data : []);
    setDoubts(d.status === 'fulfilled' ? d.value.data : []);
    setEvents(e.status === 'fulfilled' ? e.value.data : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // One approval queue: webinar registrations + course payments, oldest first
  const queue = useMemo(() => {
    const all = [
      ...regs.map(x => ({ kind: 'seat', id: x._id, who: x.user, what: x.event?.title, amount: x.amount || x.event?.price, utr: x.utr, proof: x.screenshotUrl, at: x.updatedAt || x.createdAt, phone: x.phone, dupServer: x.dupUtr })),
      ...pays.map(x => ({ kind: 'course', id: x._id, who: x.user, what: x.course?.title, amount: x.amount || x.course?.price, utr: x.utr, proof: x.screenshotUrl, at: x.updatedAt || x.createdAt, dupServer: x.dupUtr })),
    ].sort((a, b) => new Date(a.at) - new Date(b.at));
    // Same UTR used twice is the most common payment trick: flag it.
    const count = {};
    all.forEach(x => { if (x.utr) count[x.utr] = (count[x.utr] || 0) + 1; });
    return all.map(x => ({ ...x, dupUtr: Boolean(x.dupServer || (x.utr && count[x.utr] > 1)) }));
  }, [regs, pays]);

  // Classes: live now, later today, or tomorrow; plus recordings missing (last 7 days)
  const { classes, missingRecs } = useMemo(() => {
    const now = Date.now();
    const horizon = new Date(); horizon.setHours(23, 59, 59, 999); horizon.setDate(horizon.getDate() + 1);
    const classes = [];
    const missingRecs = [];
    events.filter(ev => ev.isPublished).forEach(ev => {
      const ss = [...(ev.sessions || [])].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
      ss.forEach((s, i) => {
        const item = { ev, s, number: i + 1, total: ss.length };
        if (endOf(s) > now && new Date(s.startsAt) <= horizon) classes.push(item);
        if (endOf(s) <= now && now - endOf(s) < 7 * 864e5 && !s.recordingUrl) missingRecs.push(item);
      });
    });
    classes.sort((a, b) => new Date(a.s.startsAt) - new Date(b.s.startsAt));
    return { classes, missingRecs };
  }, [events]);

  const act = async (item, action) => {
    let reason;
    if (action === 'reject') {
      reason = window.prompt('Reason for rejection (the student sees this):', 'Payment could not be verified. Please check the UTR and submit again.');
      if (reason === null) return;
    }
    setBusy(item.id);
    try {
      const url = item.kind === 'seat'
        ? `${API}/events/registrations/${item.id}/${action}`
        : `${API}/payments/${item.id}/${action}`;
      await axios.put(url, action === 'reject' ? { reason } : {});
      setToast(action === 'approve' ? `Approved ${item.who?.name?.split(' ')[0] || ''}` : 'Rejected');
      setSelected(s => { const n = new Set(s); n.delete(item.id); return n; });
      await load(); onChange?.();
    } catch (err) {
      setToast(err.response?.data?.message || 'Could not update');
    } finally { setBusy(''); }
  };

  const approveSelected = async () => {
    const items = queue.filter(x => selected.has(x.id));
    if (!items.length) return;
    setBusy('bulk');
    let ok = 0, fail = 0;
    for (const item of items) {   // one at a time: keeps the server and the log simple
      try {
        await axios.put(item.kind === 'seat'
          ? `${API}/events/registrations/${item.id}/approve`
          : `${API}/payments/${item.id}/approve`);
        ok++;
      } catch { fail++; }
    }
    setSelected(new Set());
    setToast(fail ? `Approved ${ok}, ${fail} failed` : `Approved ${ok}`);
    setBusy('');
    await load(); onChange?.();
  };

  const saveRecording = async ({ ev, s }) => {
    const url = (recDraft[s._id] || '').trim();
    if (!/^https:\/\//.test(url)) { setToast('Paste the full https:// YouTube link'); return; }
    setBusy(s._id);
    try {
      await axios.put(`${API}/events/${ev._id}/sessions/${s._id}/recording`, { recordingUrl: url });
      setToast('Recording saved. Students can watch it now');
      await load();
    } catch (err) {
      setToast(err.response?.data?.message || 'Could not save recording');
    } finally { setBusy(''); }
  };

  if (loading) return <div className="spinner-page">Loading…</div>;

  const toggle = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const cleanSel = queue.filter(x => !x.dupUtr).map(x => x.id);
  const allSel = cleanSel.length > 0 && cleanSel.every(id => selected.has(id));
  const needs = queue.length + missingRecs.length + doubts.length + refunds.length + classes.filter(c => !c.s.joinUrl).length;

  return (
    <div className="today">
      <p className="today-sum">
        {needs === 0 ? 'Nothing needs you right now.' : `${needs} thing${needs > 1 ? 's' : ''} need${needs > 1 ? '' : 's'} you.`}
      </p>

      {/* ── Classes ── */}
      {classes.length > 0 && (
        <section className="today-block">
          <h2 className="today-h">Classes today and tomorrow</h2>
          <div className="today-list">
            {classes.map(({ ev, s, number, total }) => {
              const live = new Date(s.startsAt) <= Date.now();
              return (
                <div key={s._id} className="today-row">
                  <div className="today-main">
                    <div className="today-title">
                      {live && <span className="today-live">Live</span>}
                      Class {number} of {total}: {s.title.replace(/^Day \d+\s*[—–-]\s*/i, '')}
                    </div>
                    <div className="today-meta">{ev.title}, {fmtDay(s.startsAt)} at {fmtTime(s.startsAt)}</div>
                  </div>
                  <div className="today-actions">
                    {s.joinUrl
                      ? <span className="badge badge-success">Join link set</span>
                      : <button className="btn btn-sm today-warn-btn" onClick={() => goTo('events')}>Add join link</button>}
                    <button className="btn btn-ghost btn-sm" disabled={busy === 'wb' + s._id}
                      onClick={async () => {
                        setBusy('wb' + s._id);
                        try { await openClassBoard(navigate, ev._id, s._id); }
                        catch (err) { setToast(err.response?.data?.message || 'Could not open the whiteboard'); setBusy(''); }
                      }}>
                      {busy === 'wb' + s._id ? 'Opening…' : 'Whiteboard'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Approvals ── */}
      <section className="today-block">
        <div className="today-head">
          <h2 className="today-h">Waiting for approval {queue.length > 0 && <span className="today-count">{queue.length}</span>}</h2>
          {queue.length > 1 && (
            <div className="today-bulk">
              <label className="checkbox-row small">
                <input type="checkbox" checked={allSel}
                  onChange={() => setSelected(allSel ? new Set() : new Set(cleanSel))} />
                Select all
              </label>
              <button className="btn btn-primary btn-sm" disabled={!selected.size || busy === 'bulk'} onClick={approveSelected}>
                {busy === 'bulk' ? 'Approving…' : `Approve selected${selected.size ? ` (${selected.size})` : ''}`}
              </button>
            </div>
          )}
        </div>
        {queue.length === 0 ? (
          <div className="today-empty">No payments waiting.</div>
        ) : (
          <div className="today-list">
            {queue.map(x => (
              <div key={x.id} className={`today-row ${x.dupUtr ? 'is-dup' : ''}`}>
                <input type="checkbox" className="today-check" aria-label={`Select ${x.who?.name}`}
                  checked={selected.has(x.id)} onChange={() => toggle(x.id)} />
                <div className="today-main">
                  <div className="today-title">{x.who?.name || 'Student'} <span className="today-amt">₹{x.amount}</span></div>
                  <div className="today-meta">
                    {x.kind === 'seat' ? 'Seat in ' : 'Course: '}{x.what} · {ago(x.at)}
                  </div>
                  <div className="today-meta">
                    UTR <code>{x.utr || 'none'}</code>
                    {x.proof && <> · <a href={x.proof} target="_blank" rel="noreferrer">Screenshot</a></>}
                    {x.phone && <> · {x.phone}</>}
                  </div>
                  {x.dupUtr && <div className="today-dup">This UTR was already used on another payment. Check your bank app before approving.</div>}
                </div>
                <div className="today-actions">
                  <button className="btn btn-primary btn-sm" disabled={busy === x.id} onClick={() => act(x, 'approve')}>Approve</button>
                  <button className="btn btn-ghost btn-sm" disabled={busy === x.id} onClick={() => act(x, 'reject')}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Refund requests ── */}
      {refunds.length > 0 && (
        <section className="today-block">
          <div className="today-head">
            <h2 className="today-h">Refund requests <span className="today-count">{refunds.length}</span></h2>
            <button className="btn btn-ghost btn-sm" onClick={() => goTo('refunds')}>Handle refunds</button>
          </div>
          <div className="today-list">
            {refunds.slice(0, 3).map(r => (
              <div key={r._id} className={`today-row ${r.status === 'pending' && !r.eligible ? 'is-dup' : ''}`}>
                <div className="today-main">
                  <div className="today-title">{r.user?.name} <span className="today-amt">₹{r.amountPaid}</span></div>
                  <div className="today-meta">
                    {r.title} · {r.status === 'approved' ? 'approved, UPI refund still to send' : r.type === 'guarantee' ? 'not for me' : r.type === 'admin' ? 'cancelled by you' : 'payment problem'} · {ago(r.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Recordings missing ── */}
      {missingRecs.length > 0 && (
        <section className="today-block">
          <h2 className="today-h">Recordings to add <span className="today-count">{missingRecs.length}</span></h2>
          <div className="today-list">
            {missingRecs.map(item => (
              <div key={item.s._id} className="today-row today-row-wrap">
                <div className="today-main">
                  <div className="today-title">Class {item.number}: {item.s.title.replace(/^Day \d+\s*[—–-]\s*/i, '')}</div>
                  <div className="today-meta">{item.ev.title}, ended {ago(endOf(item.s))}</div>
                </div>
                <div className="today-rec">
                  <input className="input" placeholder="https://youtu.be/… (unlisted)"
                    value={recDraft[item.s._id] || ''}
                    onChange={e => setRecDraft(d => ({ ...d, [item.s._id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && saveRecording(item)} />
                  <button className="btn btn-primary btn-sm" disabled={busy === item.s._id} onClick={() => saveRecording(item)}>Save</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Doubts ── */}
      <section className="today-block">
        <div className="today-head">
          <h2 className="today-h">Unanswered doubts {doubts.length > 0 && <span className="today-count">{doubts.length}</span>}</h2>
          {doubts.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => goTo('doubts')}>Answer doubts</button>}
        </div>
        {doubts.length === 0 ? (
          <div className="today-empty">No doubts waiting.</div>
        ) : (
          <div className="today-list">
            {doubts.slice(0, 3).map(q => (
              <div key={q._id} className="today-row">
                <div className="today-main">
                  <Link className="today-title today-q" to={`/discuss/${q._id}`}>{q.question || q.text}</Link>
                  <div className="today-meta">{q.user?.name}, {q.episode?.title || 'General'} · {ago(q.createdAt)}{q.replyCount ? ` · ${q.replyCount} ${q.replyCount === 1 ? 'reply' : 'replies'} from students` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
