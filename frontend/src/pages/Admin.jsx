import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL;

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses]     = useState([]);
  const [activeCourse, setActiveCourse] = useState('');   // course _id currently being managed
  const [episodes, setEpisodes]   = useState([]);
  const [selected, setSelected]   = useState(null);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating]   = useState(false);
  const [newEp, setNewEp]         = useState({ episodeNumber:'', title:'', description:'', phase:'Phase 1 — Python Basics', youtubeUrl:'', duration:'' });
  const [fileData, setFileData]   = useState({ label:'', fileType:'pdf', file: null });
  const [newCourse, setNewCourse] = useState({ title:'', description:'' });
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [newPhase, setNewPhase]   = useState('');
  const [msg, setMsg]             = useState('');

  // the course object currently selected (for reading its phases)
  const activeCourseObj = courses.find(c => c._id === activeCourse);

  useEffect(() => {
    if (!user || user.role !== 'admin') { navigate('/courses'); return; }
    fetchCourses();
  }, [user]);

  useEffect(() => {
    if (activeCourse) fetchEpisodes();
    else setEpisodes([]);
    setSelected(null);
  }, [activeCourse]);

  // When the selected course changes, default the new-episode phase
  // to that course's first phase (or blank if it has none yet).
  useEffect(() => {
    const c = courses.find(c => c._id === activeCourse);
    const firstPhase = c?.phases?.[0] || '';
    setNewEp(prev => ({ ...prev, phase: firstPhase }));
  }, [activeCourse, courses]);

  // Add a phase to the active course
  const addPhase = async () => {
    const label = newPhase.trim();
    if (!label || !activeCourseObj) return;
    if (activeCourseObj.phases?.includes(label)) {
      setMsg('That phase already exists in this course');
      return;
    }
    const updated = [...(activeCourseObj.phases || []), label];
    await axios.put(`${API}/courses/${activeCourse}`, { phases: updated });
    setNewPhase('');
    await fetchCourses();
  };

  // Remove a phase from the active course
  const removePhase = async (label) => {
    if (!activeCourseObj) return;
    const updated = (activeCourseObj.phases || []).filter(p => p !== label);
    await axios.put(`${API}/courses/${activeCourse}`, { phases: updated });
    await fetchCourses();
  };

  const fetchCourses = () => {
    axios.get(`${API}/courses/all`).then(r => {
      setCourses(r.data);
      // default to the first course if none selected
      setActiveCourse(prev => prev || (r.data[0]?._id || ''));
    }).catch(console.error);
  };

  const fetchEpisodes = () => {
    axios.get(`${API}/episodes/all`, { params: { course: activeCourse } })
      .then(r => setEpisodes(r.data)).catch(console.error);
  };

  const createCourse = async (e) => {
    e.preventDefault();
    setCreatingCourse(true);
    try {
      const r = await axios.post(`${API}/courses`, newCourse);
      setMsg('Course created ✓ — remember to Publish it');
      setNewCourse({ title:'', description:'' });
      await fetchCourses();
      setActiveCourse(r.data._id);
    } catch (err) {
      setMsg(err.response?.data?.message || 'Error creating course');
    }
    setCreatingCourse(false);
  };

  const togglePublishCourse = async (course) => {
    await axios.put(`${API}/courses/${course._id}`, { isPublished: !course.isPublished });
    fetchCourses();
  };

  const createEpisode = async (e) => {
    e.preventDefault();
    if (!activeCourse) { setMsg('Select or create a course first'); return; }
    setCreating(true);
    try {
      await axios.post(`${API}/episodes`, { ...newEp, course: activeCourse });
      setMsg('Episode created ✓');
      setNewEp({ episodeNumber:'', title:'', description:'', phase: activeCourseObj?.phases?.[0] || '', youtubeUrl:'', duration:'' });
      fetchEpisodes();
    } catch (err) {
      setMsg(err.response?.data?.message || 'Error creating episode');
    }
    setCreating(false);
  };

  const uploadFile = async (e) => {
    e.preventDefault();
    if (!selected || !fileData.file) return;
    setUploading(true);
    const form = new FormData();
    form.append('file',     fileData.file);
    form.append('label',    fileData.label || fileData.file.name);
    form.append('fileType', fileData.fileType);
    try {
      await axios.post(`${API}/episodes/${selected._id}/files`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setMsg('File uploaded ✓');
      setFileData({ label:'', fileType:'pdf', file: null });
      const updated = await axios.get(`${API}/episodes/all`, { params: { course: activeCourse } });
      setEpisodes(updated.data);
      const updatedEp = updated.data.find(ep => ep._id === selected._id);
      if (updatedEp) setSelected(updatedEp);
    } catch (err) {
      setMsg(err.response?.data?.message || 'Upload error');
    }
    setUploading(false);
  };

  const deleteFile = async (fileId) => {
    if (!confirm('Delete this file?')) return;
    await axios.delete(`${API}/episodes/${selected._id}/files/${fileId}`);
    const updated = await axios.get(`${API}/episodes/all`, { params: { course: activeCourse } });
    setEpisodes(updated.data);
    const updatedEp = updated.data.find(ep => ep._id === selected._id);
    if (updatedEp) setSelected(updatedEp);
  };

  const togglePublish = async (ep) => {
    await axios.put(`${API}/episodes/${ep._id}`, { isPublished: !ep.isPublished });
    fetchEpisodes();
    setSelected(prev => prev?._id === ep._id ? {...prev, isPublished: !ep.isPublished} : prev);
  };

  return (
    <div style={s.page}>
      <div style={s.content}>
        <div style={s.header}>
          <h1 style={s.title}>Admin Panel</h1>
          <div style={{ display:'flex', gap:'10px' }}>
            <button style={s.backBtn} onClick={() => navigate('/admin/roadmaps')}>🗺 Roadmaps</button>
            <button style={s.backBtn} onClick={() => navigate('/admin/analytics')}>📊 Analytics</button>
            <button style={s.backBtn} onClick={() => navigate('/courses')}>← Back to portal</button>
          </div>
        </div>

        {msg && (
          <div style={s.msg}>
            {msg}
            <button style={s.closeMsg} onClick={() => setMsg('')}>✕</button>
          </div>
        )}

        {/* COURSE MANAGEMENT */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>Courses</h2>
          <div style={{ display:'flex', gap:'10px', flexWrap:'wrap', marginBottom:'16px' }}>
            {courses.map(c => (
              <div key={c._id}
                onClick={() => setActiveCourse(c._id)}
                style={{
                  ...s.coursePill,
                  background: activeCourse === c._id ? '#1e3a5f' : '#0a0f1e',
                  borderColor: activeCourse === c._id ? '#4A9EFF' : '#1e3a5f',
                }}>
                <span style={{ color: activeCourse === c._id ? '#4A9EFF' : '#ccc', fontSize:'13px', fontWeight:600 }}>
                  {c.title}
                </span>
                <span
                  onClick={(e) => { e.stopPropagation(); togglePublishCourse(c); }}
                  style={{ ...s.pubBadge, marginLeft:'8px', background: c.isPublished ? '#0F2318' : '#2a1a00', color: c.isPublished ? '#4CAF7D' : '#FF9F45' }}>
                  {c.isPublished ? 'Live' : 'Draft'}
                </span>
              </div>
            ))}
            {courses.length === 0 && <p style={{ color:'#4A6A8A', fontSize:'13px' }}>No courses yet. Create one below.</p>}
          </div>

          <form onSubmit={createCourse} style={{ display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'flex-end' }}>
            <div style={{ ...s.field, flex:'1 1 200px', marginBottom:0 }}>
              <label style={s.label}>New course title</label>
              <input style={s.input} placeholder="e.g. MERN Stack" value={newCourse.title}
                onChange={e => setNewCourse({ ...newCourse, title: e.target.value })} required />
            </div>
            <div style={{ ...s.field, flex:'2 1 280px', marginBottom:0 }}>
              <label style={s.label}>Description</label>
              <input style={s.input} placeholder="Short description" value={newCourse.description}
                onChange={e => setNewCourse({ ...newCourse, description: e.target.value })} />
            </div>
            <button style={{ ...s.btn, width:'auto', padding:'8px 18px' }} type="submit" disabled={creatingCourse}>
              {creatingCourse ? 'Creating...' : '+ Course'}
            </button>
          </form>

          {/* PHASES of the selected course */}
          {activeCourseObj && (
            <div style={{ marginTop:'20px', borderTop:'1px solid #1e3a5f', paddingTop:'16px' }}>
              <label style={s.label}>Phases / Modules for "{activeCourseObj.title}"</label>
              <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', margin:'10px 0' }}>
                {(activeCourseObj.phases || []).map(p => (
                  <span key={p} style={s.phaseChip}>
                    {p}
                    <span style={s.phaseX} onClick={() => removePhase(p)} title="Remove phase">✕</span>
                  </span>
                ))}
                {(!activeCourseObj.phases || activeCourseObj.phases.length === 0) && (
                  <span style={{ color:'#FF9F45', fontSize:'13px' }}>
                    No phases yet — add at least one before creating episodes.
                  </span>
                )}
              </div>
              <div style={{ display:'flex', gap:'8px', maxWidth:'480px' }}>
                <input
                  style={{ ...s.input, marginBottom:0 }}
                  placeholder="e.g. Phase 1 — Fundamentals"
                  value={newPhase}
                  onChange={e => setNewPhase(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPhase(); } }}
                />
                <button type="button" style={{ ...s.btn, width:'auto', padding:'8px 16px' }} onClick={addPhase}>
                  + Phase
                </button>
              </div>
              <p style={{ color:'#4A6A8A', fontSize:'12px', marginTop:'8px' }}>
                Removing a phase here won't delete episodes already using it; reassign those episodes' phase if needed.
              </p>
            </div>
          )}
        </div>

        <div style={s.grid}>
          {/* LEFT */}
          <div>
            <div style={s.card}>
              <h2 style={s.cardTitle}>Create Episode {courses.find(c=>c._id===activeCourse) ? `— ${courses.find(c=>c._id===activeCourse).title}` : ''}</h2>
              <form onSubmit={createEpisode}>
                {[
                  ['Episode #',   'episodeNumber', 'number', '1'],
                  ['Title',       'title',         'text',   'How Python Works'],
                  ['YouTube URL', 'youtubeUrl',    'text',   'https://youtube.com/...'],
                  ['Duration',    'duration',      'text',   '18 min'],
                ].map(([label, key, type, ph]) => (
                  <div key={key} style={s.field}>
                    <label style={s.label}>{label}</label>
                    <input style={s.input} type={type} placeholder={ph}
                      value={newEp[key]}
                      onChange={e => setNewEp({...newEp, [key]: e.target.value})}
                      required={key === 'title' || key === 'episodeNumber'} />
                  </div>
                ))}
                <div style={s.field}>
                  <label style={s.label}>Phase</label>
                  {activeCourseObj?.phases?.length > 0 ? (
                    <select style={s.input} value={newEp.phase} onChange={e => setNewEp({...newEp, phase: e.target.value})}>
                      {activeCourseObj.phases.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  ) : (
                    <p style={{ color:'#FF9F45', fontSize:'13px', padding:'8px 0' }}>
                      Add a phase above before creating episodes for this course.
                    </p>
                  )}
                </div>
                <div style={s.field}>
                  <label style={s.label}>Description</label>
                  <textarea style={{...s.input, height:'70px', resize:'vertical'}}
                    value={newEp.description}
                    onChange={e => setNewEp({...newEp, description: e.target.value})} />
                </div>
                <button style={s.btn} type="submit" disabled={creating || !(activeCourseObj?.phases?.length > 0)}>
                  {creating ? 'Creating...' : 'Create Episode'}
                </button>
              </form>
            </div>

            <div style={s.card}>
              <h2 style={s.cardTitle}>All Episodes ({episodes.length})</h2>
              {episodes.length === 0 && (
                <p style={{color:'#4A6A8A', fontSize:'13px'}}>No episodes yet. Create one above.</p>
              )}
              {episodes.map(ep => (
                <div key={ep._id}
                  style={{...s.epRow, background: selected?._id === ep._id ? '#1e3a5f33' : 'transparent', border: selected?._id === ep._id ? '1px solid #1e3a5f' : '1px solid transparent'}}
                  onClick={() => setSelected(ep)}>
                  <div>
                    <span style={s.epNum}>Ep {ep.episodeNumber}</span>
                    <span style={s.epTitle}>{ep.title}</span>
                  </div>
                  <div style={s.epActions}>
                    <span style={{...s.pubBadge, background: ep.isPublished ? '#0F2318' : '#2a1a00', color: ep.isPublished ? '#4CAF7D' : '#FF9F45'}}
                      onClick={e => { e.stopPropagation(); togglePublish(ep); }}>
                      {ep.isPublished ? 'Published' : 'Draft'}
                    </span>
                    <span style={s.filesBadge}>{ep.files?.length} files</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT */}
          <div>
            {selected ? (
              <div style={s.card}>
                <h2 style={s.cardTitle}>Ep {selected.episodeNumber} — {selected.title}</h2>

                <form onSubmit={uploadFile} style={s.uploadForm}>
                  <div style={s.field}>
                    <label style={s.label}>File label (what students see)</label>
                    <input style={s.input} placeholder="e.g. Class Notes, Practice Tasks"
                      value={fileData.label}
                      onChange={e => setFileData({...fileData, label: e.target.value})} />
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>File type</label>
                    <select style={s.input} value={fileData.fileType} onChange={e => setFileData({...fileData, fileType: e.target.value})}>
                      {['pdf','docx','pptx','zip','txt'].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>Select file</label>
                    <input style={{...s.input, cursor:'pointer'}} type="file"
                      accept=".pdf,.doc,.docx,.pptx,.txt,.zip"
                      onChange={e => setFileData({...fileData, file: e.target.files[0]})} />
                  </div>
                  <button style={s.btn} type="submit" disabled={uploading || !fileData.file}>
                    {uploading ? 'Uploading...' : 'Upload File'}
                  </button>
                </form>

                <div style={{marginTop:'20px'}}>
                  <p style={s.label}>Uploaded files ({selected.files?.length})</p>
                  {selected.files?.length === 0 && (
                    <p style={{color:'#4A6A8A', fontSize:'13px'}}>No files yet.</p>
                  )}
                  {selected.files?.map(file => (
                    <div key={file._id} style={s.fileRow}>
                      <div>
                        <p style={{color:'#fff', fontSize:'14px', margin:0}}>{file.label}</p>
                        <p style={{color:'#4A6A8A', fontSize:'12px', margin:0}}>
                          {file.fileType?.toUpperCase()} {file.size && `· ${file.size}`}
                        </p>
                      </div>
                      <button style={s.delBtn} onClick={() => deleteFile(file._id)}>Delete</button>
                    </div>
                  ))}
                </div>

                <div style={{marginTop:'20px', borderTop:'1px solid #1e3a5f', paddingTop:'16px'}}>
                  <button
                    style={{...s.btn, background: selected.isPublished ? '#2a0a0a' : '#0F2318', color: selected.isPublished ? '#FF7070' : '#4CAF7D'}}
                    onClick={() => togglePublish(selected)}>
                    {selected.isPublished ? 'Unpublish episode' : 'Publish episode'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{...s.card, textAlign:'center', color:'#4A6A8A', paddingTop:'60px'}}>
                <p style={{fontSize:'32px'}}>👈</p>
                <p>Select an episode from the left to upload files</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  page:      { minHeight:'100vh', background:'#0a0f1e', fontFamily:'Arial, sans-serif' },
  content:   { maxWidth:'1200px', margin:'0 auto', padding:'32px 24px' },
  header:    { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'24px' },
  title:     { color:'#fff', fontSize:'24px', fontWeight:'700', margin:0 },
  backBtn:   { background:'none', border:'1px solid #1e3a5f', color:'#4A9EFF', padding:'8px 16px', borderRadius:'8px', cursor:'pointer', fontSize:'13px' },
  msg:       { background:'#0F2318', border:'1px solid #4CAF7D', color:'#4CAF7D', padding:'12px 16px', borderRadius:'8px', marginBottom:'20px', display:'flex', justifyContent:'space-between', alignItems:'center' },
  closeMsg:  { background:'none', border:'none', color:'#4CAF7D', cursor:'pointer', fontSize:'16px' },
  grid:      { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px' },
  card:      { background:'#111827', border:'1px solid #1e3a5f', borderRadius:'12px', padding:'22px', marginBottom:'16px' },
  cardTitle: { color:'#fff', fontSize:'16px', fontWeight:'600', marginBottom:'18px' },
  field:     { marginBottom:'12px' },
  label:     { color:'#6B8CAE', fontSize:'12px', display:'block', marginBottom:'5px', fontWeight:'600' },
  input:     { width:'100%', background:'#0a0f1e', border:'1px solid #1e3a5f', borderRadius:'6px', color:'#fff', padding:'8px 12px', fontSize:'13px', boxSizing:'border-box', outline:'none' },
  btn:       { background:'#1e3a5f', color:'#4A9EFF', border:'none', padding:'10px 20px', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontWeight:'600', width:'100%', marginTop:'4px' },
  epRow:     { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', borderRadius:'8px', cursor:'pointer', marginBottom:'6px' },
  epNum:     { color:'#4A9EFF', fontSize:'12px', fontWeight:'700', marginRight:'8px' },
  epTitle:   { color:'#ccc', fontSize:'13px' },
  epActions: { display:'flex', gap:'8px', alignItems:'center' },
  pubBadge:  { fontSize:'11px', padding:'2px 8px', borderRadius:'20px', cursor:'pointer', fontWeight:'600' },
  coursePill:{ display:'flex', alignItems:'center', padding:'8px 12px', borderRadius:'8px', border:'1px solid', cursor:'pointer' },
  phaseChip: { display:'inline-flex', alignItems:'center', gap:'8px', background:'#0a0f1e', border:'1px solid #1e3a5f', color:'#cbd5e1', fontSize:'13px', padding:'6px 12px', borderRadius:'20px' },
  phaseX:    { color:'#FF7070', cursor:'pointer', fontSize:'12px', fontWeight:700 },
  smallBtn:  { background:'#1e3a5f', color:'#4A9EFF', border:'none', padding:'8px 14px', borderRadius:'6px', cursor:'pointer', fontSize:'13px', fontWeight:600 },
  shareBox:  { marginTop:'10px', background:'#0a0f1e', border:'1px solid #1e3a5f', borderRadius:'6px', padding:'8px 12px', color:'#8899AA', fontSize:'13px' },
  code:      { color:'#4A9EFF', fontFamily:'monospace', fontSize:'13px' },
  filesBadge:{ color:'#4A6A8A', fontSize:'11px' },
  uploadForm:{ borderBottom:'1px solid #1e3a5f', paddingBottom:'20px', marginBottom:'20px' },
  fileRow:   { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', background:'#0a0f1e', borderRadius:'8px', marginBottom:'6px' },
  delBtn:    { background:'#2a0a0a', color:'#FF7070', border:'1px solid #3a1a1a', padding:'5px 12px', borderRadius:'6px', cursor:'pointer', fontSize:'12px' },
};