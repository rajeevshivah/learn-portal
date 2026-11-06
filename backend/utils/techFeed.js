// ─────────────────────────────────────────────────────────
// Tech feed: news + hackathons, personalised by career goal.
//
//  1. refresh()  pulls the newest items from every enabled source (RSS feeds,
//                Hacker News, dev.to, Devpost hackathons). New ones only.
//  2. tagWithAI() asks Claude (small, cheap model) once per article: which
//                career goals it matters to, how important it is, a one-line
//                summary, and for each goal "why it matters / what to do".
//                Without an API key, keyword matching tags the goals instead.
//  3. forStudent() ranks items for a student's goals.
//
// No background timer (Render free plan sleeps): the feed refreshes itself when
// someone opens it and it is more than REFRESH_HOURS old, or when an admin
// presses "Refresh now".
// ─────────────────────────────────────────────────────────

const { XMLParser } = require('fast-xml-parser');
const TechItem = require('../models/TechItem');
const TechSource = require('../models/TechSource');
const Settings = require('../models/Settings');
const { TRACKS, TRACK_IDS, labelOf, tracksByKeywords, matchCount } = require('./techTracks');

const REFRESH_HOURS = 3;
const KEEP_NEWS_DAYS = 21;
const AI_BATCH = 8;
const AI_MODEL = () => process.env.TECH_AI_MODEL || 'claude-haiku-5-5';
const AI_URL = () => process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages';
const AI_DAILY_CAP = () => Number(process.env.TECH_AI_DAILY_ARTICLES || 80);
const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

const DEFAULT_SOURCES = [
  { name: 'Hacker News (front page)', type: 'hn', kind: 'news', maxItems: 20 },
  { name: 'DEV Community (top today)', type: 'devto', kind: 'news', maxItems: 15 },
  { name: 'TechCrunch', type: 'rss', url: 'https://techcrunch.com/feed/', kind: 'news', maxItems: 15 },
  { name: 'Analytics India Magazine', type: 'rss', url: 'https://analyticsindiamag.com/feed/', kind: 'news', maxItems: 12 },
  { name: 'Inc42 (Indian startups)', type: 'rss', url: 'https://inc42.com/feed/', kind: 'news', maxItems: 10 },
  { name: 'Tech jobs & placements in India (Google News)', type: 'rss', kind: 'news', maxItems: 12, tracks: ['dsa-placements'],
    url: 'https://news.google.com/rss/search?q=(tech+hiring+OR+placements+OR+freshers+OR+layoffs)+India&hl=en-IN&gl=IN&ceid=IN:en' },
  { name: 'The GitHub Blog', type: 'rss', url: 'https://github.blog/feed/', kind: 'news', maxItems: 8 },
  { name: 'Devpost hackathons', type: 'devpost', kind: 'event', maxItems: 40 },
  { name: 'Tech news in Hindi (Google News)', type: 'rss', kind: 'news', maxItems: 10,
    url: `https://news.google.com/rss/search?q=${encodeURIComponent('टेक्नोलॉजी OR आर्टिफिशियल इंटेलिजेंस OR स्टार्टअप OR आईटी नौकरी')}&hl=hi&gl=IN&ceid=IN:hi` },
];

// Built-in sources can't be deleted, so any default missing by name is new: add it.
// One at a time (two requests at once would both add the same source), and clear
// any duplicate built-ins an older version may have left.
let ensuring = null;
function ensureSources() {
  if (!ensuring) ensuring = (async () => {
    const all = await TechSource.find({ builtIn: true }).sort({ createdAt: 1 }).select('name');
    const byName = {};
    for (const s of all) (byName[s.name] = byName[s.name] || []).push(s._id);
    const extra = Object.values(byName).flatMap(ids => ids.slice(1));
    if (extra.length) await TechSource.deleteMany({ _id: { $in: extra } });
    for (const d of DEFAULT_SOURCES.filter(x => !byName[x.name])) {
      await TechSource.updateOne({ name: d.name, builtIn: true }, { $setOnInsert: { ...d, builtIn: true } }, { upsert: true });
    }
  })().finally(() => { ensuring = null; });
  return ensuring;
}

