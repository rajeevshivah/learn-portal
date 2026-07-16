import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL;

export default function Courses() {
  const [courses, setCourses] = useState([]);
  const [myMap, setMyMap] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/courses`),
      axios.get(`${API}/courses/my/enrollments`),
    ]).then(([all, mine]) => {
      setCourses(all.data);
      setMyMap(Object.fromEntries(mine.data.map(e => [String(e.course._id), e.status])));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="spinner-page">Loading courses…</div>;

  return (
    <div className="page">
      <div className="container section">
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>All courses</h1>
        <p className="muted" style={{ marginBottom: 24 }}>Short, outcome-focused courses. Learn one skill properly, then move to the next.</p>

        {courses.length === 0 ? (
          <div className="empty-state">No courses published yet. Check back soon.</div>
        ) : (
          <div className="grid-cards">
            {courses.map(course => {
              const status = myMap[String(course._id)];
              return (
                <Link key={course._id} to={`/courses/${course.slug}`} className="card card-hover" style={{ color: 'inherit', display: 'flex', flexDirection: 'column' }}>
                  {course.thumbnail && (
                    <img src={course.thumbnail} alt="" style={{ borderRadius: 8, marginBottom: 12, aspectRatio: '16/9', objectFit: 'cover' }} />
                  )}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span className="badge badge-muted">{course.level}</span>
                    <span className="badge badge-muted">{course.episodeCount} lessons</span>
                    {status === 'active' && <span className="badge badge-success">Enrolled</span>}
                    {status === 'pending' && <span className="badge badge-warning">Verifying</span>}
                  </div>
                  <h3 style={{ fontSize: 16, marginBottom: 6 }}>{course.title}</h3>
                  <p className="small muted" style={{ flex: 1, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {course.description}
                  </p>
                  <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    {course.isPaid ? (
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>
                        ₹{course.price}
                        {course.mrp > course.price && (
                          <span className="small muted" style={{ textDecoration: 'line-through', marginLeft: 8, fontWeight: 400 }}>₹{course.mrp}</span>
                        )}
                      </span>
                    ) : (
                      <span className="badge badge-accent">Free</span>
                    )}
                    <span className="small" style={{ color: 'var(--accent)', fontWeight: 600 }}>View →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
