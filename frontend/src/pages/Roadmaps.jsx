import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL;

export default function Roadmaps() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [roadmaps, setRoadmaps] = useState([]);
  const [courses, setCourses]   = useState([]);
  const [events, setEvents]     = useState([]);
  const [promos, setPromos]     = useState([]);
  const [newR, setNewR]         = useState({ title:'', description:'', course:'' });
  const [creating, setCreating] = useState(false);
  const [uploadFor, setUploadFor] = useState(null);   // roadmap id currently uploading
  const [msg, setMsg]           = useState('');

  // ── New-promotion form state ──
  const emptyPromo = { kind:'course', course:'', event:'', headline:'', subtext:'', ctaLabel:'', scope:'all', roadmaps:[] };
  const [newP, setNewP]         = useState(emptyPromo);
  const [creatingP, setCreatingP] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'admin') { navigate('/courses'); return; }
    fetchAll();
  }, [user]);

  const fetchAll = () => {
    axios.get(`${API}/roadmaps`).then(r => setRoadmaps(r.data)).catch(console.error);
    axios.get(`${API}/courses/all`).then(r => setCourses(r.data)).catch(console.error);
    axios.get(`${API}/events`).then(r => setEvents(r.data)).catch(() => setEvents([]));
    axios.get(`${API}/promotions`).then(r => setPromos(r.data)).catch(() => setPromos([]));
  };

  // ─────────────────────── ROADMAP CRUD ───────────────────────
  const createRoadmap = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await axios.post(`${API}/roadmaps`, newR);
      setMsg('Roadmap created. Now upload its PDF below.');
      setNewR({ title:'', description:'', course:'' });
      fetchAll();
    } catch (err) {
      setMsg(err.response?.data?.message || 'Error creating roadmap');
    }
    setCreating(false);
  };

  const uploadPdf = async (id, file) => {
    if (!file) return;
    setUploadFor(id);
    const form = new FormData();
    form.append('file', file);
    try {
      const { data } = await axios.post(`${API}/roadmaps/${id}/pdf`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMsg(data.message || 'PDF uploaded');
      if (data.delivery && data.delivery !== 'ok') setCheck({ blocked: data.delivery === 'blocked' ? 1 : 0, broken: 1, hint: data.message, problems: [] });
      fetchAll();
    } catch (err) {
      setMsg(err.response?.data?.message || 'Upload failed');
    }
    setUploadFor(null);
  };

  // Are the files students download actually reachable? (Cloudinary can block PDFs.)
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const runCheck = async () => {
    setChecking(true);
    try { const { data } = await axios.get(`${API}/roadmaps/check-files`); setCheck(data); }
    catch (err) { setMsg(err.response?.data?.message || 'Could not check files'); }
    finally { setChecking(false); }
  };

  const linkCourse = async (id, courseId) => {
    await axios.put(`${API}/roadmaps/${id}`, { course: courseId || null });
    fetchAll();
  };

  const togglePublish = async (r) => {
    await axios.put(`${API}/roadmaps/${r._id}`, { isPublished: !r.isPublished });
    fetchAll();
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this roadmap? The shared link will stop working.')) return;
    await axios.delete(`${API}/roadmaps/${id}`);
    setMsg('Roadmap deleted');
    fetchAll();
  };

  const copyLink = (slug) => {
    const url = `https://learn.rajeevshivah.me/r/${slug}`;
    navigator.clipboard?.writeText(url);
    setMsg(`Copied: ${url}`);
  };

  // ─────────────────────── PROMOTION CRUD ───────────────────────
  const toggleRoadmapTarget = (id) => {
    setNewP(p => {
      const has = p.roadmaps.includes(id);
      return { ...p, roadmaps: has ? p.roadmaps.filter(x => x !== id) : [...p.roadmaps, id] };
    });
  };

  const createPromo = async (e) => {
    e.preventDefault();
    setCreatingP(true);
    try {
      const payload = { ...newP };
      if (payload.kind === 'course') { delete payload.event; }
      else { delete payload.course; }
      if (payload.scope === 'all') payload.roadmaps = [];
      await axios.post(`${API}/promotions`, payload);
      setMsg('Promotion created');
      setNewP(emptyPromo);
      fetchAll();
    } catch (err) {
      setMsg(err.response?.data?.message || 'Error creating promotion');
    }
    setCreatingP(false);
  };

  const togglePromoActive = async (p) => {
    await axios.put(`${API}/promotions/${p._id}`, { isActive: !p.isActive });
    fetchAll();
  };

  const changePromoOrder = async (p, delta) => {
    await axios.put(`${API}/promotions/${p._id}`, { order: (p.order || 0) + delta });
    fetchAll();
  };

  const removePromo = async (id) => {
    if (!window.confirm('Delete this promotion?')) return;
    await axios.delete(`${API}/promotions/${id}`);
    setMsg('Promotion deleted');
    fetchAll();
  };

  // Only upcoming, published events are worth promoting (past ones auto-hide anyway).
  const promotableEvents = events.filter(e => e.isPublished && !e.isCompleted);

  const describeTarget = (p) => {
    if (p.kind === 'course') return p.course ? `Course: ${p.course.title}` : 'Course (deleted)';
    if (p.event) return `Live program: ${p.event.title}${p.expired ? ' (ended, hidden)' : ''}`;
    return 'Live program (deleted)';
  };
  const describeScope = (p) => {
    if (p.scope === 'all') return 'All roadmap pages';
    const names = (p.roadmaps || []).map(r => r.title).filter(Boolean);
    return names.length ? `On: ${names.join(', ')}` : 'No roadmaps selected';
  };

  return (
    <div className="page">
      <div className="container section rmx">
        <div className="rmx-head">
          <div>
            <h1>Roadmaps</h1>
            <p className="muted">Free PDFs you share from Instagram and YouTube. Each one gets a public page with a download button, and shows whatever you’re promoting.</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin')}>Back to admin</button>
        </div>

        {msg && <div className="rmx-msg" role="status">{msg} <button className="tx-x" onClick={() => setMsg('')} aria-label="Dismiss">×</button></div>}

        {/* Download health */}
        <div className={`card rmx-check ${check && check.broken ? 'is-bad' : ''}`}>
          <div className="rmx-check-row">
            <div>
              <strong>Can students download the files?</strong>
              <div className="small muted">Checks every roadmap PDF and lesson file. Run it after uploading, or if someone says a download is empty.</div>
            </div>
            <button className="btn btn-ghost btn-sm" disabled={checking} onClick={runCheck}>{checking ? 'Checking…' : 'Check all files'}</button>
          </div>
          {check && (
            <div className="small" style={{ marginTop: 10 }}>
              {check.checked !== undefined && <div>{check.ok} of {check.checked} files download fine.</div>}
              {check.hint && <p className="rmx-hint">{check.hint}</p>}
              {check.problems?.length > 0 && (
                <ul className="rmx-problems">
                  {check.problems.map((pr, i) => <li key={i}><span className="badge badge-danger">{pr.status}</span> {pr.where}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* New roadmap */}
        <form className="card rmx-form" onSubmit={createRoadmap}>
          <h2>New roadmap</h2>
          <div className="field">
            <label className="label">Title</label>
            <input className="input" placeholder="e.g. Machine Learning Roadmap 2026" value={newR.title} onChange={e => setNewR({ ...newR, title: e.target.value })} required />
          </div>
          <div className="field">
            <label className="label">One or two lines shown under the title (optional)</label>
            <textarea className="textarea" rows={2} placeholder="Who it’s for and what it covers" value={newR.description} onChange={e => setNewR({ ...newR, description: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Link to a course (optional)</label>
            <select className="select" value={newR.course} onChange={e => setNewR({ ...newR, course: e.target.value })}>
              <option value="">Standalone, no course</option>
              {courses.map(c => <option key={c._id} value={c._id}>{c.title}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create roadmap'}</button>
        </form>

        {/* Roadmaps */}
        <div className="rmx-list">
          {roadmaps.map(r => (
            <article key={r._id} className="card rmx-item">
              <div className="rmx-item-head">
                <div style={{ minWidth: 0 }}>
                  <h3>{r.title}</h3>
                  <p className="small muted">{r.description || 'No description'}</p>
                </div>
                <button className={`badge ${r.isPublished ? 'badge-success' : 'badge-warning'} rmx-toggle`} onClick={() => togglePublish(r)} title="Click to switch">
                  {r.isPublished ? 'Live' : 'Hidden'}
                </button>
              </div>
              <div className="rmx-stats">
                <span><strong>{(r.views || 0).toLocaleString('en-IN')}</strong> views</span>
                <span><strong>{(r.downloads || 0).toLocaleString('en-IN')}</strong> downloads</span>
                <span>{r.pdfUrl ? <a href={r.pdfUrl} target="_blank" rel="noreferrer">PDF uploaded</a> : <span style={{ color: 'var(--warning)' }}>No PDF yet</span>}</span>
              </div>
              <div className="rmx-link">
                <code>learn.rajeevshivah.me/r/{r.slug}</code>
                <button className="btn btn-ghost btn-sm" onClick={() => copyLink(r.slug)}>Copy link</button>
                <a className="btn btn-ghost btn-sm" href={`/r/${r.slug}`} target="_blank" rel="noreferrer">Preview</a>
              </div>
              <div className="rmx-controls">
                <label className="small">
                  <span className="label">{r.pdfUrl ? 'Replace the PDF' : 'Upload the PDF'}</span>
                  <input type="file" accept=".pdf" disabled={uploadFor === r._id} onChange={e => uploadPdf(r._id, e.target.files[0])} />
                  {uploadFor === r._id && <span className="muted"> Uploading…</span>}
                </label>
                <label className="small">
                  <span className="label">Linked course</span>
                  <select className="select" value={r.course?._id || ''} onChange={e => linkCourse(r._id, e.target.value)}>
                    <option value="">Standalone</option>
                    {courses.map(c => <option key={c._id} value={c._id}>{c.title}</option>)}
                  </select>
                </label>
                <button className="btn btn-danger btn-sm rmx-delete" onClick={() => remove(r._id)}>Delete</button>
              </div>
            </article>
          ))}
          {roadmaps.length === 0 && <div className="empty-state">No roadmaps yet. Create one above.</div>}
        </div>

        {/* Promotions */}
        <div className="rmx-head" style={{ marginTop: 40 }}>
          <div>
            <h1 style={{ fontSize: 26 }}>Promotions on roadmap pages</h1>
            <p className="muted">Show a course or a live program to everyone who opens a roadmap. Past programs hide themselves.</p>
          </div>
        </div>

        <form className="card rmx-form" onSubmit={createPromo}>
          <h2>New promotion</h2>
          <div className="field">
            <label className="label">What to promote</label>
            <div className="tabs" style={{ margin: 0 }}>
              <button type="button" className={`tab ${newP.kind === 'course' ? 'active' : ''}`} onClick={() => setNewP({ ...newP, kind: 'course', event: '' })}>A course</button>
              <button type="button" className={`tab ${newP.kind === 'event' ? 'active' : ''}`} onClick={() => setNewP({ ...newP, kind: 'event', course: '' })}>A live program</button>
            </div>
          </div>
          {newP.kind === 'course' ? (
            <div className="field">
              <label className="label">Which course</label>
              <select className="select" value={newP.course} required onChange={e => setNewP({ ...newP, course: e.target.value })}>
                <option value="">Select a course</option>
                {courses.map(c => <option key={c._id} value={c._id}>{c.title}{c.isPublished ? '' : ' (draft)'}</option>)}
              </select>
            </div>
          ) : (
            <div className="field">
              <label className="label">Which program</label>
              <select className="select" value={newP.event} required onChange={e => setNewP({ ...newP, event: e.target.value })}>
                <option value="">Select a program</option>
                {promotableEvents.map(ev => <option key={ev._id} value={ev._id}>{ev.title}</option>)}
              </select>
              {promotableEvents.length === 0 && <p className="small" style={{ color: 'var(--warning)', marginTop: 6 }}>No upcoming published programs. Publish one first.</p>}
            </div>
          )}
          <div className="rmx-two">
            <div className="field">
              <label className="label">Headline (optional)</label>
              <input className="input" placeholder="Leave blank to use its own title" value={newP.headline} onChange={e => setNewP({ ...newP, headline: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">Button text (optional)</label>
              <input className="input" placeholder={newP.kind === 'course' ? 'Explore the course' : 'Register now'} value={newP.ctaLabel} onChange={e => setNewP({ ...newP, ctaLabel: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label className="label">One line under the headline (optional)</label>
            <input className="input" value={newP.subtext} onChange={e => setNewP({ ...newP, subtext: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Where it shows</label>
            <div className="tabs" style={{ margin: 0 }}>
              <button type="button" className={`tab ${newP.scope === 'all' ? 'active' : ''}`} onClick={() => setNewP({ ...newP, scope: 'all' })}>All roadmap pages</button>
              <button type="button" className={`tab ${newP.scope === 'selected' ? 'active' : ''}`} onClick={() => setNewP({ ...newP, scope: 'selected' })}>Chosen roadmaps</button>
            </div>
            {newP.scope === 'selected' && (
              <div className="tf-chips" style={{ marginTop: 10 }}>
                {roadmaps.map(r => (
                  <button type="button" key={r._id} className={`tf-chip ${newP.roadmaps.includes(r._id) ? 'on' : ''}`} aria-pressed={newP.roadmaps.includes(r._id)} onClick={() => toggleRoadmapTarget(r._id)}>{r.title}</button>
                ))}
                {roadmaps.length === 0 && <p className="small muted">Create a roadmap first.</p>}
              </div>
            )}
          </div>
          <button className="btn btn-primary" type="submit" disabled={creatingP}>{creatingP ? 'Creating…' : 'Create promotion'}</button>
        </form>

        <div className="rmx-list">
          {promos.map(p => (
            <article key={p._id} className="card rmx-item" style={{ opacity: p.isActive ? 1 : 0.6 }}>
              <div className="rmx-item-head">
                <div style={{ minWidth: 0 }}>
                  <h3>{p.headline || describeTarget(p)}</h3>
                  <p className="small muted">{describeTarget(p)}</p>
                  <p className="small muted">{describeScope(p)}</p>
                  {p.expired && <p className="small" style={{ color: 'var(--warning)' }}>This program has ended, so it’s hidden from every page.</p>}
                </div>
                <button className={`badge ${p.isActive ? 'badge-success' : 'badge-muted'} rmx-toggle`} onClick={() => togglePromoActive(p)} title="Click to switch">{p.isActive ? 'Showing' : 'Off'}</button>
              </div>
              <div className="rmx-link">
                <button className="btn btn-ghost btn-sm" onClick={() => changePromoOrder(p, -1)}>Move up</button>
                <button className="btn btn-ghost btn-sm" onClick={() => changePromoOrder(p, 1)}>Move down</button>
                <span className="small muted">Position {p.order || 0}</span>
                <button className="btn btn-danger btn-sm rmx-delete" onClick={() => removePromo(p._id)}>Delete</button>
              </div>
            </article>
          ))}
          {promos.length === 0 && <div className="empty-state">No promotions yet.</div>}
        </div>
      </div>
    </div>
  );
}
