import { useState } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL;

// Blocking dashboard poll. The student must vote or dismiss to proceed.
// After voting, the vote is locked and live results are shown.
// `poll` is the shaped object from GET /api/polls/active.
// onClose() is called when the student dismisses or finishes.
export default function PollModal({ poll, onClose }) {
  const [state, setState]   = useState(poll);       // updates with fresh tallies after voting
  const [picked, setPicked] = useState(null);       // option selected before submitting
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState('');

  const voted = state.hasVoted;

  const submit = async () => {
    if (!picked || busy) return;
    setBusy(true); setErr('');
    try {
      const { data } = await axios.post(`${API}/polls/${state._id}/vote`, { optionId: picked });
      setState(data);
    } catch (e) {
      setErr(e.response?.data?.message || 'Could not record your vote. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const total = state.totalVotes || 0;
  const pct = (v) => (total > 0 ? Math.round((v / total) * 100) : 0);

  return (
    <div className="poll-overlay" role="dialog" aria-modal="true">
      <div className="poll-modal">
        <span className="poll-eyebrow">📊 Quick question from Rajeev sir</span>
        <h2 className="poll-question">{state.question}</h2>

        {!voted ? (
          <>
            <p className="poll-sub">Pick one — your vote decides the next session.</p>
            <div className="poll-options">
              {state.options.map(o => (
                <button
                  key={o._id}
                  className={`poll-option${picked === o._id ? ' picked' : ''}`}
                  onClick={() => setPicked(o._id)}
                  type="button"
                >
                  <span className="poll-radio" />
                  <span>{o.text}</span>
                </button>
              ))}
            </div>
            {err && <p className="poll-err">{err}</p>}
            <div className="poll-actions">
              <button className="btn btn-ghost btn-sm" onClick={onClose} type="button">Maybe later</button>
              <button className="btn btn-primary" onClick={submit} disabled={!picked || busy} type="button">
                {busy ? 'Submitting…' : 'Submit vote'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="poll-sub">Thanks for voting! Here’s how everyone’s leaning:</p>
            <div className="poll-results">
              {state.options.map(o => {
                const mine = String(o._id) === String(state.votedOptionId);
                return (
                  <div key={o._id} className="poll-result-row">
                    <div className="poll-result-head">
                      <span>{o.text}{mine ? ' ✓' : ''}</span>
                      <span className="poll-result-pct">{pct(o.votes)}% · {o.votes}</span>
                    </div>
                    <div className="poll-bar-track">
                      <div className={`poll-bar-fill${mine ? ' mine' : ''}`} style={{ width: `${pct(o.votes)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="poll-total">{total} vote{total === 1 ? '' : 's'} so far</p>
            <div className="poll-actions">
              <button className="btn btn-primary" onClick={onClose} type="button">Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
