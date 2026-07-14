// ============================================================
// Clear stale Claude entries from /license_overrides
// ============================================================
//
// Why this exists: the dashboard merges base agency data (/agencies,
// seeded from js/admin-data.js) with a runtime override layer
// (/license_overrides written by the admin "Edit" button). An override
// COMPLETELY REPLACES the base for that agency+tool, and the Firestore
// rules forbid deleting overrides from the app (`allow delete: if false`).
//
// So after re-seeding the corrected Claude base data, any pre-existing
// Claude override would silently mask the correction. This script removes
// the Claude entries from the override layer so the clean base shows
// through. It ONLY touches overrides whose toolName is exactly 'Claude' —
// LTX Studio / Springboards / Fireflies / Descript overrides are left
// alone.
//
// SAFETY: dry-run by default. It lists what it WOULD delete and changes
// nothing. Re-run with --apply to actually delete. Run the backup first
// (npm run backup:firestore).
//
//   npm run clear:claude-overrides            # dry run, shows the list
//   npm run clear:claude-overrides -- --apply # actually deletes
//
// Requires GOOGLE_APPLICATION_CREDENTIALS — see scripts/README.md.
// First run: (pending), 2026-06 licence reconciliation.

import admin from 'firebase-admin';

const APPLY = process.argv.includes('--apply');

function initFirestore() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('GOOGLE_APPLICATION_CREDENTIALS not set. See scripts/README.md.');
    process.exit(2);
  }
  admin.initializeApp({ projectId: 'miroma-ai-hub' });
  return admin.firestore();
}

async function main() {
  console.log(APPLY ? '*** APPLY MODE — overrides WILL be deleted ***' : 'DRY RUN — nothing will be deleted (re-run with --apply to delete).');
  console.log('Connecting to Firestore…');
  const db = initFirestore();

  const snap = await db.collection('license_overrides').where('toolName', '==', 'Claude').get();

  if (snap.empty) {
    console.log('\nNo Claude overrides found. The clean base data will show as-is — nothing to clear.');
    return;
  }

  console.log(`\nFound ${snap.size} Claude override(s):`);
  snap.docs.forEach((d) => {
    const o = d.data() || {};
    console.log(`  - ${d.id}  (agency: ${o.agencyKey}, seats: ${o.seats ?? '?'})`);
  });

  if (!APPLY) {
    console.log('\nDry run complete. No changes made.');
    console.log('Run the backup first (npm run backup:firestore), then re-run with --apply to delete these.');
    return;
  }

  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  console.log(`\nDeleted ${snap.size} Claude override(s). The seeded base data is now authoritative for Claude.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('Clear failed:', err); process.exit(1); });
