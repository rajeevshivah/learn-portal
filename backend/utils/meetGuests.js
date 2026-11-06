// ─────────────────────────────────────────────────────────
// Google Meet guest list sync.
//
// A live program's classes run on one Google Meet link that lives on a Google
// Calendar event (usually a recurring one) in the instructor's calendar. This
// keeps every CONFIRMED student's email on that event's guest list. With the
// meeting's access set to "Trusted" in Meet, invited guests join directly and
// anyone else (a forwarded link, a friend) has to ask to join.
//
// Only guests this code added are ever removed. Co-hosts or anyone you invite
// by hand stay untouched. Guests are added silently (no email per student).
//
// Env (Render). Run `node scripts/google-calendar-token.js` once to get these:
//   GOOGLE_CAL_CLIENT_ID       OAuth client (type "Desktop app") with Calendar API enabled
//   GOOGLE_CAL_CLIENT_SECRET
//   GOOGLE_CAL_REFRESH_TOKEN   for the Google account that owns the class meetings
//   GOOGLE_CAL_ID              optional, default "primary"
// ─────────────────────────────────────────────────────────

const LiveEvent    = require('../models/LiveEvent');
const Registration = require('../models/Registration');

const TOKEN_URL = () => process.env.GOOGLE_OAUTH_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const CAL_API   = () => (process.env.GOOGLE_CAL_API_BASE || 'https://www.googleapis.com/calendar/v3').replace(/\/$/, '');
const CAL_ID    = () => process.env.GOOGLE_CAL_ID || 'primary';
const MAX_GUESTS = 900;   // Google's per-event guest limit is higher, but leave headroom

const isConfigured = () => Boolean(
  process.env.GOOGLE_CAL_CLIENT_ID && process.env.GOOGLE_CAL_CLIENT_SECRET && process.env.GOOGLE_CAL_REFRESH_TOKEN
);

