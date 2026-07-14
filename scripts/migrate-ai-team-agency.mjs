// ============================================================
// One-off migration: break out "AI Team" from Miroma Group
// ============================================================
//
// What it does (targeted writes only — does NOT touch other agencies):
//   1. /agencies/miroma-group   → rename display name to "Miroma Holdings Ltd"
//      (key unchanged, so every reference stays valid). Merge write.
//   2. /agencies/ai-team        → create the new agency (name "AI Team", no
//      tools of its own — licences remain tracked under Miroma Holdings).
//   3. /agency_contacts/ai-team → minimal contact (aiteam@miroma.com).
//   4. Move the Claude usage report from miroma-group → ai-team:
//      copy the snapshot(s) to /claude_usage/ai-team/snapshots/* and the
//      parent pointer, then delete them from /claude_usage/miroma-group.
//
// Safety: emulator by default; --prod requires GOOGLE_APPLICATION_CREDENTIALS.
//   Emulator:   FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/migrate-ai-team-agency.mjs
//   Production: GOOGLE_APPLICATION_CREDENTIALS=key.json node scripts/migrate-ai-team-agency.mjs --prod

import admin from 'firebase-admin';

const PROJECT_ID = 'miroma-ai-hub';
const wantProd = process.argv.includes('--prod');
const onEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

if (wantProd && onEmulator) { console.error('Refusing: --prod set but FIRESTORE_EMULATOR_HOST is also set.'); process.exit(1); }
if (!wantProd && !onEmulator) { console.error('No target. Set FIRESTORE_EMULATOR_HOST for emulator, or --prod (with GOOGLE_APPLICATION_CREDENTIALS).'); process.exit(1); }

if (onEmulator) admin.initializeApp({ projectId: PROJECT_ID });
else admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
const db = admin.firestore();

console.log(`Target: ${onEmulator ? 'EMULATOR' : 'PRODUCTION'}\n`);

// 1) Rename Miroma Group → Miroma Holdings Ltd (merge keeps tools/holders intact).
await db.collection('agencies').doc('miroma-group').set({ name: 'Miroma Holdings Ltd' }, { merge: true });
console.log('✓ renamed miroma-group → "Miroma Holdings Ltd"');

// 2) Create the AI Team agency (no tools of its own).
await db.collection('agencies').doc('ai-team').set({ key: 'ai-team', name: 'AI Team', tools: [] }, { merge: true });
console.log('✓ created /agencies/ai-team');

// 3) Contact.
await db.collection('agency_contacts').doc('ai-team').set({ email: 'aiteam@miroma.com', name: 'AI Team' }, { merge: true });
console.log('✓ created /agency_contacts/ai-team');

// 4) Move the Claude usage report miroma-group → ai-team.
const srcSnaps = await db.collection('claude_usage').doc('miroma-group').collection('snapshots').get();
if (srcSnaps.empty) {
  console.log('• no claude_usage snapshots under miroma-group to move');
} else {
  let latest = null;
  for (const doc of srcSnaps.docs) {
    const data = doc.data();
    if (data.agency === 'Miroma AI Team') data.agency = 'AI Team'; // tidy the header label
    await db.collection('claude_usage').doc('ai-team').collection('snapshots').doc(doc.id).set(data);
    await doc.ref.delete();
    if (!latest || doc.id > latest.period) latest = { period: doc.id, agency: data.agency };
    console.log(`✓ moved snapshot ${doc.id} → ai-team`);
  }
  // Parent pointer: set on ai-team, remove the old miroma-group one.
  if (latest) {
    await db.collection('claude_usage').doc('ai-team').set(
      { agencyKey: 'ai-team', latestPeriod: latest.period, latestAgencyName: latest.agency }, { merge: true });
  }
  await db.collection('claude_usage').doc('miroma-group').delete().catch(() => {});
  console.log('✓ updated ai-team pointer; removed miroma-group claude_usage parent');
}

console.log('\nDone.');
process.exit(0);
