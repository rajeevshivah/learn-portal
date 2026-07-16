import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import Toast from '../../components/Toast';

const API = import.meta.env.VITE_API_URL;

const empty = {
  title: '', description: '', thumbnail: '', level: 'Beginner', language: 'Hinglish',
  isPaid: false, price: 0, mrp: 0, accessDays: 0, phases: '', whatYouLearn: '', order: 0, isPublished: false,
};

export default function CoursesTab() {
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    axios.get(`${API}/courses/all`).then(({ data }) => setCourses(data)).catch(() => setToast('Could not load courses'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const startEdit = (c) => {
    setEditId(c._id);
    setForm({
      title: c.title, description: c.description, thumbnail: c.thumbnail,
      level: c.level || 'Beginner', language: c.language || 'Hinglish',
      isPaid: c.isPaid, price: c.price, mrp: c.mrp || 0, accessDays: c.accessDays || 0,
      phases: (c.phases || []).join('\n'),
      whatYouLearn: (c.whatYouLearn || []).join('\n'),
      order: c.order, isPublished: c.isPublished,
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async () => {
    if (!form.title.trim()) { setToast('Title is required'); return; }
    setBusy(true);
    const payload = {
      ...form,
      price: Number(form.price) || 0,
      mrp: Number(form.mrp) || 0,
      accessDays: Number(form.accessDays) || 0,
      order: Number(form.order) || 0,
      phases: form.phases.split('\n').map(s => s.trim()).filter(Boolean),
      whatYouLearn: form.whatYouLearn.split('\n').map(s => s.trim()).filter(Boolean),
    };
    try {
      if (editId) await axios.put(`${API}/courses/${editId}`, payload);
      else        await axios.post(`${API}/courses`, payload);
      setToast(editId ? 'Course updated' : 'Course created');
      setForm(empty); setEditId(null); setShowForm(false);
      load();
    } catch (err) {
      setToast(err.response?.data?.message || 'Save failed');
    } finally { setBusy(false); }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete "${c.title}"? Episodes must be removed first.`)) return;
    try {
      await axios.delete(`${API}/courses/${c._id}`);
      setToast('Course deleted'); load();
    } catch (err) {
      setToast(err.response?.data?.message || 'Delete failed');
    }
  };

  const uploadRoadmap = async (c, file) => {
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try {
      await axios.post(`${API}/courses/${c._id}/roadmap`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setToast('Roadmap PDF uploaded'); load();
    } catch (err) {
      setToast(err.response?.data?.message || 'Upload failed');
    }
  };

  return (
    <div>
      <button className="btn btn-primary" style={{ marginBottom: 18 }}
        onClick={() => { setShowForm(s => !s); setEditId(null); setForm(empty); }}>
        {showForm && !editId ? 'Close form' : '+ New course'}
      </button>

      {showForm && (
        <div className="card" style={{ marginBottom: 22 }}>
          <h2 style={{ fontSize: 16, marginBottom: 14 }}>{editId ? 'Edit course' : 'Create course'}</h2>
          <div className="field"><label className="label">Title *</label>
            <input className="input" value={form.title} onChange={e => set('title', e.target.value)} /></div>
          <div className="field"><label className="label">Description</label>
            <textarea className="textarea" value={form.description} onChange={e => set('description', e.target.value)} /></div>
          <div className="field"><label className="label">Thumbnail URL</label>
            <input className="input" value={form.thumbnail} onChange={e => set('thumbnail', e.target.value)} placeholder="https://…" /></div>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <div className="field"><label className="label">Level</label>
              <select className="select" value={form.level} onChange={e => set('level', e.target.value)}>
                <option>Beginner</option><option>Intermediate</option><option>Advanced</option>
              </select></div>
            <div className="field"><label className="label">Language</label>
              <input className="input" value={form.language} onChange={e => set('language', e.target.value)} /></div>
            <div className="field"><label className="label">Order</label>
              <input className="input" type="number" value={form.order} onChange={e => set('order', e.target.value)} /></div>
          </div>

          <hr className="divider" />
          <label className="checkbox-row" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={form.isPaid} onChange={e => set('isPaid', e.target.checked)} />
            This is a paid course
          </label>
          {form.isPaid && (
            <>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
                <div className="field"><label className="label">Price (₹) *</label>
                  <input className="input" type="number" value={form.price} onChange={e => set('price', e.target.value)} /></div>
                <div className="field"><label className="label">MRP (strike-through, optional)</label>
                  <input className="input" type="number" value={form.mrp} onChange={e => set('mrp', e.target.value)} /></div>
              </div>
              <div className="field">
                <label className="label">Access validity</label>
                <select className="select" value={String(form.accessDays)} onChange={e => set('accessDays', Number(e.target.value))}>
                  <option value="0">Lifetime access</option>
                  <option value="90">90 days</option>
                  <option value="180">6 months (180 days)</option>
                  <option value="365">1 year (365 days)</option>
                </select>
                <p className="small muted" style={{ marginTop: 5 }}>Countdown starts when you approve the payment. Existing students are not affected by later changes.</p>
              </div>
            </>
          )}

          <div className="field"><label className="label">What you'll learn (one per line)</label>
            <textarea className="textarea" value={form.whatYouLearn} onChange={e => set('whatYouLearn', e.target.value)} placeholder={'Build 100 programs from scratch\nCrack basic coding rounds'} /></div>
          <div className="field"><label className="label">Phases (one per line, in order)</label>
            <textarea className="textarea" value={form.phases} onChange={e => set('phases', e.target.value)} placeholder={'Phase 1 — Basics\nPhase 2 — Logic building'} /></div>

          <label className="checkbox-row" style={{ marginBottom: 16 }}>
            <input type="checkbox" checked={form.isPublished} onChange={e => set('isPublished', e.target.checked)} />
            Published (visible to students)
          </label>

          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : editId ? 'Update course' : 'Create course'}</button>
        </div>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Course</th><th>Pricing</th><th>Status</th><th>Roadmap PDF</th><th>Actions</th></tr></thead>
          <tbody>
            {courses.map(c => (
              <tr key={c._id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{c.title}</div>
                  <div className="small muted">/{c.slug}</div>
                </td>
                <td>
                  {c.isPaid ? <span className="badge badge-warning">₹{c.price}</span> : <span className="badge badge-accent">Free</span>}
                  {c.isPaid && <div className="small muted" style={{ marginTop: 3 }}>{c.accessDays > 0 ? `${c.accessDays} days` : 'Lifetime'}</div>}
                </td>
                <td>{c.isPublished ? <span className="badge badge-success">Published</span> : <span className="badge badge-muted">Draft</span>}</td>
                <td>
                  {c.roadmapPdfUrl && <a className="small" href={c.roadmapPdfUrl} target="_blank" rel="noreferrer">View · </a>}
                  <label className="small" style={{ color: 'var(--accent)', cursor: 'pointer' }}>
                    {c.roadmapPdfUrl ? 'Replace' : 'Upload'}
                    <input type="file" accept=".pdf" hidden onChange={e => uploadRoadmap(c, e.target.files[0])} />
                  </label>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(c)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => remove(c)}>Delete</button>
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
