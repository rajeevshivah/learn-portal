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
  const [newR, setNewR]         = useState({ title:'', description:'', course:'' });
  const [creating, setCreating] = useState(false);
  const [uploadFor, setUploadFor] = useState(null);   // roadmap id currently uploading
  const [msg, setMsg]           = useState('');

  useEffect(() => {
    if (!user || user.role !== 'admin') { navigate('/courses'); return; }
    fetchAll();
  }, [user]);

  const fetchAll = () => {
    axios.get(`${API}/roadmaps`).then(r => setRoadmaps(r.data)).catch(console.error);
    axios.get(`${API}/courses/all`).then(r => setCourses(r.data)).catch(console.error);
  };

  const createRoadmap = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await axios.post(`${API}/roadmaps`, newR);
      setMsg('Roadmap created ✓ — now upload its PDF below');
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
      await axios.post(`${API}/roadmaps/${id}/pdf`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMsg('PDF uploaded ✓');
      fetchAll();
    } catch (err) {
      setMsg(err.response?.data?.message || 'Upload failed');
    }
    setUploadFor(null);
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

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <div style={s.brand} onClick={() => navigate('/courses')}>
          <span style={{color:'#4A9EFF',fontWeight:700}}>codeWith</span><span style={{color:'#fff',fontWeight:700}}>Shivah</span>
          <span style={s.sub}>roadmaps</span>
        </div>
        <button style={s.adminBtn} onClick={() => navigate('/admin')}>← Admin</button>
      </nav>

      <div style={s.content}>
        <h1 style={s.title}>Roadmaps</h1>
        <p style={s.subtitle}>Shareable lead-magnet PDFs for Instagram &amp; YouTube. Each gets a public funnel page.</p>

        {msg && <div style={s.msg}>{msg} <span style={s.closeMsg} onClick={() => setMsg('')}>✕</span></div>}

        {/* create */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>New roadmap</h2>
          <form onSubmit={createRoadmap}>
            <div style={s.field}>
              <label style={s.label}>Title</label>
              <input style={s.input} placeholder="e.g. Machine Learning Roadmap 2026"
                value={newR.title} onChange={e => setNewR({...newR, title: e.target.value})} required />
            </div>
            <div style={s.field}>
              <label style={s.label}>Description (shown on the funnel page)</label>
              <textarea style={{...s.input, height:'64px', resize:'vertical'}}
                placeholder="One or two lines on what this roadmap covers"
                value={newR.description} onChange={e => setNewR({...newR, description: e.target.value})} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Link to a course (optional)</label>
              <select style={s.input} value={newR.course} onChange={e => setNewR({...newR, course: e.target.value})}>
                <option value="">— Standalone (no course) —</option>
                {courses.map(c => <option key={c._id} value={c._id}>{c.title}</option>)}
              </select>
            </div>
            <button style={s.btn} type="submit" disabled={creating}>
              {creating ? 'Creating...' : 'Create roadmap'}
            </button>
          </form>
        </div>

        {/* list */}
        {roadmaps.map(r => (
          <div key={r._id} style={s.card}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'10px' }}>
              <div>
                <h3 style={{ color:'#fff', fontSize:'18px', fontWeight:600 }}>{r.title}</h3>
                <p style={{ color:'#6B8CAE', fontSize:'13px', marginTop:'4px' }}>{r.description || 'No description'}</p>
              </div>
              <span style={{ ...s.badge, background: r.isPublished ? '#0F2318':'#2a1a00', color: r.isPublished ? '#4CAF7D':'#FF9F45' }}
                onClick={() => togglePublish(r)}>
                {r.isPublished ? 'Live' : 'Hidden'}
              </span>
            </div>

            <div style={s.statsRow}>
              <span>👁 {r.views || 0} views</span>
              <span>⬇ {r.downloads || 0} downloads</span>
            </div>

            <div style={s.linkRow}>
              <code style={s.code}>learn.rajeevshivah.me/r/{r.slug}</code>
              <button style={s.smallBtn} onClick={() => copyLink(r.slug)}>Copy</button>
              <a style={{...s.smallBtn, textDecoration:'none', display:'inline-block'}} href={`/r/${r.slug}`} target="_blank" rel="noreferrer">Preview</a>
            </div>

            <div style={s.controlRow}>
              <div>
                <label style={s.miniLabel}>PDF</label>
                {r.pdfUrl
                  ? <a href={r.pdfUrl} target="_blank" rel="noreferrer" style={{ color:'#4CAF7D', fontSize:'13px' }}>📄 uploaded</a>
                  : <span style={{ color:'#FF9F45', fontSize:'13px' }}>none yet</span>}
                <input type="file" accept=".pdf" style={{ display:'block', marginTop:'6px', color:'#8899AA', fontSize:'12px' }}
                  disabled={uploadFor === r._id}
                  onChange={e => uploadPdf(r._id, e.target.files[0])} />
              </div>
              <div>
                <label style={s.miniLabel}>Linked course</label>
                <select style={{...s.input, marginBottom:0}} value={r.course?._id || ''}
                  onChange={e => linkCourse(r._id, e.target.value)}>
                  <option value="">— Standalone —</option>
                  {courses.map(c => <option key={c._id} value={c._id}>{c.title}</option>)}
                </select>
              </div>
            </div>

            <button style={{...s.smallBtn, background:'#2a1a1a', color:'#FF7070', marginTop:'14px'}} onClick={() => remove(r._id)}>
              Delete roadmap
            </button>
          </div>
        ))}
        {roadmaps.length === 0 && <p style={s.muted}>No roadmaps yet. Create one above.</p>}
      </div>
    </div>
  );
}

