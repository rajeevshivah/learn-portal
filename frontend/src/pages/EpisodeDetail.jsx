import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL;

// watch?v=XYZ | youtu.be/XYZ | shorts/XYZ -> embed URL
const toEmbed = (url) => {
  if (!url) return '';
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0` : '';
};

export default function EpisodeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [episode, setEpisode] = useState(null);
  const [done, setDone] = useState(false);
  const [locked, setLocked] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const { user } = useAuth();
  const [questions, setQuestions] = useState([]);
  const [doubt, setDoubt] = useState('');
  const [asking, setAsking] = useState(false);

  const loadQuestions = () => {
    axios.get(`${API}/questions/episode/${id}`)
      .then(({ data }) => setQuestions(data)).catch(() => {});
  };

  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/episodes/${id}`)
      .then(async ({ data }) => {
        setEpisode(data);
        const { data: prog } = await axios.get(`${API}/progress/course/${data.course._id || data.course}`);
        setDone(prog.some(p => String(p.episode) === String(id)));
        loadQuestions();
      })
      .catch(err => {
        if (err.response?.status === 403 && err.response.data.requiresPayment) {
          setLocked(err.response.data.courseSlug);
        } else {
          setToast(err.response?.data?.message || 'Could not load episode');
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const askDoubt = async () => {
    if (!doubt.trim()) { setToast('Type your doubt first'); return; }
    setAsking(true);
    try {
      await axios.post(`${API}/questions`, { episodeId: id, text: doubt.trim() });
      setDoubt('');
      setToast('Doubt posted — you will get an answer here');
      loadQuestions();
    } catch (err) {
      setToast(err.response?.data?.message || 'Could not post doubt');
    } finally { setAsking(false); }
  };

  const removeDoubt = async (qid) => {
    if (!window.confirm('Delete your question?')) return;
    try {
      await axios.delete(`${API}/questions/${qid}`);
      loadQuestions();
    } catch { setToast('Could not delete'); }
  };

  const toggleDone = async () => {
    try {
      if (done) {
        await axios.delete(`${API}/progress/${id}/complete`);
        setDone(false);
      } else {
        await axios.post(`${API}/progress/${id}/complete`);
        setDone(true);
        setToast('Marked complete 🎉');
      }
    } catch {
      setToast('Could not update progress');
    }
  };

  if (loading) return <div className="spinner-page">Loading lesson…</div>;

  if (locked) return (
    <div className="page"><div className="container section" style={{ maxWidth: 560 }}>
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>This lesson is part of the paid course</h1>
        <p className="muted small" style={{ marginBottom: 20 }}>Unlock all lessons, notes and resources with one payment.</p>
        <button className="btn btn-primary" onClick={() => navigate(`/pay/${locked}`)}>Unlock full course</button>
      </div>
    </div></div>
  );

  if (!episode) return <div className="spinner-page">Episode not found.</div>;

  const embed = toEmbed(episode.youtubeUrl);
  const courseSlug = episode.course?.slug;

  return (
    <div className="page">
      <div className="container section" style={{ maxWidth: 860 }}>
        {courseSlug && <Link to={`/courses/${courseSlug}`} className="small muted">← {episode.course.title}</Link>}

        <h1 style={{ fontSize: 21, margin: '12px 0 16px' }}>
          <span className="muted">#{episode.episodeNumber}</span> {episode.title}
        </h1>

        {embed ? (
          <div className="video-frame">
            <iframe src={embed} title={episode.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          </div>
        ) : episode.youtubeUrl ? (
          <a href={episode.youtubeUrl} target="_blank" rel="noreferrer" className="btn btn-primary">▶ Watch on YouTube</a>
        ) : null}

        <div style={{ display: 'flex', gap: 10, margin: '16px 0', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className={`btn ${done ? 'btn-ghost' : 'btn-success'}`} onClick={toggleDone}>
            {done ? '✓ Completed — undo' : 'Mark as complete'}
          </button>
          {episode.duration && <span className="badge badge-muted">{episode.duration}</span>}
          {episode.phase && <span className="badge badge-muted">{episode.phase}</span>}
        </div>

        {episode.description && (
          <div className="card" style={{ marginBottom: 16 }}>
            <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{episode.description}</p>
          </div>
        )}

        {episode.files?.length > 0 && (
          <div className="card">
            <h2 style={{ fontSize: 15, marginBottom: 12 }}>Notes and resources</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {episode.files.map(f => (
                <a key={f._id} href={f.url} target="_blank" rel="noreferrer"
                   className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg)' }}>
                  <span style={{ fontSize: 20 }}>📄</span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{f.label}</span>
                  <span className="small muted">{f.size}</span>
                  <span className="small" style={{ color: 'var(--accent)' }}>Download ↓</span>
                </a>
              ))}
            </div>
          </div>
        )}
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 15, marginBottom: 4 }}>Doubts & questions</h2>
          <p className="small muted" style={{ marginBottom: 14 }}>Stuck on something in this lesson? Ask here — Rajeev sir answers directly.</p>

          <textarea className="textarea" placeholder="Type your doubt about this lesson…"
            value={doubt} onChange={e => setDoubt(e.target.value)} />
          <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} disabled={asking} onClick={askDoubt}>
            {asking ? 'Posting…' : 'Ask doubt'}
          </button>

          {questions.length > 0 && <hr className="divider" />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {questions.map(q => (
              <div key={q._id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  {q.user?.avatar && <img src={q.user.avatar} alt="" style={{ width: 22, height: 22, borderRadius: '50%' }} referrerPolicy="no-referrer" />}
                  <span className="small" style={{ fontWeight: 600 }}>{q.user?.name}</span>
                  <span className="small muted">{new Date(q.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span>
                  {!q.isAnswered && String(q.user?._id) === String(user?._id) && (
                    <button className="small" style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', marginLeft: 'auto' }}
                      onClick={() => removeDoubt(q._id)}>delete</button>
                  )}
                </div>
                <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{q.text}</p>
                {q.isAnswered ? (
                  <div style={{ background: 'var(--accent-soft)', borderRadius: 8, padding: '8px 12px', marginTop: 6 }}>
                    <div className="small" style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 2 }}>Rajeev sir</div>
                    <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{q.answer}</p>
                  </div>
                ) : (
                  <span className="badge badge-muted" style={{ marginTop: 6 }}>Awaiting answer</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
