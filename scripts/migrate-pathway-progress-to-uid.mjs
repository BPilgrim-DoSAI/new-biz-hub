// ============================================================
// One-off migration: re-key /pathway_progress docs from email-
// derived IDs to Firebase Auth uids (KNOWN_ISSUES.md S-3 fix)
// ============================================================
//
// Before this script: docs were keyed like `vix_ross_miroma_com`
// (email lowercased with @ and . replaced by _). The matching rule
// couldn't enforce "caller can only write their own doc" because
// Firestore rules can't reliably regex an email back from such a key.
//
// After this script: docs are keyed by Firebase Auth uid. The rule
// `docId == request.auth.uid` is trivial to enforce and bulletproof.
//
// Strategy:
//   1. List every doc in /pathway_progress.
//   2. Skip any that already look like a Firebase uid (28 alphanumeric).
//   3. For each remaining doc, look up its Firebase Auth user by
//      the doc's `email` field. If the user exists, write a copy
//      to /pathway_progress/{uid} and delete the email-keyed
//      original.
//   4. If the user no longer exists in Firebase Auth (rare —
//      offboarded staff), log a skip and leave the doc alone. The
//      new rule denies writes to it but admins can still read it
//      and it'll naturally fall out of use.
//
// Idempotent: re-running is safe. Already-migrated docs are skipped.
//
// ── Running this script ──
// 1. Generate a service-account key from Firebase Console
//    (Project Settings → Service Accounts → Generate new private
//    key). Save outside the repo.
// 2. export GOOGLE_APPLICATION_CREDENTIALS="/secure/path/to/key.json"
// 3. node scripts/migrate-pathway-progress-to-uid.mjs
// 4. Delete the service-account key when done.

import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'miroma-ai-hub' });
const db = admin.firestore();
const auth = admin.auth();

const UID_PATTERN = /^[A-Za-z0-9]{20,40}$/;
const stats = { migrated: 0, alreadyUid: 0, missingUser: 0, missingEmail: 0, error: 0 };

async function migrate() {
  console.log('Loading existing /pathway_progress docs…');
  const snap = await db.collection('pathway_progress').get();
  console.log(`  found ${snap.size} docs`);

  for (const doc of snap.docs) {
    if (UID_PATTERN.test(doc.id)) {
      stats.alreadyUid++;
      continue;
    }
    const data = doc.data();
    const email = data && data.email;
    if (!email) {
      console.log(`skip   ${doc.id} — no email field on doc`);
      stats.missingEmail++;
      continue;
    }
    let user;
    try {
      user = await auth.getUserByEmail(email);
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        console.log(`skip   ${doc.id} — Auth user not found for ${email}`);
        stats.missingUser++;
        continue;
      }
      console.error(`error  ${doc.id} — getUserByEmail failed:`, e.message);
      stats.error++;
      continue;
    }
    const newRef = db.collection('pathway_progress').doc(user.uid);
    try {
      await db.runTransaction(async (tx) => {
        tx.set(newRef, Object.assign({}, data, { uid: user.uid }));
        tx.delete(doc.ref);
      });
      console.log(`done   ${doc.id} → ${user.uid} (${email})`);
      stats.migrated++;
    } catch (e) {
      console.error(`error  ${doc.id} — transaction failed:`, e.message);
      stats.error++;
    }
  }

  console.log('Done.');
  console.log(`  migrated     : ${stats.migrated}`);
  console.log(`  already-uid  : ${stats.alreadyUid}`);
  console.log(`  missing user : ${stats.missingUser}`);
  console.log(`  missing email: ${stats.missingEmail}`);
  console.log(`  errored      : ${stats.error}`);
}

migrate()
  .then(() => process.exit(0))
  .catch((e) => { console.error('Migration failed:', e); process.exit(1); });
