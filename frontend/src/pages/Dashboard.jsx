import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ProgressBar from '../components/ProgressBar';
import MentorHubSection from '../components/MentorHubSection';
import PollModal from '../components/PollModal';
import SuggestBox from '../components/SuggestBox';

const API = import.meta.env.VITE_API_URL;

// Live countdown parts for a target date; returns null once it's in the past.
function countdownParts(target) {
  if (!target) return null;
  const diff = new Date(target) - new Date();
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { d, h, m, s };
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [enrollments, setEnrollments] = useState([]);
  const [summary, setSummary] = useState({});
  const [explore, setExplore] = useState([]);
  const [answered, setAnswered] = useState([]);
  const [events, setEvents] = useState([]);          // upcoming published live events
  const [myRegs, setMyRegs] = useState([]);          // this student's registrations
  const [poll, setPoll] = useState(null);            // active dashboard poll
  const [pollOpen, setPollOpen] = useState(false);   // blocking modal visibility
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);                   // drives the live countdown

  // tick every second so the hero countdown stays live
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/courses/my/enrollments`),
      axios.get(`${API}/progress/summary`),
      axios.get(`${API}/courses`),
    ]).then(([enr, prog, all]) => {
      setEnrollments(enr.data);
      setSummary(Object.fromEntries(prog.data.map(p => [String(p.course), p])));
      const enrolledIds = new Set(enr.data.map(e => String(e.course._id)));
      setExplore(all.data.filter(c => !enrolledIds.has(String(c._id))));
    }).catch(() => {}).finally(() => setLoading(false));

    // answered doubts are non-critical — load separately, fail silently
    axios.get(`${API}/questions/my/answered`)
      .then(({ data }) => setAnswered(data))
      .catch(() => {});

    // upcoming live events + my registrations — non-critical, load separately
    axios.get(`${API}/events?scope=upcoming`)
      .then(({ data }) => setEvents(data))
      .catch(() => {});
    axios.get(`${API}/events/my/registrations`)
      .then(({ data }) => setMyRegs(data))
      .catch(() => {});

    // active dashboard poll — block once per session until voted or dismissed
    axios.get(`${API}/polls/active`)
      .then(({ data }) => {
        if (!data) return;
        setPoll(data);
        const handled = sessionStorage.getItem(`poll-handled-${data._id}`);
        // Block if they haven't voted AND haven't dismissed it this session
        if (!data.hasVoted && !handled) setPollOpen(true);
      })
      .catch(() => {});
  }, []);

  // Called when the student votes or dismisses — stop blocking for this session.
  const handlePollClose = () => {
    if (poll) sessionStorage.setItem(`poll-handled-${poll._id}`, '1');
    setPollOpen(false);
    // refresh the poll so the dashboard strip shows latest tallies / voted state
    axios.get(`${API}/polls/active`).then(({ data }) => data && setPoll(data)).catch(() => {});
  };

  if (loading) return <div className="spinner-page">Loading your dashboard…</div>;

  const now = new Date();
  const isExpired = (e) => e.expiresAt && new Date(e.expiresAt) <= now;
  const active   = enrollments.filter(e => e.status === 'active' && !isExpired(e));
  const expired  = enrollments.filter(e => e.status === 'active' && isExpired(e));
  const pending  = enrollments.filter(e => e.status === 'pending');
  const rejected = enrollments.filter(e => e.status === 'rejected');

  // most recently active course for "continue learning"
  const continueCourse = active
    .map(e => ({ e, s: summary[String(e.course._id)] }))
    .filter(x => x.s && x.s.total > 0 && x.s.completed < x.s.total)
    .sort((a, b) => new Date(b.s.lastActivity) - new Date(a.s.lastActivity))[0];

  // ── Live events split into "I'm registered" vs "new / not registered yet" ──
  const regByEvent = {};
  myRegs.forEach(r => { if (r.event?._id) regByEvent[String(r.event._id)] = r; });

  const myLiveRegs = myRegs.filter(
    r => r.event && !r.event.isCompleted && ['active', 'pending'].includes(r.status)
  );
  // Show ONLY events that are still open for registration and the student
  // hasn't registered for yet. (registrationOpen is computed server-side.)
  const newEvents = events
    .filter(e => !regByEvent[String(e._id)] && e.registrationOpen)
    .sort((a, b) => new Date(a.startsAt || 0) - new Date(b.startsAt || 0));

  // The soonest one becomes the attention-grabbing hero; the rest are cards.
  const heroEvent = newEvents[0];
  const restEvents = newEvents.slice(1);
  const heroCountdown = countdownParts(heroEvent?.startsAt);

  const fmtEvent = (d) => d ? new Date(d).toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }) : '';

  return (
    <div className="page">
      {pollOpen && poll && (
        <PollModal poll={poll} onClose={handlePollClose} />
      )}
      <div className="container section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          {user.avatar && (
            <img src={user.avatar} alt={user.name} referrerPolicy="no-referrer"
              style={{ width: 52, height: 52, borderRadius: '50%', border: '2px solid var(--accent)' }} />
          )}
          <div>
            <h1 style={{ fontSize: 24, marginBottom: 2 }}>
              Namaste, {user.name.split(' ')[0]} 👋
            </h1>
            <p className="muted small">Pick up where you left off.</p>
          </div>
        </div>

        {/* Compact poll reminder once the modal has been handled this session */}
        {poll && !pollOpen && (
          <div className="poll-strip">
            <span>📊</span>
            <span className="poll-strip-q">
              {poll.hasVoted ? 'Thanks for voting!' : 'We’d love your vote:'} {poll.question}
            </span>
            <button className="poll-strip-open" onClick={() => setPollOpen(true)}>
              {poll.hasVoted ? 'See results →' : 'Vote now →'}
            </button>
          </div>
        )}

        {answered.length > 0 && (
          <div className="card" style={{ borderColor: 'var(--accent)', marginBottom: 20 }}>
            <strong style={{ color: 'var(--accent)' }}>Rajeev sir answered your doubt{answered.length > 1 ? 's' : ''} ✅</strong>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {answered.map(q => (
                <p key={q._id} className="small muted">
                  <Link to={`/episodes/${q.episode?._id || q.episode}`}>
                    #{q.episode?.episodeNumber} {q.episode?.title || 'Lesson'}
                  </Link>
                  {q.course?.title ? ` — ${q.course.title}` : ''} · answered{' '}
                  {new Date(q.answeredAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                </p>
              ))}
            </div>
          </div>
        )}

        {pending.length > 0 && (
          <div className="card" style={{ borderColor: 'var(--warning)', marginBottom: 20 }}>
            <strong style={{ color: 'var(--warning)' }}>Payment under verification</strong>
            <p className="small muted" style={{ marginTop: 4 }}>
              {pending.map(p => p.course.title).join(', ')} — access unlocks after verification, usually within a few hours.
            </p>
          </div>
        )}

        {expired.map(r => (
          <div key={r._id} className="card" style={{ borderColor: 'var(--warning)', marginBottom: 20 }}>
            <strong style={{ color: 'var(--warning)' }}>Access expired — {r.course.title}</strong>
            <p className="small muted" style={{ marginTop: 4 }}>
              Your access ended on {new Date(r.expiresAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}.{' '}
              <Link to={`/pay/${r.course.slug}`}>Renew access →</Link>
            </p>
          </div>
        ))}

        {rejected.map(r => (
          <div key={r._id} className="card" style={{ borderColor: 'var(--danger)', marginBottom: 20 }}>
            <strong style={{ color: 'var(--danger)' }}>Payment issue — {r.course.title}</strong>
            <p className="small muted" style={{ marginTop: 4 }}>
              {r.rejectReason || 'Your payment could not be verified.'}{' '}
              <Link to={`/pay/${r.course.slug}`}>Resubmit payment →</Link>
            </p>
          </div>
        ))}

        {continueCourse && (
          <div className="card card-hover" style={{ marginBottom: 26, borderColor: 'var(--accent)' }}>
            <span className="badge badge-accent" style={{ marginBottom: 10 }}>Continue learning</span>
            <h2 style={{ fontSize: 19, margin: '6px 0 12px' }}>{continueCourse.e.course.title}</h2>
            <ProgressBar completed={continueCourse.s.completed} total={continueCourse.s.total} />
            <button className="btn btn-primary" style={{ marginTop: 16 }}
              onClick={() => navigate(`/courses/${continueCourse.e.course.slug}`)}>
              Resume course →
            </button>
          </div>
        )}

        {/* ── My live sessions (registered) ── */}
        {myLiveRegs.length > 0 && (
          <>
            <h2 style={{ fontSize: 18, marginBottom: 14 }}>Your live sessions</h2>
            <div className="grid-cards" style={{ marginBottom: 26 }}>
              {myLiveRegs.map(r => (
                <Link key={r._id} to={`/events/${r.event.slug}`} className="card card-hover" style={{ color: 'inherit' }}>
                  {r.event.thumbnail && (
                    <img src={r.event.thumbnail} alt="" style={{ borderRadius: 8, marginBottom: 12, aspectRatio: '16/9', objectFit: 'cover' }} />
                  )}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span className="badge badge-muted">{r.event.type === 'workshop' ? 'Workshop' : 'Live class'}</span>
                    {r.status === 'active'
                      ? <span className="badge badge-success">Registered</span>
                      : <span className="badge badge-warning">Payment under verification</span>}
                  </div>
                  <h3 style={{ fontSize: 16, marginBottom: 6 }}>{r.event.title}</h3>
                  {r.event.sessions?.[0] && (
                    <p className="small muted">{fmtEvent(r.event.sessions[0].startsAt)}</p>
                  )}
                </Link>
              ))}
            </div>
          </>
        )}

        {/* ── New live session — HERO banner for the most imminent one ── */}
        {heroEvent && (
          <div className="live-hero">
            <div className="live-hero-body">
              <span className="live-eyebrow">
                <span className="live-dot" />
                {heroEvent.type === 'workshop' ? 'Live workshop · registering now' : 'Live class · registering now'}
              </span>
              <h2 className="live-hero-title">{heroEvent.title}</h2>
              <p className="live-hero-meta">
                <strong>{fmtEvent(heroEvent.startsAt)}</strong>
                {heroEvent.sessions?.length > 1 && <> · {heroEvent.sessions.length} days</>}
                {' · '}
                {heroEvent.isPaid ? <>₹{heroEvent.price}</> : 'Free'}
              </p>
              <button className="btn btn-primary live-hero-cta"
                onClick={() => navigate(`/events/${heroEvent.slug}`)}>
                {heroEvent.isPaid ? 'Grab your seat →' : 'Register free →'}
              </button>
            </div>

            <div>
              {heroCountdown ? (
                <div className="live-count">
                  <div className="live-count-unit">
                    <div className="live-count-num">{heroCountdown.d}</div>
                    <div className="live-count-lbl">Days</div>
                  </div>
                  <div className="live-count-unit">
                    <div className="live-count-num">{String(heroCountdown.h).padStart(2, '0')}</div>
                    <div className="live-count-lbl">Hrs</div>
                  </div>
                  <div className="live-count-unit">
                    <div className="live-count-num">{String(heroCountdown.m).padStart(2, '0')}</div>
                    <div className="live-count-lbl">Min</div>
                  </div>
                  <div className="live-count-unit">
                    <div className="live-count-num">{String(heroCountdown.s).padStart(2, '0')}</div>
                    <div className="live-count-lbl">Sec</div>
                  </div>
                </div>
              ) : (
                <div className="live-count">
                  <div className="live-count-unit" style={{ minWidth: 0, flex: 1 }}>
                    <div className="live-count-num" style={{ fontSize: 20 }}>Starting soon</div>
                  </div>
                </div>
              )}
              {typeof heroEvent.seatsLeft === 'number' && heroEvent.seatsLeft <= 10 && (
                <p className="live-seats">
                  {heroEvent.seatsLeft > 0 ? `Only ${heroEvent.seatsLeft} seats left` : 'Waitlist only'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Any additional open sessions as compact cards ── */}
        {restEvents.length > 0 && (
          <>
            <h2 style={{ fontSize: 18, marginBottom: 14 }}>More live sessions</h2>
            <div className="grid-cards" style={{ marginBottom: 26 }}>
              {restEvents.map(e => (
                <div key={e._id} className="card card-hover">
                  {e.thumbnail && (
                    <img src={e.thumbnail} alt="" style={{ borderRadius: 8, marginBottom: 12, aspectRatio: '16/9', objectFit: 'cover' }} />
                  )}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span className="badge badge-muted">{e.type === 'workshop' ? 'Workshop' : 'Live class'}</span>
                    {e.isPaid
                      ? <span className="badge badge-warning">₹{e.price}</span>
                      : <span className="badge badge-accent">Free</span>}
                  </div>
                  <h3 style={{ fontSize: 16, marginBottom: 6 }}>{e.title}</h3>
                  {e.startsAt && (
                    <p className="small muted" style={{ marginBottom: 12 }}>{fmtEvent(e.startsAt)}</p>
                  )}
                  <button className="btn btn-primary btn-sm btn-block"
                    onClick={() => navigate(`/events/${e.slug}`)}>
                    {e.isPaid ? 'View & register →' : 'Register free →'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <h2 style={{ fontSize: 18, marginBottom: 14 }}>My courses</h2>
        {active.length === 0 ? (
          <div className="empty-state">
            <p>You haven't joined any course yet.</p>
            <Link to="/courses" className="btn btn-primary" style={{ marginTop: 14 }}>Browse courses</Link>
          </div>
        ) : (
          <div className="grid-cards">
            {active.map(({ course, _id }) => {
              const s = summary[String(course._id)] || { completed: 0, total: 0 };
              return (
                <Link key={_id} to={`/courses/${course.slug}`} className="card card-hover" style={{ color: 'inherit' }}>
                  {course.thumbnail && (
                    <img src={course.thumbnail} alt="" style={{ borderRadius: 8, marginBottom: 12, aspectRatio: '16/9', objectFit: 'cover' }} />
                  )}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <span className="badge badge-muted">{course.level || 'Beginner'}</span>
                    {course.isPaid
                      ? <span className="badge badge-success">Purchased</span>
                      : <span className="badge badge-accent">Free</span>}
                  </div>
                  <h3 style={{ fontSize: 16, marginBottom: 12 }}>{course.title}</h3>
                  <ProgressBar completed={s.completed} total={s.total} />
                  {_id && enrollments.find(e => e._id === _id)?.expiresAt && (
                    <p className="small muted" style={{ marginTop: 8 }}>
                      Access till {new Date(enrollments.find(e => e._id === _id).expiresAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        <MentorHubSection />

        <SuggestBox />

        {explore.length > 0 && (
          <>
            <h2 style={{ fontSize: 18, margin: '32px 0 14px' }}>Explore more</h2>
            <div className="grid-cards">
              {explore.slice(0, 6).map(course => (
                <Link key={course._id} to={`/courses/${course.slug}`} className="card card-hover" style={{ color: 'inherit' }}>
                  {course.thumbnail && (
                    <img src={course.thumbnail} alt="" style={{ borderRadius: 8, marginBottom: 12, aspectRatio: '16/9', objectFit: 'cover' }} />
                  )}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <span className="badge badge-muted">{course.episodeCount} lessons</span>
                    {course.isPaid
                      ? <span className="badge badge-warning">₹{course.price}</span>
                      : <span className="badge badge-accent">Free</span>}
                  </div>
                  <h3 style={{ fontSize: 16, marginBottom: 6 }}>{course.title}</h3>
                  <p className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {course.description}
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
