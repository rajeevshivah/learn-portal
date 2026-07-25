/**
 * Migration 003 — Normalise episode phases & rebuild phase order
 * ------------------------------------------------------------
 * WHY: episode `phase` was a free-text field, so the same phase got typed
 * several ways ("Phase 1 — Basics" vs "Phase 1 — Python Basics"). The course
 * page groups by exact phase string, so every near-miss fell into a stray
 * "More lessons" bucket at the bottom — including episodes 1 & 2. On top of
 * that, migration 001 built each course's `phases` list ALPHABETICALLY
 * instead of in teaching order.
 *
 * WHAT THIS DOES (idempotent — safe to re-run):
 *   1. For each course, groups its episodes by a normalised phase key
 *      (dash style, casing, and the redundant word "Python" are ignored, so
 *      "Phase 1 — Basics" and "Phase 1 — Python Basics" collapse together).
 *   2. Picks ONE canonical label per group — the variant used by the episode
 *      with the LOWEST episodeNumber — and rewrites every episode in that
 *      group to use it. Now all Phase-1 lessons share one exact string.
 *   3. Rebuilds course.phases in true teaching order: phases sorted by the
 *      lowest episode number they contain (so Phase 1 comes before Phase 2,
 *      not alphabetically).
 *
 * Nothing is deleted; only `phase` strings and `course.phases` are updated.
 *
 * Run from the backend folder, pointed at your production DB:
 *   node migrations/003-normalize-phases.js
 *
 * BACK UP first (Atlas: take a snapshot). Then re-check the course page.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Course   = require('../models/Course');
const Episode  = require('../models/Episode');

// Same normalisation the frontend uses, kept in sync deliberately.
const normPhase = (p) => (p || '')
  .toLowerCase()
  .replace(/[–—-]/g, ' ')       // en dash, em dash, hyphen → space
  .replace(/\bpython\b/g, ' ')  // "Python Basics" ≡ "Basics"
  .replace(/\s+/g, ' ')
  .trim();

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('✖ MONGO_URI not set. Add it to backend/.env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✔ Connected to MongoDB\n');

  const courses = await Course.find();
  let totalRewritten = 0;

  for (const course of courses) {
    const episodes = await Episode.find({ course: course._id });
    if (!episodes.length) {
      console.log(`• ${course.title}: no episodes, skipped`);
      continue;
    }

    // group episodes by normalised phase key
    const groups = new Map();   // key -> { canonicalLabel, minEp, episodes: [] }
    for (const ep of episodes) {
      const key = normPhase(ep.phase);
      if (key === '') continue;   // leave truly phase-less episodes alone
      if (!groups.has(key)) {
        groups.set(key, { canonicalLabel: ep.phase, minEp: Infinity, episodes: [] });
      }
      const g = groups.get(key);
      g.episodes.push(ep);
      const n = Number(ep.episodeNumber);
      // canonical label = the variant on the lowest-numbered episode
      if (!Number.isNaN(n) && n < g.minEp) {
        g.minEp = n;
        g.canonicalLabel = ep.phase;
      }
    }

    // 1 & 2: rewrite each episode to its group's canonical label
    let rewrittenHere = 0;
    for (const g of groups.values()) {
      for (const ep of g.episodes) {
        if (ep.phase !== g.canonicalLabel) {
          ep.phase = g.canonicalLabel;
          await ep.save();
          rewrittenHere++;
        }
      }
    }

    // 3: rebuild course.phases in teaching order (by lowest episode number)
    const orderedPhases = [...groups.values()]
      .sort((a, b) => a.minEp - b.minEp)
      .map(g => g.canonicalLabel);

    course.phases = orderedPhases;
    await course.save();

    totalRewritten += rewrittenHere;
    console.log(
      `✔ ${course.title}: ${rewrittenHere} episode phase(s) normalised · ` +
      `phases → ${orderedPhases.join(' | ') || '(none)'}`
    );
  }

  console.log(`\n✅ Done. ${totalRewritten} episode(s) rewritten across ${courses.length} course(s).`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (err) => {
  console.error('✖ Migration failed:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
