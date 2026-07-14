// ============================================================
// Upload a bespoke automation usage snapshot to Firestore
// ============================================================
//
// Reads an automation_dashboard_data.json (hand-built per scripts/usage/
// sample-data/<agency>/automation_dashboard_data.json) and writes it as one
// snapshot at:
//
//     /automation_usage/{agencyKey}/automations/{automationKey}/snapshots/{period}
//
// The hub's "Automation Usage" admin section reads the latest snapshot for
// the selected automation (gated by canAccessAgency in firestore.rules).
// This script uses the Admin SDK, which BYPASSES those rules.
//
// Unlike Claude/LTX (calendar-month snapshots), these reports are point-in-
// time "as of" reports covering the automation's lifetime so far, so period
// is the report date (YYYY-MM-DD), not YYYY-MM.
//
// ── Safety ──
// By default it writes to the local EMULATOR only. Writing to PRODUCTION
// requires the explicit --prod flag AND a service-account key.
//
// ── Local (emulator) ──
//   firebase emulators:start --only firestore        (in another terminal)
//   FIRESTORE_EMULATOR_HOST=localhost:8080 \
//     node scripts/usage/upload-automation.mjs \
//       --file scripts/usage/sample-data/soldout/automation_dashboard_data.json \
//       --agency-key soldout --automation-key meta-ads
//
// ── Production ──
//   1. Firebase Console → Project Settings → Service Accounts →
//      "Generate new private key". Save OUTSIDE the repo.
//   2. export GOOGLE_APPLICATION_CREDENTIALS="/secure/path/key.json"
//   3. node scripts/usage/upload-automation.mjs \
//        --file <automation_dashboard_data.json> --agency-key <key> \
//        --automation-key <key> --prod
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

const file           = arg('file');
const agencyKey       = arg('agency-key');
const automationKey   = arg('automation-key');
const wantProd        = arg('prod') === true;
const periodOverride  = arg('period');

if (!file || !agencyKey || !automationKey) {
  console.error('Usage: --file <automation_dashboard_data.json> --agency-key <key> --automation-key <key> [--period YYYY-MM-DD] [--prod]');
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
const period = periodOverride || data.period || data.reportDate;
if (!period || !/^\d{4}-\d{2}-\d{2}$/.test(period)) {
  console.error(`Invalid or missing period (got "${period}"). Expected YYYY-MM-DD (the report date).`);
  process.exit(1);
}
// Sanity check that this is a real processed file, not an empty/wrong one.
// "lifetime" is the original Meta Ads Automation shape; "kpis" is the
// generic override used by automations that don't fit that shape (e.g. a
// candidate/client funnel tool) — either is evidence of a real dataset.
if (!data.automationName || !(data.lifetime || (Array.isArray(data.kpis) && data.kpis.length))) {
  console.error('This does not look like a processed automation_dashboard_data.json (missing automationName, and neither lifetime nor kpis).');
  process.exit(1);
}
if (data.agencyKey && data.agencyKey !== agencyKey) {
  console.error(`--agency-key "${agencyKey}" does not match the file's own agencyKey "${data.agencyKey}". Pass the correct one explicitly — the CLI flag is what gets written, not the file's internal field.`);
  process.exit(1);
}
if (data.automationKey && data.automationKey !== automationKey) {
  console.error(`--automation-key "${automationKey}" does not match the file's own automationKey "${data.automationKey}".`);
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
console.log(`Writing /automation_usage/${agencyKey}/automations/${automationKey}/snapshots/${period}  (agency: ${data.agency}, automation: ${data.automationName})`);

const expireAt = new Date();
expireAt.setMonth(expireAt.getMonth() + 12);

const automationDoc = db.collection('automation_usage').doc(agencyKey)
  .collection('automations').doc(automationKey);

await automationDoc.collection('snapshots').doc(period).set({
  ...data,
  uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
  expireAt: admin.firestore.Timestamp.fromDate(expireAt),
});

await automationDoc.set(
  { agencyKey, automationKey, latestPeriod: period, latestAgencyName: data.agency || agencyKey, latestAutomationName: data.automationName },
  { merge: true }
);

console.log('Done.');
process.exit(0);
