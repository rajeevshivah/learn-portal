# Tech news & hackathons

Added 7 Nov 2026. Students: one slim **Tech for you** strip on Home → the app-style **Tech**
page (`/tech`), also in the top nav as **Tech news**.
Admin: Admin → **Tech feed**.

## What students get
- On first visit they pick their goals (up to 5 of 16, e.g. Data Science, AI/ML, Web, DSA &
  Placements) or type their own ("Salesforce developer"). A typed goal is mapped by AI to
  the closest goals plus keywords.
- **For you**: news ranked for their goals. Each item has *Why it matters* and *Try this*
  written for their goal.
- **All news**: everything relevant to students, filterable by topic.
- **Hackathons & events**: upcoming ones, soonest deadline first.

- First visit: two steps. 1) goals, 2) city (optional): **Use my location** fills city and
  state (browser asks permission; only city/state are saved, never coordinates), or type it.
- Top of the page: 🎯 goals and 📍 city pills open bottom sheets to change them.
- **Hackathons** tab is split: *Near <city>* / *Online* / *Elsewhere*. "Near" = the event's
  location text contains the student's city or state. So when you add an in-person event,
  write the location as **Venue, City, State** (e.g. "IIT BHU, Varanasi, Uttar Pradesh").

## Tech Pass (what's free, what's paid)
- Free for everyone: headlines, summaries, hackathons, near-you events.
- Locked: the AI *Why it matters / Try this* tips and *Who should apply* on events. Locked
  cards show a 🔒 row that opens the pass sheet.
- Unlocked for: admins; anyone with a pass; and (switch: "Free for students…") students whose
  paid program is still running or whose paid course access hasn't expired. Never lifetime:
  program access ends when its **last class** ends, plus "keep it for N days" (default 0),
  even if you never mark the program completed. After that they see the pass offer.
- Pass: one-time Razorpay payment (UPI / card / netbanking), no auto-renew. Default ₹99 for
  90 days, change it in Admin → Tech feed → Tech Pass. Buying again adds days on top.
- Untick **Charge for tips** to make tips free for everyone.
- **Give a pass free**: by email, any number of days (toppers, friends, refunds).
- Payments show in Admin → Payments as "Tech Pass". The Refunds page doesn't handle passes:
  refund one from the Razorpay dashboard if needed.

## Looks & language
- **English and Hindi only.** Other scripts (Chinese, Russian…) and other Latin languages
  (Spanish, German…) are dropped when fetched, and the AI flags anything that slips through.
  Hindi headlines stay in Hindi; the AI summary and tips are in simple English.
- **Pictures:** the article's own image (from the feed, or the page's preview image, fetched
  once per article). No image → a drawn cover in the goal's colour with an icon.
- The AI labels each story (Release, Hiring, Funding, AI, Learn…) and pulls out the key number
  ("₹500 crore", "40,000 freshers"), shown as a chip and big on the top story's cover.
- Top story of "For you" is a big card; the rest are rows with a thumbnail. Events show a
  date tile (red when closing in < 4 days).

## College & company pages
Admin → Tech feed → Sources → **+ Add source → College / company page**: the link to a page
where a college or company lists events/fests/hackathons/drives, plus "College, City, State".
AI reads it once a day and adds the upcoming events (past and undated ones skipped), with the
college's location, so nearby students see them under **Near you**. Pages that build their
content with JavaScript can't be read (you'll get a message saying so).
**Instagram / LinkedIn / WhatsApp:** can't be read automatically (login walls, and their terms
forbid scraping). Instead: **+ Add event → paste the post text → Fill from text**; AI fills
the form, you check it and add.

## Where it comes from
Built-in sources (switch on/off in Admin → Tech feed → Sources): Hacker News, DEV Community,
TechCrunch, Analytics India Magazine, Inc42, Google News (tech hiring/placements in India),
The GitHub Blog, Devpost hackathons, Tech news in Hindi (Google News). Add any RSS feed there too.
Unstop / Devfolio / college events: add them with **+ Add event** (or ask Claude).
Gossip, stock-price and other non-student news is filtered out by the AI.

## How it runs (free Render plan)
No timer. When someone opens the feed and it's over 3 hours old, it refreshes in the
background. **Refresh now** in admin does it immediately. News older than 21 days and events
closed 3+ days ago are cleaned up (pinned and hand-added items stay).

## AI (Claude API)
Render → backend → Environment: `ANTHROPIC_API_KEY` (from console.anthropic.com → API keys).
Uses Claude Haiku 5.5, 8 articles per call, max 80 articles a day
(`TECH_AI_DAILY_ARTICLES`). Roughly a few cents a day. Set a monthly spend limit in the
Anthropic console. Without the key everything works, just without the tips.

## MCP tools
get_tech_feed_status, refresh_tech_feed, list_tech_items, add_tech_event, update_tech_item,
delete_tech_item, set_tech_source, add_tech_source, remove_tech_source,
set_tech_pass (price / days / on-off / free for paid), gift_tech_pass, list_tech_passes.
