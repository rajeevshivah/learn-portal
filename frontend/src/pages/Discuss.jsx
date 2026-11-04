import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { AskBox, ThreadList } from '../components/Discussion';

const API = import.meta.env.VITE_API_URL;

// Course-wide doubts: every lesson's threads plus general questions.
export default function Discuss() {
  const { slug } = useParams();
  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    axios.get(`${API}/questions/course/${slug}`, { params: { page: 1 } })
      .then(({ data }) => {
        setCourse(data.course);
        return axios.get(`${API}/episodes/outline/${data.course._id}`).then(({ data }) => setLessons(data)).catch(() => {});
      })
      .catch(e => setError(e.response?.data?.message || 'Could not load doubts'));
  }, [slug]);

  if (error) {
    return (
      <div className="page container section dq-page">
        <Link to={`/courses/${slug}`} className="small muted">← Back to the course</Link>
        <div className="dq-empty" style={{ marginTop: 16 }}>{error}</div>
      </div>
    );
  }
  if (!course) return <div className="spinner-page">Loading…</div>;

  return (
    <div className="page container section dq-page">
      <Link to={`/courses/${course.slug}`} className="small muted">← {course.title}</Link>
      <h1 className="dq-title">Doubts</h1>
      <p className="dq-sub">Ask anything about this course. Classmates can answer too, and Rajeev sir’s replies are marked Instructor.</p>
      <AskBox target={{ courseId: course._id }} lessons={lessons} onAsked={() => setReloadKey(k => k + 1)} />
      <ThreadList source={`/questions/course/${course._id}`} showLesson reloadKey={reloadKey} />
    </div>
  );
}