// ── Language: English and Hindi only ──
const LATIN = /[A-Za-z\u00C0-\u024F]/g, DEVA = /[\u0900-\u097F]/g, LETTER = /\p{L}/gu;
const NOT_EN = /\b(el|los|las|del|para|una|não|uma|les|des|pour|und|der|das|nicht|eine|della|por|wie|ist|sur|dans|como|também|cómo|qué|avec|sobre|desde|mais|zijn|het|een|och|med|för|jest|się|nie|bir|ve|için|bu)\b/gi;
const EN = /\b(the|and|of|to|is|for|with|on|how|you|your|what|why|new|from|this|are|was|will|can)\b/gi;
function langOf(text) {
  const t = String(text || '');
  const letters = (t.match(LETTER) || []).length;
  if (!letters) return 'en';
  const deva = (t.match(DEVA) || []).length, latin = (t.match(LATIN) || []).length;
  if ((deva + latin) / letters < 0.85) return 'other';          // Chinese, Russian, Arabic, Japanese…
  if (deva > latin) return 'hi';
  const other = (t.match(NOT_EN) || []).length, en = (t.match(EN) || []).length;
  return other >= 2 && other > en ? 'other' : 'en';             // Spanish, Portuguese, German…
}
const langAllowed = (it) => it.lang !== 'other' && langOf(`${it.title} ${it.summary}`) !== 'other';

// ── Images ──
function cleanImg(u, base) {
  if (!u) return '';
  try {
    const url = new URL(String(u).replace(/&amp;/g, '&'), base);
    if (url.protocol === 'http:') url.protocol = 'https:';
    if (url.protocol !== 'https:' || /\.(svg|ico)(\?|$)/i.test(url.pathname) || /(pixel|tracking|feeds\.feedburner|gravatar|1x1)/i.test(url.href)) return '';
    return url.href;
  } catch { return ''; }
}
const firstImgIn = (html) => (String(html || '').match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || '';

// ── Small helpers ──
const UA = 'learn.rajeevshivah.me tech-feed (+https://learn.rajeevshivah.me)';
async function get(url, { json = false } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: json ? 'application/json' : 'application/rss+xml, application/xml, text/xml, */*' }, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return json ? res.json() : res.text();
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'timed out' : e.message);
  } finally { clearTimeout(t); }
}
const stripHtml = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&#8217;|&rsquo;/g, '’').replace(/&#8216;|&lsquo;/g, '‘').replace(/&#8220;|&ldquo;/g, '“').replace(/&#8221;|&rdquo;/g, '”')
  .replace(/&#8230;|&hellip;/g, '…').replace(/&#\d+;/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);
const textOf = (v) => (v == null ? '' : typeof v === 'object' ? (v['#text'] ?? v.__cdata ?? '') : String(v));
const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const okUrl = (u) => { try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; } };

// ── Fetchers: each returns [{ title, url, summary, publishedAt, imageUrl, …event fields }] ──
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', cdataPropName: '__cdata', textNodeName: '#text' });

async function fromRss(src) {
  const doc = xml.parse(await get(src.url));
  const rssItems = asArray(doc?.rss?.channel?.item);
  const atomItems = asArray(doc?.feed?.entry);
  const out = [];
  for (const it of rssItems) {
    const link = textOf(it.link) || textOf(it.guid);
    const media = asArray(it['media:content'])[0] || asArray(it['media:thumbnail'])[0] || asArray(it.enclosure)[0];
    // Google News titles end with " - Publisher"
    let title = stripHtml(textOf(it.title));
    const publisher = textOf(it.source) || '';
    if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -(publisher.length + 3));
    out.push({
      title, url: link,
      summary: clip(stripHtml(textOf(it.description) || textOf(it['content:encoded'])), 300),
      publishedAt: new Date(textOf(it.pubDate) || textOf(it['dc:date']) || Date.now()),
      imageUrl: cleanImg(media?.['@url'] || asArray(it['media:group']?.['media:content'])[0]?.['@url'] || firstImgIn(textOf(it['content:encoded']) || textOf(it.description)), link),
      sourceLabel: publisher ? `${publisher} (via ${src.name.replace(/ \(Google News\)$/, '')})` : '',
    });
  }
  for (const it of atomItems) {
    const links = asArray(it.link);
    const link = (links.find(l => !l['@rel'] || l['@rel'] === 'alternate') || links[0])?.['@href'] || '';
    out.push({
      title: stripHtml(textOf(it.title)), url: link,
      summary: clip(stripHtml(textOf(it.summary) || textOf(it.content)), 300),
      publishedAt: new Date(textOf(it.published) || textOf(it.updated) || Date.now()),
      imageUrl: cleanImg(asArray(it['media:thumbnail'])[0]?.['@url'] || firstImgIn(textOf(it.content) || textOf(it.summary)), link),
    });
  }
  return out;
}