const s = {
  page: { minHeight:'100vh', background:'#0a0f1e', fontFamily:'Arial, sans-serif' },
  nav: { background:'#111827', borderBottom:'1px solid #1e3a5f', padding:'14px 32px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:10 },
  brand: { display:'flex', alignItems:'center', gap:'4px', fontSize:'18px', cursor:'pointer' },
  sub: { color:'#4A6A8A', fontSize:'13px', marginLeft:'8px' },
  adminBtn: { background:'#1e3a5f', color:'#4A9EFF', border:'none', padding:'6px 14px', borderRadius:'6px', cursor:'pointer', fontSize:'13px' },
  content: { maxWidth:'820px', margin:'0 auto', padding:'40px 24px' },
  title: { color:'#fff', fontSize:'28px', fontWeight:700, marginBottom:'6px' },
  subtitle: { color:'#6B8CAE', fontSize:'14px', marginBottom:'24px' },
  msg: { background:'#1e3a5f', color:'#cfe', padding:'10px 14px', borderRadius:'8px', marginBottom:'18px', fontSize:'14px', display:'flex', justifyContent:'space-between' },
  closeMsg: { cursor:'pointer', color:'#8fb' },
  card: { background:'#111827', border:'1px solid #1e3a5f', borderRadius:'12px', padding:'22px', marginBottom:'18px' },
  cardTitle: { color:'#fff', fontSize:'17px', fontWeight:600, marginBottom:'16px' },
  field: { marginBottom:'14px' },
  label: { display:'block', color:'#8899AA', fontSize:'13px', marginBottom:'6px' },
  miniLabel: { display:'block', color:'#6B8CAE', fontSize:'12px', marginBottom:'4px' },
  input: { width:'100%', padding:'10px 12px', background:'#0a0f1e', border:'1px solid #1e3a5f', borderRadius:'8px', color:'#fff', fontSize:'14px', outline:'none', marginBottom:'0' },
  btn: { width:'100%', background:'#4A9EFF', color:'#fff', border:'none', padding:'12px', borderRadius:'8px', cursor:'pointer', fontSize:'15px', fontWeight:600 },
  smallBtn: { background:'#1e3a5f', color:'#4A9EFF', border:'none', padding:'7px 12px', borderRadius:'6px', cursor:'pointer', fontSize:'12px', fontWeight:600 },
  badge: { fontSize:'12px', padding:'4px 12px', borderRadius:'20px', fontWeight:600, cursor:'pointer' },
  statsRow: { display:'flex', gap:'18px', color:'#8899AA', fontSize:'13px', margin:'14px 0' },
  linkRow: { display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap', background:'#0a0f1e', border:'1px solid #1e3a5f', borderRadius:'8px', padding:'10px 12px', marginBottom:'14px' },
  code: { color:'#4A9EFF', fontFamily:'monospace', fontSize:'13px', flex:1, minWidth:'200px' },
  controlRow: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' },
  muted: { color:'#6B8CAE', textAlign:'center', marginTop:'30px' },
};
