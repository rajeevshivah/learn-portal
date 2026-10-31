/**
 * READ-ONLY database backup. Exports every collection to Extended JSON
 * (one file per collection, one document per line) OUTSIDE the project folder:
 *   <projects folder>/learn-portal-backups/<timestamp>/<collection>.json
 *
 * Run from the backend folder:   node scripts/backup.js
 * Uses MONGO_URI from backend/.env. It never writes to the database.
 * Restore (only if ever needed):  mongoimport --uri "<URI>" --collection <name> --file <name>.json
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { EJSON } = require('bson');

(async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI missing in backend/.env');
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.resolve(__dirname, '..', '..', '..', 'learn-portal-backups', stamp);
  fs.mkdirSync(dir, { recursive: true });

  const collections = (await db.listCollections().toArray())
    .map(c => c.name).filter(n => !n.startsWith('system.'));
  let total = 0;
  for (const name of collections) {
    const out = fs.createWriteStream(path.join(dir, `${name}.json`));
    let n = 0;
    for await (const doc of db.collection(name).find()) {
      out.write(EJSON.stringify(doc, { relaxed: false }) + '\n');
      n++;
    }
    await new Promise(r => out.end(r));
    console.log(`${name.padEnd(20)} ${n} documents`);
    total += n;
  }
  console.log(`\nBackup complete: ${total} documents in ${collections.length} collections`);
  console.log(`Saved to: ${dir}`);
})()
  .catch(e => { console.error('Backup failed:', e.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
