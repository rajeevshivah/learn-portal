/**
 * Migration 002 — Paid course layer
 * Run once, locally, pointed at your production MongoDB:
 *   node migrations/002-paid-layer.js
 *
 * What it does (all idempotent — safe to re-run):
 *  1. Existing enrollments -> status 'active' (nothing breaks for current students)
 *  2. Existing courses -> isPaid false, price 0 (all stay free until you flip them)
 *  3. Existing episodes -> isFreePreview false, downloadCount renamed to viewCount
 */
const mongoose = require('mongoose');
const dotenv   = require('dotenv');
dotenv.config();

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected.');

  const db = mongoose.connection.db;

  const r1 = await db.collection('enrollments').updateMany(
    { status: { $exists: false } },
    { $set: { status: 'active', amount: 0, utr: '', screenshotUrl: '', rejectReason: '' } }
  );
  console.log(`Enrollments updated: ${r1.modifiedCount}`);

  const r2 = await db.collection('courses').updateMany(
    { isPaid: { $exists: false } },
    { $set: { isPaid: false, price: 0, mrp: 0, whatYouLearn: [], level: 'Beginner', language: 'Hinglish' } }
  );
  console.log(`Courses updated: ${r2.modifiedCount}`);

  const r3 = await db.collection('episodes').updateMany(
    { isFreePreview: { $exists: false } },
    { $set: { isFreePreview: false } }
  );
  const r4 = await db.collection('episodes').updateMany(
    { downloadCount: { $exists: true } },
    { $rename: { downloadCount: 'viewCount' } }
  );
  console.log(`Episodes updated: ${r3.modifiedCount}, viewCount renamed: ${r4.modifiedCount}`);

  console.log('Migration 002 complete.');
  await mongoose.disconnect();
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
