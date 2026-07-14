// ============================================================
// Prune Claude-usage snapshots older than the retention window
// ============================================================
//
// Enforces the DPIA's 12-month retention WITHOUT needing a Firestore TTL
// policy (TTL requires the Blaze billing plan; this project is on Spark).
// Run it as part of the monthly usage routine — see scripts/usage/README.md.
//
// It scans every snapshot across all agencies
// (/claude_usage/{agencyKey}/snapshots/{period}) and deletes those whose
// period (YYYY-MM) is older than RETENTION_MONTHS before the current month.
// Period-based, so it also catches old snapshots written before the
// `expireAt` field existed.
//
// ── Safety ──
//  - DRY RUN by default: lists what WOULD be deleted and changes nothing.
//    Pass --apply to actually delete.
//  - Like upload-usage.mjs, it targets the local EMULATOR unless --prod is
//    set with a service-account key, so you can't wipe production by accident.
//
// ── Dry run against production (safe — read-only) ──
//   export GOOGLE_APPLICATION_CREDENTIALS="/secure/path/key.json"
//   npm run usage:prune -- --prod
//
// ── Actually delete in production ──
//   npm run usage:prune -- --prod --apply
//   (then DELETE the service-account key from disk afterwards)

import admin from 'firebase-admin';

const PROJECT_ID = 'miroma-ai-hub';
const RETENTION_MONTHS = 12;

// ── Parse args ──
const apply = process.argv.includes('--apply');
const wantProd = process.argv.includes('--prod');
const onEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

// ── Guards (mirror upload-usage.mjs) ──
if (wantProd && onEmulator) {
  console.error('Refusing to run: --prod set but FIRESTORE_EMULATOR_HOST is also set. Unset the emulator host for a real prod run.');
  process.exit(1);
}
if (!wantProd && !onEmulator) {
  console.error('No target. Set FIRESTORE_EMULATOR_HOST=localhost:8080 for the emulator, or pass --prod (with GOOGLE_APPLICATION_CREDENTIALS) for production.');
  process.exit(1);
}

// ── Compute the cutoff period (keep this month and the previous 11) ──
// e.g. run in 2026-06 with RETENTION_MONTHS=12 → keep >= 2025-06, delete <= 2025-05.
const cutoff = new Date();
cutoff.setDate(1);
cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
const cutoffPeriod = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;

// ── Init Admin SDK ──
if (onEmulator) {
  admin.initializeApp({ projectId: PROJECT_ID });
} else {
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
}
const db = admin.firestore();

const target = onEmulator ? `EMULATOR (${process.env.FIRESTORE_EMULATOR_HOST})` : 'PRODUCTION';
console.log(`Target: ${target}`);
console.log(`Retention: ${RETENTION_MONTHS} months — keeping periods >= ${cutoffPeriod}, deleting older.`);
console.log(apply ? 'Mode: APPLY (will delete)\n' : 'Mode: DRY RUN (no changes — pass --apply to delete)\n');

// collectionGroup finds every {period} doc under any agency's snapshots subcollection.
const snap = await db.collectionGroup('snapshots').get();

const doomed = [];
snap.forEach((doc) => {
  const period = doc.get('period') || doc.id; // period field, fall back to doc id (YYYY-MM)
  if (typeof period === 'string' && /^\d{4}-\d{2}$/.test(period) && period < cutoffPeriod) {
    doomed.push({ ref: doc.ref, path: doc.ref.path, period });
  }
});

if (!doomed.length) {
  console.log('Nothing to prune — no snapshots older than the retention window.');
  process.exit(0);
}

doomed.sort((a, b) => a.period.localeCompare(b.period));
for (const d of doomed) console.log(`  ${apply ? 'DELETE' : 'would delete'}  ${d.path}  (${d.period})`);
console.log(`\n${doomed.length} snapshot(s) older than ${cutoffPeriod}.`);

if (!apply) {
  console.log('\nDry run only — nothing deleted. Re-run with --apply to delete.');
  process.exit(0);
}

// Batched delete (≤500 ops per batch).
let batch = db.batch();
let n = 0;
for (const d of doomed) {
  batch.delete(d.ref);
  if (++n % 450 === 0) { await batch.commit(); batch = db.batch(); }
}
await batch.commit();
console.log(`\nDeleted ${doomed.length} snapshot(s).`);
process.exit(0);
