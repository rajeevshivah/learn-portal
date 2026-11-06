import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSummary } from './TechFeed';

// Slim strip on the dashboard. Everything else lives on /tech.
export default function TechForYou() {
  const [s, setS] = useState(null);
  useEffect(() => { fetchSummary().then(setS).catch(() => setS(null)); }, []);
  if (!s) return null;

  if (!s.goalSet) {
    return (
      <Link to="/tech" className="tx-strip">
        <span className="tx-strip-icon" aria-hidden="true">⚡</span>
        <span className="tx-strip-body">
          <strong>Tech news & hackathons for your goal</strong>
          <span>Pick what you’re preparing for · 30 seconds</span>
        </span>
        <span className="tx-strip-go">Set up ›</span>
      </Link>
    );
  }

  const bits = [
    s.newForYou ? `${s.newForYou} new for ${s.following[0] || 'you'}` : `Following ${s.following[0] || 'your goal'}`,
    s.closingThisWeek ? `${s.closingThisWeek} hackathon${s.closingThisWeek > 1 ? 's' : ''} closing this week` : '',
    s.nearYou ? `${s.nearYou} near ${s.city || 'you'}` : '',
  ].filter(Boolean);

  return (
    <Link to="/tech" className="tx-strip">
      <span className="tx-strip-icon" aria-hidden="true">⚡</span>
      <span className="tx-strip-body">
        <strong>Tech for you</strong>
        <span>{bits.join(' · ')}</span>
      </span>
      <span className="tx-strip-go" aria-hidden="true">›</span>
    </Link>
  );
}
