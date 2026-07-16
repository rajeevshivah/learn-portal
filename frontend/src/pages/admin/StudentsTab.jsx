import { useEffect, useState } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL;

export default function StudentsTab() {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      axios.get(`${API}/auth/users${search ? `?search=${encodeURIComponent(search)}` : ''}`)
        .then(({ data }) => setUsers(data)).catch(() => {}).finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const badge = (s) => s === 'active' ? 'badge-success' : s === 'pending' ? 'badge-warning' : 'badge-danger';

  return (
    <div>
      <input className="input" style={{ maxWidth: 360, marginBottom: 16 }}
        placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} />

      {loading ? <div className="spinner-page">Loading…</div> :
       users.length === 0 ? <div className="empty-state">No students found.</div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Student</th><th>Joined</th><th>Enrollments</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u._id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {u.avatar && <img src={u.avatar} alt="" style={{ width: 30, height: 30, borderRadius: '50%' }} referrerPolicy="no-referrer" />}
                      <div>
                        <div style={{ fontWeight: 600 }}>{u.name} {u.role === 'admin' && <span className="badge badge-accent">admin</span>}</div>
                        <div className="small muted">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="small muted">{new Date(u.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
                  <td>
                    {u.enrollments.length === 0 ? <span className="small muted">—</span> : (
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {u.enrollments.map((e, i) => (
                          <span key={i} className={`badge ${badge(e.status)}`}>
                            {e.title}{e.amount > 0 ? ` · ₹${e.amount}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
