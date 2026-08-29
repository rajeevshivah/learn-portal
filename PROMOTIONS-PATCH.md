# Featured Promotions on Roadmap Pages — drop-in patch

Adds admin-controlled promotions (a course OR a live webinar) that show on
roadmap funnel pages. You target **all** pages or **specific** roadmaps. Past
webinars hide themselves automatically. Also fixes the missing admin link to
the Roadmaps page.

## Files in this patch

### NEW (2) — nothing to overwrite
```
backend/models/Promotion.js
backend/routes/promotions.js
```

### OVERWRITTEN (4) — replace your existing ones
```
backend/server.js                    -> mounts /api/promotions (one added line)
frontend/src/pages/Admin.jsx         -> adds "Roadmaps & Promotions" button (fixes the dead route)
frontend/src/pages/Roadmaps.jsx      -> adds the whole Promotions manager below your roadmaps
frontend/src/pages/Roadmap.jsx       -> renders promotion cards on the public funnel page
```

## Install

From your repo root:
```bash
cp -r backend/  ./
cp -r frontend/ ./
```
No new npm packages. Restart the backend so the new route mounts.

## How to use

1. Admin panel → click **Roadmaps & Promotions** (top-right).
2. Scroll to **Featured Promotions** → **New promotion**.
3. Choose a **course** or a **live webinar**, optionally set a headline/CTA.
4. Choose **All roadmap pages** or **Specific roadmaps** (tick the ones you want).
5. Create. It's live immediately on the matching `/r/:slug` pages.
6. Toggle **Active/Off** or reorder anytime. When a webinar ends (or you mark it
   completed), it disappears from every page on its own.

## Notes / decisions baked in

- A promotion points at ONE course or ONE webinar. To feature two things, make
  two promotions.
- Course CTA → `/courses/:slug`; webinar CTA → your existing `/live/:slug` funnel.
- Unpublished/deleted courses and ended/unpublished events are filtered out of
  the public response, so a stale target never shows a dead card.
- The old static "While you're here…" section stays as an always-on fallback
  below the promotions.
- Admin-only endpoints are protected server-side (protect + adminOnly); the
  public resolver only ever returns safe, live targets.

## Not touched (deliberately)

I left the older per-course `roadmapPdfUrl` system and the duplicate `(2)` files
alone — this patch is only about promotions + the admin link. Consolidating those
is a separate cleanup if you want it later.