async function fromHn() {
  const data = await get('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=40', { json: true });
  return (data.hits || []).filter(h => h.title).map(h => ({
    title: h.title,
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    summary: `${h.points || 0} points and ${h.num_comments || 0} comments on Hacker News.`,
    publishedAt: new Date(h.created_at || Date.now()),
    popularity: h.points || 0,
  }));
}

async function fromDevto() {
  const data = await get('https://dev.to/api/articles?top=1&per_page=30', { json: true });
  return (Array.isArray(data) ? data : []).map(a => ({
    title: a.title, url: a.url,
    summary: clip(stripHtml(a.description || ''), 300),
    publishedAt: new Date(a.published_at || Date.now()),
    imageUrl: cleanImg(a.cover_image || a.social_image || ''),
    tags: a.tag_list || [],
  }));
}

// "Oct 10 - Nov 20, 2026"  |  "Nov 01, 2026 - Jan 05, 2027"  |  "Dec 02 - 04, 2026"
function parseDevpostDates(s) {
  const str = String(s || '').replace(/\s+/g, ' ').trim();
  const m = str.match(/^([A-Za-z]{3}) (\d{1,2})(?:, (\d{4}))? - (?:([A-Za-z]{3}) )?(\d{1,2}), (\d{4})$/);
  if (!m) return {};
  const [, m1, d1, y1, m2, d2, y2] = m;
  const end = new Date(`${m2 || m1} ${d2}, ${y2} 23:59:00 GMT+0530`);
  const start = new Date(`${m1} ${d1}, ${y1 || y2} 00:00:00 GMT+0530`);
  if (start > end) start.setFullYear(start.getFullYear() - 1);
  return { startsAt: isNaN(start) ? null : start, endsAt: isNaN(end) ? null : end };
}

async function fromDevpost() {
  const data = await get('https://devpost.com/api/hackathons?status[]=upcoming&status[]=open&order_by=deadline', { json: true });
  return (data.hackathons || []).map(h => {
    const { startsAt, endsAt } = parseDevpostDates(h.submission_period_dates);
    const loc = h.displayed_location?.location || '';
    return {
      title: h.title, url: h.url,
      summary: clip([h.organization_name, (h.themes || []).map(t => t.name).join(', ')].filter(Boolean).join(' · '), 300),
      publishedAt: new Date(),
      imageUrl: h.thumbnail_url ? (h.thumbnail_url.startsWith('//') ? `https:${h.thumbnail_url}` : h.thumbnail_url) : '',
      startsAt, endsAt, deadline: endsAt,
      mode: /online/i.test(loc) ? 'online' : loc ? 'in-person' : '',
      location: /online/i.test(loc) ? 'Online' : loc,
      prize: stripHtml(h.prize_amount || ''),
      organizer: h.organization_name || '',
      tags: (h.themes || []).map(t => t.name),
    };
  });
}

