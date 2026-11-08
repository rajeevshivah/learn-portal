import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Toast from '../components/Toast';

const API = import.meta.env.VITE_API_URL;

const TYPE_LABEL = {
  'live-class': 'Live class',
  'workshop':   'Workshop',
};

export default function Events() {
  const navigate = useNavigate();
  const [events, setEvents]   = useState([]);
  const [scope, setScope]     = useState('upcoming');   // upcoming | past
  const [type, setType]       = useState('all');        // all | live-class | workshop
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ scope });
      if (type !== 'all') params.set('type', type);
      const { data } = await axios.get(`${API}/events?${params}`);
      setEvents(data);
    } catch (e) {
      setToast('Could not load events');
    } finally {
      setLoading(false);
    }
  }, [scope, type]);

  useEffect(() => { load(); }, [load]);

  const fmtDate = (d) => new Date(d).toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });

  return (
    <div className="page">
      <div className="container section">
        <h1 style={{ fontSize: 24, marginBottom: 6 }}>Live classes &amp; workshops</h1>
        <p className="muted small" style={{ marginBottom: 20, maxWidth: 620 }}>
          Recorded courses teach you the concepts. These live sessions are where we
          solve your actual doubts together — bring your errors, your stuck code, your questions.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
          {[
            { id: 'all',        label: 'Everything' },
            { id: 'live-class', label: 'Live classes' },
            { id: 'workshop',   label: 'Workshops' },
          ].map(t => (
            <button key={t.id} onClick={() => setType(t.id)}
              className={`badge ${type === t.id ? 'badge-accent' : 'badge-muted'}`}
              style={{ cursor: 'pointer', border: 'none', padding: '6px 14px' }}>
              {t.label}
            </button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {[
              { id: 'upcoming', label: 'Upcoming' },
              { id: 'past',     label: 'Past' },
            ].map(s => (
              <button key={s.id} onClick={() => setScope(s.id)}
                className={`badge ${scope === s.id ? 'badge-accent' : 'badge-muted'}`}
                style={{ cursor: 'pointer', border: 'none', padding: '6px 14px' }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="spinner-page">Loading…</div>
        ) : events.length === 0 ? (
          <div className="empty-state">
            {scope === 'upcoming'
              ? 'No live sessions scheduled right now. Check back soon.'
              : 'No past sessions yet.'}
          </div>
        ) : (
          <div className="ev-list">
            {events.map(ev => {
              const reg = ev.myRegistration;
              const multi = ev.sessions?.length > 1;
              const d = ev.startsAt ? new Date(ev.startsAt) : null;
              return (
                <Link key={ev._id} to={`/events/${ev.slug}`} className="ev-row">
                  <div className="ev-date" aria-hidden="true">
                    {d ? <><span className="ev-date-m">{d.toLocaleDateString('en-IN', { month: 'short' })}</span><span className="ev-date-d">{d.getDate()}</span></> : <span className="ev-date-d">—</span>}
                  </div>
                  <div className="ev-main">
                    <div className="ev-title">{ev.title}</div>
                    <div className="ev-meta">
                      {TYPE_LABEL[ev.type]}
                      {multi ? ` · ${ev.sessions.length} classes` : ''}
                      {d ? ` · ${fmtDate(ev.startsAt)}` : ''}
                      {multi && ev.endsAt ? ` to ${new Date(ev.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                    </div>
                    {ev.description && <p className="ev-desc">{ev.description}</p>}
                    <div className="ev-tags">
                      {reg?.status === 'active'  && <span className="badge badge-success">Registered</span>}
                      {reg?.status === 'pending' && <span className="badge badge-warning">Verifying payment</span>}
                      {reg?.status === 'rejected'&& <span className="badge badge-danger">Payment rejected</span>}
                      {ev.course && <span className="badge badge-muted">{ev.course.title}</span>}
                    </div>
                  </div>
                  <div className="ev-side">
                    <span className="ev-price">{ev.isPaid ? `₹${ev.price}` : 'Free'}</span>
                    {reg?.status === 'active' ? <span className="ev-cta muted">Open</span>
                      : ev.registrationOpen ? <span className="btn btn-primary btn-sm">Register</span>
                      : <span className="badge badge-muted">Closed</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
