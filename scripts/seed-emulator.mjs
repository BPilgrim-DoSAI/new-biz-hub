import admin from 'firebase-admin';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
admin.initializeApp({ projectId: 'miroma-ai-hub' });
const db = admin.firestore();

async function seed() {
  const batch = db.batch();
  const admins = [
    { email: 'aiteam@miroma.com', name: 'AI Team', access: 'all', homeAgency: 'ai-team' },
    { email: 'vishal.manjrekar@miroma.com', name: 'Vishal', access: 'all', homeAgency: 'ai-team' },
    { email: 'tess.mckean@miroma.com', name: 'Tess', access: 'all', homeAgency: 'ai-team' },
  ];

  for (const user of admins) {
    const ref = db.collection('admins').doc(user.email.toLowerCase());
    batch.set(ref, {
      name: user.name,
      access: user.access,
      homeAgency: user.homeAgency
    }, { merge: true });
  }

  await batch.commit();
  console.log('Successfully seeded emulator Firestore with admin users!');
}

seed().catch(console.error);
