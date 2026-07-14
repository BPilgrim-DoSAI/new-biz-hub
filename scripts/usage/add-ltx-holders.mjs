import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS), projectId: 'miroma-ai-hub' });
const db = getFirestore();

const updates = [
  {
    agencyId: 'fold7',
    holder: { name: 'Derek Morgans', email: 'derek.morgans@fold7.com', team: 'Founder', joinedAt: 'January 2026' },
  },
  {
    agencyId: 'soldout',
    holder: { name: 'Amber', email: 'amber@soldout.co.uk', team: '', joinedAt: 'January 2026' },
  },
  {
    agencyId: 'soldout',
    holder: { name: 'Cherie', email: 'cherie@soldout.co.uk', team: 'Assistant Studio Manager / Senior Graphic Designer', joinedAt: 'January 2026' },
  },
];

for (const { agencyId, holder } of updates) {
  const ref = db.collection('agencies').doc(agencyId);
  const snap = await ref.get();
  const data = snap.data();
  const tools = data.tools.map(function(tool) {
    if (tool.name !== 'LTX Studio') return tool;
    const already = tool.holders.some(h => h.email.toLowerCase() === holder.email.toLowerCase());
    if (already) { console.log(`${holder.name} already listed — skipping`); return tool; }
    return { ...tool, holders: [...tool.holders, holder] };
  });
  await ref.update({ tools });
  console.log(`✓ ${agencyId} — ${holder.name} added to LTX Studio holders`);
}

process.exit(0);
