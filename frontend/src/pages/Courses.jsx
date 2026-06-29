import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL;

export default function Courses() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses]         = useState([]);
  const [enrolledIds, setEnrolledIds] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [busyId, setBusyId]           = useState(null);

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/courses`),
      axios.get(`${API}/courses/my/enrollments`),
    ])
      .then(([cRes, eRes]) => {
        setCourses(cRes.data);
        setEnrolledIds(eRes.data.map(String));
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const isEnrolled = (id) => enrolledIds.includes(String(id));

  const handleEnroll = async (course, e) => {
    e.stopPropagation();
    setBusyId(course._id);
    try {
      await axios.post(`${API}/courses/${course._id}/enroll`);
      setEnrolledIds(prev => [...prev, String(course._id)]);
      navigate(`/courses/${course.slug}`);
    } catch (err) {
      alert('Could not enroll. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <div style={styles.navBrand}>
          <span style={{ color: '#4A9EFF', fontWeight: 700 }}>codeWith</span>
          <span style={{ color: '#fff', fontWeight: 700 }}>Shivah</span>
          <span style={styles.navSub}>learn.rajeevshivah.me</span>
        </div>
        <div style={styles.navRight}>
          <img src={user?.avatar} alt={user?.name} style={styles.avatar} />
          <span style={styles.navName}>{user?.name?.split(' ')[0]}</span>
          {user?.role === 'admin' && (
            <button style={styles.adminBtn} onClick={() => navigate('/admin')}>Admin</button>
          )}
          <button style={styles.logoutBtn} onClick={logout}>Logout</button>
        </div>
      </nav>

      <div style={styles.content}>
        <div style={styles.header}>
          <h1 style={styles.title}>Courses</h1>
          <p style={styles.subtitle}>
            Pick a course and join to track your progress and access episode resources.
          </p>
        </div>

        {loading ? (
          <p style={styles.muted}>Loading courses...</p>
        ) : courses.length === 0 ? (
          <p style={styles.muted}>No courses available yet.</p>
        ) : (
          <div style={styles.grid}>
            {courses.map(course => {
              const enrolled = isEnrolled(course._id);
              return (
                <div
                  key={course._id}
                  style={styles.card}
                  onClick={() => enrolled
                    ? navigate(`/courses/${course.slug}`)
                    : null}
                >
                  {course.thumbnail
                    ? <img src={course.thumbnail} alt={course.title} style={styles.thumb} />
                    : <div style={styles.thumbPlaceholder}>{course.title?.[0] || '?'}</div>}

                  <h3 style={styles.cardTitle}>{course.title}</h3>
                  <p style={styles.cardDesc}>{course.description}</p>

                  <div style={styles.cardMeta}>
                    {course.phases?.length > 0 && (
                      <span style={styles.phaseCount}>
                        {course.phases.length} phase{course.phases.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {enrolled ? (
                    <button
                      style={styles.openBtn}
                      onClick={(e) => { e.stopPropagation(); navigate(`/courses/${course.slug}`); }}
                    >
                      Open course →
                    </button>
                  ) : (
                    <button
                      style={styles.joinBtn}
                      disabled={busyId === course._id}
                      onClick={(e) => handleEnroll(course, e)}
                    >
                      {busyId === course._id ? 'Joining...' : 'Join course'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#0a0f1e', fontFamily: 'Arial, sans-serif' },
  nav: { background: '#111827', borderBottom: '1px solid #1e3a5f', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 },
  navBrand: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '18px' },
  navSub: { color: '#4A6A8A', fontSize: '13px', marginLeft: '8px' },
  navRight: { display: 'flex', alignItems: 'center', gap: '12px' },
  avatar: { width: '32px', height: '32px', borderRadius: '50%', border: '2px solid #1e3a5f' },
  navName: { color: '#8899AA', fontSize: '14px' },
  adminBtn: { background: '#1e3a5f', color: '#4A9EFF', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
  logoutBtn: { background: 'transparent', color: '#6B8CAE', border: '1px solid #1e3a5f', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
  content: { maxWidth: '1100px', margin: '0 auto', padding: '40px 24px' },
  header: { marginBottom: '40px' },
  title: { color: '#FFFFFF', fontSize: '28px', fontWeight: '700', marginBottom: '8px' },
  subtitle: { color: '#6B8CAE', fontSize: '15px' },
  muted: { color: '#6B8CAE', textAlign: 'center', marginTop: '60px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' },
  card: { background: '#111827', border: '1px solid #1e3a5f', borderRadius: '12px', padding: '20px', cursor: 'pointer', display: 'flex', flexDirection: 'column' },
  thumb: { width: '100%', height: '140px', objectFit: 'cover', borderRadius: '8px', marginBottom: '14px' },
  thumbPlaceholder: { width: '100%', height: '140px', borderRadius: '8px', marginBottom: '14px', background: 'linear-gradient(135deg, #1e3a5f, #111827)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A9EFF', fontSize: '48px', fontWeight: 700 },
  cardTitle: { color: '#FFFFFF', fontSize: '18px', fontWeight: '600', marginBottom: '8px' },
  cardDesc: { color: '#6B8CAE', fontSize: '13px', lineHeight: '1.5', marginBottom: '14px', flex: 1, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  cardMeta: { display: 'flex', gap: '12px', marginBottom: '16px' },
  phaseCount: { color: '#4CAF7D', fontSize: '12px', fontWeight: '600' },
  joinBtn: { background: '#4A9EFF', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
  openBtn: { background: '#1e3a5f', color: '#4A9EFF', border: 'none', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' },
};
