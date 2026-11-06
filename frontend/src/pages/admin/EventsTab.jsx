import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import Toast from '../../components/Toast';
import { useNavigate } from 'react-router-dom';
import { openClassBoard } from '../../lib/openBoard';
import LessonResources from '../../components/LessonResources';

const API = import.meta.env.VITE_API_URL;

const blankSession = () => ({
  title: '', startsAt: '', durationMins: 60, joinUrl: '', recordingUrl: '',
});

const blankEvent = () => ({
  type: 'live-class',
  title: '', slug: '', description: '', thumbnail: '',
  course: '',
  recordingsCourse: '',
  sessions: [blankSession()],
  isPaid: false, price: 0, mrp: 0,
  whatsappLink: '',
  confirmationMsg: 'You’re in! Join the WhatsApp group for reminders and updates. Your Join button appears on your Home screen 15 minutes before each class.',
  seatLimit: 0,
  registrationClosesAt: '',
  isPublished: false,
  isCompleted: false,
  hideWhenClosed: true,
});

// <input type="datetime-local"> needs 'YYYY-MM-DDTHH:mm' in LOCAL time.
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// ── JSON import ──────────────────────────────────────────
// Sample template shown by the "Format" button. This is exactly the shape
// the importer understands; give this to an AI to generate a full event.
const JSON_TEMPLATE = {
  type: 'workshop',                // 'workshop' or 'live-class'
  title: 'Your First Push into Tech',
  slug: '',                        // optional — auto-generated from title if blank
  description: 'A 5-day evening webinar for beginners.',
  thumbnail: '',                   // optional image URL
  isPaid: true,
  price: 199,
  mrp: 499,                        // optional strike-through price
  whatsappLink: 'https://chat.whatsapp.com/xxxxxxxx',
  confirmationMsg: 'You are registered! Join the WhatsApp group for the link.',
  seatLimit: 0,                    // 0 = unlimited
  registrationClosesAt: '',        // optional ISO date, e.g. '2026-08-08T18:00'
  sessions: [
    { title: 'Day 1 — Your First Program', startsAt: '2026-08-08T20:30', durationMins: 60, joinUrl: '' },
    { title: 'Day 2 — The Logic Behind Code', startsAt: '2026-08-09T20:30', durationMins: 60, joinUrl: '' },
  ],
};

// Map an arbitrary parsed JSON object onto the form-state shape. Unknown fields
// are ignored; missing fields fall back to the blank defaults. Dates are
// normalised to the datetime-local format the inputs expect.
const jsonToForm = (raw) => {
  const base = blankEvent();
  const s = (v, d) => (v === undefined || v === null ? d : v);
  const sessions = Array.isArray(raw.sessions) && raw.sessions.length
    ? raw.sessions.map(ss => ({
        title:        s(ss.title, ''),
        startsAt:     ss.startsAt ? toLocalInput(ss.startsAt) : '',
        durationMins: s(ss.durationMins, 60),
        joinUrl:      s(ss.joinUrl, ''),
        recordingUrl: s(ss.recordingUrl, ''),
      }))
    : [blankSession()];

  return {
    ...base,
    type:            raw.type === 'live-class' ? 'live-class' : (raw.type === 'workshop' ? 'workshop' : base.type),
    title:           s(raw.title, ''),
    slug:            s(raw.slug, ''),
    description:     s(raw.description, ''),
    thumbnail:       s(raw.thumbnail, ''),
    course:          s(raw.course, ''),
    recordingsCourse: s(raw.recordingsCourse, ''),
    isPaid:          !!s(raw.isPaid, false),
    price:           Number(s(raw.price, 0)) || 0,
    mrp:             Number(s(raw.mrp, 0)) || 0,
    whatsappLink:    s(raw.whatsappLink, ''),
    confirmationMsg: s(raw.confirmationMsg, base.confirmationMsg),
    seatLimit:       Number(s(raw.seatLimit, 0)) || 0,
    registrationClosesAt: raw.registrationClosesAt ? toLocalInput(raw.registrationClosesAt) : '',
    sessions,
  };
};


