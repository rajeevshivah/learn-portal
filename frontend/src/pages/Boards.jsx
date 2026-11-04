import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Toast from '../components/Toast';
import { openClassBoard } from '../lib/openBoard';

const API = import.meta.env.VITE_API_URL;
const fmt = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
const endOf = (s) => new Date(s.startsAt).getTime() + (s.durationMins || 60) * 60000;

// All whiteboards, plus one-tap boards for the next classes.
export default function Boards() {
  const navigate = useNavigate();
  const [boards, setBoards] = useState(null);
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');

  const load = () => axios.get(`${API}/boards`).then(({ data }) => setBoards(data)).catch(() => { setBoards([]); setToast('Could not load boards'); });
  useEffect(() => {
    load();
    axios.get(`${API}/events/admin/all`).then(({ data }) => setEvents(data)).catch(() => {});
  }, []);

  // Classes from yesterday to the next 3 days, for a quick "open board"
  const upcoming = useMemo(() => {
    const from = Date.now() - 864e5, to = Date.now() + 3 * 864e5;
    const out = [];
    events.filter(e => e.isPublished).forEach(ev => {
      const ss = [...(ev.sessions || [])].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
      ss.forEach((s, i) => { if (endOf(s) > from && new Date(s.startsAt) < to) out.push({ ev, s, n: i + 1 }); });
    });
    return out.sort((a, b) => new Date(a.s.startsAt) - new Date(b.s.startsAt)).slice(0, 6);
  }, [events]);
  const boardFor = (evId, sId) => boards?.find(b => String(b.event?._id) === String(evId) && String(b.session?._id) === String(sId));

  const openClass = async (ev, s) => {
    setBusy(s._id);
    try { await openClassBoard(navigate, ev._id, s._id); }
    catch (e) { setToast(e.response?.data?.message || 'Could not open the board'); setBusy(''); }
  };
  const blank = async () => {
    setBusy('new');
    try { const { data } = await axios.post(`${API}/boards`, {}); navigate(`/admin/board/${data._id}`); }
    catch (e) { setToast(e.response?.data?.message || 'Could not create a board'); setBusy(''); }
  };
  const remove = async (b) => {
    if (!window.confirm(`Delete "${b.title}" and its ${b.pages} page${b.pages === 1 ? '' : 's'}?${b.notes ? ' Its notes will be removed from the class too.' : ''}`)) return;
    try { await axios.delete(`${API}/boards/${b._id}`); load(); setToast('Board deleted'); }
    catch { setToast('Could not delete'); }
  };

  return (
    <div className="page container section bd-page">
      <div className="db-head">
        <h1 className="bd-title">Whiteboards</h1>
        <button className="btn btn-primary btn-sm" disabled={busy === 'new'} onClick={blank}>{busy === 'new' ? 'Opening…' : 'New blank board'}</button>
      </div>
      <p className="bd-sub">Write with your pen tablet, share the tab in Meet, then publish the pages as class notes in one click.</p>

      {upcoming.length > 0 && (
        <section className="bd-sec">
          <h2 className="db-h3">Classes around now</h2>
          <div className="db-rows">
            {upcoming.map(({ ev, s, n }) => {
              const b = boardFor(ev._id, s._id);
              return (
                <div key={s._id} className="db-row">
                  <div className="db-row-main">
                    <div className="db-row-title">Class {n}: {s.title.replace(/^Day \d+\s*[—–-]\s*/i, '')}</div>
                    <div className="db-meta">{ev.title}, {fmt(s.startsAt)}{b ? `, ${b.pages} page${b.pages === 1 ? '' : 's'}` : ''}</div>
                  </div>
                  <button className="btn btn-primary btn-sm" disabled={busy === s._id} onClick={() => openClass(ev, s)}>
                    {busy === s._id ? 'Opening…' : b ? 'Open board' : 'Start board'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="bd-sec">
        <h2 className="db-h3">All boards</h2>
        {!boards ? <div className="spinner-page">Loading…</div> : boards.length === 0 ? (
          <div className="empty-state">No boards yet. Start one from a class above, or from Admin → Today.</div>
        ) : (
          <div className="db-rows">
            {boards.map(b => (
              <div key={b._id} className="db-row">
                <Link to={`/admin/board/${b._id}`} className="db-row-main bd-link">
                  <div className="db-row-title">{b.title}</div>
                  <div className="db-meta">
                    {b.session ? `Class ${b.session.number}, ${b.event.title}` : 'Not linked to a class'}
                    {`, ${b.pages} page${b.pages === 1 ? '' : 's'}, edited ${fmt(b.updatedAt)}`}
                  </div>
                </Link>
                {b.notes
                  ? <a className="badge badge-success" href={b.notes.url} target="_blank" rel="noreferrer">Notes published</a>
                  : <span className="badge badge-muted">No notes yet</span>}
                <button className="btn btn-ghost btn-sm" onClick={() => remove(b)}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </section>
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
