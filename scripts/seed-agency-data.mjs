// ============================================================
// One-off seed: populate Firestore with admin-data.js content
// ============================================================
//
// Closes KNOWN_ISSUES.md S-1 by moving the publicly-served data in
// js/admin-data.js into Firestore behind per-agency rules.
//
// What it writes:
//   /admins/{lowercase-email}         { name, access, agency? }
//   /agencies/{agencyKey}             full agency record + tools
//   /agency_contacts/{agencyKey}      primary contact info
//
// What it does NOT touch:
//   /agency_admins/{agencyKey}        — runtime override layer
//   /license_overrides/{docId}        — runtime override layer
//   /audit_log                        — audit trail
//
// Idempotency: re-running is safe. /admins writes use merge:true so any
// fields Tess has added (or that this script doesn't know about) are
// preserved. /agencies and /agency_contacts writes are full-doc set
// — re-running overwrites the base data back to whatever admin-data.js
// currently contains. Use that as the "reset to default" workflow.
//
// ── Running this script ──
// 1. From Firebase Console → Project Settings → Service Accounts →
//    "Generate new private key". Save the JSON OUTSIDE the repo.
//    (.gitignore catches *-firebase-adminsdk-*.json and service-account*
//    as a safety net, but don't rely on it.)
// 2. export GOOGLE_APPLICATION_CREDENTIALS="/secure/path/to/key.json"
// 3. npm install   (one-time, installs firebase-admin)
// 4. npm run seed:agency-data
// 5. Verify in the Firebase Console (see scripts/README.md).
// 6. DELETE the service-account key from disk.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import admin from 'firebase-admin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADMIN_DATA_PATH = join(__dirname, '..', 'js', 'admin-data.js');

// ── Read admin-data.js via VM sandbox (no module changes required) ──
//
// Gotcha: const/let declarations don't auto-attach to the VM context's
// global (unlike var). admin-data.js uses const, so we append explicit
// globalThis assignments that run in the same scope and copy the values
// out for our extraction. Equivalent to adding module.exports at the
// bottom of the source file but without modifying the source.
function loadAdminData() {
  const rawCode = readFileSync(ADMIN_DATA_PATH, 'utf-8');
  const code = rawCode + `
;globalThis.__SEED_ADMIN_USERS = (typeof ADMIN_USERS !== 'undefined') ? ADMIN_USERS : undefined;
globalThis.__SEED_LICENSE_DATA = (typeof LICENSE_DATA !== 'undefined') ? LICENSE_DATA : undefined;
globalThis.__SEED_AGENCY_CONTACTS = (typeof AGENCY_CONTACTS !== 'undefined') ? AGENCY_CONTACTS : undefined;
`;
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  const ADMIN_USERS     = sandbox.__SEED_ADMIN_USERS;
  const LICENSE_DATA    = sandbox.__SEED_LICENSE_DATA;
  const AGENCY_CONTACTS = sandbox.__SEED_AGENCY_CONTACTS;
  if (!Array.isArray(ADMIN_USERS)) {
    throw new Error('admin-data.js: ADMIN_USERS missing or not an array');
  }
  if (!LICENSE_DATA || !Array.isArray(LICENSE_DATA.agencies)) {
    throw new Error('admin-data.js: LICENSE_DATA.agencies missing or not an array');
  }
  if (!AGENCY_CONTACTS || typeof AGENCY_CONTACTS !== 'object') {
    throw new Error('admin-data.js: AGENCY_CONTACTS missing or not an object');
  }
  return { ADMIN_USERS, AGENCY_CONTACTS, LICENSE_DATA };
}

// ── Firestore client (uses GOOGLE_APPLICATION_CREDENTIALS env var) ──
function initFirestore() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('GOOGLE_APPLICATION_CREDENTIALS not set. See scripts/README.md.');
    process.exit(2);
  }
  admin.initializeApp({ projectId: 'miroma-ai-hub' });
  return admin.firestore();
}

// ── Write helpers (logging + counting) ──
let stats = { admins: 0, agencies: 0, contacts: 0, skipped: 0 };

async function seedAdmins(db, ADMIN_USERS) {
  // Batched writes — Firestore batches max 500 ops; we're well under.
  const batch = db.batch();
  for (const user of ADMIN_USERS) {
    if (!user.email) { stats.skipped++; continue; }
    const ref = db.collection('admins').doc(user.email.toLowerCase());
    const payload = {
      name:   user.name   || '',
      access: user.access || 'agency',
    };
    if (user.agency) payload.agency = user.agency;
    if (user.homeAgency) payload.homeAgency = user.homeAgency;
    // merge:true — preserves any fields colleagues have added to the doc
    batch.set(ref, payload, { merge: true });
    stats.admins++;
  }
  await batch.commit();
}

async function seedAgencies(db, LICENSE_DATA) {
  const batch = db.batch();
  for (const agency of LICENSE_DATA.agencies) {
    if (!agency.key) { stats.skipped++; continue; }
    const ref = db.collection('agencies').doc(agency.key);
    // Full-document set — re-running this script restores base licence data
    batch.set(ref, {
      key:   agency.key,
      name:  agency.name || agency.key,
      tools: agency.tools || [],
    });
    stats.agencies++;
  }
  await batch.commit();
}

async function seedContacts(db, AGENCY_CONTACTS) {
  const batch = db.batch();
  for (const [agencyKey, contactData] of Object.entries(AGENCY_CONTACTS)) {
    if (!agencyKey) { stats.skipped++; continue; }
    const ref = db.collection('agency_contacts').doc(agencyKey);
    batch.set(ref, contactData);
    stats.contacts++;
  }
  await batch.commit();
}

// ── Main ──
async function main() {
  console.log('Reading admin-data.js…');
  const { ADMIN_USERS, AGENCY_CONTACTS, LICENSE_DATA } = loadAdminData();
  console.log(`  → ${ADMIN_USERS.length} admin users, ${LICENSE_DATA.agencies.length} agencies, ${Object.keys(AGENCY_CONTACTS).length} contacts`);

  console.log('Connecting to Firestore…');
  const db = initFirestore();

  console.log('Seeding /admins…');
  await seedAdmins(db, ADMIN_USERS);

  console.log('Seeding /agencies…');
  await seedAgencies(db, LICENSE_DATA);

  console.log('Seeding /agency_contacts…');
  await seedContacts(db, AGENCY_CONTACTS);

  console.log('Stamping seed timestamp…');
  await db.collection('_meta').doc('licence_data').set({
    seededAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log('Done.');
  console.log(`  admins   : ${stats.admins} written`);
  console.log(`  agencies : ${stats.agencies} written`);
  console.log(`  contacts : ${stats.contacts} written`);
  if (stats.skipped) console.log(`  skipped  : ${stats.skipped}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('Seed failed:', err); process.exit(1); });