// ── Quick recordings panel: paste a link per class, save one class at a time ──
function RecordingsPanel({ ev, courses = [], onSaved, setToast }) {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries((ev.sessions || []).map(s => [s._id, s.recordingUrl || ''])));
  const [busy, setBusy] = useState('');
  const linkedId = ev.recordingsCourse?._id || ev.recordingsCourse || '';
  const linked = courses.find(c => String(c._id) === String(linkedId));

  const [resOpen, setResOpen] = useState('');

  const sorted = [...(ev.sessions || [])].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  const ended = (s) => new Date(s.startsAt).getTime() + (s.durationMins || 60) * 60000 < Date.now();
  const done = sorted.filter(s => s.recordingUrl).length;
  const missing = sorted.filter(s => ended(s) && !s.recordingUrl).length;

  const save = async (s) => {
    setBusy(s._id);
    try {
      await axios.put(`${API}/events/${ev._id}/sessions/${s._id}/recording`,
        { recordingUrl: (drafts[s._id] || '').trim() });
      setToast((drafts[s._id] || '').trim() ? 'Recording saved — students can watch it now' : 'Recording removed');
      onSaved();
    } catch (err) {
      setToast(err.response?.data?.message || 'Could not save recording');
    } finally { setBusy(''); }
  };

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <div className="small muted" style={{ marginBottom: 10 }}>
        {done} of {sorted.length} recordings added
        {missing > 0 && <span style={{ color: 'var(--warning)' }}> · {missing} finished class{missing > 1 ? 'es' : ''} still missing a recording</span>}
        . Only confirmed students see these links.
      </div>
      {linked ? (
        <div className="small" style={{ marginBottom: 10, color: 'var(--accent)' }}>
          📚 Recordings become lessons in <strong>{linked.title}</strong>
          {linked.isPaid ? ` (₹${linked.price})` : ''}{!linked.isPublished && ' — course is a draft, publish it in Courses to sell it'}.
          Use 📎 Notes &amp; links to attach PDFs, notebooks, code or a Colab link to a class.
        </div>
      ) : (
        <div className="small" style={{ marginBottom: 10, color: 'var(--warning)' }}>
          No recordings course linked. Students will open recordings on YouTube. Click Edit → "Recordings course"
          to play them inside the platform, add notes and sell them.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map((s, i) => {
          const changed = (drafts[s._id] || '') !== (s.recordingUrl || '');
          return (
            <div key={s._id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {i + 1}. {s.title}{' '}
                  {s.recordingUrl
                    ? <span className="badge badge-success">✓ Added</span>
                    : ended(s) ? <span className="badge badge-warning">Missing</span>
                    : <span className="badge badge-muted">Upcoming</span>}
                </div>
                <div className="small muted">{new Date(s.startsAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}</div>
              </div>
              <input className="input" style={{ flex: '2 1 280px' }}
                placeholder="https://youtu.be/… (unlisted)"
                value={drafts[s._id] || ''}
                onChange={e => setDrafts(d => ({ ...d, [s._id]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter' && changed) save(s); }} />
              <button className="btn btn-primary btn-sm" disabled={!changed || busy === s._id} onClick={() => save(s)}>
                {busy === s._id ? 'Saving…' : 'Save'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={async () => {
                try { await openClassBoard(navigate, ev._id, s._id); }
                catch (err) { setToast(err.response?.data?.message || 'Could not open the whiteboard'); }
              }}>{s.notesUrl ? 'Whiteboard ✓' : 'Whiteboard'}</button>
              {linked && s.publishedEpisode && s.recordingUrl && (
                <>
                  <button type="button" className="btn btn-ghost btn-sm" aria-expanded={resOpen === s._id}
                    onClick={() => setResOpen(resOpen === s._id ? '' : s._id)}>
                    📎 Notes &amp; links
                  </button>
                  <a className="btn btn-ghost btn-sm" href={`/episodes/${s.publishedEpisode}`} target="_blank" rel="noreferrer">
                    Open lesson
                  </a>
                </>
              )}
              {resOpen === s._id && s.publishedEpisode && (
                <div style={{ flexBasis: '100%' }}>
                  <LessonResources episodeId={s.publishedEpisode} setToast={setToast} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Feedback panel: per-class ratings, comments, featuring testimonials ──
function FeedbackPanel({ ev, setToast }) {
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('comments'); // comments | low | consented | featured
  const [session, setSession] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const params = { event: ev._id };
    if (session) params.session = session;
    if (filter === 'comments') params.withComment = '1';
    if (filter === 'low') params.maxRating = 3;
    if (filter === 'consented') { params.consented = '1'; params.withComment = '1'; }
    if (filter === 'featured') params.featured = '1';
    try {
      const [s, l] = await Promise.all([
        axios.get(`${API}/feedback/admin/summary/${ev._id}`),
        axios.get(`${API}/feedback/admin/list`, { params }),
      ]);
      setSummary(s.data); setRows(l.data);
    } catch (err) { setToast(err.response?.data?.message || 'Could not load feedback'); }
  }, [ev._id, filter, session, setToast]);
  useEffect(() => { load(); }, [load]);

  const act = async (f, body, msg) => {
    setBusy(f._id);
    try { await axios.put(`${API}/feedback/admin/${f._id}`, body); setToast(msg); load(); }
    catch (err) { setToast(err.response?.data?.message || 'Could not update'); }
    finally { setBusy(''); }
  };
  const color = (a) => a == null ? 'var(--border-hi)' : a >= 4.3 ? 'var(--success)' : a >= 3.5 ? 'var(--warning)' : 'var(--danger)';

  if (!summary) return <div className="small muted" style={{ marginTop: 12 }}>Loading feedback…</div>;
  const started = summary.classes.filter(c => c.started);

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <div className="small muted" style={{ marginBottom: 10 }}>
        {summary.confirmedStudents} confirmed students.
        Program review: {summary.program.count ? `${summary.program.average} ★ from ${summary.program.count}` : 'none yet (opens halfway through)'}.
        Testimonials appear on public webinar pages only if the student allowed it and you feature them.
      </div>

      {started.length === 0 ? (
        <div className="small muted">No classes have started yet. Ratings appear here from the first class.</div>
      ) : (
        <div className="fbx-bars" style={{ marginBottom: 14 }}>
          {started.map(c => (
            <button key={c.sessionId} type="button" className="fbx-bar-row"
              style={{ background: session === String(c.sessionId) ? 'var(--surface-2)' : 'none', border: 0, color: 'inherit', cursor: 'pointer', textAlign: 'left', padding: '2px 4px', borderRadius: 6 }}
              title={c.title} onClick={() => setSession(session === String(c.sessionId) ? '' : String(c.sessionId))}>
              <span>Class {c.number}</span>
              <span className="fbx-bar"><span style={{ width: `${c.average ? (c.average / 5) * 100 : 0}%`, background: color(c.average) }} /></span>
              <span className="small">{c.count ? `${c.average} ★ · ${c.count}` : 'no ratings'}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {[['comments', 'With comments'], ['low', '3★ or less'], ['consented', 'Can be featured'], ['featured', 'Featured']].map(([k, label]) => (
          <button key={k} type="button" className={`btn btn-sm ${filter === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
        {session && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSession('')}>✕ All classes</button>}
      </div>

      {rows.length === 0 ? <div className="small muted">Nothing here yet.</div> : rows.map(f => (
        <div key={f._id} className="fbx-comment" style={{ opacity: f.hidden ? 0.5 : 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span className="small"><strong style={{ color: '#FBBF24' }}>{'★'.repeat(f.rating)}</strong>{' '}
              <strong>{f.student}</strong> <span className="muted">· {f.classTitle}</span></span>
            <span className="small muted">{new Date(f.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
          </div>
          {f.comment && <div style={{ fontSize: 14 }}>{f.comment}</div>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {f.consentToFeature && f.comment && !f.hidden && (
              <button type="button" className={`btn btn-sm ${f.featured ? 'btn-primary' : 'btn-ghost'}`} disabled={busy === f._id}
                onClick={() => act(f, { featured: !f.featured }, f.featured ? 'Removed from website' : 'Featured on webinar pages ✓')}>
                {f.featured ? '★ Featured' : '☆ Feature on website'}
              </button>
            )}
            {!f.consentToFeature && f.comment && <span className="small muted">Private: student didn't allow publishing</span>}
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy === f._id}
              onClick={() => act(f, { hidden: !f.hidden }, f.hidden ? 'Restored' : 'Hidden from stats')}>
              {f.hidden ? 'Unhide' : 'Hide'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Meet link per class: a fresh Google Meet for every class ──
function MeetPanel({ ev, setToast, onChanged }) {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(() => axios.get(`${API}/events/${ev._id}/meet`)
    .then(({ data }) => setInfo(data))
    .catch(e => setErr(e.response?.data?.message || 'Could not load')), [ev._id]);
  useEffect(() => { load(); }, [load]);

  const send = async (body, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setErr('');
    try {
      const { data } = await axios.put(`${API}/events/${ev._id}/meet`, body);
      setInfo(data); setToast(data.message); onChanged?.();
    } catch (e) {
      const d = e.response?.data;
      if (d?.connected !== undefined) setInfo(d);
      setErr(d?.message || 'Something went wrong');
    } finally { setBusy(false); }
  };

  if (!info) return <div className="meet-panel small muted">{err || 'Loading…'}</div>;
  const ls = info.lastRun;
  return (
    <div className="meet-panel">
      <div className="meet-head">
        <div>
          <div className="meet-title">Meet link per class</div>
          <p className="small muted">
            Every upcoming class gets its own Google Meet, created in your Google Calendar. If a student forwards a link,
            it only works for that one class. Links are made the moment you add or change classes, and follow the class if
            you move or delete it. A class where you type your own link is left alone.
          </p>
        </div>
        <label className="switch-row">
          <input type="checkbox" checked={info.enabled} disabled={busy || (!info.connected && !info.enabled)}
            onChange={e => send({ enabled: e.target.checked })} />
          <span>{info.enabled ? 'On' : 'Off'}</span>
        </label>
      </div>

      {!info.connected && (
        <div className="meet-warn small">
          Google Calendar isn’t connected on the server. Add the three <code>GOOGLE_CAL_…</code> values on Render
          (see <code>SEATS-MEET-LOGIN.md</code>).
        </div>
      )}

      <div className="meet-grid small">
        <div><span className="muted">Upcoming classes</span><br /><strong>{info.upcoming}</strong></div>
        <div><span className="muted">With their own portal link</span><br /><strong>{info.portalLinks}</strong></div>
        <div><span className="muted">With a link you typed</span><br /><strong>{info.ownLinks}</strong></div>
        <div><span className="muted">No link yet</span><br /><strong style={{ color: info.noLink ? 'var(--warning)' : undefined }}>{info.noLink}</strong></div>
      </div>

      {info.enabled && info.ownLinks > 0 && (
        <div className="meet-warn small">
          {info.sharedOwnLink
            ? <>{info.ownLinks} upcoming classes use a link you typed, shared between them. A forwarded copy works for all of them.</>
            : <>{info.ownLinks} upcoming {info.ownLinks === 1 ? 'class uses' : 'classes use'} a link you typed in.</>}
          {' '}<button className="btn btn-ghost btn-sm" disabled={busy} style={{ marginLeft: 6 }}
            onClick={() => send({ replaceOwn: true }, `Give all ${info.ownLinks} upcoming classes their own new Meet link? Your current link stops being used for them. Students always join from the portal, so they get the new links automatically.`)}>
            Give each its own link
          </button>
        </div>
      )}

      {info.enabled && info.noLink > 0 && (
        <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} disabled={busy} onClick={() => send({})}>
          {busy ? 'Working…' : 'Create missing links now'}
        </button>
      )}

      <p className="small muted" style={{ marginTop: 10 }}>
        Students see a class’s link only from 15 minutes before it starts, on the portal.
        {' '}New programs start with this {info.defaultForNew ? 'on' : 'off'} (change it in Settings).
      </p>
      {err && <div className="small meet-err">{err}</div>}
      {ls && (
        <div className="small muted" style={{ marginTop: 6 }}>
          Last run {new Date(ls.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}:{' '}
          <span style={{ color: ls.ok ? 'var(--success)' : 'var(--danger)' }}>{ls.message}</span>
        </div>
      )}
    </div>
  );
}

// ── Move a seat to another email / cancel it (with or without a refund) ──
function SeatAction({ reg, kind, onDone, onClose, setToast }) {
  const paidOnline = /^RZP pay_/.test(reg.utr || '');
  const paid = reg.amount > 0 && Boolean(reg.utr);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [refund, setRefund] = useState(paid);
  const [amount, setAmount] = useState(reg.amount);
  const [manual, setManual] = useState(false);
  const [upiId, setUpiId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    if (kind === 'move' && !email.trim()) return setErr('Enter the email they can sign in with');
    if (kind === 'cancel' && note.trim().length < 3) return setErr('Write a short reason');
    if (kind === 'cancel' && refund && paidOnline && !manual &&
      !window.confirm(`Refund ₹${amount} to ${reg.user?.email} through Razorpay now? This moves money and can’t be undone.`)) return;
    setBusy(true);
    try {
      const { data } = kind === 'move'
        ? await axios.put(`${API}/events/registrations/${reg._id}/transfer`, { email, name, note })
        : await axios.put(`${API}/events/registrations/${reg._id}/cancel`, { reason: note, refund, amount: Number(amount), manual, upiId });
      setToast(data.message); onDone();
    } catch (e) { setErr(e.response?.data?.message || 'Something went wrong'); }
    finally { setBusy(false); }
  };

  return (
    <div className="seat-action">
      {kind === 'move' ? (
        <>
          <div className="seat-action-title">Move this seat to another email</div>
          <p className="small muted">Their access, recordings and refund rights move with it. If nobody has signed in with that
            email yet, an account is created: they just sign in with Google using it.</p>
          <div className="seat-fields">
            <input className="input" type="email" placeholder="New email (Gmail they can sign in with)" value={email}
              onChange={e => setEmail(e.target.value)} autoFocus />
            <input className="input" placeholder="Name (optional)" value={name} onChange={e => setName(e.target.value)} />
            <input className="input" placeholder="Note, e.g. lost access to old Gmail (optional)" value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </>
      ) : (
        <>
          <div className="seat-action-title">Cancel this seat</div>
          <p className="small muted">The student loses access to classes, recordings and the WhatsApp link on the portal.
            Remove them from the WhatsApp group yourself.</p>
          <div className="seat-fields">
            <input className="input" placeholder="Reason (kept in the seat history)" value={note} onChange={e => setNote(e.target.value)} autoFocus />
          </div>
          {paid ? (
            <div className="seat-refund">
              <label className="checkbox-row small">
                <input type="checkbox" checked={refund} onChange={e => setRefund(e.target.checked)} />
                Refund the payment
              </label>
              {refund && (
                <div className="seat-fields">
                  <label className="small">Amount ₹
                    <input className="input rfa-amt" type="number" min="1" max={reg.amount} value={amount} onChange={e => setAmount(e.target.value)} />
                  </label>
                  {paidOnline ? (
                    <label className="checkbox-row small">
                      <input type="checkbox" checked={manual} onChange={e => setManual(e.target.checked)} />
                      I already refunded it in the Razorpay dashboard
                    </label>
                  ) : (
                    <input className="input" placeholder="Their UPI ID for the refund (optional)" value={upiId} onChange={e => setUpiId(e.target.value)} />
                  )}
                  <span className="small muted">
                    {paidOnline ? (manual ? 'Recorded as refunded.' : 'Refunded through Razorpay right away.') : 'Paid by UPI: recorded in Refunds as approved. Send the money, then mark it sent there.'}
                  </span>
                </div>
              )}
            </div>
          ) : <p className="small muted">Nothing was paid for this seat.</p>}
        </>
      )}
      {err && <div className="small meet-err">{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className={`btn btn-sm ${kind === 'cancel' ? 'btn-danger' : 'btn-primary'}`} disabled={busy} onClick={submit}>
          {busy ? 'Working…' : kind === 'move' ? 'Move seat' : refund && paid ? `Cancel and refund ₹${amount}` : 'Cancel seat'}
        </button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export default function EventsTab({ onChange }) {
  const [events, setEvents]   = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState('');

  const [editing, setEditing] = useState(null);   // event object being edited, or null
  const [saving, setSaving]   = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);

  const [viewingRegs, setViewingRegs] = useState(null);  // event whose attendees we're showing
  const [regs, setRegs] = useState([]);
  const [regQuery, setRegQuery] = useState('');
  const [regFilter, setRegFilter] = useState('all');    // all | pending | active | rejected
  const [regSel, setRegSel] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const [recordingsFor, setRecordingsFor] = useState(null); // event id whose recordings panel is open
  const [feedbackFor, setFeedbackFor] = useState(null);     // event id whose feedback panel is open
  const [meetFor, setMeetFor] = useState(null);             // event id whose Meet links panel is open
  const [seatAction, setSeatAction] = useState(null);       // { id, kind: 'move' | 'cancel' }
  const [showImport, setShowImport] = useState(false);   // JSON import panel toggle
  const [pasteText, setPasteText]   = useState('');      // pasted JSON

  const load = useCallback(async () => {
    try {
      const [ev, co] = await Promise.all([
        axios.get(`${API}/events/admin/all`),
        axios.get(`${API}/courses/all`).catch(() => axios.get(`${API}/courses`)),
      ]);
      setEvents(ev.data);
      setCourses(co.data);
    } catch (e) {
      setToast('Could not load events');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── form helpers ──
  const startNew  = () => setEditing(blankEvent());
  const startEdit = (ev) => setEditing({
    ...ev,
    course: ev.course?._id || ev.course || '',
    recordingsCourse: ev.recordingsCourse?._id || ev.recordingsCourse || '',
    registrationClosesAt: toLocalInput(ev.registrationClosesAt),
    sessions: ev.sessions.map(s => ({ ...s, startsAt: toLocalInput(s.startsAt) })),
  });

  const set = (k, v) => setEditing(e => ({ ...e, [k]: v }));

  // Upload a thumbnail image to Cloudinary, then store just the URL.
  const uploadThumb = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setToast('Please choose an image file'); return; }
    setUploadingImg(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await axios.post(`${API}/events/upload-image`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      set('thumbnail', data.url);
      setToast('Image uploaded ✓');
    } catch (err) {
      setToast(err.response?.data?.message || 'Image upload failed');
    } finally {
      setUploadingImg(false);
    }
  };


  const setSession = (i, k, v) => setEditing(e => {
    const sessions = [...e.sessions];
    sessions[i] = { ...sessions[i], [k]: v };
    return { ...e, sessions };
  });

  const addSession = () => setEditing(e => ({ ...e, sessions: [...e.sessions, blankSession()] }));
  const removeSession = (i) => setEditing(e => ({
    ...e, sessions: e.sessions.filter((_, idx) => idx !== i),
  }));

  // ── JSON import / format helpers ──
  // Parse text and load it into the form for review. Returns true on success.
  const applyJson = (text) => {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      setToast('That’s not valid JSON — check for a missing comma or quote.');
      return false;
    }
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      setToast('JSON must be a single event object.');
      return false;
    }
    setEditing(prev => ({
      ...jsonToForm(parsed),
      // keep the id if we were editing an existing event
      _id: prev?._id,
    }));
    setShowImport(false);
    setPasteText('');
    setToast('Imported — review the fields below, then Save.');
    return true;
  };

  const onUploadJson = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => applyJson(String(reader.result));
    reader.onerror = () => setToast('Could not read that file.');
    reader.readAsText(file);
  };

  const copyFormat = () => {
    const txt = JSON.stringify(JSON_TEMPLATE, null, 2);
    navigator.clipboard?.writeText(txt)
      .then(() => setToast('Format copied — paste it into any AI to fill in.'))
      .catch(() => setToast('Copy failed — use the download button instead.'));
  };

  const downloadFormat = () => {
    const blob = new Blob([JSON.stringify(JSON_TEMPLATE, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'event-format.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const autoSlug = (title) => title.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 60);

  const save = async () => {
    const e = editing;
    if (!e.title.trim())  return setToast('Title is required');
    if (!e.slug.trim())   return setToast('Slug is required');
    if (e.type === 'live-class' && !e.course) return setToast('Pick a course for this live class');
    if (!e.sessions.length) return setToast('Add at least one session');
    if (e.sessions.some(s => !s.title.trim() || !s.startsAt)) {
      return setToast('Every session needs a title and a start time');
    }
    if (e.isPaid && (!e.price || e.price <= 0)) return setToast('Set a price above 0');

    const payload = {
      ...e,
      course: e.type === 'live-class' ? e.course : null,
      recordingsCourse: e.recordingsCourse || null,
      price: Number(e.price) || 0,
      mrp:   Number(e.mrp) || 0,
      seatLimit: Number(e.seatLimit) || 0,
      registrationClosesAt: e.registrationClosesAt
        ? new Date(e.registrationClosesAt).toISOString() : null,
      sessions: e.sessions.map(s => ({
        ...s,
        startsAt: new Date(s.startsAt).toISOString(),
        durationMins: Number(s.durationMins) || 60,
      })),
    };

    setSaving(true);
    try {
      const { data } = e._id ? await axios.put(`${API}/events/${e._id}`, payload)
        : await axios.post(`${API}/events`, payload);
      setToast(`${e._id ? 'Event updated' : 'Event created'}${data?.meetNote ? `. ${data.meetNote}` : ''}`);
      setEditing(null);
      load();
      onChange?.();
    } catch (err) {
      setToast(err.response?.data?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (ev) => {
    if (!window.confirm(`Delete "${ev.title}" and all its registrations? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/events/${ev._id}`);
      setToast('Event deleted');
      load(); onChange?.();
    } catch (err) {
      setToast(err.response?.data?.message || 'Could not delete');
    }
  };

  // ── registrations ──
  const openRegs = async (ev, keepView = false) => {
    setViewingRegs(ev);
    if (!keepView) { setRegQuery(''); setRegFilter('all'); }
    setRegSel(new Set());
    try {
      const { data } = await axios.get(`${API}/events/${ev._id}/registrations`);
      setRegs(data);
    } catch (e) { setToast('Could not load registrations'); }
  };

  const approve = async (id) => {
    try {
      await axios.put(`${API}/events/registrations/${id}/approve`);
      setToast('Approved — WhatsApp link unlocked');
      openRegs(viewingRegs, true); load(); onChange?.();
    } catch (err) { setToast(err.response?.data?.message || 'Could not approve'); }
  };

  const reject = async (id) => {
    const reason = window.prompt('Reason for rejection?', 'Payment could not be verified');
    if (reason === null) return;
    try {
      await axios.put(`${API}/events/registrations/${id}/reject`, { reason });
      setToast('Rejected');
      openRegs(viewingRegs, true); load(); onChange?.();
    } catch (err) { setToast(err.response?.data?.message || 'Could not reject'); }
  };

  const approveSelected = async () => {
    setBulkBusy(true);
    let ok = 0, fail = 0;
    for (const id of regSel) {
      try { await axios.put(`${API}/events/registrations/${id}/approve`); ok++; } catch { fail++; }
    }
    setBulkBusy(false);
    setToast(fail ? `Approved ${ok}, ${fail} failed` : `Approved ${ok}`);
    openRegs(viewingRegs, true); load(); onChange?.();
  };

  const toggleAttended = async (id) => {
    try {
      await axios.put(`${API}/events/registrations/${id}/attended`);
      openRegs(viewingRegs);
    } catch (e) { setToast('Could not update'); }
  };

  const publishRecording = async (ev, session) => {
    if (!session.recordingUrl) {
      return setToast('Add a recording URL to this session first, then save.');
    }
    if (!window.confirm(`Publish "${session.title}" as an episode in the course?`)) return;
    try {
      await axios.post(`${API}/events/${ev._id}/sessions/${session._id}/publish`);
      setToast('Published as an episode');
      load();
    } catch (err) {
      setToast(err.response?.data?.message || 'Could not publish');
    }
  };

  const exportCsv = () => {
    const rows = [
      ['Name', 'Email', 'Phone', 'College', 'Status', 'Amount', 'UTR', 'Expectation', 'Attended'],
      ...regs.map(r => [
        r.user?.name, r.user?.email, r.phone, r.college,
        r.status, r.amount, r.utr, r.expectation, r.attended ? 'Yes' : 'No',
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${viewingRegs.slug}-registrations.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmt = (d) => new Date(d).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });

  if (loading) return <div className="spinner-page">Loading…</div>;

  // ───────────────────────────────────────────────
  // REGISTRATIONS VIEW
  // ───────────────────────────────────────────────
  if (viewingRegs) {
    const q = regQuery.trim().toLowerCase();
    const utrSeen = {};
    regs.forEach(r => { if (r.utr) utrSeen[r.utr] = (utrSeen[r.utr] || 0) + 1; });
    const filteredRegs = regs.filter(r =>
      (regFilter === 'all' || r.status === regFilter) &&
      (!q || [r.user?.name, r.user?.email, r.phone, r.college, r.utr].filter(Boolean).join(' ').toLowerCase().includes(q)));
    return (
      <div>
        <button className="btn btn-ghost btn-sm" onClick={() => { setViewingRegs(null); setRegs([]); }}>
          ← Back to events
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '14px 0 18px', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 18, flex: 1 }}>{viewingRegs.title} — registrations</h2>
          {regs.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={exportCsv}>Export CSV</button>
          )}
        </div>

        {regs.length > 0 && (() => {
          const counts = { all: regs.length, pending: 0, active: 0, rejected: 0, refunded: 0, cancelled: 0 };
          regs.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
          const utrCount = {};
          regs.forEach(r => { if (r.utr) utrCount[r.utr] = (utrCount[r.utr] || 0) + 1; });
          const shownPending = filteredRegs.filter(r => r.status === 'pending' && !(r.utr && utrCount[r.utr] > 1));
          const allSel = shownPending.length > 0 && shownPending.every(r => regSel.has(r._id));
          return (
            <div className="regs-bar">
              <input className="input regs-search" placeholder="Search name, email, phone, college, UTR or Razorpay pay_ id"
                value={regQuery} onChange={e => setRegQuery(e.target.value)} />
              <div className="regs-chips">
                {[['all', 'All'], ['pending', 'Pending'], ['active', 'Confirmed'], ['rejected', 'Rejected'], ['refunded', 'Refunded'], ['cancelled', 'Cancelled']]
                  .filter(([k]) => !['refunded', 'cancelled'].includes(k) || counts[k] > 0).map(([k, l]) => (
                  <button key={k} type="button" className={`btn btn-sm ${regFilter === k ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => { setRegFilter(k); setRegSel(new Set()); }}>{l} {counts[k] || 0}</button>
                ))}
              </div>
              {shownPending.length > 0 && (
                <div className="regs-bulk">
                  <label className="checkbox-row small">
                    <input type="checkbox" checked={allSel}
                      onChange={() => setRegSel(allSel ? new Set() : new Set(shownPending.map(r => r._id)))} />
                    Select all pending shown
                  </label>
                  <button className="btn btn-primary btn-sm" disabled={!regSel.size || bulkBusy} onClick={approveSelected}>
                    {bulkBusy ? 'Approving…' : `Approve selected${regSel.size ? ` (${regSel.size})` : ''}`}
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {regs.length === 0 ? (
          <div className="empty-state">No registrations yet.</div>
        ) : filteredRegs.length === 0 ? (
          <div className="empty-state">No registrations match.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredRegs.map(r => (
              <div key={r._id} className="card" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  {r.status === 'pending' && (
                    <input type="checkbox" style={{ marginTop: 4 }} aria-label={`Select ${r.user?.name}`}
                      checked={regSel.has(r._id)}
                      onChange={() => setRegSel(s => { const n = new Set(s); n.has(r._id) ? n.delete(r._id) : n.add(r._id); return n; })} />
                  )}
                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{r.user?.name}</div>
                    <div className="small muted">{r.user?.email}</div>
                    <div className="small muted" style={{ marginTop: 4 }}>
                      {r.phone && <span>📱 {r.phone} </span>}
                      {r.college && <span>· {r.college}</span>}
                    </div>
                    {r.expectation && (
                      <p className="small" style={{ marginTop: 8, fontStyle: 'italic', color: 'var(--text-2)' }}>
                        "{r.expectation}"
                      </p>
                    )}
                    {r.utr && (
                      <div className="small muted" style={{ marginTop: 6 }}>
                        UTR: <code>{r.utr}</code> · ₹{r.amount}
                        {utrSeen[r.utr] > 1 && <span className="badge badge-danger" style={{ marginLeft: 8 }}>UTR used twice</span>}
                        {r.screenshotUrl && (
                          <a href={r.screenshotUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}>
                            View screenshot
                          </a>
                        )}
                      </div>
                    )}
                    {r.rejectReason && (
                      <div className="small" style={{ color: 'var(--danger)', marginTop: 6 }}>
                        {r.rejectReason}
                      </div>
                    )}
                    {r.history?.length > 0 && (
                      <ul className="seat-history small muted">
                        {r.history.map((h, i) => (
                          <li key={i}>
                            {h.action === 'transferred' ? <>Moved from <strong>{h.from}</strong> to <strong>{h.to}</strong></> : <>Cancelled</>}
                            {' · '}{fmt(h.at)}{h.by?.name ? ` by ${h.by.name}` : ''}{h.note ? ` · “${h.note}”` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    <span className={`badge badge-${
                      r.status === 'active' ? 'success' : r.status === 'pending' ? 'warning' : ['refunded', 'cancelled'].includes(r.status) ? 'muted' : 'danger'
                    }`}>{r.status}</span>

                    {r.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => approve(r._id)}>Approve</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => reject(r._id)}>Reject</button>
                      </div>
                    )}
                    {r.status === 'active' && (
                      <label className="small muted" style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                        <input type="checkbox" checked={r.attended} onChange={() => toggleAttended(r._id)} />
                        Attended
                      </label>
                    )}
                    {['active', 'pending'].includes(r.status) && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setSeatAction({ id: r._id, kind: 'move' })}>Move to email</button>
                        {r.status === 'active' && (
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
                            onClick={() => setSeatAction({ id: r._id, kind: 'cancel' })}>Cancel seat</button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {seatAction?.id === r._id && (
                  <SeatAction key={seatAction.kind} reg={r} kind={seatAction.kind} setToast={setToast}
                    onClose={() => setSeatAction(null)}
                    onDone={() => { setSeatAction(null); openRegs(viewingRegs, true); load(); onChange?.(); }} />
                )}
              </div>
            ))}
          </div>
        )}
        <Toast message={toast} onDone={() => setToast('')} />
      </div>
    );
  }

  // ───────────────────────────────────────────────
  // EDIT / CREATE FORM
  // ───────────────────────────────────────────────
  if (editing) {
    const e = editing;
    return (
      <div>
        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>← Cancel</button>
        <h2 style={{ fontSize: 18, margin: '14px 0 18px' }}>
          {e._id ? 'Edit event' : 'New live class / workshop'}
        </h2>

        {/* ── Import from JSON (fill the form for review) ── */}
        <div className="card" style={{ marginBottom: 18, background: 'var(--surface-2)' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowImport(v => !v)}>
              {showImport ? '▾ Import from JSON' : '▸ Import from JSON'}
            </button>
            <span className="small muted">Fill every field (incl. all sessions) from one file.</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={copyFormat}>Copy format</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={downloadFormat}>Download format</button>
            </div>
          </div>

          {showImport && (
            <div style={{ marginTop: 14 }}>
              <label className="btn btn-ghost btn-sm" style={{ display: 'inline-block', cursor: 'pointer', marginBottom: 12 }}>
                Upload .json file
                <input type="file" accept="application/json,.json" style={{ display: 'none' }}
                  onChange={ev => { onUploadJson(ev.target.files?.[0]); ev.target.value = ''; }} />
              </label>
              <p className="small muted" style={{ margin: '0 0 6px' }}>…or paste JSON here:</p>
              <textarea
                className="input" rows={7} value={pasteText}
                onChange={ev => setPasteText(ev.target.value)}
                placeholder='{ "type": "workshop", "title": "...", "sessions": [ ... ] }'
                style={{ fontFamily: 'monospace', fontSize: 12.5, marginBottom: 10 }} />
              <div>
                <button type="button" className="btn btn-primary btn-sm"
                  onClick={() => applyJson(pasteText)} disabled={!pasteText.trim()}>
                  Load into form
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div>
            <label className="small muted" style={{ display: 'block', marginBottom: 5 }}>Type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { id: 'live-class', label: 'Live class (inside a course)' },
                { id: 'workshop',   label: 'Workshop (standalone topic)' },
              ].map(t => (
                <button key={t.id} onClick={() => set('type', t.id)}
                  className={`badge ${e.type === t.id ? 'badge-accent' : 'badge-muted'}`}
                  style={{ cursor: 'pointer', border: 'none', padding: '7px 14px' }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {e.type === 'live-class' && (
            <div>
              <label className="small muted" style={{ display: 'block', marginBottom: 5 }}>Course *</label>
              <select className="input" value={e.course} style={{ width: '100%' }}
                onChange={ev => set('course', ev.target.value)}>
                <option value="">— Select a course —</option>
                {courses.map(c => <option key={c._id} value={c._id}>{c.title}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="small muted" style={{ display: 'block', marginBottom: 5 }}>
              Recordings course (optional)
            </label>
            <select className="input" value={e.recordingsCourse || ''} style={{ width: '100%' }}
              onChange={ev => set('recordingsCourse', ev.target.value)}>
              <option value="">— None: recordings stay on the event page only —</option>
              {courses.map(c => (
                <option key={c._id} value={c._id}>
                  {c.title}{c.isPaid ? ` (₹${c.price})` : ' (free)'}{c.isPublished ? '' : ' · draft'}
                </option>
              ))}
            </select>
            <p className="small muted" style={{ marginTop: 4 }}>
              Each class recording becomes a lesson in this course, played inside the platform with notes.
              Confirmed registrants get it free; anyone else can buy the course.
            </p>
          </div>

          <div>
            <label className="small muted" style={{ display: 'block', marginBottom: 5 }}>Title *</label>
            <input className="input" style={{ width: '100%' }} value={e.title}
              placeholder={e.type === 'workshop' ? 'e.g. Git & GitHub in One Day' : 'e.g. Doubt Session — Loops & Functions'}
              onChange={ev => {
                set('title', ev.target.value);
                if (!e._id) set('slug', autoSlug(ev.target.value));
              }} />
          </div>

          <div>
            <label className="small muted" style={{ display: 'block', marginBottom: 5 }}>Slug *</label>
            <input className="input" style={{ width: '100%' }} value={e.slug}
              onChange={ev => set('slug', ev.target.value)} />
            <p className="small muted" style={{ marginTop: 4 }}>URL: /events/{e.slug || '…'}</p>
          </div>

          <div>
            <label className="small muted" style={{ display: 'block', marginBottom: 5 }}>Description</label>
            <textarea className="input" rows={4} style={{ width: '100%', resize: 'vertical' }}
              value={e.description} onChange={ev => set('description', ev.target.value)} />
          </div>

          <div>
            <label className="small muted" style={{ display: 'block', marginBottom: 5 }}>Thumbnail image</label>
            {e.thumbnail && (
              <img src={e.thumbnail} alt="" style={{ width: '100%', maxWidth: 320, borderRadius: 8, marginBottom: 8, aspectRatio: '16/9', objectFit: 'cover', display: 'block' }} />
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
                {uploadingImg ? 'Uploading…' : (e.thumbnail ? 'Replace image' : 'Upload image')}
                <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingImg}
                  onChange={ev => uploadThumb(ev.target.files[0])} />
              </label>
              {e.thumbnail && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('thumbnail', '')}>Remove</button>
              )}
            </div>
            <input className="input" style={{ marginTop: 8 }} placeholder="…or paste an image URL"
              value={e.thumbnail} onChange={ev => set('thumbnail', ev.target.value)} />
          </div>

          {/* ── Sessions ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <label className="small muted" style={{ flex: 1 }}>
                Sessions — one for a single class, several for a multi-day workshop
              </label>
              <button className="btn btn-ghost btn-sm" onClick={addSession}>+ Add day</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {e.sessions.map((s, i) => (
                <div key={i} style={{
                  background: 'var(--surface-2)', borderRadius: 10, padding: 14,
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong className="small" style={{ flex: 1 }}>Session {i + 1}</strong>
                    {e.sessions.length > 1 && (
                      <button className="btn btn-ghost btn-sm" onClick={() => removeSession(i)}>Remove</button>
                    )}
                  </div>

                  <input className="input" placeholder="Session title — e.g. Day 1: Loops"
                    value={s.title} onChange={ev => setSession(i, 'title', ev.target.value)} />

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 200px' }}>
                      <label className="small muted" style={{ display: 'block', marginBottom: 4 }}>Starts at</label>
                      <input className="input" type="datetime-local" style={{ width: '100%' }}
                        value={s.startsAt} onChange={ev => setSession(i, 'startsAt', ev.target.value)} />
                    </div>
                    <div style={{ flex: '0 1 120px' }}>
                      <label className="small muted" style={{ display: 'block', marginBottom: 4 }}>Minutes</label>
                      <input className="input" type="number" style={{ width: '100%' }}
                        value={s.durationMins} onChange={ev => setSession(i, 'durationMins', ev.target.value)} />
                    </div>
                  </div>

                  <input className="input" placeholder="Join link (Zoom / Meet) — shown only to confirmed students"
                    value={s.joinUrl} onChange={ev => setSession(i, 'joinUrl', ev.target.value)} />

                  <input className="input" placeholder="Recording URL (add after the session ends)"
                    value={s.recordingUrl || ''} onChange={ev => setSession(i, 'recordingUrl', ev.target.value)} />

                  {e._id && e.type === 'live-class' && s._id && (
                    s.publishedEpisode ? (
                      <span className="badge badge-success" style={{ alignSelf: 'flex-start' }}>
                        ✓ Published as an episode
                      </span>
                    ) : (
                      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}
                        onClick={() => publishRecording(e, s)}>
                        Publish recording as episode →
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── Pricing ── */}
          <div>
            <label className="small muted" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <input type="checkbox" checked={e.isPaid} onChange={ev => set('isPaid', ev.target.checked)} />
              Paid event (a small fee keeps unserious people out)
            </label>
            {e.isPaid && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 140px' }}>
                  <label className="small muted" style={{ display: 'block', marginBottom: 4 }}>Price ₹</label>
                  <input className="input" type="number" style={{ width: '100%' }}
                    value={e.price} onChange={ev => set('price', ev.target.value)} />
                </div>
                <div style={{ flex: '1 1 140px' }}>
                  <label className="small muted" style={{ display: 'block', marginBottom: 4 }}>MRP ₹ (optional)</label>
                  <input className="input" type="number" style={{ width: '100%' }}
                    value={e.mrp} onChange={ev => set('mrp', ev.target.value)} />
                </div>
              </div>
            )}
          </div>

          {/* ── WhatsApp reply ── */}
          <div>
            <label className="small muted" style={{ display: 'block', marginBottom: 5 }}>
              WhatsApp group link
            </label>
            <input className="input" style={{ width: '100%' }} placeholder="https://chat.whatsapp.com/…"
              value={e.whatsappLink} onChange={ev => set('whatsappLink', ev.target.value)} />
            <p className="small muted" style={{ marginTop: 4 }}>
              {e.isPaid
                ? 'Revealed only after you approve the payment.'
                : 'Shown immediately when a student registers.'}
            </p>
          </div>

          <div>
            <label className="small muted" style={{ display: 'block', marginBottom: 5 }}>
              Confirmation message
            </label>
            <textarea className="input" rows={2} style={{ width: '100%', resize: 'vertical' }}
              value={e.confirmationMsg} onChange={ev => set('confirmationMsg', ev.target.value)} />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 140px' }}>
              <label className="small muted" style={{ display: 'block', marginBottom: 4 }}>
                Seat limit (0 = unlimited)
              </label>
              <input className="input" type="number" style={{ width: '100%' }}
                value={e.seatLimit} onChange={ev => set('seatLimit', ev.target.value)} />
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <label className="small muted" style={{ display: 'block', marginBottom: 4 }}>
                Registration closes (blank = at start time)
              </label>
              <input className="input" type="datetime-local" style={{ width: '100%' }}
                value={e.registrationClosesAt}
                onChange={ev => set('registrationClosesAt', ev.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <label className="small muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={e.isPublished}
                onChange={ev => set('isPublished', ev.target.checked)} />
              Published (visible to students)
            </label>
            <label className="small muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={e.isCompleted}
                onChange={ev => set('isCompleted', ev.target.checked)} />
              Completed (moves to "Past")
            </label>
            <label className="small muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={e.hideWhenClosed !== false}
                onChange={ev => set('hideWhenClosed', ev.target.checked)} />
              After registration closes, show only to registered students
            </label>
          </div>

          <button className="btn btn-primary btn-block" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : e._id ? 'Save changes' : 'Create event'}
          </button>
        </div>
        <Toast message={toast} onDone={() => setToast('')} />
      </div>
    );
  }

  // ───────────────────────────────────────────────
  // LIST VIEW
  // ───────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <p className="small muted" style={{ flex: 1 }}>
          Live problem-solving classes and workshops.
        </p>
        <button className="btn btn-primary btn-sm" onClick={startNew}>+ New event</button>
      </div>

      {events.length === 0 ? (
        <div className="empty-state">No events yet. Create your first live class.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {events.map(ev => (
            <div key={ev._id} className="card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span className="badge badge-muted">
                      {ev.type === 'workshop' ? 'Workshop' : 'Live class'}
                    </span>
                    {ev.sessions?.length > 1 && (
                      <span className="badge badge-muted">{ev.sessions.length} days</span>
                    )}
                    {ev.isPaid
                      ? <span className="badge badge-warning">₹{ev.price}</span>
                      : <span className="badge badge-accent">Free</span>}
                    {ev.isPublished
                      ? <span className="badge badge-success">Published</span>
                      : <span className="badge badge-muted">Draft</span>}
                    {ev.isCompleted && <span className="badge badge-muted">Done</span>}
                    {!ev.whatsappLink && (
                      <span className="badge badge-danger">No WhatsApp link</span>
                    )}
                  </div>

                  <div style={{ fontWeight: 600, fontSize: 15 }}>{ev.title}</div>
                  <div className="small muted" style={{ marginTop: 3 }}>
                    {ev.course?.title && <span>{ev.course.title} · </span>}
                    {ev.startsAt && fmt(ev.startsAt)}
                  </div>
                  <div className="small muted" style={{ marginTop: 5 }}>
                    {ev.counts.active} confirmed
                    {ev.counts.pending > 0 && (
                      <span style={{ color: 'var(--warning)' }}> · {ev.counts.pending} awaiting approval</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {ev.isPublished && (
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => {
                        const link = `${window.location.origin}/live/${ev.slug}`;
                        navigator.clipboard?.writeText(link)
                          .then(() => setToast('Share link copied ✓'))
                          .catch(() => setToast(link));
                      }}>
                      Copy share link
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => openRegs(ev)}>
                    Registrations
                    {ev.counts.pending > 0 && <span className="tab-count">{ev.counts.pending}</span>}
                  </button>
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => setRecordingsFor(recordingsFor === ev._id ? null : ev._id)}>
                    🎥 Recordings
                  </button>
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => setFeedbackFor(feedbackFor === ev._id ? null : ev._id)}>
                    ⭐ Feedback
                  </button>
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => setMeetFor(meetFor === ev._id ? null : ev._id)}>
                    🔗 Meet links{ev.meetAuto?.enabled && <span className="badge badge-success" style={{ marginLeft: 6 }}>per class</span>}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(ev)}>Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => remove(ev)}
                    style={{ color: 'var(--danger)' }}>Delete</button>
                </div>
              </div>
              {recordingsFor === ev._id && (
                <RecordingsPanel key={ev._id + (ev.updatedAt || '')} ev={ev} courses={courses} onSaved={load} setToast={setToast} />
              )}
              {feedbackFor === ev._id && <FeedbackPanel ev={ev} setToast={setToast} />}
              {meetFor === ev._id && <MeetPanel ev={ev} setToast={setToast} onChanged={load} />}
            </div>
          ))}
        </div>
      )}
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
