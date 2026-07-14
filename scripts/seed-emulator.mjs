import admin from 'firebase-admin';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
admin.initializeApp({ projectId: 'miroma-ai-hub' });
const db = admin.firestore();

async function seed() {
  const batch = db.batch();
  const admins = [
    { email: 'aiteam@miroma.com', name: 'AI Team', access: 'all', homeAgency: 'ai-team' },
    { email: 'vishal.manjrekar@miroma.com', name: 'Vishal', access: 'all', homeAgency: 'ai-team' },
    { email: 'tess.mckean@miroma.com', name: 'Tess', access: 'all', homeAgency: 'ai-team' },
    { email: 'test@miroma.com', name: 'Test User', access: 'all', homeAgency: 'miroma' },
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
  console.log('Seeded admin users.');

  // ── New Business Hub data ──
  await seedNewBizData();
  await seedTestAuthUser();

  console.log('\nDone! Open http://localhost:5050/new-business.html');
  console.log('Sign in with: test@miroma.com / testpass123');
  console.log('Emulator UI:  http://localhost:4000');
}

async function seedNewBizData() {
  const now = admin.firestore.FieldValue.serverTimestamp();

  // Nomination doc
  await db.collection('newbiz_users').doc('miroma').set({
    emails: ['test@miroma.com'],
    updatedAt: new Date().toISOString(),
    updatedBy: 'seed-script',
  }, { merge: true });
  console.log('Seeded newbiz_users/miroma.');

  // Sample opportunities
  const opps = [
    {
      id: 'opp-seed-001',
      title: 'Q4 Brand Campaign',
      clientName: 'Acme Corp',
      agencyKey: 'miroma',
      phase: 'intake',
      status: 'active',
      createdBy: 'test@miroma.com',
      rawBrief: '',
    },
    {
      id: 'opp-seed-002',
      title: 'Summer Social Push',
      clientName: 'Global Brands Ltd',
      agencyKey: 'miroma',
      phase: 'agency-brief',
      status: 'active',
      createdBy: 'test@miroma.com',
      rawBrief: 'Run a summer social campaign across Instagram and TikTok targeting 18-30 year olds in the UK.',
    },
    {
      id: 'opp-seed-003',
      title: 'Rebrand Pitch 2025',
      clientName: 'TechStart Inc',
      agencyKey: 'miroma',
      phase: 'positioning',
      status: 'won',
      createdBy: 'test@miroma.com',
      rawBrief: 'Complete rebrand for TechStart — brand strategy, visual identity, and launch campaign.',
    },
  ];

  for (const opp of opps) {
    const { id, ...data } = opp;
    await db.collection('opportunities').doc(id).set({
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    console.log(`Seeded opportunities/${id}.`);
  }
}

async function seedTestAuthUser() {
  try {
    let user;
    try {
      user = await admin.auth().getUserByEmail('test@miroma.com');
      console.log('Auth user test@miroma.com already exists.');
    } catch {
      user = await admin.auth().createUser({
        email: 'test@miroma.com',
        password: 'testpass123',
        displayName: 'Test User',
      });
      console.log('Created auth user test@miroma.com.');
    }

    await admin.auth().setCustomUserClaims(user.uid, {
      agencyKey: 'miroma',
      newbizAccess: true,
      access: 'all',
    });
    console.log('Set custom claims (agencyKey=miroma, newbizAccess=true, access=all).');
  } catch (err) {
    console.warn('Auth seed warning:', err.message);
  }
}

seed().catch(console.error);
