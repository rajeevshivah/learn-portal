import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL;

export default function Analytics() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (!user || user.role !== 'admin') { navigate('/courses'); return; }
    axios.get(`${API}/analytics/overview`)
      .then(r => setData(r.data))
      .catch(() => setError('Could not load analytics'))
      .finally(() => setLoading(false));
  }, [user]);

  const maxSignup = data?.signupsLast30?.reduce((m, d) => Math.max(m, d.count), 0) || 1;

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <div style={s.brand} onClick={() => navigate('/courses')}>
          <span style={{ color:'#4A9EFF', fontWeight:700 }}>codeWith</span>
          <span style={{ color:'#fff', fontWeight:700 }}>Shivah</span>
          <span style={s.sub}>analytics</span>
        </div>
        <button style={s.adminBtn} onClick={() => navigate('/admin')}>← Admin</button>
      </nav>

      <div style={s.content}>
        <h1 style={s.title}>Analytics</h1>
        <p style={s.subtitle}>In-app metrics from your own data. For traffic & referrers, see Google Analytics.</p>

        {loading ? <p style={s.muted}>Loading...</p>
         : error ? <p style={s.muted}>{error}</p>
         : (
          <>
            {/* headline cards */}
            <div style={s.cardsRow}>
              <Stat label="Students"    value={data.headline.totalStudents} color="#4A9EFF" />
              <Stat label="Courses"     value={data.headline.totalCourses} color="#9B6EFF" />
              <Stat label="Episodes"    value={data.headline.totalEpisodes} color="#4CAF7D" />
              <Stat label="Enrollments" value={data.headline.totalEnrollments} color="#FF9F45" />
            </div>

            {/* per-course */}
            <div style={s.panel}>
              <h2 style={s.panelTitle}>Per course</h2>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Course</th>
                    <th style={s.th}>Status</th>
                    <th style={s.thNum}>Episodes</th>
                    <th style={s.thNum}>Enrollments</th>
                  </tr>
                </thead>
                <tbody>
                  {data.perCourse.map(c => (
                    <tr key={c.id}>
                      <td style={s.td}>{c.title}</td>
                      <td style={s.td}>
                        <span style={{ ...s.badge, color: c.isPublished ? '#4CAF7D' : '#FF9F45', background: c.isPublished ? '#0F2318' : '#2a1a00' }}>
                          {c.isPublished ? 'Live' : 'Draft'}
                        </span>
                      </td>
                      <td style={s.tdNum}>{c.episodes}</td>
                      <td style={s.tdNum}>{c.enrollments}</td>
                    </tr>
                  ))}
                  {data.perCourse.length === 0 && (
                    <tr><td style={s.td} colSpan={4}>No courses yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* top episodes */}
            <div style={s.panel}>
              <h2 style={s.panelTitle}>Most-opened episodes</h2>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Episode</th>
                    <th style={s.th}>Course</th>
                    <th style={s.thNum}>Opens</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topEpisodes.map(e => (
                    <tr key={e.id}>
                      <td style={s.td}>Ep {e.episodeNumber} — {e.title}</td>
                      <td style={s.td}>{e.course}</td>
                      <td style={s.tdNum}>{e.downloads}</td>
                    </tr>
                  ))}
                  {data.topEpisodes.length === 0 && (
                    <tr><td style={s.td} colSpan={3}>No episode activity yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* signups last 30 days */}
            <div style={s.panel}>
              <h2 style={s.panelTitle}>New students — last 30 days</h2>
              {data.signupsLast30.length === 0 ? (
                <p style={s.muted}>No signups in this window.</p>
              ) : (
                <div style={s.barRow}>
                  {data.signupsLast30.map(d => (
                    <div key={d.date} style={s.barWrap} title={`${d.date}: ${d.count}`}>
                      <div style={{ ...s.bar, height: `${(d.count / maxSignup) * 100}%` }} />
                    </div>
                  ))}
                </div>
              )}
              <p style={s.hint}>Hover a bar for the date and count.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={s.statCard}>
      <div style={{ ...s.statValue, color }}>{value}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  );
}

const s = {
  page: { minHeight:'100vh', background:'#0a0f1e', fontFamily:'Arial, sans-serif' },
  nav: { background:'#111827', borderBottom:'1px solid #1e3a5f', padding:'14px 32px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:10 },
  brand: { display:'flex', alignItems:'center', gap:'4px', fontSize:'18px', cursor:'pointer' },
  sub: { color:'#4A6A8A', fontSize:'13px', marginLeft:'8px' },
  adminBtn: { background:'#1e3a5f', color:'#4A9EFF', border:'none', padding:'6px 14px', borderRadius:'6px', cursor:'pointer', fontSize:'13px' },
  content: { maxWidth:'1000px', margin:'0 auto', padding:'40px 24px' },
  title: { color:'#fff', fontSize:'28px', fontWeight:700, marginBottom:'6px' },
  subtitle: { color:'#6B8CAE', fontSize:'14px', marginBottom:'32px' },
  muted: { color:'#6B8CAE', textAlign:'center', marginTop:'40px' },
  cardsRow: { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'14px', marginBottom:'28px' },
  statCard: { background:'#111827', border:'1px solid #1e3a5f', borderRadius:'12px', padding:'22px' },
  statValue: { fontSize:'34px', fontWeight:700, lineHeight:1 },
  statLabel: { color:'#6B8CAE', fontSize:'13px', marginTop:'8px' },
  panel: { background:'#111827', border:'1px solid #1e3a5f', borderRadius:'12px', padding:'22px', marginBottom:'20px' },
  panelTitle: { color:'#fff', fontSize:'17px', fontWeight:600, marginBottom:'16px' },
  table: { width:'100%', borderCollapse:'collapse' },
  th: { textAlign:'left', color:'#6B8CAE', fontSize:'12px', fontWeight:600, textTransform:'uppercase', padding:'8px 10px', borderBottom:'1px solid #1e3a5f' },
  thNum: { textAlign:'right', color:'#6B8CAE', fontSize:'12px', fontWeight:600, textTransform:'uppercase', padding:'8px 10px', borderBottom:'1px solid #1e3a5f' },
  td: { color:'#cbd5e1', fontSize:'14px', padding:'10px', borderBottom:'1px solid #15233a' },
  tdNum: { color:'#fff', fontSize:'14px', fontWeight:600, textAlign:'right', padding:'10px', borderBottom:'1px solid #15233a' },
  badge: { fontSize:'11px', padding:'2px 8px', borderRadius:'20px', fontWeight:600 },
  barRow: { display:'flex', alignItems:'flex-end', gap:'4px', height:'120px', padding:'8px 0' },
  barWrap: { flex:1, height:'100%', display:'flex', alignItems:'flex-end' },
  bar: { width:'100%', background:'#4A9EFF', borderRadius:'3px 3px 0 0', minHeight:'2px' },
  hint: { color:'#4A6A8A', fontSize:'12px', marginTop:'8px' },
};
