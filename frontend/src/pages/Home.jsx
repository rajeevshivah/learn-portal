import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { PublicBar } from '../components/Navbar';
import Cover from '../components/Cover';
import { Testimonials } from '../components/Feedback';

const API = import.meta.env.VITE_API_URL;

const fmtTime = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
const fmtDay = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

// Public homepage for first-time visitors: what's on offer before any sign-in.
export default function Home() {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [programs, setPrograms] = useState([]);
  const [courses, setCourses] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`${API}/events/public`).then(({ data }) => setPrograms(data)).catch(() => {});
    axios.get(`${API}/courses`).then(({ data }) => setCourses(data.filter(c => c.episodeCount > 0))).catch(() => {});
  }, []);

  const onGoogle = async (cred) => {
    try { await loginWithGoogle(cred.credential); navigate('/dashboard'); }
    catch { setError('Sign-in failed. Please try again.'); }
  };

  const lead = programs[0];
  const free = courses.filter(c => !c.isPaid);
  const paid = courses.filter(c => c.isPaid);

  return (
    <div className="page home">
      <PublicBar />

      <section className="container home-hero">
        <div className="home-hero-text">
          <h1>Learn to code by building real things, live.</h1>
          <p className="home-lede">
            Live evening classes and short recorded courses by Rajeev Shivah, taught in Hinglish.
            Every live class is recorded with notes, so you never fall behind.
          </p>
          <div className="home-signin">
            <GoogleLogin onSuccess={onGoogle} onError={() => setError('Sign-in failed. Please try again.')}
              theme="filled_black" shape="pill" text="continue_with" />
            <Link to="/courses" className="btn btn-ghost">Browse courses</Link>
          </div>
          {error && <p className="small" style={{ color: 'var(--danger)', marginTop: 10 }}>{error}</p>}
          <p className="home-fine">Free to sign up. Pay only for the programs you join.</p>
        </div>

        {lead && (
          <Link to={`/live/${lead.slug}`} className="ticket home-ticket" aria-label={`${lead.title}, register`}>
            <div className="ticket-main">
              <span className="ticket-program">Open for registration</span>
              <h2 className="ticket-title">{lead.title}</h2>
              <div className="ticket-when">
                <span className="ticket-time">{fmtTime(lead.startsAt)}</span>
                <span className="ticket-date">
                  Starts {fmtDay(lead.startsAt)}
                  <span className="ticket-in">{lead.classCount} live {lead.classCount === 1 ? 'class' : 'classes'}</span>
                </span>
              </div>
              <span className="btn btn-primary">{lead.isPaid ? 'Register' : 'Register free'}</span>
            </div>
            <div className="ticket-stub">
              {lead.thumbnail && <img className="ticket-thumb" src={lead.thumbnail} alt="" />}
              {lead.isPaid ? (
                <>
                  <div className="ticket-num"><span className="ticket-num-big home-price">₹{lead.price}</span></div>
                  {lead.mrp > lead.price && <span className="ticket-num-lbl home-mrp">₹{lead.mrp}</span>}
                </>
              ) : (
                <div className="ticket-num"><span className="ticket-num-big home-price">Free</span></div>
              )}
              {typeof lead.seatsLeft === 'number' && <span className="ticket-num-lbl home-seats">{lead.seatsLeft} seats left</span>}
            </div>
          </Link>
        )}
      </section>

      {programs.length > 1 && (
        <section className="container home-sec">
          <h2 className="home-h2">More live programs</h2>
          <div className="db-rows">
            {programs.slice(1).map(p => (
              <Link key={p._id} to={`/live/${p.slug}`} className="db-row">
                <div className="db-row-main">
                  <div className="db-row-title">{p.title}</div>
                  <div className="db-meta">Starts {fmtDay(p.startsAt)}, {fmtTime(p.startsAt)} · {p.classCount} {p.classCount === 1 ? 'class' : 'classes'}</div>
                </div>
                <span className="db-price">{p.isPaid ? `₹${p.price}` : 'Free'}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {courses.length > 0 && (
        <section className="container home-sec">
          <div className="db-head">
            <h2 className="home-h2">Courses</h2>
            <Link to="/courses" className="db-more">See all</Link>
          </div>
          <div className="rail">
            {[...free, ...paid].slice(0, 8).map(c => (
              <Link key={c._id} to={`/courses/${c.slug}`} className="rail-card">
                <Cover course={c} />
                <div className="rail-body">
                  <div className="rail-title">{c.title}</div>
                  <div className="db-meta">
                    {c.episodeCount} {c.episodeCount === 1 ? 'lesson' : 'lessons'}
                    <span className="db-price-inline">{c.isPaid ? `₹${c.price}` : 'Free'}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="container home-sec">
        <h2 className="home-h2">How a live program works</h2>
        <ol className="home-steps">
          <li><strong>Register</strong><span>Pay by UPI or card. Your seat is confirmed on your Home screen.</span></li>
          <li><strong>Join live in the evening</strong><span>A Join button appears 15 minutes before each class. Ask your doubts as we build.</span></li>
          <li><strong>Rewatch anytime</strong><span>Each class is recorded with notes and stays in your account.</span></li>
        </ol>
      </section>

      <div className="container home-sec">
        <Testimonials />
      </div>

      <footer className="container home-foot">
        <span>codeWithShivah by Rajeev Shivah</span>
        <Link to="/courses">Courses</Link>
        <Link to="/login">Sign in</Link>
      </footer>
    </div>
  );
}
