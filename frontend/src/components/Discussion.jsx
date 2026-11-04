import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import RichText from './RichText';
import Toast from './Toast';

const API = import.meta.env.VITE_API_URL;
const err = (e, fallback) => e.response?.data?.message || fallback;

export const ago = (d) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(d)) / 60000));
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const firstLine = (t = '') => t.replace(/```[\s\S]*?```/g, ' [code] ').replace(/\s+/g, ' ').trim();

function Face({ user, size = 24 }) {
  if (user?.avatar) return <img className="dq-face" src={user.avatar} alt="" referrerPolicy="no-referrer" style={{ width: size, height: size }} />;
  return <span className="dq-face dq-face-txt" style={{ width: size, height: size }}>{(user?.name || '?')[0]}</span>;
}

function Name({ user }) {
  return (
    <span className="dq-name">
      {user?.name || 'Student'}
      {user?.isAdmin && <span className="dq-instructor">Instructor</span>}
    </span>
  );
}

function VoteBtn({ score, voted, mine, onVote, size }) {
  return (
    <button type="button" className={`dq-vote ${voted ? 'on' : ''} ${size || ''}`} onClick={onVote} disabled={mine}
      aria-pressed={voted} aria-label={mine ? `${score} found this helpful` : voted ? 'Remove helpful vote' : 'Mark as helpful'}
      title={mine ? 'You can’t vote on your own post' : 'This helped'}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5 4 15h16z" /></svg>
      <span>{score}</span>
    </button>
  );
}

