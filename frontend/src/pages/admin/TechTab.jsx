import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import Toast from '../../components/Toast';
import { useTracks, ago } from '../../components/TechFeed';

const API = import.meta.env.VITE_API_URL;
const fmt = (d) => d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : '—';
const EMPTY_EVENT = { title: '', url: '', summary: '', deadline: '', startsAt: '', mode: 'online', location: '', prize: '', organizer: '', tracks: [], pinned: false };

export default function TechTab() {
  const tracks = useTracks();
  const [status, setStatus] = useState(null);
  const [items, setItems] = useState([]);
  const [kind, setKind] = useState('event');
  const [q, setQ] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [ev, setEv] = useState(null);           // add-event form
  const [src, setSrc] = useState(null);         // add-source form

  const loadStatus = useCallback(() => axios.get(`${API}/tech/admin/status`).then(({ data }) => setStatus(data)).catch(() => {}), []);
  const loadItems = useCallback(() => axios.get(`${API}/tech/admin/items`, { params: { kind, q: q || undefined } })
    .then(({ data }) => setItems(data)).catch(() => {}), [kind, q]);
  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { const t = setTimeout(loadItems, 250); return () => clearTimeout(t); }, [loadItems]);

  const clearToast = useCallback(() => setToast(''), []);
  const err = (e) => setToast(e.response?.data?.message || 'Something went wrong');
  const refresh = async () => {
    setBusy(true);
    try { const { data } = await axios.post(`${API}/tech/admin/refresh`); setToast(data.message); loadStatus(); loadItems(); }
    catch (e) { err(e); } finally { setBusy(false); }
  };
  const patchItem = async (it, body) => {
    try { const { data } = await axios.put(`${API}/tech/admin/items/${it._id}`, body); setItems(list => list.map(x => x._id === it._id ? data : x)); }
    catch (e) { err(e); }
  };
  const deleteItem = async (it) => {
    if (!window.confirm(`Delete “${it.title}”?`)) return;
    try { await axios.delete(`${API}/tech/admin/items/${it._id}`); setItems(list => list.filter(x => x._id !== it._id)); }
    catch (e) { err(e); }
  };
  const saveEvent = async () => {
    setBusy(true);
    try {
      const body = { ...ev, kind: 'event' };
      ['deadline', 'startsAt'].forEach(k => { body[k] = ev[k] ? new Date(ev[k]).toISOString() : undefined; });
      await axios.post(`${API}/tech/admin/items`, body);
      setToast('Event added to the feed'); setEv(null); setKind('event'); loadItems(); loadStatus();
    } catch (e) { err(e); } finally { setBusy(false); }
  };
  const toggleSource = async (s) => {
    try { await axios.put(`${API}/tech/admin/sources/${s._id}`, { enabled: !s.enabled }); loadStatus(); }
    catch (e) { err(e); }
  };
  const addSource = async () => {
    setBusy(true);
    try { const { data } = await axios.post(`${API}/tech/admin/sources`, src); setToast(data.message || 'Feed added. It is used from the next refresh.'); setSrc(null); loadStatus(); }
    catch (e) { err(e); } finally { setBusy(false); }
  };
  const removeSource = async (s) => {
    if (!window.confirm(`Remove “${s.name}”?`)) return;
    try { await axios.delete(`${API}/tech/admin/sources/${s._id}`); loadStatus(); } catch (e) { err(e); }
  };
  const [paste, setPaste] = useState('');
  const fillFromPaste = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/tech/admin/items/extract`, { text: paste, url: ev.url });
      const dt = (d, t) => (d ? `${d}T${t}` : '');
      setEv({ ...ev, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v && (!Array.isArray(v) || v.length))),
        deadline: dt(data.deadline, '23:59') || ev.deadline, startsAt: dt(data.startsAt, '09:00') || ev.startsAt });
      setToast('Filled in from the text. Check it, then Add to feed.');
    } catch (e) { err(e); } finally { setBusy(false); }
  };
  const pickTrack = (list, id) => list.includes(id) ? list.filter(x => x !== id) : [...list, id];

  if (!status) return <p className="muted">Loading…</p>;
  const ai = status.ai;

  return (
    <div className="tech-admin">
      <Toast message={toast} onDone={clearToast} duration={4000} />

      <div className="card">
        <div className="tech-admin-head">
          <div>
            <h2 style={{ fontSize: 16 }}>Tech feed</h2>
            <p className="small muted" style={{ marginTop: 4 }}>
              Last refresh {status.lastRefreshAt ? ago(status.lastRefreshAt) : 'never'}{status.refreshing ? ' (refreshing now…)' : ''}.
              {' '}It refreshes by itself when a student opens it and it’s over {status.refreshEveryHours} hours old.
            </p>
          </div>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={refresh}>{busy ? 'Working…' : 'Refresh now'}</button>
        </div>
        <div className="meet-grid small">
          <div><span className="muted">News in feed</span><br /><strong>{status.counts.news}</strong></div>
          <div><span className="muted">Upcoming events</span><br /><strong>{status.counts.events}</strong></div>
          <div><span className="muted">Students with a goal</span><br /><strong>{status.counts.studentsWithGoal}</strong></div>
          <div><span className="muted">AI summaries today</span><br />
            <strong>{ai.enabled ? `${ai.today} / ${ai.dailyCap}` : 'Off'}</strong>
            {ai.enabled && ai.waiting > 0 && <span className="muted"> · {ai.waiting} waiting</span>}
          </div>
        </div>
        {!ai.enabled && <div className="meet-warn small">AI tips are off: add <code>ANTHROPIC_API_KEY</code> on Render. Until then news is matched to goals by keywords, without “why it matters / try this”.</div>}
        {ai.lastError && <div className="small meet-err">Last AI error: {ai.lastError}</div>}
        {status.goals.length > 0 && (
          <p className="small muted" style={{ marginTop: 12 }}>
            Students follow: {status.goals.map(g => `${g.label} (${g.students})`).join(', ')}
          </p>
        )}
      </div>

      <PassCard pass={status.pass} onSaved={loadStatus} setToast={setToast} err={err} />

      {/* ── Items ── */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="tech-admin-head">
          <div className="tabs" style={{ margin: 0 }}>
            <button className={`tab ${kind === 'event' ? 'active' : ''}`} onClick={() => setKind('event')}>Hackathons &amp; events</button>
            <button className={`tab ${kind === 'news' ? 'active' : ''}`} onClick={() => setKind('news')}>News</button>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setEv(ev ? null : { ...EMPTY_EVENT })}>{ev ? 'Close' : '+ Add event'}</button>
        </div>

        {ev && (
          <div className="seat-action">
            <div className="seat-action-title">Add a hackathon or event</div>
            <p className="small muted">For Unstop, Devfolio, college fests or anything you want students to see. It’s marked “Shared by Rajeev sir”.</p>
            <textarea className="input tech-paste" rows={3} value={paste} onChange={e => setPaste(e.target.value)}
              placeholder="Shortcut: paste an Instagram / LinkedIn / WhatsApp post or email about the event here, and AI fills the form below" />
            <button className="btn btn-ghost btn-sm" style={{ margin: '6px 0 10px' }} disabled={busy || paste.trim().length < 20} onClick={fillFromPaste}>{busy ? 'Reading…' : 'Fill from text'}</button>
            <div className="seat-fields">
              <input className="input" placeholder="Title" value={ev.title} onChange={e => setEv({ ...ev, title: e.target.value })} />
              <input className="input" placeholder="Link (https://…)" value={ev.url} onChange={e => setEv({ ...ev, url: e.target.value })} />
              <input className="input" placeholder="Organizer (optional)" value={ev.organizer} onChange={e => setEv({ ...ev, organizer: e.target.value })} />
              <input className="input" placeholder="Prize (optional)" value={ev.prize} onChange={e => setEv({ ...ev, prize: e.target.value })} />
            </div>
            <div className="seat-fields">
              <label className="small">Registration closes<input className="input" type="datetime-local" value={ev.deadline} onChange={e => setEv({ ...ev, deadline: e.target.value })} /></label>
              <label className="small">Starts (optional)<input className="input" type="datetime-local" value={ev.startsAt} onChange={e => setEv({ ...ev, startsAt: e.target.value })} /></label>
              <select className="input" value={ev.mode} onChange={e => setEv({ ...ev, mode: e.target.value })} style={{ flex: '0 1 160px' }}>
                <option value="online">Online</option><option value="in-person">In person</option><option value="hybrid">Hybrid</option>
              </select>
              {ev.mode !== 'online' && <input className="input" placeholder="Venue, City, State (e.g. IIT BHU, Varanasi, Uttar Pradesh)" value={ev.location} onChange={e => setEv({ ...ev, location: e.target.value })} />}
            </div>
            <textarea className="input" rows={2} style={{ width: '100%', marginTop: 8 }} placeholder="One line for students: who should apply, what to build (optional)"
              value={ev.summary} onChange={e => setEv({ ...ev, summary: e.target.value })} />
            <div className="small muted" style={{ margin: '10px 0 6px' }}>Suits (leave empty for everyone):</div>
            <div className="tf-chips">
              {tracks.map(t => <button key={t.id} type="button" className={`tf-chip ${ev.tracks.includes(t.id) ? 'on' : ''}`} onClick={() => setEv({ ...ev, tracks: pickTrack(ev.tracks, t.id) })}>{t.label}</button>)}
            </div>
            <label className="checkbox-row small" style={{ marginTop: 10 }}>
              <input type="checkbox" checked={ev.pinned} onChange={e => setEv({ ...ev, pinned: e.target.checked })} /> Pin to the top for everyone
            </label>
            <div style={{ marginTop: 10 }}><button className="btn btn-primary btn-sm" disabled={busy} onClick={saveEvent}>Add to feed</button></div>
          </div>
        )}

        <input className="input" style={{ width: '100%', margin: '14px 0 6px' }} placeholder="Search titles…" value={q} onChange={e => setQ(e.target.value)} />
        {items.length === 0 ? <p className="small muted">Nothing here yet. Press Refresh now.</p> : (
          <div className="tech-items">
            {items.map(it => (
              <div key={it._id} className={`tech-item ${it.hidden ? 'is-hidden' : ''}`}>
                <div className="tech-item-main">
                  <a href={it.url} target="_blank" rel="noreferrer" className="tf-title" style={{ fontSize: 14.5 }}>{it.title}</a>
                  <div className="tf-meta">
                    <span>{it.source}</span>
                    <span>· {it.kind === 'event' ? (it.deadline ? `closes ${fmt(it.deadline)}` : 'no deadline') : ago(it.publishedAt)}</span>
                    {it.tracks.length > 0 && <span>· {it.tracks.map(t => t === 'general' ? 'Everyone' : (tracks.find(x => x.id === t)?.label || t)).join(', ')}</span>}
                    {it.kind === 'news' && <span>· importance {it.importance}{!it.aiDone && ' · waiting for AI'}</span>}
                  </div>
                </div>
                <div className="tech-item-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => patchItem(it, { pinned: !it.pinned })}>{it.pinned ? 'Unpin' : 'Pin'}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => patchItem(it, { hidden: !it.hidden })}>{it.hidden ? 'Show' : 'Hide'}</button>
                  {it.manual && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => deleteItem(it)}>Delete</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Sources ── */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="tech-admin-head">
          <h2 style={{ fontSize: 16 }}>Sources</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => setSrc(src ? null : { type: 'page', name: '', url: '', location: '', tracks: [] })}>{src ? 'Close' : '+ Add source'}</button>
        </div>
        {src && (
          <div className="seat-action">
            <div className="tabs" style={{ margin: '0 0 10px' }}>
              <button className={`tab ${src.type === 'page' ? 'active' : ''}`} onClick={() => setSrc({ ...src, type: 'page' })}>College / company page</button>
              <button className={`tab ${src.type === 'rss' ? 'active' : ''}`} onClick={() => setSrc({ ...src, type: 'rss' })}>RSS news feed</button>
            </div>
            {src.type === 'page' && <p className="small muted" style={{ marginBottom: 8 }}>
              Link to the page where a college or company lists its events, fests, hackathons or drives. AI reads it once a day and adds the upcoming ones as events.
              Instagram / LinkedIn pages can’t be read (they need a login): use “+ Add event” and paste the post instead.
            </p>}
            <div className="seat-fields">
              <input className="input" placeholder={src.type === 'page' ? 'Name, e.g. IIT BHU events' : 'Name, e.g. Python Insider'} value={src.name} onChange={e => setSrc({ ...src, name: e.target.value })} />
              <input className="input" placeholder={src.type === 'page' ? 'Events page link (https://…)' : 'RSS feed link (https://…/feed)'} value={src.url} onChange={e => setSrc({ ...src, url: e.target.value })} />
              {src.type === 'page' && <input className="input" placeholder="College, City, State (e.g. IIT BHU, Varanasi, Uttar Pradesh)" value={src.location} onChange={e => setSrc({ ...src, location: e.target.value })} />}
            </div>
            <div className="small muted" style={{ margin: '10px 0 6px' }}>Only about (optional):</div>
            <div className="tf-chips">
              {tracks.map(t => <button key={t.id} type="button" className={`tf-chip ${src.tracks.includes(t.id) ? 'on' : ''}`} onClick={() => setSrc({ ...src, tracks: pickTrack(src.tracks, t.id) })}>{t.label}</button>)}
            </div>
            <div style={{ marginTop: 10 }}><button className="btn btn-primary btn-sm" disabled={busy} onClick={addSource}>{busy ? (src.type === 'page' ? 'Reading the page…' : 'Checking the feed…') : 'Add'}</button></div>
          </div>
        )}
        <div className="tech-items">
          {status.sources.map(s => (
            <div key={s._id} className={`tech-item ${s.enabled ? '' : 'is-hidden'}`}>
              <div className="tech-item-main">
                <strong style={{ fontSize: 14 }}>{s.name}</strong>{' '}<span className="badge badge-muted">{s.type === 'page' ? 'college page · daily' : s.kind === 'event' ? 'events' : 'news'}</span>{s.location && <span className="small muted"> · {s.location}</span>}
                <div className="tf-meta">
                  {s.lastRun?.at
                    ? <span style={{ color: s.lastRun.ok ? undefined : 'var(--danger)' }}>Last run {ago(s.lastRun.at)}: {s.lastRun.message}</span>
                    : <span>Not run yet</span>}
                </div>
              </div>
              <div className="tech-item-actions">
                <label className="switch-row small"><input type="checkbox" checked={s.enabled} onChange={() => toggleSource(s)} />{s.enabled ? 'On' : 'Off'}</label>
                {!s.builtIn && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => removeSource(s)}>Remove</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Tech Pass: price, length, who gets it free, gifts ──
function PassCard({ pass, onSaved, setToast, err }) {
  const [f, setF] = useState({ price: pass.price, days: pass.days, paidGraceDays: pass.paidGraceDays });
  const [gift, setGift] = useState({ email: '', days: pass.days, note: '' });
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async (body) => {
    setBusy(true);
    try { await axios.put(`${API}/tech/admin/pass`, body); setToast('Tech Pass updated'); onSaved(); }
    catch (e) { err(e); } finally { setBusy(false); }
  };
  const give = async () => {
    setBusy(true);
    try { const { data } = await axios.post(`${API}/tech/admin/passes`, gift); setToast(data.message); setGift({ ...gift, email: '', note: '' }); onSaved(); if (list) showList(); }
    catch (e) { err(e); } finally { setBusy(false); }
  };
  const showList = () => axios.get(`${API}/tech/admin/passes`).then(({ data }) => setList(data)).catch(err);

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="tech-admin-head">
        <div>
          <h2 style={{ fontSize: 16 }}>Tech Pass</h2>
          <p className="small muted" style={{ marginTop: 4 }}>
            Everyone sees the news and hackathons. The AI “Why it matters / Try this” tips need a pass, unless the student is in a paid program or course.
          </p>
        </div>
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={pass.enabled} disabled={busy} onChange={e => save({ enabled: e.target.checked })} />
          Charge for tips
        </label>
      </div>
      {!pass.enabled ? (
        <p className="small muted" style={{ marginTop: 10 }}>Off: tips are free for every student.</p>
      ) : (
        <>
          <div className="meet-grid small">
            <div><span className="muted">Active passes</span><br /><strong>{pass.active}</strong></div>
            <div><span className="muted">Sold</span><br /><strong>{pass.sold}</strong></div>
            <div><span className="muted">Revenue</span><br /><strong>₹{pass.revenue.toLocaleString('en-IN')}</strong></div>
          </div>
          <div className="seat-fields" style={{ marginTop: 12, alignItems: 'flex-end' }}>
            <label className="small">Price (₹)<input className="input" type="number" min={1} value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></label>
            <label className="small">Lasts (days)<input className="input" type="number" min={1} value={f.days} onChange={e => setF({ ...f, days: e.target.value })} /></label>
            {pass.freeForPaid && <label className="small">Program students keep it for (days after last class)<input className="input" type="number" min={0} value={f.paidGraceDays} onChange={e => setF({ ...f, paidGraceDays: e.target.value })} /></label>}
            <button className="btn btn-primary btn-sm" disabled={busy || (Number(f.price) === pass.price && Number(f.days) === pass.days && Number(f.paidGraceDays) === pass.paidGraceDays)} onClick={() => save(f)}>Save</button>
          </div>
          <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10 }}>
            <input type="checkbox" checked={pass.freeForPaid} disabled={busy} onChange={e => save({ freeForPaid: e.target.checked })} />
            Free for students while their paid program runs, or while their paid course access lasts
          </label>
          {pass.freeForPaid && <p className="small muted" style={{ marginTop: 6 }}>
            {Number(pass.paidGraceDays) ? `Program students lose the tips ${pass.paidGraceDays} days after their last class.` : 'Program students lose the tips as soon as their last class ends.'} Then they see the pass offer like everyone else.
          </p>}
          <p className="small muted" style={{ marginTop: 6 }}>One-time payment through Razorpay (UPI, card, netbanking). No auto-renew. Price changes apply to new purchases only.</p>
        </>
      )}

      <div className="seat-action" style={{ marginTop: 14 }}>
        <div className="seat-action-title">Give a pass free</div>
        <div className="seat-fields">
          <input className="input" placeholder="Student email" value={gift.email} onChange={e => setGift({ ...gift, email: e.target.value })} />
          <input className="input" type="number" min={1} style={{ flex: '0 1 110px' }} value={gift.days} onChange={e => setGift({ ...gift, days: e.target.value })} aria-label="Days" />
          <input className="input" placeholder="Note (optional)" value={gift.note} onChange={e => setGift({ ...gift, note: e.target.value })} />
          <button className="btn btn-ghost btn-sm" disabled={busy || !gift.email.trim()} onClick={give}>Give</button>
        </div>
        <button className="db-more" style={{ marginTop: 8 }} onClick={() => list ? setList(null) : showList()}>{list ? 'Hide passes' : 'See who has a pass'}</button>
        {list && (
          list.length === 0 ? <p className="small muted">No passes yet.</p> : (
            <div className="small" style={{ marginTop: 8 }}>
              {list.map(p => (
                <div key={p._id} className="tech-pass-row">
                  <span><strong>{p.user?.name || '—'}</strong> <span className="muted">{p.user?.email}</span></span>
                  <span className="muted">{p.source === 'gift' ? 'Gift' : `₹${p.amount}`} · till {new Date(p.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}{new Date(p.expiresAt) < Date.now() ? ' (ended)' : ''}</span>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
