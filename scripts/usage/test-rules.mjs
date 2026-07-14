// Security-rules regression test. Proves the per-agency isolation and
// admin-tier gating that the hub relies on for data protection:
//   - /claude_usage      agency admin reads only their own agency; no client writes
//   - /agencyMeetings    agency admin reads own; only super admins (access=='all') write
//   - /content_use_cases public read for allowlisted users; super-admin write only
//   - /content_news      same public-read / super-admin-write shape
// Run it with:   npm run test:rules
// (needs the Firebase emulator + a Java runtime; see scripts/README.md.)

import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';

const env = await initializeTestEnvironment({
  projectId: 'miroma-ai-hub',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
});

// Seed admin profiles + sample docs with rules DISABLED (admin context).
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await db.doc('admins/agency-admin@miroma.com').set({ name: 'Agency Admin', access: 'agency', agency: 'miroma-group' });
  await db.doc('admins/other-admin@soldout.co.uk').set({ name: 'Other', access: 'agency', agency: 'soldout' });
  await db.doc('admins/super@miroma.com').set({ name: 'Super', access: 'all' });
  await db.doc('claude_usage/miroma-group/snapshots/2026-05').set({ period: '2026-05', agency: 'Miroma AI Team' });
  await db.doc('agencyMeetings/miroma-group/entries/2026-06').set({ agencyKey: 'miroma-group', period: '2026-06', goingWell: 'seed' });
  await db.doc('content_use_cases/seed-uc').set({ slug: 'seed-uc', title: 'Seed', category: 'Finance', tool: 'Claude', description: 'd', type: 'prompt', order: 1 });
  await db.doc('content_news/seed-news').set({ title: 'Seed', body: 'b', date: '2026-06-01', type: 'update' });
});

const results = [];
function record(name, p) { return p.then(() => results.push([name, true])).catch(() => results.push([name, false])); }

// Authenticated contexts carry the email claim the rules read.
const agencyAdmin = env.authenticatedContext('uidA', { email: 'agency-admin@miroma.com' }).firestore();
const otherAdmin  = env.authenticatedContext('uidB', { email: 'other-admin@soldout.co.uk' }).firestore();
const superAdmin  = env.authenticatedContext('uidS', { email: 'super@miroma.com' }).firestore();
const anon        = env.unauthenticatedContext().firestore();

// ── /claude_usage — per-agency isolation, no client writes ──
const usage = (db) => db.doc('claude_usage/miroma-group/snapshots/2026-05');
await record('[claude_usage]    agency admin reads OWN agency  → ALLOW', assertSucceeds(usage(agencyAdmin).get()));
await record('[claude_usage]    agency admin reads OTHER agency → DENY ', assertFails(usage(otherAdmin).get()));
await record('[claude_usage]    super admin reads any agency    → ALLOW', assertSucceeds(usage(superAdmin).get()));
await record('[claude_usage]    unauthenticated read            → DENY ', assertFails(usage(anon).get()));
await record('[claude_usage]    client write (agency admin)     → DENY ', assertFails(usage(agencyAdmin).set({ hacked: true })));

// ── /agencyMeetings — agency-scoped read, super-admin-only write ──
const meeting = (db) => db.doc('agencyMeetings/miroma-group/entries/2026-06');
const validEntry = { agencyKey: 'miroma-group', period: '2026-06', goingWell: 'x', needsAttention: '', actionsAgreed: '', meetingDate: '', updatedBy: 'super@miroma.com' };
await record('[agencyMeetings]  agency admin reads OWN agency  → ALLOW', assertSucceeds(meeting(agencyAdmin).get()));
await record('[agencyMeetings]  agency admin reads OTHER agency → DENY ', assertFails(meeting(otherAdmin).get()));
await record('[agencyMeetings]  super admin reads any agency    → ALLOW', assertSucceeds(meeting(superAdmin).get()));
await record('[agencyMeetings]  unauthenticated read            → DENY ', assertFails(meeting(anon).get()));
await record('[agencyMeetings]  agency admin writes entry       → DENY ', assertFails(meeting(agencyAdmin).set(validEntry)));
await record('[agencyMeetings]  super admin writes entry        → ALLOW', assertSucceeds(meeting(superAdmin).set(validEntry)));

// ── /content_use_cases — public read (allowlisted), super-admin write ──
const uc = (db) => db.doc('content_use_cases/seed-uc');
const validUc = { slug: 'seed-uc', title: 'T', category: 'Finance', tool: 'Claude', description: 'd', type: 'prompt', order: 2, updatedBy: 'super@miroma.com' };
await record('[content_use_cases] allowlisted user reads        → ALLOW', assertSucceeds(uc(agencyAdmin).get()));
await record('[content_use_cases] unauthenticated read          → DENY ', assertFails(uc(anon).get()));
await record('[content_use_cases] non-super admin writes        → DENY ', assertFails(uc(agencyAdmin).set(validUc)));
await record('[content_use_cases] super admin writes            → ALLOW', assertSucceeds(uc(superAdmin).set(validUc)));

// ── /content_news — public read (allowlisted), super-admin write ──
const news = (db) => db.doc('content_news/seed-news');
const validNews = { title: 'T', body: 'b', date: '2026-06-29', type: 'update', updatedBy: 'super@miroma.com' };
await record('[content_news]    allowlisted user reads          → ALLOW', assertSucceeds(news(agencyAdmin).get()));
await record('[content_news]    unauthenticated read            → DENY ', assertFails(news(anon).get()));
await record('[content_news]    non-super admin writes          → DENY ', assertFails(news(agencyAdmin).set(validNews)));
await record('[content_news]    super admin writes              → ALLOW', assertSucceeds(news(superAdmin).set(validNews)));

await env.cleanup();

console.log('\n=== Firestore rules regression ===');
let ok = true;
for (const [name, pass] of results) { console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}`); if (!pass) ok = false; }
console.log(ok ? '\nAll rule checks passed ✓' : '\nSOME CHECKS FAILED ✗');
process.exit(ok ? 0 : 1);
