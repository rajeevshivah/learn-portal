import { useEffect, useState } from 'react';
import axios from 'axios';
import Toast from '../../components/Toast';

const API = import.meta.env.VITE_API_URL;

export default function PollsTab() {
  const [polls, setPolls]   = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]   = useState('');

  // create form
  const [question, setQuestion] = useState('');
  const [options, setOptions]   = useState(['', '']);
  const [saving, setSaving]     = useState(false);

  const load = () => {
    Promise.all([
      axios.get(`${API}/polls/admin/all`),
      axios.get(`${API}/suggestions/admin/all`),
    ])
      .then(([p, s]) => { setPolls(p.data); setSuggestions(s.data); })
      .catch(() => setToast('Could not load'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const toggleReviewed = async (id) => {
    await axios.put(`${API}/suggestions/${id}/review`);
    load();
  };
  const delSuggestion = async (id) => {
    if (!window.confirm('Delete this suggestion?')) return;
    await axios.delete(`${API}/suggestions/${id}`);
    setToast('Suggestion deleted');
    load();
  };

  const setOption = (i, val) => setOptions(o => o.map((x, idx) => (idx === i ? val : x)));
  const addOption = () => setOptions(o => (o.length < 4 ? [...o, ''] : o));
  const removeOption = (i) => setOptions(o => (o.length > 2 ? o.filter((_, idx) => idx !== i) : o));

  const create = async () => {
    const opts = options.map(o => o.trim()).filter(Boolean);
    if (!question.trim()) return setToast('Enter a question');
    if (opts.length < 2)  return setToast('Enter at least 2 options');
    setSaving(true);
    try {
      await axios.post(`${API}/polls`, { question: question.trim(), options: opts });
      setQuestion(''); setOptions(['', '']);
      setToast('Poll is now live on student dashboards ✓');
      load();
    } catch (e) {
      setToast(e.response?.data?.message || 'Could not create poll');
    } finally {
      setSaving(false);
    }
  };

  const close  = async (id) => { await axios.put(`${API}/polls/${id}/close`);  setToast('Poll closed'); load(); };
  const reopen = async (id) => { await axios.put(`${API}/polls/${id}/reopen`); setToast('Poll reopened'); load(); };
  const del    = async (id) => {
    if (!window.confirm('Delete this poll and all its votes?')) return;
    await axios.delete(`${API}/polls/${id}`); setToast('Poll deleted'); load();
  };

  if (loading) return <div className="spinner-page">Loading polls…</div>;

  return (
    <div>
      {/* Create */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>Create a poll</h3>
        <p className="small muted" style={{ marginBottom: 16 }}>
          Shows as a pop-up on every student’s dashboard. Creating a new poll replaces any active one.
        </p>

        <label className="small muted" style={{ display: 'block', marginBottom: 6 }}>Question</label>
        <input className="input" value={question} onChange={e => setQuestion(e.target.value)}
          placeholder="What topic should I cover in the next webinar?" style={{ marginBottom: 16 }} />

        <label className="small muted" style={{ display: 'block', marginBottom: 6 }}>Options (2–4)</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {options.map((o, i) => (
            <div key={i} style={{ display: 'flex', gap: 8 }}>
              <input className="input" value={o} onChange={e => setOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`} />
              {options.length > 2 && (
                <button className="btn btn-ghost btn-sm" onClick={() => removeOption(i)} type="button">✕</button>
              )}
            </div>
          ))}
        </div>
        {options.length < 4 && (
          <button className="btn btn-ghost btn-sm" onClick={addOption} type="button" style={{ marginBottom: 16 }}>
            + Add option
          </button>
        )}

        <div>
          <button className="btn btn-primary" onClick={create} disabled={saving} type="button">
            {saving ? 'Publishing…' : 'Publish poll'}
          </button>
        </div>
      </div>

      {/* Existing polls */}
      {polls.length === 0 ? (
        <div className="empty-state">No polls yet. Create one above.</div>
      ) : (
        polls.map(p => {
          const total = p.options.reduce((s, o) => s + o.votes, 0);
          const pct = (v) => (total > 0 ? Math.round((v / total) * 100) : 0);
          return (
            <div key={p._id} className="card" style={{ marginBottom: 16, borderColor: p.isActive ? 'var(--accent)' : 'var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                    {p.isActive
                      ? <span className="badge badge-success">Live</span>
                      : <span className="badge badge-muted">Closed</span>}
                    <span className="small muted">{total} vote{total === 1 ? '' : 's'}</span>
                  </div>
                  <h3 style={{ fontSize: 16 }}>{p.question}</h3>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {p.isActive
                    ? <button className="btn btn-ghost btn-sm" onClick={() => close(p._id)}>Close</button>
                    : <button className="btn btn-ghost btn-sm" onClick={() => reopen(p._id)}>Reopen</button>}
                  <button className="btn btn-danger btn-sm" onClick={() => del(p._id)}>Delete</button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {p.options.map(o => (
                  <div key={o._id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6 }}>
                      <span>{o.text}</span>
                      <span className="small muted">{pct(o.votes)}% · {o.votes}</span>
                    </div>
                    <div className="poll-bar-track">
                      <div className="poll-bar-fill mine" style={{ width: `${pct(o.votes)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      {/* Student topic suggestions */}
      <h3 style={{ fontSize: 16, margin: '32px 0 4px' }}>
        Topic suggestions from students
        {suggestions.length > 0 && <span className="small muted"> · {suggestions.length}</span>}
      </h3>
      <p className="small muted" style={{ marginBottom: 16 }}>
        Free-text ideas students sent from their dashboard. Only you see these.
      </p>

      {suggestions.length === 0 ? (
        <div className="empty-state">No suggestions yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {suggestions.map(s => (
            <div key={s._id} className="card" style={{ opacity: s.reviewed ? 0.6 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14.5, marginBottom: 6 }}>{s.text}</p>
                  <p className="small muted">
                    {s.user?.name || 'Student'}
                    {s.user?.email ? ` · ${s.user.email}` : ''} ·{' '}
                    {new Date(s.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleReviewed(s._id)}>
                    {s.reviewed ? 'Unmark' : 'Mark read'}
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => delSuggestion(s._id)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
