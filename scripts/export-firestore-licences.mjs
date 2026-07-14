// ============================================================
// Backup: export licence-related Firestore collections to JSON
// ============================================================
//
// Run this BEFORE seed-agency-data.mjs or clear-claude-overrides.mjs so
// there is a rollback point. It only READS — it never writes to Firestore.
//
// Backs up the collections that the seed/clear operations touch (plus a
// couple of adjacent ones for safety):
//   /agencies            (seed overwrites these)
//   /license_overrides   (clear-claude-overrides deletes Claude ones)
//   /agency_contacts     (seed overwrites these)
//   /agency_admins       (untouched, included for completeness)
//   /admins              (seed merges into these)
//
// Output: a single timestamped JSON file. By default it lands in the repo
// root with a name matched by .gitignore so it can't be committed by
// accident. Pass a path as the first argument to put it elsewhere
// (recommended: somewhere outside the repo).
//
//   npm run backup:firestore
//   # or: node scripts/export-firestore-licences.mjs ~/miroma-backup.json
//
// Requires GOOGLE_APPLICATION_CREDENTIALS — see scripts/README.md.
// First run: (pending), 2026-06 licence reconciliation.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import admin from 'firebase-admin';

const COLLECTIONS = [
  'agencies',
  'license_overrides',
  'agency_contacts',
  'agency_admins',
  'admins',
];

function initFirestore() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('GOOGLE_APPLICATION_CREDENTIALS not set. See scripts/README.md.');
    process.exit(2);
  }
  admin.initializeApp({ projectId: 'miroma-ai-hub' });
  return admin.firestore();
}

// Firestore Timestamps don't JSON-serialise readably; convert to ISO so the
// backup is human-inspectable. Everything else passes through untouched.
function jsonReplacer(_key, value) {
  if (value && typeof value === 'object' && typeof value._seconds === 'number'
      && typeof value._nanoseconds === 'number') {
    return new Date(value._seconds * 1000 + Math.round(value._nanoseconds / 1e6)).toISOString();
  }
  return value;
}

async function dumpCollection(db, name) {
  const snap = await db.collection(name).get();
  return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = resolve(process.argv[2] || `firestore-licences-backup-${stamp}.json`);

  console.log('Connecting to Firestore (read-only)…');
  const db = initFirestore();

  const backup = { exportedAt: new Date().toISOString(), projectId: 'miroma-ai-hub', collections: {} };
  for (const name of COLLECTIONS) {
    const docs = await dumpCollection(db, name);
    backup.collections[name] = docs;
    console.log(`  ${name}: ${docs.length} docs`);
  }

  writeFileSync(outPath, JSON.stringify(backup, jsonReplacer, 2), 'utf-8');
  console.log(`\nBackup written to:\n  ${outPath}`);
  console.log('Keep this file until you have verified the seed/clear worked.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('Backup failed:', err); process.exit(1); });