// A college / company events page. Pages are all different, so the AI reads the page
// text (with its links) and pulls out upcoming events students can join.
function pageText(html, base) {
  let h = String(html || '').slice(0, 600000)
    .replace(/<(script|style|noscript|svg|head|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  h = h.replace(/<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, href, inner) => {
    const t = stripHtml(inner);
    let abs = ''; try { abs = new URL(href.replace(/&amp;/g, '&'), base).href; } catch { /* bad link */ }
    return t && abs && /^https?:/.test(abs) ? ` ${t} [${abs}] ` : ` ${t} `;
  });
  h = h.replace(/<\/(p|div|li|tr|h\d|br|section|article)>|<br\s*\/?>/gi, '\n');
  return h.split('\n').map(stripHtml).filter(Boolean).join('\n').slice(0, 14000);
}
const ymd = (s, endOfDay) => {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${endOfDay ? '23:59:00' : '09:00:00'}+05:30`);
  return isNaN(d) ? null : d;
};
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9\u0900-\u097F]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

async function fromPage(src) {
  if (!aiEnabled()) throw new Error('Reading college/company pages needs ANTHROPIC_API_KEY');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  let html;
  try {
    const res = await fetch(src.url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'timed out' : e.message); }
  finally { clearTimeout(t); }
  const text = pageText(html, src.url);
  if (text.length < 80) throw new Error('The page had almost no text (it may load its content with JavaScript)');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const prompt = `Today is ${today}. Below is the text of the web page ${src.url} ("${src.name}"${src.location ? `, located in ${src.location}` : ''}). Links appear as [url] after their text.

Find upcoming events that engineering/computer students can join or apply to: hackathons, coding contests, tech fests, workshops, bootcamps, seminars/webinars, placement or internship drives. Skip past events, exam schedules, holidays, admissions, tenders, and anything not about tech or careers.

Reply with only a JSON array (max 15, [] if none):
[{"title": short name, "url": the most specific link for it from the page or "", "startsAt": "YYYY-MM-DD" or "", "deadline": registration last date "YYYY-MM-DD" or "", "mode": "online"|"in-person"|"hybrid", "location": venue and city if stated or "", "organizer": who runs it or "", "prize": prize if stated or "", "summary": max 25 words, what it is and who it is for}]

Page text:
${text}`;
  const out = firstJson(await claude(TAG_SYSTEM, prompt, 2500), '[', ']');
  return asArray(out).filter(e => e && e.title).map(e => {
    const startsAt = ymd(e.startsAt), deadline = ymd(e.deadline, true) || (startsAt ? new Date(startsAt.getTime() + 15 * 3600e3) : null);
    const own = okUrl(e.url) && e.url.split('#')[0] !== src.url.split('#')[0];
    return {
      title: clip(stripHtml(e.title), 200),
      url: own ? e.url : `${src.url.split('#')[0]}#${slug(e.title)}`,
      summary: clip(stripHtml(e.summary || ''), 300),
      publishedAt: new Date(), startsAt, deadline,
      mode: ['online', 'in-person', 'hybrid'].includes(e.mode) ? e.mode : 'in-person',
      location: e.mode === 'online' ? 'Online' : clip(stripHtml(e.location || ''), 120) || src.location || '',
      organizer: clip(stripHtml(e.organizer || ''), 80) || src.name,
      prize: clip(stripHtml(e.prize || ''), 120),
    };
  }).filter(e => (e.deadline || e.startsAt) && (e.deadline || e.startsAt) > Date.now());   // must have a date in the future
}
const PAGE_EVERY_HOURS = 24;

// Articles without a picture: use the page's own preview image (og:image), a few per refresh
async function fillImages(limit = 25) {
  const items = await TechItem.find({ kind: 'news', imageUrl: '', imgTried: false, hidden: false, url: { $not: /news\.google\.com|news\.ycombinator\.com/ } })
    .sort({ publishedAt: -1 }).limit(limit);
  let found = 0;
  const one = async (it) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    try {
      const res = await fetch(it.url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: ctl.signal, redirect: 'follow' });
      if (res.ok && /html/i.test(res.headers.get('content-type') || 'text/html')) {
        const head = (await res.text()).slice(0, 200000);
        const m = head.match(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*content=["']([^"']+)["']/i)
          || head.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
        const img = cleanImg(m?.[1], res.url || it.url);
        if (img) { it.imageUrl = img; found++; }
      }
    } catch { /* site slow or blocked: the card gets a drawn cover */ }
    finally { clearTimeout(t); }
    it.imgTried = true;
    await it.save();
  };
  for (let i = 0; i < items.length; i += 5) await Promise.all(items.slice(i, i + 5).map(one));
  return found;
}

