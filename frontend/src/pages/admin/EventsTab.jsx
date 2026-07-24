import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import Toast from '../../components/Toast';

const API = import.meta.env.VITE_API_URL;

const blankSession = () => ({
  title: '', startsAt: '', durationMins: 60, joinUrl: '', recordingUrl: '',
});

const blankEvent = () => ({
  type: 'live-class',
  title: '', slug: '', description: '', thumbnail: '',
  course: '',
  sessions: [blankSession()],
  isPaid: false, price: 0, mrp: 0,
  whatsappLink: '',
  confirmationMsg: 'You are registered! Join the WhatsApp group below for the joining link and reminders.',
  seatLimit: 0,
  registrationClosesAt: '',
  isPublished: false,
  isCompleted: false,
});

// <input type="datetime-local"> needs 'YYYY-MM-DDTHH:mm' in LOCAL time.
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function EventsTab({ onChange }) {
  const [events, setEvents]   = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState('');

  const [editing, setEditing] = useState(null);   // event object being edited, or null
  const [saving, setSaving]   = useState(false);

  const [viewingRegs, setViewingRegs] = useState(null);  // event whose attendees we're showing
  const [regs, setRegs] = useState([]);

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
    registrationClosesAt: toLocalInput(ev.registrationClosesAt),
    sessions: ev.sessions.map(s => ({ ...s, startsAt: toLocalInput(s.startsAt) })),
  });

  const set = (k, v) => setEditing(e => ({ ...e, [k]: v }));

  const setSession = (i, k, v) => setEditing(e => {
    const sessions = [...e.sessions];
    sessions[i] = { ...sessions[i], [k]: v };
    return { ...e, sessions };
  });

  const addSession = () => setEditing(e => ({ ...e, sessions: [...e.sessions, blankSession()] }));
  const removeSession = (i) => setEditing(e => ({
    ...e, sessions: e.sessions.filter((_, idx) => idx !== i),
  }));

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
      if (e._id) await axios.put(`${API}/events/${e._id}`, payload);
      else       await axios.post(`${API}/events`, payload);
      setToast(e._id ? 'Event updated' : 'Event created');
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
  const openRegs = async (ev) => {
    setViewingRegs(ev);
    try {
      const { data } = await axios.get(`${API}/events/${ev._id}/registrations`);
      setRegs(data);
    } catch (e) { setToast('Could not load registrations'); }
  };

  const approve = async (id) => {
    try {
      await axios.put(`${API}/events/registrations/${id}/approve`);
      setToast('Approved — WhatsApp link unlocked');
      openRegs(viewingRegs); load(); onChange?.();
    } catch (err) { setToast(err.response?.data?.message || 'Could not approve'); }
  };

  const reject = async (id) => {
    const reason = window.prompt('Reason for rejection?', 'Payment could not be verified');
    if (reason === null) return;
    try {
      await axios.put(`${API}/events/registrations/${id}/reject`, { reason });
      setToast('Rejected');
      openRegs(viewingRegs); load(); onChange?.();
    } catch (err) { setToast(err.response?.data?.message || 'Could not reject'); }
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

        {regs.length === 0 ? (
          <div className="empty-state">No registrations yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {regs.map(r => (
              <div key={r._id} className="card" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
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
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    <span className={`badge badge-${
                      r.status === 'active' ? 'success' : r.status === 'pending' ? 'warning' : 'danger'
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
                  </div>
                </div>
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
                      ? <span className="badge badge-success">Live</span>
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
                  <button className="btn btn-ghost btn-sm" onClick={() => openRegs(ev)}>
                    Registrations
                    {ev.counts.pending > 0 && <span className="tab-count">{ev.counts.pending}</span>}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(ev)}>Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => remove(ev)}
                    style={{ color: 'var(--danger)' }}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
