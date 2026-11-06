import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { RecLink } from './RecordingPlayer';

const API = import.meta.env.VITE_API_URL;

export const JOIN_EARLY_MS = 15 * 60000;   // Join button opens 15 min before class
export const endOf = (s) => new Date(s.startsAt).getTime() + (s.durationMins || 60) * 60000;
export const byStart = (a, b) => new Date(a.startsAt) - new Date(b.startsAt);
export const cleanTitle = (t = '') => t.replace(/^Day \d+\s*[—–-]\s*/i, '');
export const fmtTime = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
export const fmtDay = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtEvent = (d) => d ? `${fmtDay(d)}, ${fmtTime(d)}` : '';
export const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

// "in 2 days" / "in 3h 20m" / "in 42 min"
export function startsIn(target) {
  const diff = new Date(target) - Date.now();
  if (diff <= 0) return '';
  const mins = Math.ceil(diff / 60000);
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `in ${h}h ${mins % 60}m`;
  const d = Math.round(h / 24);
  return `in ${d} day${d > 1 ? 's' : ''}`;
}

export { RecLink } from './RecordingPlayer';

// Re-render every 30 s so the Join button appears on time without a reload.
function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

// ── Join button ──
// The server only hands out a class's Meet link from 15 minutes before it starts
// until it ends, so the button asks for it at click time. A tab is opened first
// (in the click itself) so the browser doesn't block it as a pop-up.
export function JoinButton({ eventId, session, className = 'btn ticket-join', label = 'Join class', waitClass = 'ticket-join-wait' }) {
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const start = new Date(session.startsAt).getTime();
  const open = now >= start - JOIN_EARLY_MS && now < endOf(session) + 15 * 60000;
  const hasLink = Boolean(session.joinUrl || session.hasJoinLink);

  if (!open) {
    return <span className={waitClass}>{hasLink ? `Join opens at ${fmtTime(start - JOIN_EARLY_MS)}` : 'Join link appears here before class'}</span>;
  }
  const join = async () => {
    setErr(''); setBusy(true);
    const tab = window.open('', '_blank');
    try {
      const { data } = await axios.get(`${API}/events/${eventId}/sessions/${session._id}/join`);
      if (tab) { tab.opener = null; tab.location.href = data.url; } else window.location.href = data.url;
    } catch (e) {
      if (tab) tab.close();
      setErr(e.response?.data?.message || 'Could not open the class. Try again.');
    } finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" className={className} onClick={join} disabled={busy}>{busy ? 'Opening…' : label}</button>
      {err && <span className="small" style={{ color: 'var(--danger)' }}>{err}</span>}
    </>
  );
}

// ── The class ticket: tonight's (or the next) class for a registered program ──
export default function ClassTicket({ t, compact = false }) {
  const { event, session, number, total, lastRec } = t;
  const now = Date.now();
  const start = new Date(session.startsAt).getTime();
  const live = now >= start && now < endOf(session);
  const today = sameDay(session.startsAt, now);
  const when = live ? 'Live now' : `Starts ${startsIn(session.startsAt)}`;

  return (
    <section className={`ticket ${live ? 'is-live' : ''} ${compact ? 'ticket-compact' : ''}`} aria-label="Your next class">
      <div className="ticket-main">
        <Link to={`/events/${event.slug}`} className="ticket-program">{event.title}</Link>
        <h2 className="ticket-title">{cleanTitle(session.title)}</h2>
        <div className="ticket-when">
          <span className="ticket-time">{fmtTime(session.startsAt)}</span>
          <span className="ticket-date">
            {today ? 'Today' : fmtDay(session.startsAt)}
            <span className={`ticket-in ${live ? 'live' : ''}`}>{live && <i className="ticket-dot" />}{when}</span>
          </span>
        </div>
        <div className="ticket-actions">
          <JoinButton eventId={event._id} session={session} />
          {event.whatsappLink && (
            <a className="btn btn-ghost btn-sm" href={event.whatsappLink} target="_blank" rel="noreferrer">WhatsApp group</a>
          )}
        </div>
      </div>
      <div className="ticket-stub">
        {event.thumbnail && <img className="ticket-thumb" src={event.thumbnail} alt="" loading="lazy" />}
        <div className="ticket-num">
          <span className="ticket-num-big">{number}</span>
          <span className="ticket-num-of">of {total}</span>
        </div>
        <span className="ticket-num-lbl">Class</span>
        {lastRec && (
          <RecLink s={lastRec} className="ticket-rec">
            <span className="ticket-rec-play" aria-hidden="true">▶</span>
            <span>Class {lastRec.number} recording is ready</span>
          </RecLink>
        )}
      </div>
    </section>
  );
}


