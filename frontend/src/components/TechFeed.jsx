import { useEffect, useState } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL;

export const ago = (d) => {
  const mins = Math.max(1, Math.round((Date.now() - new Date(d)) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
};
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const closesIn = (d) => {
  const days = Math.ceil((new Date(d) - Date.now()) / 864e5);
  if (days <= 0) return 'Closes today';
  if (days === 1) return 'Closes tomorrow';
  return days <= 14 ? `Closes in ${days} days` : `Closes ${fmtDate(d)}`;
};

let tracksCache = null;
export function useTracks() {
  const [tracks, setTracks] = useState(tracksCache || []);
  useEffect(() => {
    if (tracksCache) return;
    axios.get(`${API}/tech/tracks`).then(({ data }) => { tracksCache = data; setTracks(data); }).catch(() => {});
  }, []);
  return tracks;
}

// ── Pick career goals (chips) or type your own ──
export function GoalPicker({ initial, onSaved, onCancel, compact = false }) {
  const tracks = useTracks();
  const [picked, setPicked] = useState(initial?.tracks || []);
  const [custom, setCustom] = useState(initial?.custom || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toggle = (id) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : p.length >= 5 ? p : [...p, id]);

  const save = async () => {
    setErr('');
    if (!picked.length && !custom.trim()) return setErr('Pick at least one, or type your own');
    setBusy(true);
    try {
      const { data } = await axios.put(`${API}/tech/goal`, { tracks: picked, custom });
      onSaved?.(data);
    } catch (e) { setErr(e.response?.data?.message || 'Could not save'); }
    finally { setBusy(false); }
  };

  return (
    <div className={`tf-goal ${compact ? 'tf-goal-compact' : ''}`}>
      <div className="tf-goal-q">What are you preparing for?</div>
      <p className="tf-goal-sub">Pick up to 5. Your tech news, tips and hackathons follow these. Change them any time.</p>
      <div className="tf-chips" role="group" aria-label="Career goals">
        {tracks.map(t => (
          <button key={t.id} type="button" className={`tf-chip ${picked.includes(t.id) ? 'on' : ''}`}
            aria-pressed={picked.includes(t.id)} onClick={() => toggle(t.id)}>{t.label}</button>
        ))}
      </div>
      <input className="input tf-custom" maxLength={80} value={custom} onChange={e => setCustom(e.target.value)}
        placeholder="Something else? Type it, e.g. Salesforce developer, SAP, Robotics" />
      {err && <div className="small" style={{ color: 'var(--danger)', marginTop: 6 }}>{err}</div>}
      <div className="tf-goal-actions">
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Show my news'}</button>
        {onCancel && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}

// ── One news item ──
export function NewsCard({ it, showInsight = true }) {
  return (
    <article className={`tf-news ${it.pinned ? 'is-pinned' : ''}`}>
      <div className="tf-meta">
        {it.pinned && <span className="tf-pin">Pinned</span>}
        <span>{it.source}</span><span aria-hidden="true">·</span><span>{ago(it.publishedAt)}</span>
      </div>
      <a className="tf-title" href={it.url} target="_blank" rel="noreferrer">{it.title}</a>
      {it.summary && <p className="tf-summary">{it.summary}</p>}
      {showInsight && it.insight?.locked && (
        <button type="button" className="tf-locked" onClick={() => window.dispatchEvent(new CustomEvent('tech-unlock'))}>
          <span aria-hidden="true">🔒</span> What this means for {it.insight.label}, and what to do
        </button>
      )}
      {showInsight && it.insight && !it.insight.locked && (it.insight.why || it.insight.todo) && (
        <div className="tf-insight">
          <span className="tf-insight-for">For {it.insight.label}</span>
          {it.insight.why && <p><strong>Why it matters:</strong> {it.insight.why}</p>}
          {it.insight.todo && <p><strong>Try this:</strong> {it.insight.todo}</p>}
        </div>
      )}
    </article>
  );
}

// ── One hackathon / event ──
export function EventCard({ it, compact = false }) {
  const closes = it.deadline || it.endsAt;
  const soon = closes && new Date(closes) - Date.now() < 4 * 864e5;
  return (
    <article className={`tf-event ${compact ? 'tf-event-compact' : ''}`}>
      <div className="tf-event-top">
        {closes && <span className={`tf-deadline ${soon ? 'soon' : ''}`}>{closesIn(closes)}</span>}
        {it.mode && <span className="tf-tag">{it.mode === 'in-person' ? (it.location || 'In person') : it.mode === 'online' ? 'Online' : `Hybrid${it.location ? ` · ${it.location}` : ''}`}</span>}
      </div>
      <a className="tf-title" href={it.url} target="_blank" rel="noreferrer">{it.title}</a>
      <div className="tf-meta">
        {it.near && <span className="tf-near">Near you ·</span>}
        {it.organizer && <span>{it.organizer}</span>}
        {it.startsAt && <span>{it.organizer ? '· ' : ''}{fmtDate(it.startsAt)}{it.endsAt && fmtDate(it.endsAt) !== fmtDate(it.startsAt) ? ` – ${fmtDate(it.endsAt)}` : ''}</span>}
        {it.prize && <span className="tf-prize">· {it.prize}</span>}
      </div>
      {!compact && it.insight?.locked && (
        <button type="button" className="tf-locked" onClick={() => window.dispatchEvent(new CustomEvent('tech-unlock'))}>
          <span aria-hidden="true">🔒</span> Who should apply, for {it.insight.label}
        </button>
      )}
      {!compact && it.insight?.todo && <p className="tf-summary"><strong>Who should apply:</strong> {it.insight.todo}</p>}
      {!compact && !it.insight?.todo && it.summary && <p className="tf-summary">{it.summary}</p>}
    </article>
  );
}

export const fetchFeed = (params) => axios.get(`${API}/tech/feed`, { params }).then(r => r.data);
export const fetchAccess = () => axios.get(`${API}/tech/access`).then(r => r.data);
export const fetchSummary = () => axios.get(`${API}/tech/summary`).then(r => r.data);
export const saveLocation = (city, state) => axios.put(`${API}/tech/location`, { city, state }).then(r => r.data);

export const STATES = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'];

// Bottom sheet on phones, centred card on desktop
export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="tx-sheet-backdrop" onClick={onClose}>
      <div className="tx-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="tx-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="tx-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// City + state, typed or filled from the device's location (asked only on tap)
export function LocationForm({ initial, onSaved, onSkip, skipLabel = 'Skip' }) {
  const [city, setCity] = useState(initial?.city || '');
  const [state, setState] = useState(initial?.state || '');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const locate = () => {
    setErr('');
    if (!navigator.geolocation) return setErr('This browser can’t share location. Type your city instead.');
    setBusy('locate');
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=en&lat=${coords.latitude}&lon=${coords.longitude}`);
        const a = (await r.json()).address || {};
        setCity(a.city || a.town || a.village || a.county || a.state_district || '');
        const st = STATES.find(x => x.toLowerCase() === String(a.state || '').toLowerCase());
        setState(st || a.state || '');
      } catch { setErr('Couldn’t find your city. Type it instead.'); }
      finally { setBusy(''); }
    }, (e) => {
      setBusy('');
      setErr(e.code === 1 ? 'Location permission was blocked. Type your city instead.' : 'Couldn’t get your location. Type your city instead.');
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 3600e3 });
  };
  const save = async (c = city, s = state) => {
    setErr(''); setBusy('save');
    try { onSaved?.(await saveLocation(c, s)); }
    catch (e) { setErr(e.response?.data?.message || 'Could not save'); }
    finally { setBusy(''); }
  };

  return (
    <div className="tx-loc">
      <button type="button" className="tx-locate" onClick={locate} disabled={Boolean(busy)}>
        <span aria-hidden="true">📍</span> {busy === 'locate' ? 'Finding your city…' : 'Use my location'}
      </button>
      <div className="tx-or"><span>or type it</span></div>
      <input className="input" placeholder="City, e.g. Varanasi" value={city} maxLength={60} onChange={e => setCity(e.target.value)} />
      <select className="input" value={state} onChange={e => setState(e.target.value)}>
        <option value="">State</option>
        {STATES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <p className="tx-fine">Only your city and state are saved, to show hackathons and tech events near you. Never shown to anyone.</p>
      {err && <div className="small" style={{ color: 'var(--danger)' }}>{err}</div>}
      <div className="tf-goal-actions">
        <button className="btn btn-primary" disabled={Boolean(busy) || (!city.trim() && !state)} onClick={() => save()}>Save</button>
        {onSkip && <button className="btn btn-ghost" disabled={Boolean(busy)} onClick={onSkip}>{skipLabel}</button>}
        {(initial?.city || initial?.state) && <button className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => save('', '')}>Remove</button>}
      </div>
    </div>
  );
}
export const fetchGoal = () => axios.get(`${API}/tech/goal`).then(r => r.data);
