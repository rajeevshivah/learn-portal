import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import Toast from '../../components/Toast';

const API = import.meta.env.VITE_API_URL;

export default function DoubtsTab({ onChange }) {
  const [view, setView] = useState('unanswered');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const url = view === 'unanswered' ? `${API}/questions/unanswered` : `${API}/questions/all`;
    axios.get(url).then(({ data }) => setRows(data)).catch(() => setToast('Could not load doubts')).finally(() => setLoading(false));
  }, [view]);
  useEffect(() => { load(); }, [load]);

  const answer = async (id) => {
    const text = (drafts[id] || '').trim();
    if (!text) { setToast('Write an answer first'); return; }
    setBusy(id);
    try {
      await axios.put(`${API}/questions/${id}/answer`, { answer: text });
      setToast('Answer posted');
      setDrafts(d => ({ ...d, [id]: '' }));
      load();
      onChange?.();
    } catch (err) {
      setToast(err.response?.data?.message || 'Could not post answer');
    } finally { setBusy(''); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this question?')) return;
    try {
      await axios.delete(`${API}/questions/${id}`);
      load(); onChange?.();
    } catch { setToast('Delete failed'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`btn btn-sm ${view === 'unanswered' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('unanswered')}>Unanswered</button>
        <button className={`btn btn-sm ${view === 'all' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('all')}>All doubts</button>
      </div>

      {loading ? <div className="spinner-page">Loading…</div> :
       rows.length === 0 ? <div className="empty-state">{view === 'unanswered' ? 'No unanswered doubts. All clear ✓' : 'No doubts yet.'}</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {rows.map(q => (
            <div key={q._id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                <div className="small">
                  <strong>{q.user?.name}</strong>
                  <span className="muted"> · {q.course?.title} · #{q.episode?.episodeNumber} {q.episode?.title}</span>
                </div>
                <span className="small muted">{new Date(q.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
              <p style={{ fontSize: 14.5, whiteSpace: 'pre-wrap', marginBottom: 10 }}>{q.text}</p>

              {q.isAnswered ? (
                <div style={{ background: 'var(--success-soft)', borderRadius: 8, padding: '10px 14px' }}>
                  <div className="small" style={{ color: 'var(--success)', fontWeight: 600, marginBottom: 4 }}>Your answer</div>
                  <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{q.answer}</p>
                </div>
              ) : (
                <div>
                  <textarea className="textarea" placeholder="Write your answer…"
                    value={drafts[q._id] || ''} onChange={e => setDrafts(d => ({ ...d, [q._id]: e.target.value }))} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="btn btn-primary btn-sm" disabled={busy === q._id} onClick={() => answer(q._id)}>
                      {busy === q._id ? 'Posting…' : 'Post answer'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => remove(q._id)}>Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
