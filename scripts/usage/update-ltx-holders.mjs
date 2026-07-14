import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp({ credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS), projectId: 'miroma-ai-hub' });
const db = getFirestore();

async function updateHolders() {
  // ── 1. Add Matt Farnworth to Multiple Agency LTX Studio ──────────────────
  const multipleRef = db.collection('agencies').doc('multiple');
  const multipleSnap = await multipleRef.get();
  const multipleData = multipleSnap.data();
  const multipleTools = multipleData.tools.map(function(tool) {
    if (tool.name !== 'LTX Studio') return tool;
    const already = tool.holders.some(h => h.email.toLowerCase() === 'mattf@themultipleagency.com');
    if (already) { console.log('Matt Farnworth already listed — skipping'); return tool; }
    return {
      ...tool,
      holders: [...tool.holders, {
        name: 'Matt Farnworth',
        email: 'mattf@themultipleagency.com',
        team: 'Head of Creative Strategy',
        joinedAt: 'January 2026',
      }]
    };
  });
  await multipleRef.update({ tools: multipleTools });
  console.log('✓ Multiple Agency — Matt Farnworth added to LTX Studio holders');

  // ── 2. Replace Arran Javed with Ariel Nolasco in MX US LTX Studio ────────
  const mxusRef = db.collection('agencies').doc('mxus');
  const mxusSnap = await mxusRef.get();
  const mxusData = mxusSnap.data();
  const mxusTools = mxusData.tools.map(function(tool) {
    if (tool.name !== 'LTX Studio') return tool;
    const filtered = tool.holders.filter(h => h.email.toLowerCase() !== 'arran@mxlocation.co');
    const alreadyAriel = filtered.some(h => h.email.toLowerCase() === 'ariel@mxlocation.co');
    const newHolders = alreadyAriel ? filtered : [...filtered, {
      name: 'Ariel Nolasco',
      email: 'ariel@mxlocation.co',
      team: 'Media',
      joinedAt: 'January 2026',
    }];
    console.log('  Removed Arran Javed, added Ariel Nolasco');
    return { ...tool, holders: newHolders };
  });
  await mxusRef.update({ tools: mxusTools });
  console.log('✓ MX US — Ariel Nolasco now listed as LTX Studio holder');
}

updateHolders().catch(console.error).finally(() => process.exit(0));