const FETCHERS = { rss: fromRss, hn: fromHn, devto: fromDevto, devpost: fromDevpost, page: fromPage };

// ── Refresh ──
let running = null;
async function settingsMeta() { return Settings.get(); }

async function refreshNow() {
  await ensureSources();
  const sources = await TechSource.find({ enabled: true });
  let added = 0;
  for (const src of sources) {
    if (src.type === 'page' && src.lastRun?.ok && src.lastRun.at && Date.now() - src.lastRun.at < PAGE_EVERY_HOURS * 3600e3) continue;
    try {
      const raw = (await FETCHERS[src.type](src))
        .filter(x => x.title && okUrl(x.url))
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0) || b.publishedAt - a.publishedAt)
        .slice(0, src.maxItems || 15);
      const known = new Set((await TechItem.find({ url: { $in: raw.map(r => r.url) } }).select('url')).map(x => x.url));
      let n = 0;
      for (const r of raw) {
        if (known.has(r.url)) continue;
        if (src.kind === 'news' && r.publishedAt < Date.now() - KEEP_NEWS_DAYS * 864e5) continue;
        const lang = langOf(`${r.title} ${r.summary}`);
        if (lang === 'other') continue;                   // English and Hindi only
        const text = `${r.title} ${r.summary} ${(r.tags || []).join(' ')}`;
        const tracks = src.tracks?.length ? [...src.tracks] : tracksByKeywords(text);
        try {
          await TechItem.create({
            kind: src.kind, title: clip(r.title, 300), url: r.url, source: r.sourceLabel || src.name, sourceId: src._id,
            summary: r.summary || '', imageUrl: r.imageUrl || '', imgTried: Boolean(r.imageUrl), lang, publishedAt: isNaN(r.publishedAt) ? new Date() : r.publishedAt,
            tracks, importance: r.popularity >= 300 ? 4 : r.popularity >= 120 ? 3 : 2,
            startsAt: r.startsAt || null, endsAt: r.endsAt || null, deadline: r.deadline || null,
            mode: r.mode || '', location: r.location || '', prize: clip(r.prize || '', 120), organizer: r.organizer || '',
          });
          n++;
        } catch (e) { if (e.code !== 11000) throw e; }   // same link from two sources
      }
      src.lastRun = { at: new Date(), ok: true, added: n, message: `${n} new` };
      added += n;
    } catch (e) {
      src.lastRun = { at: new Date(), ok: false, added: 0, message: e.message.slice(0, 200) };
    }
    await src.save();
  }

  // Housekeeping: old news and finished events go (pinned and admin-added stay)
  await TechItem.deleteMany({ kind: 'news', pinned: false, manual: false, publishedAt: { $lt: new Date(Date.now() - KEEP_NEWS_DAYS * 864e5) } });
  await TechItem.deleteMany({ kind: 'event', manual: false, $or: [{ deadline: { $lt: new Date(Date.now() - 3 * 864e5) } }, { deadline: null, endsAt: { $lt: new Date(Date.now() - 3 * 864e5) } }] });

  const ai = await tagWithAI();
  const images = await fillImages().catch(() => 0);
  const s = await settingsMeta();
  s.techLastRefreshAt = new Date();
  await s.save();
  return { added, ai, images };
}

function refresh() {
  if (!running) running = refreshNow().finally(() => { running = null; });
  return running;
}
async function refreshIfStale() {
  const s = await settingsMeta();
  const last = s.techLastRefreshAt ? new Date(s.techLastRefreshAt).getTime() : 0;
  if (Date.now() - last > REFRESH_HOURS * 3600e3 && !running) {
    refresh().catch(e => console.error('Tech feed refresh:', e.message));
    return true;
  }
  return Boolean(running);
}

