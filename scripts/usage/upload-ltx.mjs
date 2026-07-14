// ============================================================
// Upload a processed LTX Studio usage dashboard to Firestore
// ============================================================
//
// Reads an ltx_dashboard_data.json (produced by process_ltx.py) and writes
// it as one monthly snapshot at:
//
//     /ltx_usage/{agencyKey}/snapshots/{period}
//
// The hub's "LTX Usage" admin section reads the latest snapshots for the
// signed-in admin's agency (gated by canAccessAgency in firestore.rules).
// This script uses the Admin SDK, which BYPASSES those rules.
//
// ── Safety ──
// By default it writes to the local EMULATOR only. Writing to PRODUCTION
// requires the explicit --prod flag AND a service-account key.
//
// ── Local (emulator) ──
//   firebase emulators:start --only firestore        (in another terminal)
//   FIRESTORE_EMULATOR_HOST=localhost:8080 \
//     node scripts/usage/upload-ltx.mjs \
//       --file "../../ai-usage-reporting/LTX Usage Data/processed/dewynters/ltx_dashboard_data.json" \
//       --agency-key dewynters
//
// ── Production ──
//   1. Firebase Console → Project Settings → Service Accounts →
//      "Generate new private key". Save OUTSIDE the repo.
//   2. export GOOGLE_APPLICATION_CREDENTIALS="/secure/path/key.json"
//   3. node scripts/usage/upload-ltx.mjs \
//        --file <ltx_dashboard_data.json> --agency-key <key> --prod
//   4. DELETE the key from disk afterwards.

import { readFileSync } from 'node:fs';
import admin from 'firebase-admin';

const PROJECT_ID = 'miroma-ai-hub';

function arg(name, fallback = null) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return (v && !v.startsWith('--')) ? v : true;
}

const file       = arg('file');
const agencyKey  = arg('agency-key');
const wantProd   = arg('prod') === true;
const periodOverride = arg('period');

if (!file || !agencyKey) {
  console.error('Usage: --file <ltx_dashboard_data.json> --agency-key <key> [--period YYYY-MM] [--prod]');
  process.exit(1);
}

const onEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

if (wantProd && onEmulator) {
  console.error('Refusing: --prod set but FIRESTORE_EMULATOR_HOST is also set.');
  process.exit(1);
}
if (!wantProd && !onEmulator) {
  console.error('No target. Set FIRESTORE_EMULATOR_HOST=localhost:8080 for the emulator, or pass --prod for production.');
  process.exit(1);
}

const data = JSON.parse(readFileSync(file, 'utf-8'));
const period = periodOverride || data.period;
if (!period || !/^\d{4}-\d{2}$/.test(period)) {
  console.error(`Invalid or missing period (got "${period}"). Expected YYYY-MM.`);
  process.exit(1);
}
if (!data.summary || !data.credit_by_type) {
  console.error('This does not look like a processed ltx_dashboard_data.json (missing summary/credit_by_type).');
  process.exit(1);
}

if (onEmulator) {
  admin.initializeApp({ projectId: PROJECT_ID });
} else {
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
}
const db = admin.firestore();

const target = onEmulator ? `EMULATOR (${process.env.FIRESTORE_EMULATOR_HOST})` : 'PRODUCTION';
console.log(`Target: ${target}`);
console.log(`Writing /ltx_usage/${agencyKey}/snapshots/${period}  (agency: ${data.agency})`);

const expireAt = new Date();
expireAt.setMonth(expireAt.getMonth() + 12);

const docRef = db.collection('ltx_usage').doc(agencyKey).collection('snapshots').doc(period);
await docRef.set({
  ...data,
  uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
  expireAt: admin.firestore.Timestamp.fromDate(expireAt),
});

await db.collection('ltx_usage').doc(agencyKey).set(
  { agencyKey, latestPeriod: period, latestAgencyName: data.agency || agencyKey },
  { merge: true }
);

console.log('Done.');
process.exit(0);
