import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ProgressBar from '../components/ProgressBar';

const API = import.meta.env.VITE_API_URL;

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [enrollments, setEnrollments] = useState([]);
  const [summary, setSummary] = useState({});
  const [explore, setExplore] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/courses/my/enrollments`),
      axios.get(`${API}/progress/summary`),
      axios.get(`${API}/courses`),
    ]).then(([enr, prog, all]) => {
      setEnrollments(enr.data);
      setSummary(Object.fromEntries(prog.data.map(p => [String(p.course), p])));
      const enrolledIds = new Set(enr.data.map(e => String(e.course._id)));
      setExplore(all.data.filter(c => !enrolledIds.has(String(c._id))));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="spinner-page">Loading your dashboard…</div>;

  const now = new Date();
  const isExpired = (e) => e.expiresAt && new Date(e.expiresAt) <= now;
  const active   = enrollments.filter(e => e.status === 'active' && !isExpired(e));
  const expired  = enrollments.filter(e => e.status === 'active' && isExpired(e));
  const pending  = enrollments.filter(e => e.status === 'pending');
  const rejected = enrollments.filter(e => e.status === 'rejected');

  // most recently active course for "continue learning"
  const continueCourse = active
    .map(e => ({ e, s: summary[String(e.course._id)] }))
    .filter(x => x.s && x.s.total > 0 && x.s.completed < x.s.total)
    .sort((a, b) => new Date(b.s.lastActivity) - new Date(a.s.lastActivity))[0];

  return (
    <div className="page">
      <div className="container section">
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>
          Namaste, {user.name.split(' ')[0]} 👋
        </h1>
        <p className="muted" style={{ marginBottom: 24 }}>Pick up where you left off.</p>

        {pending.length > 0 && (
          <div className="card" style={{ borderColor: 'var(--warning)', marginBottom: 20 }}>
            <strong style={{ color: 'var(--warning)' }}>Payment under verification</strong>
            <p className="small muted" style={{ marginTop: 4 }}>
              {pending.map(p => p.course.title).join(', ')} — access unlocks after verification, usually within a few hours.
            </p>
          </div>
        )}

        {expired.map(r => (
          <div key={r._id} className="card" style={{ borderColor: 'var(--warning)', marginBottom: 20 }}>
            <strong style={{ color: 'var(--warning)' }}>Access expired — {r.course.title}</strong>
            <p className="small muted" style={{ marginTop: 4 }}>
              Your access ended on {new Date(r.expiresAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}.{' '}
              <Link to={`/pay/${r.course.slug}`}>Renew access →</Link>
            </p>
          </div>
        ))}

        {rejected.map(r => (
          <div key={r._id} className="card" style={{ borderColor: 'var(--danger)', marginBottom: 20 }}>
            <strong style={{ color: 'var(--danger)' }}>Payment issue — {r.course.title}</strong>
            <p className="small muted" style={{ marginTop: 4 }}>
              {r.rejectReason || 'Your payment could not be verified.'}{' '}
              <Link to={`/pay/${r.course.slug}`}>Resubmit payment →</Link>
            </p>
          </div>
        ))}

        {continueCourse && (
          <div className="card card-hover" style={{ marginBottom: 26, borderColor: 'var(--accent)' }}>
            <span className="badge badge-accent" style={{ marginBottom: 10 }}>Continue learning</span>
            <h2 style={{ fontSize: 19, margin: '6px 0 12px' }}>{continueCourse.e.course.title}</h2>
            <ProgressBar completed={continueCourse.s.completed} total={continueCourse.s.total} />
            <button className="btn btn-primary" style={{ marginTop: 16 }}
              onClick={() => navigate(`/courses/${continueCourse.e.course.slug}`)}>
              Resume course →
            </button>
          </div>
        )}

        <h2 style={{ fontSize: 18, marginBottom: 14 }}>My courses</h2>
        {active.length === 0 ? (
          <div className="empty-state">
            <p>You haven't joined any course yet.</p>
            <Link to="/courses" className="btn btn-primary" style={{ marginTop: 14 }}>Browse courses</Link>
          </div>
        ) : (
          <div className="grid-cards">
            {active.map(({ course, _id }) => {
              const s = summary[String(course._id)] || { completed: 0, total: 0 };
              return (
                <Link key={_id} to={`/courses/${course.slug}`} className="card card-hover" style={{ color: 'inherit' }}>
                  {course.thumbnail && (
                    <img src={course.thumbnail} alt="" style={{ borderRadius: 8, marginBottom: 12, aspectRatio: '16/9', objectFit: 'cover' }} />
                  )}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <span className="badge badge-muted">{course.level || 'Beginner'}</span>
                    {course.isPaid
                      ? <span className="badge badge-success">Purchased</span>
                      : <span className="badge badge-accent">Free</span>}
                  </div>
                  <h3 style={{ fontSize: 16, marginBottom: 12 }}>{course.title}</h3>
                  <ProgressBar completed={s.completed} total={s.total} />
                  {_id && enrollments.find(e => e._id === _id)?.expiresAt && (
                    <p className="small muted" style={{ marginTop: 8 }}>
                      Access till {new Date(enrollments.find(e => e._id === _id).expiresAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        {explore.length > 0 && (
          <>
            <h2 style={{ fontSize: 18, margin: '32px 0 14px' }}>Explore more</h2>
            <div className="grid-cards">
              {explore.slice(0, 6).map(course => (
                <Link key={course._id} to={`/courses/${course.slug}`} className="card card-hover" style={{ color: 'inherit' }}>
                  {course.thumbnail && (
                    <img src={course.thumbnail} alt="" style={{ borderRadius: 8, marginBottom: 12, aspectRatio: '16/9', objectFit: 'cover' }} />
                  )}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <span className="badge badge-muted">{course.episodeCount} lessons</span>
                    {course.isPaid
                      ? <span className="badge badge-warning">₹{course.price}</span>
                      : <span className="badge badge-accent">Free</span>}
                  </div>
                  <h3 style={{ fontSize: 16, marginBottom: 6 }}>{course.title}</h3>
                  <p className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {course.description}
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
