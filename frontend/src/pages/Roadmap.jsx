import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL;

// Public lead-magnet page: one roadmap PDF, shared from Instagram / YouTube.
// No login. The board holds the download; below it, what's live right now.
export default function Roadmap() {
  const { slug } = useParams();
  const [data, setData]       = useState(null);
  const [promos, setPromos]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [dl, setDl]           = useState('idle');   // idle | busy | done | failed

  useEffect(() => {
    axios.get(`${API}/roadmaps/public/${slug}`)
      .then(r => setData(r.data))
      .catch(err => setError(err.response?.data?.message || 'Roadmap not found'))
      .finally(() => setLoading(false));
    axios.get(`${API}/promotions/public/for-roadmap/${slug}`)
      .then(r => setPromos(Array.isArray(r.data) ? r.data : []))
      .catch(() => setPromos([]));
  }, [slug]);

  const filename = () => `${data.title.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-')}-Roadmap.pdf`;

  const handleDownload = async () => {
    if (!data.pdfUrl) return;
    setDl('busy');
    try {
      const response = await fetch(data.pdfUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (!blob.size) throw new Error('empty');
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename();
      document.body.appendChild(a); a.click();
      window.URL.revokeObjectURL(url); document.body.removeChild(a);
      axios.post(`${API}/roadmaps/public/${slug}/download`).catch(() => {});   // count only real downloads
      setDl('done');
    } catch {
      // The file host refused (e.g. delivery switched off). Opening it in a tab at least shows the real error.
      setDl('failed');
      window.open(data.pdfUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const fmtWhen = (d) => d ? new Date(d).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

  if (loading) return <div className="page rm"><div className="rm-wrap"><p className="muted">Loading…</p></div></div>;

  if (error) return (
    <div className="page rm">
      <div className="rm-wrap">
        <Brand />
        <div className="rm-board rm-board-empty">
          <h1>This roadmap isn’t here any more</h1>
          <p>{error}. The courses it pointed to are still open.</p>
          <Link to="/courses" className="btn rm-chalk-btn">See the courses</Link>
        </div>
      </div>
    </div>
  );

  const live = promos.filter(p => p.kind === 'event');
  const rest = promos.filter(p => p.kind !== 'event');

  return (
    <div className="page rm">
      <div className="rm-wrap">
        <Brand />

        {/* The board: title + download */}
        <section className="rm-board">
          <p className="rm-kicker">Free roadmap</p>
          <h1 className="rm-title">{data.title}</h1>
          {data.description && <p className="rm-desc">{data.description}</p>}
          <div className="rm-actions">
            <button className="btn rm-chalk-btn" onClick={handleDownload} disabled={dl === 'busy' || !data.pdfUrl}>
              {dl === 'busy' ? 'Getting the PDF…' : dl === 'done' ? 'Downloaded. Get it again' : 'Download the PDF'}
            </button>
            <span className="rm-fine">{!data.pdfUrl ? 'The PDF is being added. Check back soon.' : 'No sign-up. Yours to keep.'}</span>
          </div>
          {dl === 'failed' && (
            <p className="rm-warn" role="alert">
              The file didn’t come through, so we opened it in a new tab. If that’s blank too, message Rajeev sir on Instagram and he’ll send it.
            </p>
          )}
        </section>

        {/* What's live right now (admin-controlled) */}
        {live.length > 0 && (
          <section className="rm-section">
            <h2 className="rm-h2"><span className="rm-live-dot" aria-hidden="true" /> Happening now</h2>
            {live.map(p => <Promo key={p.id} p={p} when={fmtWhen(p.startsAt)} />)}
          </section>
        )}
        {rest.length > 0 && (
          <section className="rm-section">
            <h2 className="rm-h2">Picked for you</h2>
            {rest.map(p => <Promo key={p.id} p={p} />)}
          </section>
        )}

        {/* The funnel, said once */}
        <section className="rm-section rm-next">
          <h2 className="rm-h2">The roadmap is the map. The classes are the journey.</h2>
          <p className="rm-lead">
            Live evening classes in Hinglish, recorded with notes, and a mentor who answers your doubts.
            Every class lives inside the learning portal, free to join.
          </p>
          <ul className="rm-list">
            <li>Structured courses, lesson by lesson, from basics to job-ready</li>
            <li>Notes, code and practice tasks with every lesson</li>
            <li>Your progress saved, so you always know what’s next</li>
          </ul>
          {data.course
            ? <Link to={`/courses/${data.course.slug}`} className="btn btn-primary rm-cta">Open the {data.course.title} course</Link>
            : <Link to="/courses" className="btn btn-primary rm-cta">See all courses</Link>}
        </section>

        <p className="rm-foot"><Link to="/">learn.rajeevshivah.me</Link> · codeWithShivah by Rajeev Shivah</p>
      </div>
    </div>
  );
}

function Brand() {
  return <Link to="/" className="rm-brand">code<span>With</span>Shivah</Link>;
}

function Promo({ p, when }) {
  return (
    <Link to={p.href} className="rm-promo">
      {p.thumbnail
        ? <img className="rm-promo-img" src={p.thumbnail} alt="" loading="lazy" />
        : <div className="rm-promo-img rm-promo-cover"><span>{p.kind === 'event' ? 'Live' : 'Course'}</span></div>}
      <div className="rm-promo-body">
        <div className="rm-promo-meta">
          {p.kind === 'event' ? 'Live program' : 'Recorded course'}{when ? ` · starts ${when}` : ''}
        </div>
        <h3 className="rm-promo-title">{p.headline}</h3>
        {p.subtext && <p className="rm-promo-text">{p.subtext}</p>}
        <div className="rm-promo-row">
          <span className="rm-promo-cta">{p.ctaLabel}</span>
          <span className="rm-promo-price">{p.isPaid ? `₹${p.price}` : 'Free'}</span>
        </div>
      </div>
    </Link>
  );
}
