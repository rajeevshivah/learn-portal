/**
 * ONE-TIME MIGRATION — Phase 1: Course layer
 * ------------------------------------------------------------
 * What this does (safe to run more than once):
 *   1. Creates a default "PyMaster India" course if it doesn't exist.
 *   2. Assigns every episode that has no `course` to that default course.
 *   3. Rebuilds the default course's `phases` list from existing episode phases.
 *   4. Drops the OLD global-unique index on episodeNumber (episodeNumber_1)
 *      so the new per-course compound index can take over.
 *
 * Run from the backend folder:
 *   node migrations/001-course-layer.js
 *
 * Make sure your .env (MONGO_URI) is in place first.
 * BACK UP your database before running (Atlas: take a snapshot).
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Course   = require('../models/Course');
const Episode  = require('../models/Episode');

const DEFAULT_COURSE = {
  title: 'PyMaster India',
  slug: 'pymaster-india',
  description: 'Learn Python from zero — episode-wise notes, PDFs and resources.',
  order: 0,
  isPublished: true,
};

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('✖ MONGO_URI not set. Add it to backend/.env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✔ Connected to MongoDB');

  // ── 1. Default course ────────────────────────────────
  let course = await Course.findOne({ slug: DEFAULT_COURSE.slug });
  if (!course) {
    course = await Course.create(DEFAULT_COURSE);
    console.log(`✔ Created default course "${course.title}" (${course._id})`);
  } else {
    console.log(`• Default course already exists (${course._id})`);
  }

  // ── 2. Backfill episodes with no course ──────────────
  // We read with the native driver to catch docs missing the field entirely.
  const coll = mongoose.connection.collection('episodes');
  const orphanFilter = { $or: [{ course: { $exists: false } }, { course: null }] };
  const orphanCount = await coll.countDocuments(orphanFilter);

  if (orphanCount > 0) {
    const result = await coll.updateMany(orphanFilter, { $set: { course: course._id } });
    console.log(`✔ Assigned ${result.modifiedCount} episode(s) to "${course.title}"`);
  } else {
    console.log('• No orphan episodes to assign');
  }

  // ── 3. Rebuild the course's phase list from its episodes ──
  const phases = await Episode.distinct('phase', { course: course._id });
  const cleanPhases = phases.filter(Boolean).sort();
  course.phases = cleanPhases;
  await course.save();
  console.log(`✔ Course phases set: ${cleanPhases.length ? cleanPhases.join(' | ') : '(none)'}`);

  // ── 4. Drop the old global-unique index on episodeNumber ──
  try {
    const indexes = await coll.indexes();
    const oldIndex = indexes.find(i => i.name === 'episodeNumber_1');
    if (oldIndex) {
      await coll.dropIndex('episodeNumber_1');
      console.log('✔ Dropped old global-unique index "episodeNumber_1"');
    } else {
      console.log('• Old index "episodeNumber_1" not present (already dropped)');
    }
  } catch (e) {
    console.warn('⚠ Could not drop old index:', e.message);
  }

  // ── 5. Ensure the new compound index exists ──────────
  await Episode.syncIndexes();
  console.log('✔ Synced Episode indexes (new compound: course + episodeNumber)');

  console.log('\n✅ Migration complete.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (err) => {
  console.error('✖ Migration failed:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
