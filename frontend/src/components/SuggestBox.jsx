import { useState } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL;

// Always-on "suggest a topic" box for the student dashboard.
// Free text, submitted privately — only the admin reads these.
export default function SuggestBox() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr]   = useState('');

  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setErr('');
    try {
      await axios.post(`${API}/suggestions`, { text: t });
      setText('');
      setSent(true);
    } catch (e) {
      setErr(e.response?.data?.message || 'Could not send. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="suggest-box">
      <div className="suggest-head">
        <span className="suggest-icon">💡</span>
        <div>
          <h3 className="suggest-title">Got a topic in mind?</h3>
          <p className="suggest-sub">Tell Rajeev sir what you’d like the next session to cover.</p>
        </div>
      </div>

      {sent ? (
        <div className="suggest-thanks">
          Thanks — your idea is in! <button className="suggest-again" onClick={() => setSent(false)}>Suggest another</button>
        </div>
      ) : (
        <>
          <div className="suggest-row">
            <input
              className="input"
              value={text}
              maxLength={500}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              placeholder="e.g. Building a REST API with Node & Express"
            />
            <button className="btn btn-primary" onClick={submit} disabled={!text.trim() || busy} type="button">
              {busy ? 'Sending…' : 'Send'}
            </button>
          </div>
          {err && <p className="suggest-err">{err}</p>}
        </>
      )}
    </div>
  );
}
