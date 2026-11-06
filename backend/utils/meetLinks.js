// ─────────────────────────────────────────────────────────
// A fresh Google Meet link for every class.
//
// When a program has "Meet link per class" on, every upcoming class gets its
// own Google Calendar event (in the host's calendar, no guests) with its own
// Meet link, saved as the class's join link. A link that leaks only works for
// that one class. Students get it from the portal 15 minutes before class
// (see utils/joinWindow.js), never earlier.
//
// Runs whenever an admin creates or edits a program (the server is awake then),
// so nothing depends on a background timer.
//
// Rules per class:
//   • finished classes are never touched
//   • a class with a link YOU typed in is left alone (unless you ask to replace it)
//   • a portal-made link follows the class: time or title change → event updated;
//     link cleared → a new one is made; class deleted → its event is deleted;
//     you paste your own link over it → the portal's event is deleted, yours stays
// ─────────────────────────────────────────────────────────

const crypto = require('crypto');
const LiveEvent = require('../models/LiveEvent');
const { isConfigured, gcal } = require('./googleCalendar');

const ended = (s, now = Date.now()) =>
  new Date(s.startsAt).getTime() + (s.durationMins || 60) * 60000 <= now;
const signature = (event, s) => `${event.title}|${s.title}|${new Date(s.startsAt).toISOString()}|${s.durationMins || 60}`;

const calBody = (event, s) => {
  const start = new Date(s.startsAt);
  const end = new Date(start.getTime() + (s.durationMins || 60) * 60000);
  return {
    summary: `${event.title} · ${s.title}`.slice(0, 250),
    description: 'Class meeting created by learn.rajeevshivah.me. Students join from the portal; this link opens to them 15 minutes before class.',
    start: { dateTime: start.toISOString(), timeZone: 'Asia/Kolkata' },
    end:   { dateTime: end.toISOString(), timeZone: 'Asia/Kolkata' },
    visibility: 'private',
    reminders: { useDefault: true },
  };
};

const meetUrl = (ev) =>
  ev?.hangoutLink || (ev?.conferenceData?.entryPoints || []).find(p => p.entryPointType === 'video')?.uri || '';

async function createMeeting(event, s) {
  let ev = await gcal('POST', '/events', {
    query: { conferenceDataVersion: 1, sendUpdates: 'none' },
    body: {
      ...calBody(event, s),
      conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    },
  });
  // Google sometimes finishes making the Meet a moment later
  for (let i = 0; i < 3 && !meetUrl(ev); i++) {
    await new Promise(r => setTimeout(r, 1200));
    ev = await gcal('GET', `/events/${encodeURIComponent(ev.id)}`);
  }
  const url = meetUrl(ev);
  if (!url) {
    await deleteMeeting(ev.id);
    throw new Error('Google created the event but no Meet link came back. Is Google Meet allowed on this account?');
  }
  return { eventId: ev.id, url };
}

async function deleteMeeting(calendarEventId) {
  if (!calendarEventId) return;
  try { await gcal('DELETE', `/events/${encodeURIComponent(calendarEventId)}`, { query: { sendUpdates: 'none' } }); }
  catch (e) { if (![404, 410].includes(e.status)) throw e; }   // already gone is fine
}

// Make every upcoming class's link right. replaceOwn: also replace links you
// typed in yourself (used once, when switching an existing program over).
async function ensureNow(eventId, { replaceOwn = false } = {}) {
  const event = await LiveEvent.findById(eventId);
  if (!event) throw new Error('Event not found');
  if (!event.meetAuto?.enabled) return { skipped: true, message: 'Meet link per class is off for this program' };
  if (!isConfigured()) throw new Error('Google Calendar isn’t connected on the server (GOOGLE_CAL_… settings missing on Render).');

  const counts = { created: 0, updated: 0, released: 0, ownLeft: 0 };
  let failure = null;
  for (const s of event.sessions) {
    if (ended(s)) continue;
    try {
      const auto = s.autoMeet?.eventId ? s.autoMeet : null;
      if (auto) {
        if (s.joinUrl && s.joinUrl !== auto.url) {          // you put your own link on it
          await deleteMeeting(auto.eventId);
          s.autoMeet = undefined; counts.released++;
          continue;
        }
        if (s.joinUrl) {
          const sig = signature(event, s);
          if (auto.synced !== sig) {                       // class moved or renamed
            await gcal('PATCH', `/events/${encodeURIComponent(auto.eventId)}`, { query: { sendUpdates: 'none' }, body: calBody(event, s) });
            s.autoMeet.synced = sig; counts.updated++;
          }
          continue;
        }
        await deleteMeeting(auto.eventId);                 // link cleared → make a new one
        s.autoMeet = undefined;
      } else if (s.joinUrl && !replaceOwn) {
        counts.ownLeft++;
        continue;                                          // your own link: leave it
      }
      const m = await createMeeting(event, s);
      s.joinUrl = m.url;
      s.autoMeet = { eventId: m.eventId, url: m.url, synced: signature(event, s) };
      counts.created++;
    } catch (e) {
      failure = e;
      break;   // most errors (permission, quota) would repeat for every class
    }
  }
  event.markModified('sessions');

  const parts = [];
  if (counts.created) parts.push(`${counts.created} new link${counts.created > 1 ? 's' : ''} made`);
  if (counts.updated) parts.push(`${counts.updated} moved/renamed in Google Calendar`);
  if (counts.released) parts.push(`${counts.released} switched to your own link`);
  const message = failure
    ? `${parts.length ? parts.join(', ') + '. Then stopped: ' : ''}${failure.message}`
    : parts.length ? `${parts.join(', ')}.`
      : counts.ownLeft ? `Nothing changed: ${counts.ownLeft} upcoming class${counts.ownLeft > 1 ? 'es have links' : ' has a link'} you typed in, which ${counts.ownLeft > 1 ? 'are' : 'is'} left alone.`
        : 'Every upcoming class already has its own link.';
  event.meetAuto.lastRun = { at: new Date(), ok: !failure, message };
  await event.save();
  if (failure) { const err = new Error(message); err.status = 400; throw err; }
  return { ...counts, message };
}

// One run at a time per program, so two quick edits can't make duplicate meetings.
const chains = new Map();
function ensureLinks(eventId, opts) {
  const key = String(eventId);
  const run = (chains.get(key) || Promise.resolve()).catch(() => {}).then(() => ensureNow(key, opts));
  chains.set(key, run);
  run.finally(() => { if (chains.get(key) === run) chains.delete(key); }).catch(() => {});
  return run;
}

// After an edit: never fails the edit itself; returns a note for the admin.
async function afterEdit(eventId) {
  try {
    const on = await LiveEvent.exists({ _id: eventId, 'meetAuto.enabled': true });
    if (!on) return '';
    const r = await ensureLinks(eventId);
    return r.created || r.updated || r.released ? `Meet links: ${r.message}` : '';
  } catch (e) {
    return `Saved, but Meet links: ${e.message}`;
  }
}

// Delete the portal's calendar events for classes that are being removed.
async function releaseSessions(sessions) {
  if (!isConfigured()) return;
  for (const s of sessions || []) {
    if (s.autoMeet?.eventId && !ended(s)) {
      try { await deleteMeeting(s.autoMeet.eventId); }
      catch (e) { console.error('Meet link cleanup:', e.message); }
    }
  }
}

module.exports = { ensureLinks, afterEdit, releaseSessions, ended };
