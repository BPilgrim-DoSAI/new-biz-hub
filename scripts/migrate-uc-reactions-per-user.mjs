// ============================================================
// One-off migration: split /uc_reactions docs from
// "single doc with users array" → "aggregate + per-user docs"
// (KNOWN_ISSUES.md S-4 fix)
// ============================================================
//
// Before:
//   /uc_reactions/{slug}  -> { count, users: ['email@...', ...], title }
//
// After:
//   /uc_reactions/{slug}                  -> { slug, title, count }
//   /uc_reaction_users/{slug}__{uid}      -> { slug, uid, email, reactedAt }
//
// Why: pre-migration, any signed-in user could read the entire users
// array (privacy leak — they could see who'd liked any use case) and
// any signed-in user could overwrite the doc with arbitrary content
// (tampering). The new schema gates per-user records to their owner
// (or admins) and limits aggregate writes to ±1 transitions, so
// individual identities are no longer exposed and counts are bounded.
//
// Strategy:
//   1. List every doc in /uc_reactions.
//   2. For each doc, look up the Firebase Auth user for each email in
//      the `users` array. Create a /uc_reaction_users/{slug}__{uid}
//      record for each that resolves. Emails with no matching Auth user
//      (offboarded staff) are logged and skipped.
//   3. Rewrite the aggregate doc with just { slug, title, count }
//      (count = number of users we successfully migrated).
//   4. The `users` field on the aggregate doc is removed; the data is
//      now in the subcollection.
//
// Idempotent: re-running checks for the absence of the `users` field
// to determine if a doc is already migrated. Already-migrated docs are
// skipped, and any new per-user docs that the live client created in
// the meantime are left alone.
//
// ── Running this script ──
// 1. Generate a service-account key from Firebase Console.
// 2. export GOOGLE_APPLICATION_CREDENTIALS="/secure/path/to/key.json"
// 3. node scripts/migrate-uc-reactions-per-user.mjs
// 4. Delete the service-account key when done.

import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'miroma-ai-hub' });
const db = admin.firestore();
const auth = admin.auth();

const stats = {
  aggDocs: 0,
  alreadyMigrated: 0,
  perUserCreated: 0,
  missingUser: 0,
  errored: 0,
};

async function migrate() {
  console.log('Loading existing /uc_reactions docs…');
  const snap = await db.collection('uc_reactions').get();
  console.log(`  found ${snap.size} aggregate docs`);
  stats.aggDocs = snap.size;

  for (const doc of snap.docs) {
    const data = doc.data();
    const slug = doc.id;
    const title = data.title || '';
    const users = Array.isArray(data.users) ? data.users : null;

    if (!users) {
      stats.alreadyMigrated++;
      continue;
    }

    let perUserCreatedForThisDoc = 0;
    const perUserWrites = [];

    for (const emailRaw of users) {
      const email = (emailRaw || '').toLowerCase();
      if (!email) continue;
      let user;
      try {
        user = await auth.getUserByEmail(email);
      } catch (e) {
        if (e.code === 'auth/user-not-found') {
          console.log(`  skip user ${email} (no Auth record) for slug ${slug}`);
          stats.missingUser++;
          continue;
        }
        console.error(`  error  ${slug}/${email} —`, e.message);
        stats.errored++;
        continue;
      }
      perUserWrites.push({
        ref: db.collection('uc_reaction_users').doc(slug + '__' + user.uid),
        data: {
          slug:      slug,
          uid:       user.uid,
          email:     email,
          // Use server timestamp at write time (transaction commits)
          reactedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
      perUserCreatedForThisDoc++;
    }

    try {
      await db.runTransaction(async (tx) => {
        for (const w of perUserWrites) {
          tx.set(w.ref, w.data, { merge: true });
        }
        // Rewrite aggregate doc without the users array
        tx.set(doc.ref, {
          slug:  slug,
          title: title,
          count: perUserCreatedForThisDoc,
        });
      });
      console.log(`done   ${slug}: ${perUserCreatedForThisDoc} per-user docs created, aggregate count set`);
      stats.perUserCreated += perUserCreatedForThisDoc;
    } catch (e) {
      console.error(`error  ${slug} — transaction failed:`, e.message);
      stats.errored++;
    }
  }

  console.log('Done.');
  console.log(`  aggregate docs visited : ${stats.aggDocs}`);
  console.log(`  already-migrated       : ${stats.alreadyMigrated}`);
  console.log(`  per-user docs created  : ${stats.perUserCreated}`);
  console.log(`  missing Auth users     : ${stats.missingUser}`);
  console.log(`  errored                : ${stats.errored}`);
}

migrate()
  .then(() => process.exit(0))
  .catch((e) => { console.error('Migration failed:', e); process.exit(1); });
