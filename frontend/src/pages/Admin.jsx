import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL;

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [episodes, setEpisodes]   = useState([]);
  const [selected, setSelected]   = useState(null);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating]   = useState(false);
  const [newEp, setNewEp]         = useState({ episodeNumber:'', title:'', description:'', phase:'Phase 1 — Python Basics', youtubeUrl:'', duration:'' });
  const [fileData, setFileData]   = useState({ label:'', fileType:'pdf', file: null });
  const [msg, setMsg]             = useState('');

  useEffect(() => {
    if (!user || user.role !== 'admin') { navigate('/episodes'); return; }
    fetchEpisodes();
  }, [user]);

  const fetchEpisodes = () => {
    axios.get(`${API}/episodes/all`).then(r => setEpisodes(r.data)).catch(console.error);
  };

  const createEpisode = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await axios.post(`${API}/episodes`, newEp);
      setMsg('Episode created ✓');
      setNewEp({ episodeNumber:'', title:'', description:'', phase:'Phase 1 — Python Basics', youtubeUrl:'', duration:'' });
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
      const updated = await axios.get(`${API}/episodes/all`);
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
    const updated = await axios.get(`${API}/episodes/all`);
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
          <button style={s.backBtn} onClick={() => navigate('/episodes')}>← Back to portal</button>
        </div>

        {msg && (
          <div style={s.msg}>
            {msg}
            <button style={s.closeMsg} onClick={() => setMsg('')}>✕</button>
          </div>
        )}

        <div style={s.grid}>
          {/* LEFT */}
          <div>
            <div style={s.card}>
              <h2 style={s.cardTitle}>Create Episode</h2>
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
                  <select style={s.input} value={newEp.phase} onChange={e => setNewEp({...newEp, phase: e.target.value})}>
                    {['Phase 1 — Python Basics','Phase 2 — Intermediate Python','Phase 3 — Dev Tools','Phase 4 — Data Analysis','Phase 5 — Visualization','Phase 6 — Machine Learning','Phase 7 — Deep Learning & AI','Phase 8 — Production & Career'].map(p =>
                      <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div style={s.field}>
                  <label style={s.label}>Description</label>
                  <textarea style={{...s.input, height:'70px', resize:'vertical'}}
                    value={newEp.description}
                    onChange={e => setNewEp({...newEp, description: e.target.value})} />
                </div>
                <button style={s.btn} type="submit" disabled={creating}>
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
  filesBadge:{ color:'#4A6A8A', fontSize:'11px' },
  uploadForm:{ borderBottom:'1px solid #1e3a5f', paddingBottom:'20px', marginBottom:'20px' },
  fileRow:   { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', background:'#0a0f1e', borderRadius:'8px', marginBottom:'6px' },
  delBtn:    { background:'#2a0a0a', color:'#FF7070', border:'1px solid #3a1a1a', padding:'5px 12px', borderRadius:'6px', cursor:'pointer', fontSize:'12px' },
};