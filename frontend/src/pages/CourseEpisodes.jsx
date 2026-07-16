import { useEffect, useState, useCallback } from 'react';
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

  const load = useCallback(async () => {
    try {
      const { data: c } = await axios.get(`${API}/courses/${slug}`);
      setCourse(c);
      const [eps, mine, prog] = await Promise.all([
        axios.get(`${API}/episodes?course=${c._id}`),
        axios.get(`${API}/courses/my/enrollments`),
        axios.get(`${API}/progress/course/${c._id}`),
      ]);
      setEpisodes(eps.data);
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

  if (loading) return <div className="spinner-page">Loading course…</div>;
  if (!course) return <div className="spinner-page">Course not found.</div>;

  const hasFullAccess = user?.role === 'admin' || !course.isPaid || status === 'active';
  const unlockedCount = episodes.filter(e => !e.locked).length;
  const completedHere = episodes.filter(e => doneSet.has(String(e._id))).length;

  // group by phase, preserving course.phases order
  const phaseOrder = course.phases?.length ? course.phases : [...new Set(episodes.map(e => e.phase).filter(Boolean))];
  const grouped = [];
  const seen = new Set();
  phaseOrder.forEach(p => {
    const list = episodes.filter(e => e.phase === p);
    if (list.length) { grouped.push({ phase: p, list }); list.forEach(e => seen.add(e._id)); }
  });
  const rest = episodes.filter(e => !seen.has(e._id));
  if (rest.length) grouped.push({ phase: grouped.length ? 'More lessons' : '', list: rest });

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
      </div>
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