// ── Claude ──
async function claude(system, user, maxTokens = 3000) {
  const res = await fetch(AI_URL(), {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: AI_MODEL(), max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Claude API error ${res.status}`);
  return (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
}
const firstJson = (text, open, close) => {
  const a = text.indexOf(open), b = text.lastIndexOf(close);
  if (a < 0 || b < a) throw new Error('No JSON in the AI reply');
  return JSON.parse(text.slice(a, b + 1));
};

const KICKERS = ['release', 'tool', 'ai', 'hiring', 'layoffs', 'funding', 'startup', 'policy', 'security', 'research', 'tutorial', 'career', 'event', 'other'];
const TRACK_LIST = TRACKS.map(t => `${t.id}: ${t.label}`).join('\n');
const TAG_SYSTEM = `You curate a tech news feed for Indian engineering students and freshers (B.Tech/BCA/MCA, 18–24) who are learning to code and preparing for jobs. Be concrete, plain and honest. No hype, no emojis.`;

async function tagBatch(items) {
  const list = items.map((it, i) => `[${i}] ${it.title}\nSource: ${it.source}\n${it.kind === 'event' ? `Hackathon/event. ${it.summary}` : it.summary}`).join('\n\n');
  const prompt = `Career goals (id: label):\n${TRACK_LIST}\n\nItems:\n${list}\n\n` +
`For each item return an object:
{"i": index,
 "tracks": up to 3 goal ids it really matters to, or ["general"] if every tech student should know it, or [] if it is irrelevant to students (gossip, stock prices, US politics, product deals),
 "importance": 1-5 (5 = changes what students should learn or affects jobs/hiring broadly; 1 = trivia),
 "summary": one plain sentence in English, max 25 words, saying what happened (translate if the item is in Hindi),
 "lang": language of the item's title: "en", "hi", or "other",
 "kicker": one label for the card: release | tool | ai | hiring | layoffs | funding | startup | policy | security | research | tutorial | career | event | other,
 "stat": the single most striking number or fact in it, max 4 words (e.g. "₹1,500 crore", "10,000 freshers", "2x faster"), or "" if none,
 "insights": one entry per goal in "tracks" (use "general" when tracks is ["general"]): {"track": id, "why": max 18 words on why it matters to a student on that goal, "todo": max 18 words, one concrete thing they can do this week}}
For hackathons, "todo" should say who should apply and what to build or prepare.
Reply with only a JSON array.`;
  const out = firstJson(await claude(TAG_SYSTEM, prompt), '[', ']');
  return Array.isArray(out) ? out : [];
}

async function tagWithAI() {
  if (!aiEnabled()) return { skipped: 'no ANTHROPIC_API_KEY' };
  const s = await settingsMeta();
  const today = new Date().toISOString().slice(0, 10);
  const used = s.techAi?.day === today ? s.techAi.articles : 0;
  let budget = AI_DAILY_CAP() - used;
  if (budget <= 0) return { skipped: 'daily AI limit reached' };

  const todo = await TechItem.find({ aiDone: false, aiTries: { $lt: 2 }, hidden: false })
    .sort({ kind: 1, publishedAt: -1 }).limit(Math.min(budget, 120));
  // A source tied to goals (e.g. a Python-only feed) keeps those goals whatever the AI says
  const fixed = new Map((await TechSource.find({ 'tracks.0': { $exists: true } }).select('tracks')).map(x => [String(x._id), x.tracks]));
  let done = 0, error = '';
  for (let i = 0; i < todo.length; i += AI_BATCH) {
    const batch = todo.slice(i, i + AI_BATCH);
    try {
      const res = await tagBatch(batch);
      for (const r of res) {
        const it = batch[r.i];
        if (!it) continue;
        const tracks = asArray(r.tracks).filter(t => t === 'general' || TRACK_IDS.includes(t)).slice(0, 3);
        const own = fixed.get(String(it.sourceId)) || [];
        it.tracks = own.length ? [...new Set([...own, ...tracks.filter(t => t !== 'general')])].slice(0, 4) : tracks;
        it.importance = Math.min(5, Math.max(1, Math.round(Number(r.importance) || 2)));
        if (r.summary) it.summary = clip(String(r.summary), 220);
        if (['en', 'hi', 'other'].includes(r.lang)) it.lang = r.lang;
        it.kicker = KICKERS.includes(r.kicker) ? r.kicker : (it.kind === 'event' ? 'event' : 'other');
        it.stat = clip(String(r.stat || '').trim(), 32);
        it.insights = asArray(r.insights)
          .filter(x => x && (x.track === 'general' || TRACK_IDS.includes(x.track)))
          .map(x => ({ track: x.track, why: clip(String(x.why || ''), 160), todo: clip(String(x.todo || ''), 160) }))
          .slice(0, 3);
        it.aiDone = true;
      }
      for (const it of batch) { if (!it.aiDone) it.aiTries += 1; await it.save(); }
      done += batch.filter(b => b.aiDone).length;
    } catch (e) {
      error = e.message;
      for (const it of batch) { it.aiTries += 1; await it.save(); }
      break;
    }
  }
  s.techAi = { day: today, articles: used + done, lastError: error };
  await s.save();
  return { tagged: done, error };
}

// A student's own goal ("Salesforce developer") → closest goals + match words
async function mapCustomGoal(text) {
  const clean = clip(String(text || '').trim(), 80);
  if (!clean) return { tracks: [], keywords: [] };
  const fallback = () => ({
    tracks: tracksByKeywords(clean).slice(0, 3),
    keywords: clean.toLowerCase().split(/[^a-z0-9.+#]+/).filter(w => w.length > 2 && !['developer', 'engineer', 'and', 'the', 'for'].includes(w)).slice(0, 8),
  });
  if (!aiEnabled()) return fallback();
  try {
    const out = firstJson(await claude(TAG_SYSTEM,
      `A student typed their career goal: "${clean}".\nCareer goals (id: label):\n${TRACK_LIST}\n\nReply with only JSON: {"tracks": 1-3 closest goal ids, "keywords": 5-10 lower-case words or short phrases that news about this goal would contain}`, 400), '{', '}');
    return {
      tracks: asArray(out.tracks).filter(t => TRACK_IDS.includes(t)).slice(0, 3),
      keywords: asArray(out.keywords).map(k => String(k).toLowerCase().trim()).filter(Boolean).slice(0, 10),
    };
  } catch { return fallback(); }
}

// ── Ranking for one student ──
// Is this event in the student's city or state?
const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
function isNear(it, goal) {
  if (it.kind !== 'event' || it.mode === 'online' || !it.location) return false;
  const loc = ` ${norm(it.location)} `;
  return [goal.city, goal.state].map(norm).filter(x => x.length > 2).some(x => loc.includes(` ${x} `));
}

function shapeForStudent(it, goal) {
  const mine = goal.tracks || [];
  const insight = it.insights.find(x => mine.includes(x.track)) || it.insights.find(x => x.track === 'general') || it.insights[0] || null;
  return {
    _id: it._id, kind: it.kind, title: it.title, url: it.url, source: it.source, summary: it.summary,
    imageUrl: it.imageUrl, kicker: it.kicker || (it.kind === 'event' ? 'event' : ''), stat: it.stat || '', lang: it.lang, publishedAt: it.publishedAt, tracks: it.tracks, trackLabels: it.tracks.filter(t => t !== 'general').map(labelOf),
    importance: it.importance, pinned: it.pinned,
    insight: insight ? { track: insight.track, label: insight.track === 'general' ? 'Everyone in tech' : labelOf(insight.track), why: insight.why, todo: insight.todo } : null,
    startsAt: it.startsAt, endsAt: it.endsAt, deadline: it.deadline, mode: it.mode, location: it.location, prize: it.prize, organizer: it.organizer,
    near: isNear(it, goal),
  };
}

function score(it, goal) {
  const mine = goal.tracks || [];
  const text = `${it.title} ${it.summary}`;
  const trackHit = it.tracks.some(t => mine.includes(t));
  const kwHit = (goal.keywords || []).length ? matchCount(text, goal.keywords) : 0;
  const general = it.tracks.includes('general');
  const relevant = it.pinned || trackHit || kwHit > 0 || (general && it.importance >= 3);
  const ageDays = (Date.now() - new Date(it.publishedAt).getTime()) / 864e5;
  const s = (it.pinned ? 50 : 0) + (trackHit ? 6 : 0) + Math.min(kwHit, 3) * 2 + (general ? 1 : 0) + it.importance * 1.5 - ageDays * 1.2;
  return { relevant, s };
}

// scope: 'mine' (default) | 'all';  kind: 'news' | 'event';  track: filter to one goal
async function forStudent(goal, { scope = 'mine', kind = 'news', track = '', limit = 30, skip = 0 } = {}) {
  const now = new Date();
  const base = { kind, hidden: false };
  if (kind === 'event') base.$or = [{ deadline: { $gte: now } }, { deadline: null, endsAt: { $gte: now } }, { deadline: null, endsAt: null, startsAt: { $gte: now } }];
  else base.publishedAt = { $gte: new Date(Date.now() - KEEP_NEWS_DAYS * 864e5) };
  const items = (await TechItem.find(base).sort(kind === 'event' ? { deadline: 1 } : { publishedAt: -1 }).limit(400))
    .filter(it => kind !== 'news' || it.aiDone || !aiEnabled() || it.manual || it.tracks.length)   // wait for AI tagging when it's on
    .filter(it => !(it.aiDone && it.tracks.length === 0 && !it.pinned && !it.manual))              // AI said: not for students
    .filter(it => it.manual || langAllowed(it));                                                    // English and Hindi only

  let list = items;
  if (track) list = list.filter(it => it.tracks.includes(track));
  if (scope === 'mine' && !track) {
    const scored = list.map(it => ({ it, ...score(it, goal) })).filter(x => x.relevant || kind === 'event' && (x.it.tracks.length === 0 || x.it.tracks.includes('general')));
    list = kind === 'event'
      ? scored.map(x => x.it).sort((a, b) => isNear(b, goal) - isNear(a, goal))   // near you first, then by deadline
      : scored.sort((a, b) => b.s - a.s).map(x => x.it);
  } else if (kind === 'news') {
    list = list.sort((a, b) => (b.pinned - a.pinned) || (b.publishedAt - a.publishedAt));
  }
  return { total: list.length, items: list.slice(skip, skip + limit).map(it => shapeForStudent(it, goal)) };
}

// Turn a pasted announcement (Instagram / WhatsApp / LinkedIn post, email) into an event draft
async function extractEvent(text, url = '') {
  if (!aiEnabled()) throw new Error('Needs ANTHROPIC_API_KEY');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const out = firstJson(await claude(TAG_SYSTEM, `Today is ${today}. Here is an announcement someone pasted${url ? ` (from ${url})` : ''}:\n\n${clip(String(text), 6000)}\n\nReply with only JSON for the event in it: {"title": short name, "url": registration/info link found in the text or "", "startsAt": "YYYY-MM-DD" or "", "deadline": last date to register "YYYY-MM-DD" or "", "mode": "online"|"in-person"|"hybrid", "location": "Venue, City, State" or "", "organizer": "", "prize": "", "summary": max 25 words, who should apply and what to build or prepare, "tracks": up to 3 ids from:\n${TRACK_LIST}}`, 800), '{', '}');
  return {
    title: clip(stripHtml(out.title || ''), 200), url: okUrl(out.url) ? out.url : (okUrl(url) ? url : ''),
    startsAt: out.startsAt || '', deadline: out.deadline || '',
    mode: ['online', 'in-person', 'hybrid'].includes(out.mode) ? out.mode : 'online',
    location: clip(stripHtml(out.location || ''), 120), organizer: clip(stripHtml(out.organizer || ''), 80),
    prize: clip(stripHtml(out.prize || ''), 120), summary: clip(stripHtml(out.summary || ''), 300),
    tracks: asArray(out.tracks).filter(t => TRACK_IDS.includes(t)).slice(0, 3),
  };
}

module.exports = {
  isNear, langOf, pageText, extractEvent, fillImages,
  refresh, refreshIfStale, isRefreshing: () => Boolean(running), aiEnabled, mapCustomGoal, forStudent,
  ensureSources, parseDevpostDates, FETCHERS, DEFAULT_SOURCES, REFRESH_HOURS,
};
