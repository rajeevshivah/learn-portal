# Live Classes & Workshops + Playlist Search

Drop-in patch for learn-portal. The folder structure here mirrors your repo
exactly, so you can copy `backend/` and `frontend/` straight over the repo root.

## What's inside

### NEW files (6) — safe, nothing to overwrite
```
backend/models/LiveEvent.js
backend/models/Registration.js
backend/routes/events.js
frontend/src/pages/Events.jsx
frontend/src/pages/EventDetail.jsx
frontend/src/pages/admin/EventsTab.jsx
```

### OVERWRITTEN files (5) — these replace your existing ones
```
backend/server.js                      -> mounts /api/events
frontend/src/App.jsx                   -> adds /events and /events/:slug routes
frontend/src/pages/Admin.jsx           -> adds "Live & Workshops" tab + pending badge
frontend/src/components/Navbar.jsx     -> adds "Live" nav link
frontend/src/pages/CourseEpisodes.jsx  -> adds playlist search + live-class banner
```

If you have made your own edits to any of those 5 since I read the project,
diff them before overwriting — my versions are based on the zip you uploaded.

## Install

From your repo root:

```bash
cp -r /path/to/this/backend/  ./
cp -r /path/to/this/frontend/ ./
git status     # expect: 5 modified, 6 untracked
```

No new npm packages required. Everything reuses dependencies you already have
(express-async-handler, mongoose, cloudinary, axios, react-router-dom).

No new environment variables. Paid events reuse the UPI details from your
existing Settings tab.

## Smoke test before pushing

Run backend and frontend, then in this order:

1. Admin panel -> "Live & Workshops" tab appears
2. Create a FREE live class attached to a course, add WhatsApp link, tick Published
3. As a student -> "Live" in navbar -> register -> WhatsApp link appears immediately
4. Create a PAID event at Rs.50 -> register as student -> says "under verification",
   NO link visible
5. Admin -> Registrations -> Approve -> student refreshes -> link now appears
6. Open a course with 4+ lessons -> search box present and filtering

Step 4 is the important one. That is the paid gate. If the WhatsApp link is
visible before approval, do not push -- something is wrong.

## How the access gate works

`whatsappLink` and every session's `joinUrl` are stripped to an empty string
server-side in `shapeEvent()` (backend/routes/events.js) unless the student's
registration status is 'active'. This is enforced in the API response, not in
the UI, so opening DevTools reveals nothing.

- Free event  -> status 'active' immediately -> link in the registration reply
- Paid event  -> status 'pending' -> link only after you approve in admin

## Recording -> episode

Each session has a `recordingUrl` field. After the session ends, paste the
YouTube URL, save, then hit "Publish recording as episode". It finds the
course's highest episodeNumber, adds 1, and creates the episode under a
"Live Sessions" phase. The session stores `publishedEpisode` so you cannot
publish the same recording twice.

## Known rough edges

1. Manual approval means a student paying at 7pm for an 8pm class may not get
   the link in time. Use the "Registration closes" field to give yourself an
   approval window.

2. The seat-limit check reads the count then writes, so simultaneous
   registrations can overshoot the cap slightly. Not an issue at small scale.

3. WhatsApp group invite links expire when reset. If you reuse a group across
   events, update the link in the admin form each time.
