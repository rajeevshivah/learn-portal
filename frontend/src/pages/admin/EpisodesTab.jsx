import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import Toast from '../../components/Toast';

const API = import.meta.env.VITE_API_URL;

const empty = { course: '', episodeNumber: 1, title: '', description: '', phase: '', youtubeUrl: '', duration: '', tags: '', isFreePreview: false };

export default function EpisodesTab() {
  const [courses, setCourses] = useState([]);
  const [filter, setFilter] = useState('');
  const [episodes, setEpisodes] = useState([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axios.get(`${API}/courses/all`).then(({ data }) => setCourses(data)).catch(() => {});
  }, []);

  const load = useCallback(() => {
    axios.get(`${API}/episodes/all${filter ? `?course=${filter}` : ''}`)
      .then(({ data }) => setEpisodes(data)).catch(() => setToast('Could not load episodes'));
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const startEdit = (ep) => {
    setEditId(ep._id);
    setForm({
      course: ep.course?._id || ep.course, episodeNumber: ep.episodeNumber,
      title: ep.title, description: ep.description || '', phase: ep.phase || '',
      youtubeUrl: ep.youtubeUrl || '', duration: ep.duration || '',
      tags: (ep.tags || []).join(', '), isFreePreview: ep.isFreePreview || false,
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async () => {
    if (!form.course || !form.title.trim()) { setToast('Course and title are required'); return; }
    setBusy(true);
    try {
      if (editId) await axios.put(`${API}/episodes/${editId}`, form);
      else        await axios.post(`${API}/episodes`, form);
      setToast(editId ? 'Episode updated' : 'Episode created (draft — publish when ready)');
      setForm(empty); setEditId(null); setShowForm(false);
      load();
    } catch (err) {
      setToast(err.response?.data?.message || 'Save failed');
    } finally { setBusy(false); }
  };

  const togglePublish = async (ep) => {
    try {
      await axios.put(`${API}/episodes/${ep._id}`, { isPublished: !ep.isPublished });
      load();
    } catch { setToast('Could not update'); }
  };

  const remove = async (ep) => {
    if (!window.confirm(`Delete episode #${ep.episodeNumber} "${ep.title}"? Files will also be removed.`)) return;
    try {
      await axios.delete(`${API}/episodes/${ep._id}`);
      setToast('Episode deleted'); load();
    } catch (err) { setToast(err.response?.data?.message || 'Delete failed'); }
  };

  const uploadFile = async (ep, file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('label', file.name);
    try {
      await axios.post(`${API}/episodes/${ep._id}/files`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setToast('File uploaded'); load();
    } catch (err) { setToast(err.response?.data?.message || 'Upload failed'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => { setShowForm(s => !s); setEditId(null); setForm({ ...empty, course: filter }); }}>
          {showForm && !editId ? 'Close form' : '+ New episode'}
        </button>
        <select className="select" style={{ maxWidth: 280 }} value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">All courses</option>
          {courses.map(c => <option key={c._id} value={c._id}>{c.title}</option>)}
        </select>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 22 }}>
          <h2 style={{ fontSize: 16, marginBottom: 14 }}>{editId ? 'Edit episode' : 'Create episode'}</h2>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '2fr 1fr' }}>
            <div className="field"><label className="label">Course *</label>
              <select className="select" value={form.course} onChange={e => set('course', e.target.value)}>
                <option value="">Select course…</option>
                {courses.map(c => <option key={c._id} value={c._id}>{c.title}</option>)}
              </select></div>
            <div className="field"><label className="label">Episode #</label>
              <input className="input" type="number" value={form.episodeNumber} onChange={e => set('episodeNumber', Number(e.target.value))} /></div>
          </div>
          <div className="field"><label className="label">Title *</label>
            <input className="input" value={form.title} onChange={e => set('title', e.target.value)} /></div>
          <div className="field"><label className="label">Description</label>
            <textarea className="textarea" value={form.description} onChange={e => set('description', e.target.value)} /></div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <div className="field"><label className="label">Phase</label>
              <input className="input" value={form.phase} onChange={e => set('phase', e.target.value)} placeholder="Phase 1 — Basics" /></div>
            <div className="field"><label className="label">Duration</label>
              <input className="input" value={form.duration} onChange={e => set('duration', e.target.value)} placeholder="12 min" /></div>
            <div className="field"><label className="label">Tags (comma separated)</label>
              <input className="input" value={form.tags} onChange={e => set('tags', e.target.value)} /></div>
          </div>
          <div className="field"><label className="label">YouTube URL (unlisted)</label>
            <input className="input" value={form.youtubeUrl} onChange={e => set('youtubeUrl', e.target.value)} placeholder="https://youtu.be/…" /></div>
          <label className="checkbox-row" style={{ marginBottom: 16 }}>
            <input type="checkbox" checked={form.isFreePreview} onChange={e => set('isFreePreview', e.target.checked)} />
            Free preview (watchable without purchase — use for first 2-3 episodes)
          </label>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : editId ? 'Update episode' : 'Create episode'}</button>
        </div>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>#</th><th>Episode</th><th>Course</th><th>Flags</th><th>Files</th><th>Actions</th></tr></thead>
          <tbody>
            {episodes.map(ep => (
              <tr key={ep._id}>
                <td style={{ fontWeight: 700 }}>{ep.episodeNumber}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{ep.title}</div>
                  <div className="small muted">{ep.phase}</div>
                </td>
                <td className="small">{ep.course?.title}</td>
                <td>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <button className={`badge ${ep.isPublished ? 'badge-success' : 'badge-muted'}`}
                      style={{ border: 'none', cursor: 'pointer' }} onClick={() => togglePublish(ep)}>
                      {ep.isPublished ? 'Published' : 'Draft'}
                    </button>
                    {ep.isFreePreview && <span className="badge badge-accent">Preview</span>}
                  </div>
                </td>
                <td>
                  <span className="small muted">{ep.files?.length || 0} file(s) · </span>
                  <label className="small" style={{ color: 'var(--accent)', cursor: 'pointer' }}>
                    Upload
                    <input type="file" hidden accept=".pdf,.doc,.docx,.pptx,.txt,.zip" onChange={e => uploadFile(ep, e.target.files[0])} />
                  </label>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(ep)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => remove(ep)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
