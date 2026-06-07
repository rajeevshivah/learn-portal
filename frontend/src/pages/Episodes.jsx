import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL;

const phaseColors = {
  'Phase 1': '#4A9EFF',
  'Phase 2': '#4CAF7D',
  'Phase 3': '#9B6EFF',
  'Phase 4': '#FF9F45',
  'Phase 5': '#FF6B9D',
  'Phase 6': '#45D4C8',
  'Phase 7': '#FF7070',
  'Phase 8': '#A8D8EA',
};

function getPhaseColor(phase) {
  const key = Object.keys(phaseColors).find(k => phase?.startsWith(k));
  return key ? phaseColors[key] : '#4A9EFF';
}

export default function Episodes() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');

  useEffect(() => {
    axios.get(`${API}/episodes`)
      .then(res => setEpisodes(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const filtered = episodes.filter(ep =>
    ep.title.toLowerCase().includes(search.toLowerCase()) ||
    ep.phase.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={styles.page}>
      {/* Navbar */}
      <nav style={styles.nav}>
        <div style={styles.navBrand}>
          <span style={{ color: '#4A9EFF', fontWeight: 700 }}>PyMaster</span>
          <span style={{ color: '#fff', fontWeight: 700 }}> India</span>
          <span style={styles.navSub}>learn.rajeevshivah.me</span>
        </div>
        <div style={styles.navRight}>
          <img src={user?.avatar} alt={user?.name} style={styles.avatar} />
          <span style={styles.navName}>{user?.name?.split(' ')[0]}</span>
          {user?.role === 'admin' && (
            <button style={styles.adminBtn} onClick={() => navigate('/admin')}>Admin</button>
          )}
          <button style={styles.logoutBtn} onClick={logout}>Logout</button>
        </div>
      </nav>

      <div style={styles.content}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>Episode Resources</h1>
          <p style={styles.subtitle}>
            Notes, PDFs, tasks and code files — download for each episode
          </p>
          <input
            style={styles.search}
            placeholder="Search episodes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Episodes grid */}
        {loading ? (
          <p style={{ color: '#6B8CAE', textAlign: 'center', marginTop: '60px' }}>Loading episodes...</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: '#6B8CAE', textAlign: 'center', marginTop: '60px' }}>No episodes found.</p>
        ) : (
          <div style={styles.grid}>
            {filtered.map(ep => (
              <div
                key={ep._id}
                style={styles.card}
                onClick={() => navigate(`/episodes/${ep._id}`)}
              >
                <div style={styles.cardTop}>
                  <span style={{ ...styles.epNum, borderColor: getPhaseColor(ep.phase), color: getPhaseColor(ep.phase) }}>
                    Ep {ep.episodeNumber}
                  </span>
                  <span style={{ ...styles.phaseTag, background: getPhaseColor(ep.phase) + '22', color: getPhaseColor(ep.phase) }}>
                    {ep.phase?.split('—')[0]?.trim()}
                  </span>
                </div>
                <h3 style={styles.cardTitle}>{ep.title}</h3>
                <p style={styles.cardDesc}>{ep.description}</p>
                <div style={styles.cardFooter}>
                  <span style={styles.fileCount}>
                    {ep.files?.length || 0} file{ep.files?.length !== 1 ? 's' : ''}
                  </span>
                  {ep.duration && <span style={styles.duration}>⏱ {ep.duration}</span>}
                  <span style={styles.downloadBtn}>Download →</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#0a0f1e', fontFamily: 'Arial, sans-serif' },
  nav: { background: '#111827', borderBottom: '1px solid #1e3a5f', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 },
  navBrand: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '18px' },
  navSub: { color: '#4A6A8A', fontSize: '13px', marginLeft: '8px' },
  navRight: { display: 'flex', alignItems: 'center', gap: '12px' },
  avatar: { width: '32px', height: '32px', borderRadius: '50%', border: '2px solid #1e3a5f' },
  navName: { color: '#8899AA', fontSize: '14px' },
  adminBtn: { background: '#1e3a5f', color: '#4A9EFF', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
  logoutBtn: { background: 'transparent', color: '#6B8CAE', border: '1px solid #1e3a5f', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
  content: { maxWidth: '1100px', margin: '0 auto', padding: '40px 24px' },
  header: { marginBottom: '40px' },
  title: { color: '#FFFFFF', fontSize: '28px', fontWeight: '700', marginBottom: '8px' },
  subtitle: { color: '#6B8CAE', fontSize: '15px', marginBottom: '20px' },
  search: { width: '100%', maxWidth: '400px', padding: '10px 16px', background: '#111827', border: '1px solid #1e3a5f', borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' },
  card: { background: '#111827', border: '1px solid #1e3a5f', borderRadius: '12px', padding: '20px', cursor: 'pointer', transition: 'border-color 0.2s', ':hover': { borderColor: '#4A9EFF' } },
  cardTop: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' },
  epNum: { fontSize: '13px', fontWeight: '700', border: '1px solid', borderRadius: '20px', padding: '2px 10px' },
  phaseTag: { fontSize: '11px', fontWeight: '600', padding: '2px 10px', borderRadius: '20px' },
  cardTitle: { color: '#FFFFFF', fontSize: '16px', fontWeight: '600', marginBottom: '8px', lineHeight: '1.4' },
  cardDesc: { color: '#6B8CAE', fontSize: '13px', lineHeight: '1.5', marginBottom: '16px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  cardFooter: { display: 'flex', alignItems: 'center', gap: '12px', borderTop: '1px solid #1e3a5f', paddingTop: '12px' },
  fileCount: { color: '#4CAF7D', fontSize: '12px', fontWeight: '600' },
  duration: { color: '#6B8CAE', fontSize: '12px' },
  downloadBtn: { marginLeft: 'auto', color: '#4A9EFF', fontSize: '13px', fontWeight: '600' },
};
