import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import MentorHubSection from '../components/MentorHubSection';
import PollModal from '../components/PollModal';
import SuggestBox from '../components/SuggestBox';
import { FeedbackPrompt } from '../components/Feedback';
import Cover from '../components/Cover';
import TechForYou from '../components/TechForYou';
import ClassTicket, { endOf, byStart, fmtTime, fmtEvent, sameDay } from '../components/ClassTicket';

const API = import.meta.env.VITE_API_URL;

function Bar({ completed = 0, total = 0 }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="db-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
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

  // re-render every 20s so the class countdown + Join button stay current
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 20000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // Each part loads independently: one slow or failing call never blanks the others.
    Promise.allSettled([
      axios.get(`${API}/courses/my/enrollments`),
      axios.get(`${API}/progress/summary`),
      axios.get(`${API}/courses`),
    ]).then(([enr, prog, all]) => {
      const mine = enr.status === 'fulfilled' ? enr.value.data : [];
      setEnrollments(mine);
      if (prog.status === 'fulfilled') setSummary(Object.fromEntries(prog.value.data.map(p => [String(p.course), p])));
      const enrolledIds = new Set(mine.map(e => String(e.course._id)));
      if (all.status === 'fulfilled') setExplore(all.value.data.filter(c => !enrolledIds.has(String(c._id)) && c.episodeCount > 0));
    }).finally(() => setLoading(false));

    // new replies on my doubts are non-critical — load separately, fail silently
    axios.get(`${API}/questions/my/activity`)
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

  if (loading) {
    return (
      <div className="page"><div className="container section db" aria-busy="true">
        <div className="skel skel-h1" /><div className="skel skel-ticket" /><div className="skel skel-row" />
      </div></div>
    );
  }

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

  // ── Live programs ──
  const regByEvent = {};
  myRegs.forEach(r => { if (r.event?._id) regByEvent[String(r.event._id)] = r; });

  const myLiveRegs = myRegs.filter(
    r => r.event && ['active', 'pending'].includes(r.status) && (
      !r.event.isCompleted ||
      // finished programs stay here while they have recordings to rewatch
      (r.status === 'active' && (r.event.sessions || []).some(x => x.recordingUrl))
    )
  );
  const pendingRegs = myLiveRegs.filter(r => r.status === 'pending');

  // Per program: next class, class number, latest recording
  const programs = myLiveRegs.filter(r => r.status === 'active').map(r => {
    const ss = [...(r.event.sessions || [])].sort(byStart).map((s, i) => ({ ...s, number: i + 1 }));
    const next = ss.find(s => endOf(s) > Date.now());
    const done = ss.filter(s => endOf(s) <= Date.now()).length;
    const recs = ss.filter(s => s.recordingUrl);
    const lastRec = recs[recs.length - 1];
    return { reg: r, event: r.event, sessions: ss, next, done, recs, lastRec };
  });

  // The ticket = the soonest upcoming class across all programs
  const ticketProg = programs.filter(p => p.next && !p.event.isCompleted)
    .sort((a, b) => byStart(a.next, b.next))[0];
  const ticket = ticketProg && {
    event: ticketProg.event, session: ticketProg.next, number: ticketProg.next.number,
    total: ticketProg.sessions.length, lastRec: ticketProg.lastRec,
  };

  // Programs still open for registration that this student hasn't joined
  const newEvents = events
    .filter(e => !regByEvent[String(e._id)] && e.registrationOpen)
    .sort((a, b) => new Date(a.startsAt || 0) - new Date(b.startsAt || 0));

  const ticketLive = ticket && Date.now() >= new Date(ticket.session.startsAt).getTime();
  const subtitle = ticketLive ? `Class ${ticket.number} is live now.`
    : ticket && sameDay(ticket.session.startsAt, now)
    ? `Class ${ticket.number} is today at ${fmtTime(ticket.session.startsAt)}.`
    : continueCourse ? 'Pick up where you left off.' : 'Here’s everything in one place.';

  const notices = [
    ...pendingRegs.map(r => ({ key: r._id, tone: 'warn', title: `Verifying your payment for ${r.event.title}`, body: 'Your seat is confirmed as soon as it’s verified, usually within a few hours.' })),
    ...pending.map(p => ({ key: p._id, tone: 'warn', title: `Verifying your payment for ${p.course.title}`, body: 'Access unlocks after verification, usually within a few hours.' })),
    ...expired.map(r => ({ key: r._id, tone: 'warn', title: `Access ended for ${r.course.title}`, body: `Ended on ${new Date(r.expiresAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}.`, link: { to: `/pay/${r.course.slug}`, label: 'Renew access' } })),
    ...rejected.map(r => ({ key: r._id, tone: 'bad', title: `Payment not verified for ${r.course.title}`, body: r.rejectReason || 'We couldn’t match your payment.', link: { to: `/pay/${r.course.slug}`, label: 'Resubmit payment' } })),
  ];

  return (
    <div className="page">
      {pollOpen && poll && <PollModal poll={poll} onClose={handlePollClose} />}

      <div className="container section db">
        <header className="db-hello">
          {user.avatar
            ? <img className="db-hello-avatar" src={user.avatar} alt="" referrerPolicy="no-referrer" />
            : <span className="db-hello-avatar db-hello-initial" aria-hidden="true">{user.name[0]}</span>}
          <div>
            <h1><span lang="hi" className="db-namaste">नमस्ते</span>, {user.name.split(' ')[0]}</h1>
            <p>{subtitle}</p>
          </div>
        </header>

        {notices.length > 0 && (
          <div className="db-notices">
            {notices.map(n => (
              <div key={n.key} className={`db-notice db-notice-${n.tone}`} role="status">
                <strong>{n.title}</strong>
                <span>{n.body}{n.link && <> <Link to={n.link.to}>{n.link.label}</Link></>}</span>
              </div>
            ))}
          </div>
        )}

        <div className="db-grid">
          <div className="db-main">
            {ticket && <ClassTicket t={ticket} />}

            <FeedbackPrompt />

            {continueCourse && (
              <section className="db-block">
                <h2 className="db-h2">Continue learning</h2>
                <Link to={`/courses/${continueCourse.e.course.slug}`} className="db-continue">
                  <Cover course={continueCourse.e.course} />
                  <div className="db-continue-body">
                    <div className="db-continue-title">{continueCourse.e.course.title}</div>
                    <Bar completed={continueCourse.s.completed} total={continueCourse.s.total} />
                    <div className="db-meta">
                      {continueCourse.s.completed} of {continueCourse.s.total} lessons done
                    </div>
                  </div>
                  <span className="btn btn-primary btn-sm db-continue-go">Resume</span>
                </Link>
              </section>
            )}

            {programs.length > 0 && (
              <section className="db-block">
                <h2 className="db-h2">Your live programs</h2>
                <div className="db-rows">
                  {programs.map(p => (
                    <Link key={p.reg._id} to={`/events/${p.event.slug}`} className="db-row">
                      {p.event.thumbnail && <img className="db-row-thumb" src={p.event.thumbnail} alt="" loading="lazy" />}
                      <div className="db-row-main">
                        <div className="db-row-title">{p.event.title}</div>
                        <div className="db-meta">
                          {p.event.isCompleted || !p.next
                            ? `Completed, ${p.recs.length} recording${p.recs.length === 1 ? '' : 's'} to rewatch`
                            : `${p.done} of ${p.sessions.length} classes done${p.recs.length ? `, ${p.recs.length} recording${p.recs.length === 1 ? '' : 's'}` : ''}`}
                        </div>
                        <Bar completed={p.done} total={p.sessions.length} />
                      </div>
                      <span className="db-chev" aria-hidden="true">›</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <TechForYou />

            <section className="db-block">
              <div className="db-head">
                <h2 className="db-h2">Your courses</h2>
                <Link to="/courses" className="db-more">All courses</Link>
              </div>
              {active.length === 0 ? (
                <div className="db-empty">
                  <p>You haven’t joined a course yet. Start with a free one.</p>
                  <Link to="/courses" className="btn btn-primary btn-sm">Browse courses</Link>
                </div>
              ) : (
                <div className="rail">
                  {active.map(({ course, _id, viaEvent, expiresAt }) => {
                    const s = summary[String(course._id)] || { completed: 0, total: 0 };
                    return (
                      <Link key={_id} to={`/courses/${course.slug}`} className="rail-card">
                        <Cover course={course} />
                        <div className="rail-body">
                          <div className="rail-title">{course.title}</div>
                          <Bar completed={s.completed} total={s.total} />
                          <div className="db-meta">
                            {viaEvent ? 'Included with your live program'
                              : expiresAt ? `Access till ${new Date(expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                              : s.total ? `${s.completed} of ${s.total} lessons` : course.isPaid ? 'Purchased' : 'Free course'}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <aside className="db-side">
            {poll && !pollOpen && (
              <button className="db-poll" onClick={() => setPollOpen(true)}>
                <span className="db-poll-q">{poll.question}</span>
                <span className="db-more">{poll.hasVoted ? 'See results' : 'Vote'}</span>
              </button>
            )}

            {answered.length > 0 && (
              <section className="db-card">
                <h3 className="db-h3">New replies on your doubts</h3>
                <ul className="db-answers">
                  {answered.map(q => (
                    <li key={q._id}>
                      <Link to={`/discuss/${q._id}`}>{q.text.replace(/```[\s\S]*?```/g, ' [code] ').replace(/\s+/g, ' ').slice(0, 90)}</Link>
                      <span className="db-meta">
                        {q.byInstructor ? 'Rajeev sir' : q.lastReplyBy}
                        {q.newReplies > 1 ? ` and ${q.newReplies - 1} more` : ''} replied
                        {q.course?.title ? `, ${q.course.title}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {newEvents.length > 0 && (
              <section className="db-card db-open">
                <h3 className="db-h3">Open for registration</h3>
                {newEvents.slice(0, 3).map(e => (
                  <Link key={e._id} to={`/events/${e.slug}`} className="db-open-row">
                    {e.thumbnail && <img className="db-open-thumb" src={e.thumbnail} alt="" loading="lazy" />}
                    <div className="db-open-main">
                      <div className="db-open-title">{e.title}</div>
                      <div className="db-meta">
                        Starts {fmtEvent(e.startsAt)}
                        {typeof e.seatsLeft === 'number' && e.seatsLeft <= 30 && (
                          <span className="db-seats">{e.seatsLeft > 0 ? `${e.seatsLeft} seats left` : 'Waitlist'}</span>
                        )}
                      </div>
                    </div>
                    <span className="db-price">{e.isPaid ? `₹${e.price}` : 'Free'}</span>
                  </Link>
                ))}
              </section>
            )}

            <MentorHubSection />
            <SuggestBox />
          </aside>
        </div>

        {explore.length > 0 && (
          <section className="db-block db-explore">
            <div className="db-head">
              <h2 className="db-h2">Explore more</h2>
              <Link to="/courses" className="db-more">See all</Link>
            </div>
            <div className="rail">
              {explore.slice(0, 8).map(course => (
                <Link key={course._id} to={`/courses/${course.slug}`} className="rail-card">
                  <Cover course={course} />
                  <div className="rail-body">
                    <div className="rail-title">{course.title}</div>
                    <div className="db-meta">
                      {course.episodeCount ? `${course.episodeCount} ${course.episodeCount === 1 ? 'lesson' : 'lessons'}` : ''}
                      <span className="db-price-inline">{course.isPaid ? `₹${course.price}` : 'Free'}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
