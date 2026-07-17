# MentorHub Integration — Featured Packages on Learn Portal

The learn portal dashboard now shows MentorHub packages that you flag
"show on learn portal" from MentorHub admin. The learn portal side is DONE.
This file is the exact spec for the MentorHub side. Give this file to your
MentorHub project chat and ask it to implement.

If you do nothing on the MentorHub side, the learn portal still works:
it shows one generic "Book a 1:1 session" card linking to the site
(as long as VITE_MENTORHUB_URL is set on the learn portal).

---

## What the learn portal calls

```
GET {MENTORHUB_API}/api/packages/featured
```

- PUBLIC endpoint — no login, no token (students of the learn portal are
  not logged into MentorHub).
- Must respond with a JSON array (max useful: 3 items shown):

```json
[
  {
    "_id": "665f1a...",
    "name": "1:1 Doubt Solving Session",
    "price": 499,
    "tagline": "45 minutes, screen share, any topic",
    "link": "https://mentorshub.rajeevshivah.me/book/doubt-session"
  }
]
```

- `link` is optional — if missing, the learn portal links to the main site.
- Empty array `[]` is fine — the learn portal shows the generic card instead.

---

## Changes needed in the MentorHub codebase

### 1. Package model — add one flag

```js
showOnLearnPortal: {
  type: Boolean,
  default: false,
},
```

### 2. Public route

```js
// GET /api/packages/featured — PUBLIC (consumed by learn.rajeevshivah.me)
router.get('/featured', async (req, res) => {
  try {
    const packages = await Package.find({
      showOnLearnPortal: true,
      isActive: true,          // adjust to your model's "live" flag
    })
      .select('name price tagline description')
      .limit(3);

    res.json(packages.map(p => ({
      _id: p._id,
      name: p.name,
      price: p.price,
      tagline: p.tagline || p.description || '',
      // adjust to your real booking URL pattern:
      link: `${process.env.SITE_URL}/`,
    })));
  } catch (e) {
    res.json([]);   // never break the learn portal dashboard
  }
});
```

ROUTE ORDER: define `/featured` BEFORE any `/:id` route in the same file.

### 3. Admin toggle

In the MentorHub admin packages screen, add a checkbox/toggle
"Show on Learn Portal" that sets `showOnLearnPortal` via the existing
package update route. (Just include the field in the update whitelist.)

### 4. CORS

The learn portal frontend calls this endpoint directly from the browser, so
MentorHub's backend must allow the learn portal origin. If MentorHub uses a
single-origin CORS config, change it to a list:

```js
app.use(cors({
  origin: [
    process.env.CLIENT_URL,                  // existing MentorHub frontend(s)
    'https://learn.rajeevshivah.me',
    'http://localhost:5173',                 // local dev
  ],
  credentials: true,
}));
```

(If MentorHub already serves two frontends, it likely already has a list —
just add the learn portal domain.)

---

## Learn portal side (already done — for reference)

Two env vars on the learn portal frontend (Vercel):

```
VITE_MENTORHUB_URL=https://mentorshub.rajeevshivah.me
VITE_MENTORHUB_API=https://<mentorhub-backend>.onrender.com
```

- Both blank → feature completely hidden.
- Only URL set → generic "Book a 1:1 session" card.
- Both set + endpoint live → up to 3 real package cards with prices.

Placement: dashboard (below My courses) + a contextual line in every
episode's doubts section.

## Recommendation

Create ONE dedicated package in MentorHub for course students, e.g.
"Course Student Doubt Session — ₹399" (slightly below your normal rate).
Flag only that one. A single focused offer converts better than a menu.