// ── Access token (refreshed from the stored refresh token, cached ~1 h) ──
let cached = { token: '', exp: 0 };
async function accessToken() {
  if (cached.token && Date.now() < cached.exp) return cached.token;
  const res = await fetch(TOKEN_URL(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CAL_CLIENT_ID,
      client_secret: process.env.GOOGLE_CAL_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_CAL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const why = data.error === 'invalid_grant'
      ? 'Google rejected the saved permission (refresh token expired or revoked). Run scripts/google-calendar-token.js again and update GOOGLE_CAL_REFRESH_TOKEN.'
      : `Could not get Google access (${data.error_description || data.error || res.status})`;
    throw new Error(why);
  }
  cached = { token: data.access_token, exp: Date.now() + Math.max(60, (data.expires_in || 3600) - 120) * 1000 };
  return cached.token;
}

async function gcal(method, path, { query, body } = {}) {
  const url = new URL(`${CAL_API()}${path}`);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Google Calendar error (${res.status})`;
    const err = new Error(res.status === 404 ? 'That calendar event was not found in the connected Google account.' : msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

const calPath = () => `/calendars/${encodeURIComponent(CAL_ID())}`;

// ── Turning what the admin pastes into a calendar event id ──
// Accepts a raw event id, or a Google Calendar link (…?eid=…). An instance of
// a recurring event ("abc_20261102T143000Z") is mapped to its series ("abc").
function parseEventRef(input) {
  let ref = String(input || '').trim();
  if (!ref) return '';
  if (/^https?:\/\//i.test(ref)) {
    let eid = '';
    try { eid = new URL(ref).searchParams.get('eid') || ''; } catch { eid = ''; }
    if (!eid) { const m = ref.match(/\/event[s]?\/([A-Za-z0-9_-]+)/); eid = m ? m[1] : ''; }
    if (!eid) return '';
    try {
      const decoded = Buffer.from(eid.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      ref = decoded.split(/\s+/)[0] || '';
    } catch { return ''; }
  }
  ref = ref.replace(/_\d{8}(T\d{6}Z?)?$/, '');
  return /^[a-z0-9_]{5,1024}$/i.test(ref) ? ref : '';
}

const meetCode = (url) => {
  const m = String(url || '').match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
  return m ? m[1].toLowerCase() : '';
};

// Find the calendar event that carries this program's Meet link.
// Classes still to come (or running now). Their Meet link is the one to protect;
// a link used only by finished classes is history.
const upcoming = (event) => {
  const now = Date.now();
  return (event.sessions || []).filter(s => new Date(s.startsAt).getTime() + (s.durationMins || 90) * 60000 > now);
};
const currentSessions = (event) => (upcoming(event).length ? upcoming(event) : (event.sessions || []));

async function findByMeetLink(event) {
  const sessions = currentSessions(event);
  // The link of the NEXT class decides; fall back to any link on upcoming classes.
  const next = [...sessions].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)).find(s => meetCode(s.joinUrl));
  const codes = new Set(next ? [meetCode(next.joinUrl)] : []);
  if (!codes.size) throw new Error('No Google Meet link on this program’s upcoming classes, so there is no meeting to protect. Add the Meet link to the classes first.');
  const first = sessions.reduce((m, s) => (!m || s.startsAt < m ? s.startsAt : m), null);
  const timeMin = new Date(new Date(first || Date.now()).getTime() - 3 * 864e5).toISOString();
  let pageToken;
  for (let page = 0; page < 8; page++) {
    const data = await gcal('GET', `${calPath()}/events`, {
      query: { timeMin, singleEvents: false, maxResults: 250, pageToken, showDeleted: false },
    });
    for (const it of data.items || []) {
      const links = [it.hangoutLink, ...((it.conferenceData?.entryPoints || []).map(p => p.uri))];
      if (links.some(l => codes.has(meetCode(l)))) return it.recurringEventId || it.id;
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  throw new Error('Couldn’t find a calendar event with this Meet link in the connected Google account. Paste the calendar event link in Meet guests instead.');
}

// ── The sync itself ──
async function syncNow(eventId) {
  const event = await LiveEvent.findById(eventId);
  if (!event) throw new Error('Event not found');
  const ms = event.meetSync || {};
  if (!ms.enabled) return { skipped: true, message: 'Meet guest list is switched off for this program' };
  if (!isConfigured()) throw new Error('Google Calendar isn’t connected yet. Add GOOGLE_CAL_CLIENT_ID, GOOGLE_CAL_CLIENT_SECRET and GOOGLE_CAL_REFRESH_TOKEN on the server.');

  let calId = ms.calendarEventId;
  if (!calId) {
    calId = await findByMeetLink(event);
    event.meetSync.calendarEventId = calId;
  }

  const regs = await Registration.find({ event: event._id, status: 'active' }).populate('user', 'email');
  const want = new Set(regs.map(r => String(r.user?.email || '').toLowerCase().trim()).filter(Boolean));
  if (want.size > MAX_GUESTS) throw new Error(`${want.size} confirmed students is more than one calendar event should hold (${MAX_GUESTS}). Split the program across two meetings.`);

  const cal = await gcal('GET', `${calPath()}/events/${encodeURIComponent(calId)}`);
  const managed = new Set((ms.managedEmails || []).map(e => e.toLowerCase()));
  const current = cal.attendees || [];
  const onList = new Set(current.map(a => String(a.email || '').toLowerCase()));

  let removed = 0;
  const kept = current.filter(a => {
    const e = String(a.email || '').toLowerCase();
    if (managed.has(e) && !want.has(e) && !a.organizer && !a.self) { removed++; return false; }
    return true;
  });
  const toAdd = [...want].filter(e => !onList.has(e));
  const attendees = [...kept, ...toAdd.map(email => ({ email }))];

  if (toAdd.length || removed) {
    await gcal('PATCH', `${calPath()}/events/${encodeURIComponent(calId)}`, {
      query: { sendUpdates: 'none' },
      body: { attendees },
    });
  }

  // We manage every confirmed student now on the list (including ones you had
  // added by hand earlier: they leave the list if their seat goes).
  event.meetSync.managedEmails = [...want];
  event.meetSync.lastSync = {
    at: new Date(), ok: true, guests: want.size, added: toAdd.length, removed,
    message: toAdd.length || removed
      ? `Guest list updated: ${toAdd.length} added, ${removed} removed.`
      : 'Guest list already up to date.',
  };
  await event.save();
  return { ...event.meetSync.lastSync, calendarEventId: calId, eventTitle: cal.summary || '' };
}

// One sync at a time per program, so two payments landing together can't
// overwrite each other's guest list.
const chains = new Map();
function syncEvent(eventId) {
  const key = String(eventId);
  const run = (chains.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    try {
      return await syncNow(key);
    } catch (e) {
      await LiveEvent.updateOne({ _id: key }, {
        $set: { 'meetSync.lastSync.at': new Date(), 'meetSync.lastSync.ok': false, 'meetSync.lastSync.message': e.message },
      }).catch(() => {});
      throw e;
    }
  });
  chains.set(key, run);
  run.finally(() => { if (chains.get(key) === run) chains.delete(key); }).catch(() => {});
  return run;
}

// Fire-and-forget after a seat changes. Never blocks or breaks the caller.
async function queueSync(eventId) {
  try {
    if (!eventId || !isConfigured()) return;
    const on = await LiveEvent.exists({ _id: eventId, 'meetSync.enabled': true });
    if (!on) return;
    syncEvent(eventId).catch(e => console.error('Meet guest sync:', e.message));
  } catch (e) {
    console.error('Meet guest sync:', e.message);
  }
}

module.exports = { isConfigured, parseEventRef, meetCode, syncEvent, queueSync, currentSessions };
