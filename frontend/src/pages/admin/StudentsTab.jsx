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

  const badge = (s) => s === 'active' ? 'badge-success' : s === 'pending' ? 'badge-warning' : ['refunded', 'cancelled'].includes(s) ? 'badge-muted' : 'badge-danger';
  const [msg, setMsg] = useState('');
  const [newPw, setNewPw] = useState(null);   // { user, password, mailed }
  const [adding, setAdding] = useState(false);
  const [nu, setNu] = useState({ name: '', phone: '', email: '' });
  const resetPw = async (u) => {
    if (!window.confirm(`Give ${u.name} a new password? Their current one stops working and they're signed out everywhere.`)) return;
    try { const { data } = await axios.put(`${API}/auth/users/${u._id}/password`, {}); setNewPw({ user: u, ...data }); setMsg(''); }
    catch (err) { setMsg(err.response?.data?.message || 'Could not reset the password'); }
  };
  const addStudent = async () => {
    try {
      const { data } = await axios.post(`${API}/auth/users`, nu);
      setNewPw({ user: { name: data.name, email: data.email, phone: data.phone }, ...data }); setNu({ name: '', phone: '', email: '' }); setAdding(false); setMsg('');
      setSearch(data.email);
    } catch (err) { setMsg(err.response?.data?.message || 'Could not create the account'); }
  };
  const signOut = async (u) => {
    if (!window.confirm(`Sign ${u.email} out on every device?`)) return;
    try { const { data } = await axios.put(`${API}/auth/users/${u._id}/sign-out`); setMsg(data.message); }
    catch (err) { setMsg(err.response?.data?.message || 'Could not sign them out'); }
  };

  return (
    <div>
      <input className="input" style={{ maxWidth: 360, marginBottom: 16 }}
        placeholder="Search by name, email or mobile…" value={search} onChange={e => setSearch(e.target.value)} />
      <button className="btn btn-ghost btn-sm" style={{ marginLeft: 10, verticalAlign: 'top' }} onClick={() => setAdding(a => !a)}>{adding ? 'Close' : '+ Add student'}</button>
      {adding && (
        <div className="card" style={{ marginBottom: 16, maxWidth: 640 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Make an account for a student</div>
          <p className="small muted" style={{ marginBottom: 10 }}>For someone stuck at sign-up (on the phone with you, say). A 6-digit password is generated and shown to you.</p>
          <div className="seat-fields">
            <input className="input" placeholder="Name" value={nu.name} onChange={e => setNu({ ...nu, name: e.target.value })} />
            <input className="input" placeholder="Mobile" value={nu.phone} onChange={e => setNu({ ...nu, phone: e.target.value })} />
            <input className="input" placeholder="Email" value={nu.email} onChange={e => setNu({ ...nu, email: e.target.value })} />
            <button className="btn btn-primary btn-sm" disabled={!nu.name.trim() || !nu.email.trim()} onClick={addStudent}>Create</button>
          </div>
        </div>
      )}
      {msg && <p className="small" style={{ marginBottom: 12, color: 'var(--danger)' }}>{msg}</p>}
      {newPw && (
        <div className="card" role="status" style={{ marginBottom: 16, maxWidth: 640, borderColor: 'var(--success)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <strong>Login details for {newPw.user.name}</strong>
            <button className="btn btn-ghost btn-sm" onClick={() => setNewPw(null)}>Done</button>
          </div>
          <p className="small muted" style={{ margin: '6px 0 10px' }}>Read these out or send them on WhatsApp. {newPw.mailed ? 'Also emailed to the student.' : 'Not emailed (email isn’t set up).'}</p>
          <div className="meet-grid small">
            <div><span className="muted">Email</span><br /><strong>{newPw.user.email}</strong></div>
            {newPw.user.phone && <div><span className="muted">Mobile</span><br /><strong>{newPw.user.phone}</strong></div>}
            <div><span className="muted">Password</span><br /><strong style={{ fontSize: 18, letterSpacing: 2 }}>{newPw.password}</strong></div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => navigator.clipboard?.writeText(`Login: ${newPw.user.email}${newPw.user.phone ? ` or ${newPw.user.phone}` : ''}\nPassword: ${newPw.password}\nhttps://learn.rajeevshivah.me/login`)}>Copy for WhatsApp</button>
        </div>
      )}

      {loading ? <div className="spinner-page">Loading…</div> :
       users.length === 0 ? <div className="empty-state">No students found.</div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Student</th><th>Joined</th><th>Courses &amp; programs</th><th></th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u._id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {u.avatar && <img src={u.avatar} alt="" style={{ width: 30, height: 30, borderRadius: '50%' }} referrerPolicy="no-referrer" />}
                      <div>
                        <div style={{ fontWeight: 600 }}>{u.name} {u.role === 'admin' && <span className="badge badge-accent">admin</span>}</div>
                        <div className="small muted">{u.email}{u.phone ? ` · ${u.phone}` : ''}{u.hasPassword ? '' : ' · Google'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="small muted">{new Date(u.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
                  <td>
                    {u.enrollments.length + (u.registrations?.length || 0) === 0 ? <span className="small muted">—</span> : (
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {u.enrollments.map((e, i) => (
                          <span key={`c${i}`} className={`badge ${badge(e.status)}`}>
                            {e.title}{e.amount > 0 ? ` · ₹${e.amount}` : ''}
                          </span>
                        ))}
                        {(u.registrations || []).map((r) => (
                          <span key={r.registrationId} className={`badge ${badge(r.status)}`} title={`Live program · ${r.status}`}>
                            🎙 {r.event}{r.amount > 0 ? ` · ₹${r.amount}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    {u.role !== 'admin' && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => resetPw(u)}>New password</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => signOut(u)}>Sign out everywhere</button>
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
