import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL;
const LABELS = ['', 'Poor', 'Okay', 'Good', 'Great', 'Loved it'];

// ── Star rating input (keyboard + touch friendly) ──
export function StarInput({ value, onChange, size = 30, readOnly = false }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="stars" role={readOnly ? 'img' : 'radiogroup'}
      aria-label={readOnly ? `${value} out of 5 stars` : 'Rating'}
      onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map(n => (
        readOnly ? (
          <span key={n} className={`star ${n <= shown ? 'on' : ''}`} style={{ fontSize: size }}>★</span>
        ) : (
          <button key={n} type="button" role="radio" aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? 's' : ''} — ${LABELS[n]}`}
            className={`star ${n <= shown ? 'on' : ''}`} style={{ fontSize: size }}
            onMouseEnter={() => setHover(n)} onClick={() => onChange(n)}>★</button>
        )
      ))}
    </div>
  );
}

// ── One feedback form: a single class, or the whole program ──
export function FeedbackForm({ eventId, sessionId = null, title, subtitle, initial, onSaved, compact = false }) {
  const isProgram = !sessionId;
  const [rating, setRating] = useState(initial?.rating || 0);
  const [comment, setComment] = useState(initial?.comment || '');
  const [consent, setConsent] = useState(initial?.consentToFeature ?? isProgram);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e?.preventDefault();
    if (!rating) { setError('Tap a star to rate'); return; }
    setBusy(true); setError('');
    try {
      const { data } = await axios.post(`${API}/feedback`, {
        eventId, sessionId, rating, comment: comment.trim(),
        consentToFeature: comment.trim() ? consent : false,
      });
      onSaved?.(data.feedback);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save. Please try again.');
    } finally { setBusy(false); }
  };

  return (
    <form className={`fb-form ${compact ? 'fb-compact' : ''}`} onSubmit={submit}>
      {title && <div className="fb-title">{title}</div>}
      {subtitle && <div className="fb-sub">{subtitle}</div>}
      <div className="fb-stars-row">
        <StarInput value={rating} onChange={(n) => { setRating(n); setError(''); }} />
        <span className="fb-label">{LABELS[rating] || ''}</span>
      </div>
      {rating > 0 && (
        <>
          <textarea className="input fb-comment" rows={isProgram ? 3 : 2} maxLength={600}
            placeholder={isProgram
              ? 'What changed for you after this program? What would you tell a friend?'
              : rating <= 3 ? 'What was confusing or could be better? (optional)' : 'What did you like most? (optional)'}
            value={comment} onChange={e => setComment(e.target.value)} />
          {comment.trim() && (
            <label className="checkbox-row fb-consent">
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
              You can show my review (first name only) on the website
            </label>
          )}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Saving…' : initial ? 'Update feedback' : 'Submit feedback'}
          </button>
        </>
      )}
      {error && <div className="fb-error" role="alert">{error}</div>}
    </form>
  );
}

// ── Dashboard prompt: "How was today's class?" one at a time ──
export function FeedbackPrompt() {
  const [data, setData] = useState(null);
  const [thanks, setThanks] = useState('');
  const [skipped, setSkipped] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('fb-skipped') || '[]'); } catch { return []; }
  });

  const load = useCallback(() => {
    axios.get(`${API}/feedback/pending`).then(({ data }) => setData(data)).catch(() => setData(null));
  }, []);
  useEffect(() => { load(); }, [load]);

  const skip = (key) => {
    const next = [...skipped, key];
    setSkipped(next);
    try { sessionStorage.setItem('fb-skipped', JSON.stringify(next)); } catch { /* private mode */ }
  };

  if (thanks) {
    return <div className="fb-card fb-thanks" role="status">🙏 {thanks}</div>;
  }
  if (!data) return null;
  const cls = (data.classes || []).find(c => !skipped.includes(`c:${c.sessionId}`));
  const prog = !cls && (data.programs || []).find(p => !skipped.includes(`p:${p.eventId}`));
  if (!cls && !prog) return null;

  const done = () => { setThanks('Thanks! Your feedback helps make the next class better.'); setTimeout(() => { setThanks(''); load(); }, 2200); };

  return (
    <div className="fb-card">
      <div className="fb-card-head">
        <span className="fb-eyebrow">{cls ? `Class ${cls.number} · ${cls.eventTitle}` : prog.eventTitle}</span>
        <button type="button" className="fb-skip" onClick={() => skip(cls ? `c:${cls.sessionId}` : `p:${prog.eventId}`)}>
          Later
        </button>
      </div>
      {cls ? (
        <FeedbackForm key={cls.sessionId} eventId={cls.eventId} sessionId={cls.sessionId}
          title={`How was "${cls.title.replace(/^Day \d+\s*[—-]\s*/, '')}"?`}
          subtitle="Takes 5 seconds. Only Rajeev sir sees your rating." onSaved={done} compact />
      ) : (
        <FeedbackForm key={prog.eventId} eventId={prog.eventId}
          title={prog.isCompleted ? 'You finished the program! How was it overall?' : "You're halfway through! How is the program so far?"}
          subtitle="Your review helps other students decide." onSaved={done} />
      )}
    </div>
  );
}

// ── Event page: rate each class + program review (confirmed students) ──
export function EventFeedback({ event }) {
  const [mine, setMine] = useState(null);
  const [open, setOpen] = useState(null); // sessionId | 'program'

  const load = useCallback(() => {
    axios.get(`${API}/feedback/mine`, { params: { event: event._id } })
      .then(({ data }) => setMine(data)).catch(() => setMine([]));
  }, [event._id]);
  useEffect(() => { load(); }, [load]);
  if (!mine) return null;

  const now = Date.now();
  const sessions = [...(event.sessions || [])].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  const started = sessions.map((s, i) => ({ ...s, number: i + 1 })).filter(s => new Date(s.startsAt).getTime() <= now);
  const endOf = (s) => new Date(s.startsAt).getTime() + (s.durationMins || 60) * 60000;
  const endedCount = sessions.filter(s => endOf(s) < now).length;
  const programOpen = event.isCompleted || (sessions.length && endedCount >= Math.ceil(sessions.length / 2));
  const byId = new Map(mine.map(f => [String(f.sessionId || 'program'), f]));
  if (!started.length) return null;

  const saved = () => { setOpen(null); load(); };
  const programFb = byId.get('program');

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="ed-section-head">
        <h2 className="ed-section-title">Your feedback</h2>
        <span className="small muted">{mine.filter(f => f.sessionId).length} of {started.length} classes rated</span>
      </div>

      {programOpen && (
        <div className="fb-program">
          {open === 'program' || !programFb ? (
            <FeedbackForm eventId={event._id} initial={programFb}
              title={programFb ? 'Edit your program review' : 'Rate the whole program'}
              subtitle="Your review helps other students decide." onSaved={saved} />
          ) : (
            <div className="fb-row">
              <div><strong>Program review</strong> <StarInput value={programFb.rating} readOnly size={16} /></div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen('program')}>Edit</button>
            </div>
          )}
        </div>
      )}

      <div className="fb-list">
        {[...started].reverse().map(s => {
          const f = byId.get(String(s._id));
          return (
            <div key={s._id} className="fb-item">
              <div className="fb-row">
                <div className="fb-row-title">
                  <span className="muted small">Class {s.number}</span>
                  <span>{s.title.replace(/^Day \d+\s*[—-]\s*/, '')}</span>
                </div>
                {f && open !== String(s._id) ? (
                  <button type="button" className="fb-mini" onClick={() => setOpen(String(s._id))} aria-label="Edit rating">
                    <StarInput value={f.rating} readOnly size={15} />
                  </button>
                ) : open !== String(s._id) && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(String(s._id))}>Rate</button>
                )}
              </div>
              {open === String(s._id) && (
                <FeedbackForm eventId={event._id} sessionId={s._id} initial={f} onSaved={saved} compact />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Public testimonials + average rating (marketing pages) ──
export function Testimonials({ title = 'What students say', limit = 6 }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    axios.get(`${API}/feedback/public`, { params: { limit } }).then(({ data }) => setData(data)).catch(() => {});
  }, [limit]);
  // Show nothing until there is real proof — never fake numbers.
  if (!data || (!data.testimonials.length && data.ratings < 20)) return null;

  return (
    <section className="testi">
      <div className="testi-head">
        <h2 className="ed-section-title">{title}</h2>
        {data.ratings >= 20 && data.average && (
          <div className="testi-score">
            <span className="testi-avg">{data.average.toFixed(1)}</span>
            <StarInput value={Math.round(data.average)} readOnly size={16} />
            <span className="small muted">from {data.ratings.toLocaleString('en-IN')} class ratings by {data.students.toLocaleString('en-IN')} students</span>
          </div>
        )}
      </div>
      {data.testimonials.length > 0 && (
        <div className="testi-grid">
          {data.testimonials.map(t => (
            <figure key={t.id} className="testi-card">
              <StarInput value={t.rating} readOnly size={14} />
              <blockquote>“{t.comment}”</blockquote>
              <figcaption>
                {t.avatar
                  ? <img src={t.avatar} alt="" referrerPolicy="no-referrer" />
                  : <span className="testi-initial">{t.name[0]}</span>}
                <span>
                  <strong>{t.name}</strong>
                  {t.program && <span className="small muted"> · {t.program}</span>}
                  <span className="testi-verified">✓ Verified student</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
