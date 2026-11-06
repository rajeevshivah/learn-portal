import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  GoalPicker, NewsCard, EventCard, Sheet, LocationForm,
  fetchFeed, fetchGoal, fetchAccess, useTracks,
} from '../components/TechFeed';
import { payWithRazorpay, PAYMENT_HELP_TEXT } from '../lib/razorpay';

const TABS = [['mine', 'For you'], ['events', 'Hackathons'], ['all', 'All news']];
const PAGE = 20;
const today = () => new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtDay = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function Tech() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'mine';
  const track = params.get('track') || '';
  const tracks = useTracks();
  const [goal, setGoal] = useState(null);
  const [onboard, setOnboard] = useState(0);            // 0 = done, 1 = goals, 2 = location
  const [sheet, setSheet] = useState('');               // 'goal' | 'loc' | 'pass'
  const [access, setAccess] = useState(null);
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [busyMore, setBusyMore] = useState(false);
  const [paying, setPaying] = useState(false);
  const [note, setNote] = useState('');

  const query = useCallback((skip = 0) => fetchFeed({
    kind: tab === 'events' ? 'event' : 'news',
    scope: tab === 'all' ? 'all' : 'mine',
    track: tab === 'all' ? track : '',
    limit: tab === 'events' ? 50 : PAGE, skip,
  }), [tab, track]);

  const load = useCallback(() => {
    setItems(null);
    query(0).then(d => { setItems(d.items); setTotal(d.total); setRefreshing(d.refreshing && d.total === 0); }).catch(() => setItems([]));
  }, [query]);

  useEffect(() => {
    fetchGoal().then(g => { setGoal(g); if (!g.set) setOnboard(1); }).catch(() => setGoal({ set: false }));
    fetchAccess().then(setAccess).catch(() => setAccess(null));
  }, []);
  useEffect(() => { if (goal?.set) load(); }, [goal?.set, goal?.city, load]);
  useEffect(() => { if (!refreshing) return; const t = setTimeout(load, 9000); return () => clearTimeout(t); }, [refreshing, load]);
  // A locked tip on a card asks for the pass sheet
  useEffect(() => {
    const open = () => setSheet('pass');
    window.addEventListener('tech-unlock', open);
    return () => window.removeEventListener('tech-unlock', open);
  }, []);

  const more = async () => {
    setBusyMore(true);
    try { const d = await query(items.length); setItems([...items, ...d.items]); setTotal(d.total); }
    finally { setBusyMore(false); }
  };
  const setTab = (k) => { setParams(k === 'mine' ? {} : { tab: k }); window.scrollTo({ top: 0 }); };
  const setTrack = (t) => setParams(t ? { tab: 'all', track: t } : { tab: 'all' });
  useEffect(() => { window.scrollTo({ top: 0 }); }, [onboard]);
  const labelOf = (id) => tracks.find(t => t.id === id)?.label || id;
  const following = goal ? [...(goal.tracks || []).map(labelOf), goal.custom].filter(Boolean) : [];

  const buyPass = async () => {
    setPaying(true); setNote('');
    try {
      const r = await payWithRazorpay({ kind: 'techpass' });
      setAccess(await fetchAccess());
      setSheet('');
      setNote(r?.message || 'Tech Pass active. Tips are unlocked.');
      load();
    } catch (err) {
      if (err.message === 'stuck') setNote(PAYMENT_HELP_TEXT);
      else if (err.message !== 'cancelled') setNote(err.response?.data?.message || err.message);
    } finally { setPaying(false); }
  };

  if (!goal) return <div className="page tx-page"><div className="tx-wrap"><p className="muted">Loading…</p></div></div>;

  // ── First visit: two quick steps ──
  if (onboard) {
    return (
      <div className="page tx-page">
        <div className="tx-wrap tx-onboard">
          <div className="tx-steps" aria-label={`Step ${onboard} of 2`}>
            <span className={onboard >= 1 ? 'on' : ''} /><span className={onboard >= 2 ? 'on' : ''} />
          </div>
          {onboard === 1 ? (
            <>
              <h1 className="tx-title">Your tech feed</h1>
              <p className="tx-lead">News, tips and hackathons picked for what you’re preparing for.</p>
              <div className="tx-card"><GoalPicker initial={goal} onSaved={(g) => { setGoal(g); setOnboard(2); }} /></div>
            </>
          ) : (
            <>
              <h1 className="tx-title">Where are you?</h1>
              <p className="tx-lead">So we can show hackathons and tech events at colleges and companies near you. Optional.</p>
              <div className="tx-card">
                <LocationForm initial={goal} skipLabel="Skip for now"
                  onSaved={(g) => { setGoal(g); setOnboard(0); }} onSkip={() => setOnboard(0)} />
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const near = tab === 'events' && items ? items.filter(i => i.near) : [];
  const online = tab === 'events' && items ? items.filter(i => !i.near && i.mode === 'online') : [];
  const elsewhere = tab === 'events' && items ? items.filter(i => !i.near && i.mode !== 'online') : [];
  const place = [goal.city, goal.state].filter(Boolean).join(', ');

  return (
    <div className="page tx-page">
      <div className="tx-wrap">
        <header className="tx-head">
          <div className="tx-date">{today()}</div>
          <h1 className="tx-title">Tech</h1>
          <div className="tx-pills">
            <button type="button" className="tx-pill" onClick={() => setSheet('goal')}>
              <span aria-hidden="true">🎯</span>
              <span className="tx-pill-text">{following.length ? following.slice(0, 2).join(', ') + (following.length > 2 ? ` +${following.length - 2}` : '') : 'Set your goal'}</span>
            </button>
            <button type="button" className="tx-pill" onClick={() => setSheet('loc')}>
              <span aria-hidden="true">📍</span>
              <span className="tx-pill-text">{goal.city || goal.state || 'Add your city'}</span>
            </button>
          </div>
        </header>

        {note && <div className="tx-note" role="status">{note} <button className="tx-x" onClick={() => setNote('')} aria-label="Dismiss">×</button></div>}

        {access && !access.full && access.offer && (
          <button type="button" className="tx-upsell" onClick={() => setSheet('pass')}>
            <div>
              <strong>Unlock “Why it matters” and “Try this”</strong>
              <span>AI tips on every story for your goal · ₹{access.offer.price} for {access.offer.days} days</span>
            </div>
            <span className="tx-upsell-go" aria-hidden="true">›</span>
          </button>
        )}
        {access?.full && (access.reason === 'included' || access.reason === 'pass') && (
          <div className="tx-access"><span aria-hidden="true">✓</span> {access.reason === 'pass' ? `Tech Pass till ${fmtDay(access.passUntil)}` : access.label}</div>
        )}

        <div className="tx-seg-wrap">
          <div className="tx-seg" role="tablist">
            {TABS.map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
        </div>

        {tab === 'all' && (
          <div className="tx-scroll-chips" role="group" aria-label="Filter by topic">
            <button className={`tf-chip ${!track ? 'on' : ''}`} onClick={() => setTrack('')}>Everything</button>
            {tracks.map(t => <button key={t.id} className={`tf-chip ${track === t.id ? 'on' : ''}`} onClick={() => setTrack(t.id)}>{t.label}</button>)}
          </div>
        )}

        {items === null ? (
          <div className="tx-skel"><div /><div /><div /></div>
        ) : items.length === 0 ? (
          <div className="tx-empty">
            {refreshing ? 'Fetching the latest for you. This takes a few seconds the first time…'
              : tab === 'events' ? 'No upcoming hackathons or events right now. Check back in a day or two.'
                : tab === 'mine' ? 'Nothing new for your goals in the last few weeks. Try All news.'
                  : 'No news here yet.'}
          </div>
        ) : tab === 'events' ? (
          <>
            {!place && (
              <button type="button" className="tx-nudge" onClick={() => setSheet('loc')}>
                <span aria-hidden="true">📍</span> Add your city to see hackathons and events near you
              </button>
            )}
            {place && (
              <Section title={`Near ${goal.city || goal.state}`} empty={`Nothing in ${place} right now. We’ll show events here as colleges and companies near you announce them.`} list={near} />
            )}
            <Section title="Online · join from anywhere" list={online} />
            <Section title={place ? 'Elsewhere' : 'In person'} list={elsewhere} />
          </>
        ) : (
          <div className="tx-list">
            {items.map((it, i) => <NewsCard key={it._id} it={it} variant={i === 0 ? 'hero' : 'row'} showInsight={tab === 'mine' || Boolean(track)} />)}
          </div>
        )}

        {items && tab !== 'events' && items.length < total && (
          <button className="btn btn-ghost tx-more" disabled={busyMore} onClick={more}>{busyMore ? 'Loading…' : 'Show more'}</button>
        )}
        <p className="tx-fine tx-foot">
          News comes from public tech sites and is summarised by AI. Tips are suggestions: check the original before acting on it.
        </p>
      </div>

      {sheet === 'goal' && (
        <Sheet title="Your goals" onClose={() => setSheet('')}>
          <GoalPicker initial={goal} onSaved={(g) => { setGoal(g); setSheet(''); load(); }} onCancel={() => setSheet('')} />
        </Sheet>
      )}
      {sheet === 'loc' && (
        <Sheet title="Your city" onClose={() => setSheet('')}>
          <LocationForm initial={goal} onSaved={(g) => { setGoal(g); setSheet(''); }} />
        </Sheet>
      )}
      {sheet === 'pass' && (
        <Sheet title="Tech Pass" onClose={() => setSheet('')}>
          {access?.full ? (
            <p className="tx-lead">You already have full access{access.label ? ` (${access.label})` : ''}.</p>
          ) : access?.offer ? (
            <div className="tx-pass">
              <div className="tx-price">₹{access.offer.price}<span> · {access.offer.days} days</span></div>
              <ul>
                <li><strong>Why it matters</strong> for your goal, on every story</li>
                <li><strong>Try this</strong>: one small thing to do this week</li>
                <li>Who should apply, on each hackathon</li>
              </ul>
              <p className="tx-fine">One-time payment by UPI, card or netbanking. It doesn’t renew on its own.
                {access.offer.freeForPaid ? ' Free while you’re in any paid program or course.' : ''}</p>
              <button className="btn btn-primary tx-buy" disabled={paying} onClick={buyPass}>{paying ? 'Opening payment…' : `Pay ₹${access.offer.price}`}</button>
            </div>
          ) : (
            <p className="tx-lead">Tips are available to students in a paid program or course.</p>
          )}
        </Sheet>
      )}
    </div>
  );
}

function Section({ title, list, empty }) {
  if (!list.length && !empty) return null;
  return (
    <section className="tx-section">
      <h2 className="tx-h2">{title}{list.length > 0 && <span className="tx-count">{list.length}</span>}</h2>
      {list.length ? <div className="tx-list">{list.map(it => <EventCard key={it._id} it={it} />)}</div>
        : <div className="tx-empty small">{empty}</div>}
    </section>
  );
}
