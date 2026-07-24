import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ProgressBar from '../components/ProgressBar';
import Toast from '../components/Toast';

const API = import.meta.env.VITE_API_URL;

export default function CourseEpisodes() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [course, setCourse] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [doneSet, setDoneSet] = useState(new Set());
  const [status, setStatus] = useState(null);   // my enrollment status
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  // ── NEW: playlist search + filter ──
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');   // all | todo | done | free

  // ── NEW: upcoming live classes for this course ──
  const [liveEvents, setLiveEvents] = useState([]);

  const load = useCallback(async () => {
    try {
      const { data: c } = await axios.get(`${API}/courses/${slug}`);
      setCourse(c);
      const [eps, mine, prog, live] = await Promise.all([
        axios.get(`${API}/episodes?course=${c._id}`),
        axios.get(`${API}/courses/my/enrollments`),
        axios.get(`${API}/progress/course/${c._id}`),
        axios.get(`${API}/events?course=${c._id}&scope=upcoming`).catch(() => ({ data: [] })),
      ]);
      setEpisodes(eps.data);
      setLiveEvents(live.data || []);
      const my = mine.data.find(e => String(e.course._id) === String(c._id));
      const expired = my?.expiresAt && new Date(my.expiresAt) <= new Date();
      setStatus(my ? (my.status === 'active' && expired ? 'expired' : my.status) : null);
      setDoneSet(new Set(prog.data.map(p => String(p.episode))));
    } catch (e) {
      setToast('Could not load course');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const enroll = async () => {
    try {
      await axios.post(`${API}/courses/${course._id}/enroll`);
      setToast('Enrolled! Start learning 🎉');
      setStatus('active');
    } catch (err) {
      if (err.response?.status === 402) {
        navigate(`/pay/${course.slug}`);
      } else {
        setToast(err.response?.data?.message || 'Could not enroll');
      }
    }
  };

  // ── Search + filter logic ──
  // Matches title, description, phase and tags so students can find
  // "that lesson about dictionaries" without remembering the number.
  const visibleEpisodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return episodes.filter(ep => {
      if (filter === 'done' && !doneSet.has(String(ep._id))) return false;
      if (filter === 'todo' &&  doneSet.has(String(ep._id))) return false;
      if (filter === 'free' && !ep.isFreePreview) return false;
      if (!q) return true;

      const haystack = [
        ep.title,
        ep.description,
        ep.phase,
        `episode ${ep.episodeNumber}`,
        `${ep.episodeNumber}`,
        ...(ep.tags || []),
      ].filter(Boolean).join(' ').toLowerCase();

      // every word in the query must appear somewhere — so "loop while"
      // finds "While loops" even though the order differs
      return q.split(/\s+/).every(word => haystack.includes(word));
    });
  }, [episodes, query, filter, doneSet]);

  if (loading) return <div className="spinner-page">Loading course…</div>;
  if (!course) return <div className="spinner-page">Course not found.</div>;

  const hasFullAccess = user?.role === 'admin' || !course.isPaid || status === 'active';
  const unlockedCount = episodes.filter(e => !e.locked).length;
  const completedHere = episodes.filter(e => doneSet.has(String(e._id))).length;
  const isSearching = query.trim() !== '' || filter !== 'all';

  // group by phase, preserving course.phases order — now over the FILTERED list
  const phaseOrder = course.phases?.length
    ? course.phases
    : [...new Set(episodes.map(e => e.phase).filter(Boolean))];
  const grouped = [];
  const seen = new Set();
  phaseOrder.forEach(p => {
    const list = visibleEpisodes.filter(e => e.phase === p);
    if (list.length) { grouped.push({ phase: p, list }); list.forEach(e => seen.add(e._id)); }
  });
  const rest = visibleEpisodes.filter(e => !seen.has(e._id));
  if (rest.length) grouped.push({ phase: grouped.length ? 'More lessons' : '', list: rest });

  const fmtDate = (d) => new Date(d).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });

  return (
    <div className="page">
      <div className="container section">
        <Link to="/courses" className="small muted">← All courses</Link>

        <div className="card" style={{ margin: '14px 0 24px' }}>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 320px' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <span className="badge badge-muted">{course.level}</span>
                <span className="badge badge-muted">{course.language}</span>
                <span className="badge badge-muted">{episodes.length} lessons</span>
                {course.isPaid
                  ? (status === 'active'
                      ? <span className="badge badge-success">Purchased</span>
                      : <span className="badge badge-warning">₹{course.price}</span>)
                  : <span className="badge badge-accent">Free</span>}
              </div>
              <h1 style={{ fontSize: 23, marginBottom: 8 }}>{course.title}</h1>
              <p className="muted small" style={{ maxWidth: 640 }}>{course.description}</p>

              {course.whatYouLearn?.length > 0 && !hasFullAccess && (
                <ul style={{ margin: '14px 0 0 18px' }} className="small muted">
                  {course.whatYouLearn.map((w, i) => <li key={i} style={{ marginBottom: 4 }}>{w}</li>)}
                </ul>
              )}

              {hasFullAccess && episodes.length > 0 && (
                <div style={{ marginTop: 16, maxWidth: 420 }}>
                  <ProgressBar completed={completedHere} total={episodes.length} />
                </div>
              )}
            </div>

            {!hasFullAccess && (
              <div style={{ flex: '0 0 auto', minWidth: 200 }}>
                {status === 'pending' ? (
                  <div className="badge badge-warning" style={{ padding: '8px 14px' }}>Payment under verification</div>
                ) : status === 'expired' ? (
                  <>
                    <div className="badge badge-warning" style={{ padding: '8px 14px', marginBottom: 10 }}>Access expired</div>
                    <button className="btn btn-primary btn-block" onClick={() => navigate(`/pay/${course.slug}`)}>
                      Renew access — ₹{course.price}
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700 }}>
                      ₹{course.price}
                      {course.mrp > course.price && (
                        <span className="small muted" style={{ textDecoration: 'line-through', marginLeft: 8, fontWeight: 400 }}>₹{course.mrp}</span>
                      )}
                    </div>
                    <button className="btn btn-primary btn-block" style={{ marginTop: 10 }}
                      onClick={() => navigate(`/pay/${course.slug}`)}>
                      Buy this course
                    </button>
                    {unlockedCount > 0 && <p className="small muted" style={{ marginTop: 8, textAlign: 'center' }}>{unlockedCount} free preview{unlockedCount > 1 ? 's' : ''} below</p>}
                  </>
                )}
              </div>
            )}
            {!course.isPaid && !status && (
              <button className="btn btn-primary" onClick={enroll}>Enroll free</button>
            )}
          </div>
        </div>

        {/* ── Upcoming live problem-solving classes for this course ── */}
        {liveEvents.length > 0 && (
          <div className="card" style={{ marginBottom: 24, borderLeft: '3px solid var(--accent)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
              🔴 Live problem-solving {liveEvents.length > 1 ? 'classes' : 'class'}
            </div>
            <p className="small muted" style={{ marginBottom: 12 }}>
              Bring your doubts — we solve them together, live.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {liveEvents.map(ev => (
                <div key={ev._id}
                  className="card card-hover"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', cursor: 'pointer' }}
                  onClick={() => navigate(`/events/${ev.slug}`)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14.5 }}>{ev.title}</div>
                    <div className="small muted" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
                      {ev.startsAt && <span>{fmtDate(ev.startsAt)}</span>}
                      {ev.sessions?.length > 1 && <span>{ev.sessions.length} sessions</span>}
                      {ev.isPaid
                        ? <span className="badge badge-warning">₹{ev.price}</span>
                        : <span className="badge badge-accent">Free</span>}
                      {ev.myRegistration?.status === 'active' && <span className="badge badge-success">Registered</span>}
                      {ev.myRegistration?.status === 'pending' && <span className="badge badge-warning">Pending</span>}
                    </div>
                  </div>
                  <span className="small" style={{ color: 'var(--accent)', flexShrink: 0 }}>
                    {ev.myRegistration?.status === 'active' ? 'View →' : 'Register →'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Playlist search ── */}
        {episodes.length > 3 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input
                className="input"
                type="search"
                placeholder="Search lessons — title, topic or number…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                style={{ width: '100%', paddingLeft: 38 }}
              />
              <span style={{
                position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
                pointerEvents: 'none', opacity: 0.5, fontSize: 14,
              }}>🔍</span>
              {query && (
                <button
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-2)', fontSize: 16, lineHeight: 1, padding: 4,
                  }}>×</button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {[
                { id: 'all',  label: 'All' },
                { id: 'todo', label: 'Not watched' },
                { id: 'done', label: 'Completed' },
                ...(course.isPaid ? [{ id: 'free', label: 'Free previews' }] : []),
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`badge ${filter === f.id ? 'badge-accent' : 'badge-muted'}`}
                  style={{ cursor: 'pointer', border: 'none', padding: '5px 12px' }}>
                  {f.label}
                </button>
              ))}
              {isSearching && (
                <span className="small muted" style={{ marginLeft: 'auto' }}>
                  {visibleEpisodes.length} of {episodes.length}
                </span>
              )}
            </div>
          </div>
        )}

        {grouped.map(({ phase, list }) => (
          <div key={phase || 'main'} style={{ marginBottom: 26 }}>
            {phase && <h2 style={{ fontSize: 15, color: 'var(--text-2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{phase}</h2>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {list.map(ep => {
                const done = doneSet.has(String(ep._id));
                return (
                  <div key={ep._id}
                    className={`card ${!ep.locked ? 'card-hover' : ''}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
                             cursor: ep.locked ? 'default' : 'pointer', opacity: ep.locked ? 0.65 : 1 }}
                    onClick={() => !ep.locked && navigate(`/episodes/${ep._id}`)}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: done ? 'var(--success-soft)' : 'var(--surface-2)',
                      color: done ? 'var(--success)' : 'var(--text-2)',
                      fontWeight: 700, fontSize: 14,
                    }}>
                      {ep.locked ? '🔒' : done ? '✓' : ep.episodeNumber}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14.5 }}>{ep.title}</div>
                      <div className="small muted" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {ep.duration && <span>{ep.duration}</span>}
                        {ep.isFreePreview && course.isPaid && <span className="badge badge-accent">Free preview</span>}
                      </div>
                    </div>
                    {!ep.locked && <span className="small" style={{ color: 'var(--accent)', flexShrink: 0 }}>Watch →</span>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {episodes.length === 0 && <div className="empty-state">Lessons coming soon.</div>}

        {episodes.length > 0 && visibleEpisodes.length === 0 && (
          <div className="empty-state">
            No lessons match “{query || filter}”.
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 10 }}
              onClick={() => { setQuery(''); setFilter('all'); }}>
              Clear
            </button>
          </div>
        )}
      </div>
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
