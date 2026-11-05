import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { toEmbed } from '../lib/youtube';
import { AskBox, ThreadList } from '../components/Discussion';
import { fileKind, LINK_ACTION, LINK_KIND } from '../lib/fileTypes';

const API = import.meta.env.VITE_API_URL;

export default function EpisodeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [episode, setEpisode] = useState(null);
  const [done, setDone] = useState(false);
  const [locked, setLocked] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const { user } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/episodes/${id}`)
      .then(async ({ data }) => {
        setEpisode(data);
        const { data: prog } = await axios.get(`${API}/progress/course/${data.course._id || data.course}`);
        setDone(prog.some(p => String(p.episode) === String(id)));
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

  const [downloading, setDownloading] = useState('');

  const downloadFile = async (f) => {
    setDownloading(f._id);
    try {
      const res = await axios.get(`${API}/episodes/${id}/files/${f._id}/download`, {
        responseType: 'blob',
      });
      // filename from server header, fallback to label
      let filename = f.label || 'download';
      const cd = res.headers['content-disposition'];
      const m = cd && cd.match(/filename="?([^";]+)"?/);
      if (m) filename = m[1];
      const blobUrl = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      setToast('Could not download file');
    } finally { setDownloading(''); }
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

        {(episode.files?.length > 0 || episode.links?.length > 0) && (
          <section className="card res">
            <h2 className="res-h">Notes, code and links</h2>
            <ul className="res-list">
              {(episode.links || []).map(l => (
                <li key={l._id}>
                  <a className="res-item" href={l.url} target="_blank" rel="noopener noreferrer">
                    <span className={`res-kind res-${l.kind}`}>{LINK_KIND[l.kind] || 'Link'}</span>
                    <span className="res-name">{l.label}</span>
                    <span className="res-act">{LINK_ACTION[l.kind] || 'Open link'}</span>
                  </a>
                </li>
              ))}
              {(episode.files || []).map(f => (
                <li key={f._id}>
                  <button type="button" className="res-item" onClick={() => downloadFile(f)} disabled={downloading === f._id}>
                    <span className="res-kind">{fileKind(f)}</span>
                    <span className="res-name">{f.label}<span className="res-size">{f.size}</span></span>
                    <span className="res-act">{downloading === f._id ? 'Downloading…' : 'Download'}</span>
                  </button>
                </li>
              ))}
            </ul>
            {(episode.links || []).some(l => l.kind === 'colab') && (
              <p className="res-tip">Opening a Colab notebook? Use File → Save a copy in Drive, then run and edit your own copy.</p>
            )}
          </section>
        )}
        <section className="card dq-lesson-card" style={{ marginTop: 16 }}>
          <div className="db-head">
            <h2 className="dq-h">Doubts on this lesson</h2>
            {courseSlug && <Link to={`/courses/${courseSlug}/discuss`} className="db-more">All course doubts</Link>}
          </div>
          <p className="small muted" style={{ marginBottom: 12 }}>Stuck? Ask here. Classmates can answer, and Rajeev sir replies too.</p>
          <AskBox target={{ episodeId: id }} onAsked={() => setReloadKey(k => k + 1)} />
          {import.meta.env.VITE_MENTORHUB_URL && (
            <p className="small muted" style={{ margin: '4px 0 12px' }}>
              Need deeper help than a text answer?{' '}
              <a href={import.meta.env.VITE_MENTORHUB_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                Book a live 1:1 session with Rajeev sir
              </a>
            </p>
          )}
          <ThreadList source={`/questions/episode/${id}`} searchable={false} reloadKey={reloadKey}
            empty="No doubts on this lesson yet." />
        </section>
      </div>
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