// ── Ask box ──────────────────────────────────────────────
export function AskBox({ target, lessons, onAsked, placeholder }) {
  const [text, setText] = useState('');
  const [lesson, setLesson] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const ask = async () => {
    if (!text.trim()) { setToast('Write your doubt first'); return; }
    setBusy(true);
    try {
      const body = { text: text.trim(), ...target };
      if (lessons && lesson) { body.episodeId = lesson; }
      const { data } = await axios.post(`${API}/questions`, body);
      setText(''); setToast('Doubt posted. You’ll see replies on Home.');
      onAsked?.(data);
    } catch (e) { setToast(err(e, 'Could not post your doubt')); }
    finally { setBusy(false); }
  };

  return (
    <div className="dq-ask">
      <textarea className="textarea" rows={3} maxLength={5000} value={text} onChange={e => setText(e.target.value)}
        placeholder={placeholder || 'What are you stuck on? Paste the error or the code too.'} />
      <div className="dq-ask-row">
        {lessons?.length > 0 && (
          <select className="select dq-lesson" value={lesson} onChange={e => setLesson(e.target.value)} aria-label="Lesson">
            <option value="">General question</option>
            {lessons.map(l => <option key={l._id} value={l._id}>{l.episodeNumber ? `${l.episodeNumber}. ` : ''}{l.title}</option>)}
          </select>
        )}
        <span className="dq-hint">Wrap code in ``` to keep its spacing</span>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={ask}>{busy ? 'Posting…' : 'Ask doubt'}</button>
      </div>
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}

// ── Thread list (lesson or whole course) ─────────────────
const FILTERS = [['all', 'All'], ['unanswered', 'No replies yet'], ['solved', 'Solved'], ['mine', 'My doubts']];

export function ThreadList({ source, showLesson = false, searchable = true, reloadKey, empty }) {
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('active');
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { const t = setTimeout(() => setTerm(q), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(1); }, [filter, sort, term]);

  useEffect(() => {
    let live = true;
    axios.get(`${API}${source}`, { params: { filter, sort, q: term, page } })
      .then(({ data }) => { if (live) { setData(data); setError(''); } })
      .catch(e => live && setError(err(e, 'Could not load doubts')));
    return () => { live = false; };
  }, [source, filter, sort, term, page, reloadKey]);

  if (error) return <div className="dq-empty">{error}</div>;

  return (
    <div className="dq-list-wrap">
      <div className="dq-tools">
        <div className="dq-chips" role="group" aria-label="Show">
          {FILTERS.map(([k, label]) => (
            <button key={k} type="button" className={`dq-chip ${filter === k ? 'on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
        {searchable && (
          <div className="dq-search">
            <input className="input" type="search" placeholder="Search doubts" value={q} onChange={e => setQ(e.target.value)} aria-label="Search doubts" />
            <select className="select" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">
              <option value="active">Recent activity</option>
              <option value="new">Newest</option>
              <option value="top">Most helpful</option>
            </select>
          </div>
        )}
      </div>

      {!data ? <div className="dq-empty">Loading…</div> :
        data.threads.length === 0 ? (
          <div className="dq-empty">
            {term ? `No doubts match “${term}”.` :
              filter === 'unanswered' ? 'Every doubt here has a reply.' :
              filter === 'solved' ? 'No solved doubts yet.' :
              filter === 'mine' ? 'You haven’t asked anything here yet.' :
              (empty || 'No doubts yet. Ask the first one.')}
          </div>
        ) : (
          <>
            <div className="dq-list">
              {data.threads.map(t => <ThreadRow key={t._id} t={t} showLesson={showLesson} />)}
            </div>
            {data.pages > 1 && (
              <div className="dq-pager">
                <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
                <span className="small muted">Page {page} of {data.pages}</span>
                <button className="btn btn-ghost btn-sm" disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            )}
          </>
        )}
    </div>
  );
}

function ThreadRow({ t, showLesson }) {
  const label = t.solved ? 'Solved' : t.replyCount === 1 ? 'reply' : 'replies';
  return (
    <Link to={`/discuss/${t._id}`} className={`dq-row ${t.hidden ? 'is-hidden' : ''}`}>
      <div className={`dq-count ${t.solved ? 'solved' : t.replyCount ? 'has' : ''}`} aria-label={t.solved ? `Solved, ${t.replyCount} replies` : `${t.replyCount} ${label}`}>
        <span className="dq-count-n">{t.solved ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg> : t.replyCount}</span>
        <span className="dq-count-l">{t.solved ? `${t.replyCount} ${t.replyCount === 1 ? 'reply' : 'replies'}` : label}</span>
      </div>
      <div className="dq-row-main">
        <div className="dq-row-text">{firstLine(t.text)}</div>
        <div className="dq-row-meta">
          <span>{t.user?.name}</span>
          {showLesson && <span>{t.episode ? `Lesson ${t.episode.episodeNumber || ''}`.trim() : 'General'}</span>}
          <span>{ago(t.lastActivityAt)}</span>
          {t.score > 0 && <span className="dq-row-score">{t.score} found this useful</span>}
          {t.isAnswered && <span className="dq-tag">Instructor replied</span>}
          {t.locked && <span className="dq-tag dq-tag-muted">Closed</span>}
          {t.hidden && <span className="dq-tag dq-tag-danger">Hidden</span>}
        </div>
      </div>
    </Link>
  );
}

// ── One thread ───────────────────────────────────────────
export function ThreadView({ id, isAdmin, onDeleted }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [commentFor, setCommentFor] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const replyRef = useRef(null);

  const load = useCallback(() => axios.get(`${API}/questions/${id}`)
    .then(({ data }) => { setData(data); setError(''); })
    .catch(e => setError(err(e, 'Could not load this doubt'))), [id]);
  useEffect(() => { load(); }, [load]);

  const run = async (key, fn, okMsg) => {
    setBusy(key);
    try { await fn(); if (okMsg) setToast(okMsg); await load(); }
    catch (e) { setToast(err(e, 'Something went wrong')); }
    finally { setBusy(''); }
  };

  if (error) return <div className="dq-empty">{error}</div>;
  if (!data) return <div className="spinner-page">Loading…</div>;
  const { thread: t, answers } = data;

  const postReply = () => {
    if (!reply.trim()) { setToast('Write your reply first'); return; }
    run('reply', async () => { await axios.post(`${API}/questions/${id}/replies`, { text: reply.trim() }); setReply(''); }, 'Reply posted');
  };
  const postComment = (parent) => {
    if (!comment.trim()) { setToast('Write your comment first'); return; }
    run('c' + parent, async () => {
      await axios.post(`${API}/questions/${id}/replies`, { text: comment.trim(), parent });
      setComment(''); setCommentFor('');
    });
  };
  const vote = (url) => run('v', () => axios.post(url));
  const accept = (rid) => run('a' + rid, () => axios.put(`${API}/questions/${id}/accept`, { replyId: rid }));
  const remove = (rid, restore) => {
    if (!restore && !window.confirm('Remove this reply?')) return;
    run('r' + rid, () => axios.delete(`${API}/questions/replies/${rid}${restore ? '?restore=1' : ''}`), restore ? 'Restored' : 'Removed');
  };
  const moderate = (body, msg) => run('m', () => axios.put(`${API}/questions/${id}/moderate`, body), msg);
  const delThread = async () => {
    if (!window.confirm('Delete this doubt for everyone?')) return;
    try { await axios.delete(`${API}/questions/${id}`); onDeleted?.(t); }
    catch (e) { setToast(err(e, 'Could not delete')); }
  };

  const where = t.episode
    ? <Link to={`/episodes/${t.episode._id}`}>Lesson {t.episode.episodeNumber}: {t.episode.title}</Link>
    : <span>General question</span>;

  return (
    <div className="dq-thread">
      <article className="dq-q">
        <VoteBtn score={t.score} voted={t.voted} mine={t.mine} onVote={() => vote(`${API}/questions/${id}/vote`)} />
        <div className="dq-q-main">
          <div className="dq-by">
            <Face user={t.user} /><Name user={t.user} /><span className="dq-when">asked {ago(t.createdAt)}</span>
          </div>
          <RichText text={t.text} className="dq-q-text" />
          <div className="dq-q-foot">
            {where}
            {t.course?.slug && <Link to={`/courses/${t.course.slug}/discuss`}>All doubts in {t.course.title}</Link>}
          </div>
          {(t.canDelete || isAdmin) && (
            <div className="dq-actions">
              {isAdmin && <button type="button" onClick={() => moderate({ locked: !t.locked }, t.locked ? 'Reopened' : 'Closed for new replies')}>{t.locked ? 'Reopen thread' : 'Close thread'}</button>}
              {isAdmin && <button type="button" onClick={() => moderate({ hidden: !t.hidden }, t.hidden ? 'Visible again' : 'Hidden from students')}>{t.hidden ? 'Unhide' : 'Hide from students'}</button>}
              {t.canDelete && <button type="button" className="dq-danger" onClick={delThread}>Delete</button>}
            </div>
          )}
        </div>
      </article>

      <div className="dq-status">
        {t.solved ? <span className="dq-solved">Solved</span> : null}
        <span>{t.replyCount === 0 ? 'No replies yet' : `${t.replyCount} ${t.replyCount === 1 ? 'reply' : 'replies'}`}</span>
        {t.locked && <span className="dq-tag dq-tag-muted">Closed for new replies</span>}
        {t.hidden && <span className="dq-tag dq-tag-danger">Hidden from students</span>}
      </div>

      <div className="dq-answers">
        {answers.map(a => (
          <article key={a._id} className={`dq-a ${a.accepted ? 'accepted' : ''} ${a.isAdmin ? 'instructor' : ''} ${a.hidden ? 'is-hidden' : ''}`}>
            <VoteBtn score={a.score} voted={a.voted} mine={a.mine} onVote={() => vote(`${API}/questions/replies/${a._id}/vote`)} />
            <div className="dq-a-main">
              {a.accepted && <div className="dq-accepted">Accepted answer</div>}
              <div className="dq-by"><Face user={a.user} size={22} /><Name user={a.user} /><span className="dq-when">{ago(a.createdAt)}</span></div>
              <RichText text={a.text} />
              <div className="dq-actions">
                {t.canAccept && !a.hidden && (
                  <button type="button" disabled={busy === 'a' + a._id} onClick={() => accept(a._id)}>
                    {a.accepted ? 'Unaccept' : 'Accept this answer'}
                  </button>
                )}
                {!t.locked && !a.hidden && <button type="button" onClick={() => { setCommentFor(commentFor === a._id ? '' : a._id); setComment(''); }}>Comment</button>}
                {(a.mine || isAdmin) && !a.hidden && <button type="button" className="dq-danger" onClick={() => remove(a._id)}>Remove</button>}
                {isAdmin && a.hidden && <button type="button" onClick={() => remove(a._id, true)}>Restore</button>}
                {a.hidden && <span className="dq-tag dq-tag-danger">Removed</span>}
              </div>

              {(a.comments.length > 0 || commentFor === a._id) && (
                <div className="dq-comments">
                  {a.comments.map(c => (
                    <div key={c._id} className={`dq-c ${c.hidden ? 'is-hidden' : ''}`}>
                      <RichText text={c.text} />
                      <span className="dq-c-by">
                        <Name user={c.user} /> · {ago(c.createdAt)}
                        {c.score > 0 && <> · {c.score} helpful</>}
                        {!c.mine && !c.hidden && <button type="button" className={c.voted ? 'on' : ''} onClick={() => vote(`${API}/questions/replies/${c._id}/vote`)}>{c.voted ? 'Helped' : 'Helpful'}</button>}
                        {(c.mine || isAdmin) && !c.hidden && <button type="button" className="dq-danger" onClick={() => remove(c._id)}>Remove</button>}
                        {isAdmin && c.hidden && <button type="button" onClick={() => remove(c._id, true)}>Restore</button>}
                      </span>
                    </div>
                  ))}
                  {commentFor === a._id && (
                    <div className="dq-c-form">
                      <input className="input" autoFocus maxLength={600} value={comment} placeholder="Add a short comment"
                        onChange={e => setComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && postComment(a._id)} />
                      <button className="btn btn-primary btn-sm" disabled={busy === 'c' + a._id} onClick={() => postComment(a._id)}>Post</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      {t.locked && !isAdmin ? (
        <div className="dq-empty">This thread is closed for new replies.</div>
      ) : (
        <div className="dq-compose">
          <h2 className="dq-h">{answers.length ? 'Your answer' : 'Be the first to help'}</h2>
          <textarea ref={replyRef} className="textarea" rows={4} maxLength={5000} value={reply} onChange={e => setReply(e.target.value)}
            placeholder={t.mine ? 'Add more detail, or share what fixed it' : 'Explain what worked for you. Code is welcome.'} />
          <div className="dq-ask-row">
            <span className="dq-hint">Wrap code in ``` to keep its spacing</span>
            <button className="btn btn-primary btn-sm" disabled={busy === 'reply'} onClick={postReply}>{busy === 'reply' ? 'Posting…' : 'Post reply'}</button>
          </div>
        </div>
      )}
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
