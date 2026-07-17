import { useEffect, useState } from 'react';

// Cross-sell section: shows packages you flagged "show on learn portal"
// in MentorHub admin. Controlled by two env vars:
//   VITE_MENTORHUB_URL — the MentorHub site (e.g. https://mentorshub.rajeevshivah.me)
//   VITE_MENTORHUB_API — MentorHub backend base (e.g. https://mentorhub-api.onrender.com)
// If the API is unreachable but the site URL is set, a simple generic card shows.
// If neither is set, the whole section renders nothing.

const SITE = import.meta.env.VITE_MENTORHUB_URL;
const HUB_API = import.meta.env.VITE_MENTORHUB_API;

export default function MentorHubSection() {
  const [packages, setPackages] = useState(null); // null = loading, [] = none/failed

  useEffect(() => {
    if (!HUB_API) { setPackages([]); return; }
    // plain fetch — guarantees our learn-portal JWT is never sent to another backend
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    fetch(`${HUB_API}/api/packages/featured`, { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : []))
      .then(data => setPackages(Array.isArray(data) ? data.slice(0, 3) : []))
      .catch(() => setPackages([]))
      .finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, []);

  if (!SITE) return null;               // feature off
  if (packages === null) return null;   // still loading — don't flash

  // Fallback: API gave nothing, but site exists → one generic card
  if (packages.length === 0) {
    return (
      <div className="card" style={{ margin: '32px 0 8px', borderColor: 'var(--accent)' }}>
        <span className="badge badge-accent" style={{ marginBottom: 8 }}>1:1 Mentorship</span>
        <h3 style={{ fontSize: 16, margin: '6px 0 6px' }}>Stuck on something? Get live help.</h3>
        <p className="small muted" style={{ marginBottom: 14 }}>
          Book a one-on-one session with Rajeev sir — screen share, doubt solving, career guidance.
        </p>
        <a className="btn btn-primary btn-sm" href={SITE} target="_blank" rel="noreferrer">
          Visit MentorHub →
        </a>
      </div>
    );
  }

  return (
    <>
      <h2 style={{ fontSize: 18, margin: '32px 0 4px' }}>Live 1:1 mentorship</h2>
      <p className="small muted" style={{ marginBottom: 14 }}>
        Recorded lessons teach you — a live session unblocks you. Book directly with Rajeev sir.
      </p>
      <div className="grid-cards">
        {packages.map(p => (
          <div key={p._id || p.name} className="card card-hover">
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <span className="badge badge-accent">1:1 Session</span>
              {p.price != null && <span className="badge badge-warning">₹{p.price}</span>}
            </div>
            <h3 style={{ fontSize: 16, marginBottom: 6 }}>{p.name}</h3>
            {(p.tagline || p.description) && (
              <p className="small muted" style={{ marginBottom: 14, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {p.tagline || p.description}
              </p>
            )}
            <a className="btn btn-primary btn-sm" href={p.link || SITE} target="_blank" rel="noreferrer">
              Book session →
            </a>
          </div>
        ))}
      </div>
    </>
  );
}
