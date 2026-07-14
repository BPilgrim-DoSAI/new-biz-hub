// ============================================================
// Upload a processed Claude-usage dashboard to Firestore
// ============================================================
//
// Reads a dashboard_data.json (produced by process_usage.py +
// analyze_usage.py) and writes it as one monthly snapshot at:
//
//     /claude_usage/{agencyKey}/snapshots/{period}
//
// The hub's "Claude Usage" admin section reads the latest snapshots for
// the signed-in admin's agency (gated by canAccessAgency in firestore.rules).
// This script uses the Admin SDK, which BYPASSES those rules — so it is the
// only thing that can write usage data.
//
// ── Safety ──
// By default it writes to the local EMULATOR only. Writing to PRODUCTION
// requires the explicit --prod flag AND a service-account key, so you can't
// publish real data by accident.
//
// ── Local (emulator) ──
//   firebase emulators:start --only firestore        (in another terminal)
//   FIRESTORE_EMULATOR_HOST=localhost:8080 \
//     npm run usage:upload -- --file scripts/usage/sample-data/dashboard_data.json \
//       --agency-key miroma-group
//
// ── Production (when you're ready) ──
//   1. Firebase Console → Project Settings → Service Accounts →
//      "Generate new private key". Save OUTSIDE the repo.
//   2. export GOOGLE_APPLICATION_CREDENTIALS="/secure/path/key.json"
//   3. npm run usage:upload -- --file <dashboard_data.json> \
//        --agency-key miroma-group --prod
//   4. DELETE the key from disk afterwards.

import { readFileSync } from 'node:fs';
import admin from 'firebase-admin';

const PROJECT_ID = 'miroma-ai-hub';

// ── Parse args ──
function arg(name, fallback = null) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return (v && !v.startsWith('--')) ? v : true; // bare flag → true
}

const file = arg('file');
const agencyKey = arg('agency-key');
const wantProd = arg('prod') === true;
const periodOverride = arg('period');

if (!file || !agencyKey) {
  console.error('Usage: --file <dashboard_data.json> --agency-key <key> [--period YYYY-MM] [--prod]');
  process.exit(1);
}

const onEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

// ── Guard: never write to prod unless explicitly asked ──
if (wantProd && onEmulator) {
  console.error('Refusing to run: --prod set but FIRESTORE_EMULATOR_HOST is also set. Unset the emulator host for a real prod write.');
  process.exit(1);
}
if (!wantProd && !onEmulator) {
  console.error('No target. Set FIRESTORE_EMULATOR_HOST=localhost:8080 for the emulator, or pass --prod (with GOOGLE_APPLICATION_CREDENTIALS) for production.');
  process.exit(1);
}

// ── Load + validate the dashboard data ──
const data = JSON.parse(readFileSync(file, 'utf-8'));
const period = periodOverride || data.period;
if (!period || !/^\d{4}-\d{2}$/.test(period)) {
  console.error(`Invalid or missing period (got "${period}"). Expected YYYY-MM — pass --period to override.`);
  process.exit(1);
}
if (!data.summary || !Array.isArray(data.workflows)) {
  console.error('This does not look like a processed dashboard_data.json (missing summary/workflows).');
  process.exit(1);
}

// ── Init Admin SDK ──
if (onEmulator) {
  admin.initializeApp({ projectId: PROJECT_ID });
} else {
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
}
const db = admin.firestore();

// ── Write ──
const target = onEmulator ? `EMULATOR (${process.env.FIRESTORE_EMULATOR_HOST})` : 'PRODUCTION';
console.log(`Target: ${target}`);
console.log(`Writing /claude_usage/${agencyKey}/snapshots/${period}  (agency: ${data.agency})`);

const docRef = db.collection('claude_usage').doc(agencyKey).collection('snapshots').doc(period);
// Stamp an uploadedAt for traceability; the dashboard itself uses data.period.
//
// expireAt enforces the DPIA's 12-month retention: a Firestore TTL policy on
// the `snapshots` collection-group field `expireAt` auto-deletes each snapshot
// ~12 months after upload. Set it here so retention travels with the data.
// (See scripts/usage/README.md → "Retention" for the one-off TTL setup.)
// Snapshots written before this field existed have no expireAt and are left
// untouched by the TTL — backfill them if you want them on the same clock.
const expireAt = new Date();
expireAt.setMonth(expireAt.getMonth() + 12);
await docRef.set({
  ...data,
  uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
  expireAt: admin.firestore.Timestamp.fromDate(expireAt),
});

// Keep a convenience pointer on the parent doc (latest period for this agency).
await db.collection('claude_usage').doc(agencyKey).set(
  { agencyKey, latestPeriod: period, latestAgencyName: data.agency || agencyKey },
  { merge: true }
);

console.log('Done.');
process.exit(0);
