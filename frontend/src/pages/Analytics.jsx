import { useEffect, useState } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL;

export default function Analytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`${API}/analytics/overview`)
      .then(({ data }) => setData(data))
      .catch(err => setError(err.response?.data?.message || 'Could not load analytics'));
  }, []);

  if (error) return <div className="spinner-page" style={{ color: 'var(--danger)' }}>{error}</div>;
  if (!data) return <div className="spinner-page">Loading analytics…</div>;

  const { totals, perCourse, topEpisodes, recentUsers } = data;

  return (
    <div className="page">
      <div className="container section">
        <h1 style={{ fontSize: 24, marginBottom: 20 }}>Analytics</h1>

        <div className="grid-stats" style={{ marginBottom: 26 }}>
          <div className="card"><div className="stat-value" style={{ color: 'var(--success)' }}>₹{totals.revenue.toLocaleString('en-IN')}</div><div className="stat-label">Total revenue</div></div>
          <div className="card"><div className="stat-value">{totals.sales}</div><div className="stat-label">Course sales</div></div>
          <div className="card"><div className="stat-value">{totals.students}</div><div className="stat-label">Students</div></div>
          <div className="card"><div className="stat-value">{totals.enrollments}</div><div className="stat-label">Active enrollments</div></div>
          <div className="card"><div className="stat-value" style={{ color: totals.pendingPayments > 0 ? 'var(--warning)' : 'inherit' }}>{totals.pendingPayments}</div><div className="stat-label">Pending payments</div></div>
          <div className="card"><div className="stat-value">{totals.episodes}</div><div className="stat-label">Episodes</div></div>
        </div>

        <h2 style={{ fontSize: 17, marginBottom: 12 }}>Courses</h2>
        <div className="table-wrap" style={{ marginBottom: 26 }}>
          <table className="table">
            <thead><tr><th>Course</th><th>Pricing</th><th>Enrollments</th><th>Sales</th><th>Revenue</th><th>Lessons completed</th></tr></thead>
            <tbody>
              {perCourse.map(c => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.title}</div>
                    {!c.isPublished && <span className="badge badge-muted">Draft</span>}
                  </td>
                  <td>{c.isPaid ? `₹${c.price}` : 'Free'}</td>
                  <td>{c.enrollments}</td>
                  <td>{c.sales}</td>
                  <td style={{ fontWeight: 600, color: c.revenue > 0 ? 'var(--success)' : 'inherit' }}>₹{c.revenue.toLocaleString('en-IN')}</td>
                  <td>{c.completions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          <div className="card">
            <h2 style={{ fontSize: 15, marginBottom: 12 }}>Most viewed episodes</h2>
            {topEpisodes.map(ep => (
              <div key={ep._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="small">#{ep.episodeNumber} {ep.title} <span className="muted">· {ep.course?.title}</span></span>
                <span className="small" style={{ fontWeight: 600 }}>{ep.viewCount || 0}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <h2 style={{ fontSize: 15, marginBottom: 12 }}>Recent signups</h2>
            {recentUsers.map(u => (
              <div key={u._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                {u.avatar && <img src={u.avatar} alt="" style={{ width: 26, height: 26, borderRadius: '50%' }} referrerPolicy="no-referrer" />}
                <span className="small" style={{ flex: 1 }}>{u.name}</span>
                <span className="small muted">{new Date(u.createdAt).toLocaleDateString('en-IN')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
