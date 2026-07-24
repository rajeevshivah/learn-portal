import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {events.map(ev => {
              const reg = ev.myRegistration;
              const multi = ev.sessions?.length > 1;
              return (
                <div key={ev._id} className="card card-hover"
                  style={{ display: 'flex', gap: 16, padding: '16px 18px', cursor: 'pointer', flexWrap: 'wrap' }}
                  onClick={() => navigate(`/events/${ev.slug}`)}>

                  <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      <span className="badge badge-muted">{TYPE_LABEL[ev.type]}</span>
                      {multi && <span className="badge badge-muted">{ev.sessions.length} days</span>}
                      {ev.course && <span className="badge badge-muted">{ev.course.title}</span>}
                      {ev.isPaid
                        ? <span className="badge badge-warning">₹{ev.price}</span>
                        : <span className="badge badge-accent">Free</span>}
                      {reg?.status === 'active'  && <span className="badge badge-success">Registered</span>}
                      {reg?.status === 'pending' && <span className="badge badge-warning">Verifying payment</span>}
                      {reg?.status === 'rejected'&& <span className="badge badge-danger">Payment rejected</span>}
                    </div>

                    <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{ev.title}</div>
                    {ev.description && (
                      <p className="small muted" style={{
                        display: '-webkit-box', WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>{ev.description}</p>
                    )}

                    {ev.startsAt && (
                      <div className="small" style={{ marginTop: 8, color: 'var(--text-2)' }}>
                        📅 {fmtDate(ev.startsAt)}
                        {multi && ev.endsAt && ` → ${new Date(ev.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                      </div>
                    )}
                  </div>

                  <div style={{ flex: '0 0 auto', alignSelf: 'center' }}>
                    {reg?.status === 'active' ? (
                      <span className="small" style={{ color: 'var(--success)' }}>View details →</span>
                    ) : ev.registrationOpen ? (
                      <span className="btn btn-primary btn-sm">Register</span>
                    ) : (
                      <span className="badge badge-muted">Closed</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
