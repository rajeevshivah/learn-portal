import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import Cover from '../components/Cover';
import { useAuth } from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL;

export default function Courses() {
  const [courses, setCourses] = useState([]);
  const [myMap, setMyMap] = useState({});
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    Promise.allSettled([
      axios.get(`${API}/courses`),
      user ? axios.get(`${API}/courses/my/enrollments`) : Promise.resolve({ data: [] }),
    ]).then(([all, mine]) => {
      if (all.status === 'fulfilled') setCourses(all.value.data);
      if (mine.status === 'fulfilled') setMyMap(Object.fromEntries(mine.value.data.map(e => [String(e.course._id), e.status])));
    }).finally(() => setLoading(false));
  }, [user]);

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
            {courses.filter(c => c.episodeCount > 0 || myMap[String(c._id)]).map(course => {
              const status = myMap[String(course._id)];
              return (
                <Link key={course._id} to={`/courses/${course.slug}`} className="rail-card cs-card">
                  <Cover course={course} />
                  <div className="rail-body">
                    <div className="rail-title">{course.title}</div>
                    <p className="cs-desc">{course.description}</p>
                    <div className="cs-foot">
                      <span className="db-meta">
                        {course.level} · {course.episodeCount} {course.episodeCount === 1 ? 'lesson' : 'lessons'}
                        {status === 'active' ? ' · Enrolled' : status === 'pending' ? ' · Verifying payment' : ''}
                      </span>
                      <span className="cs-price">
                        {course.isPaid ? <>₹{course.price}{course.mrp > course.price && <s>₹{course.mrp}</s>}</> : 'Free'}
                      </span>
                    </div>
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
