// ============================================================
// Aggregate a monthly Group AI Progress report into Firestore
// ============================================================
//
// Reads the ALREADY-PUBLISHED per-agency Firestore docs (claude_usage,
// ltx_usage, automation_usage, agencies, content_use_cases, site_visits)
// and computes ONE cross-agency rollup document at:
//
//     /group_reports/{period}
//
// This is the data source for the Hub's "Group AI Progress" admin tab
// (super-admin only, access=='all'). Because it reads from Firestore
// rather than local JSON, the group view always reconciles with what
// every admin already sees on their own agency's report — there is no
// separate "truth" to keep in sync by hand.
//
// Run this LAST in the monthly routine, after every agency's Claude/LTX
// snapshot for the month is published (see README.md step D) and any
// automation snapshots are current (upload-automation.mjs).
//
// Uses the Admin SDK, which BYPASSES firestore.rules — the only thing
// that can write /group_reports (client writes are rule-denied; see the
// match block in firestore.rules).
//
// ── Safety ──
// Same convention as every other script in this folder: local EMULATOR
// by default; PRODUCTION requires --prod + a service-account key. Use
// --dry-run to compute and print the document WITHOUT writing anywhere —
// there's no local-preview HTML step for this report the way per-agency
// dashboards get one via build_preview.py, so this is the way to sanity-
// check the numbers before a real publish.
//
// ── Local (emulator) ──
//   firebase emulators:start --only firestore
//   FIRESTORE_EMULATOR_HOST=localhost:8080 \
//     node scripts/usage/aggregate-group-report.mjs --period 2026-06
//
// ── Production ──
//   1. Firebase Console → Project Settings → Service Accounts →
//      "Generate new private key". Save OUTSIDE the repo.
//   2. export GOOGLE_APPLICATION_CREDENTIALS="/secure/path/key.json"
//   3. Sanity-check first (reads only, no write):
//        node scripts/usage/aggregate-group-report.mjs --period 2026-06 --prod --dry-run
//   4. Eyeball the printed JSON, then publish for real:
//        node scripts/usage/aggregate-group-report.mjs --period 2026-06 --prod
//   5. DELETE the key from disk afterwards.

import admin from 'firebase-admin';

const PROJECT_ID = 'miroma-ai-hub';

// ── Next steps — hand-authored editorial judgement, not derived data ──
// Same category of content as the monthly classification.json "wins" —
// nobody can compute "what an agency lead should do next" from usage
// stats alone. Edit this list before each month's run to reflect the
// current quarter's priorities; it publishes verbatim into the doc.
const NEXT_STEPS = [
  { title: 'Extend usage reporting.', body: "Add Claude usage data for Fold 7, Finance, Twelve AM, Outcomes, SET and MX UK/US, plus Maker Lab's system usage data. HR, Legal and Miroma Holdings are excluded by choice, on data-security grounds." },
  { title: 'Build Claude design systems per agency.', body: 'On-brand templates and style guides so outputs are on-brand by default, not by manual review.' },
  { title: 'Validate the efficiency model.', body: 'Agency leads check the time bands against real jobs — theoretical savings become evidenced ROI.' },
  { title: 'Onboard the quiet seats.', body: 'Targeted onboarding and training for licensed-but-inactive users, using the per-agency lists in the hub.' },
  { title: 'Turn chat into workflows.', body: 'Shared project and skill templates for chat-led teams — Spot Co, Maker Lab, Attentive.' },
  { title: 'Meet agencies regularly.', body: "Weekly check-ins with Finance's Claude users already underway; keep sharing insights and capabilities via the AI Hub." },
  { title: 'Expand into Cowork and Connectors.', body: 'Greater functionality for agencies, with data-privacy guardrails in place from the start.' },
];

function arg(name, fallback = null) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return (v && !v.startsWith('--')) ? v : true;
}

const period = arg('period');
const wantProd = arg('prod') === true;
const dryRun = arg('dry-run') === true;

if (!period || !/^\d{4}-\d{2}$/.test(period)) {
  console.error('Usage: --period <YYYY-MM> [--prod] [--dry-run]');
  process.exit(1);
}

// Agencies we deliberately don't gather/report Claude or LTX usage for, on
// data-security grounds. They're skipped from the USAGE rollup (totals, per-
// agency adoption curve, weekly trend) but KEPT in the licence/spend matrix —
// they still hold licences. Keep in sync with USAGE_EXCLUDED_AGENCIES in
// js/admin-panel.js and USAGE_EXCLUDED_KEYS in js/group-report.js.
const USAGE_EXCLUDED = new Set(['hr', 'miroma-group', 'legal']);

const onEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

if (wantProd && onEmulator) {
  console.error('Refusing to run: --prod set but FIRESTORE_EMULATOR_HOST is also set. Unset the emulator host for a real prod run.');
  process.exit(1);
}
if (!wantProd && !onEmulator) {
  console.error('No target. Set FIRESTORE_EMULATOR_HOST=localhost:8080 for the emulator, or pass --prod (with GOOGLE_APPLICATION_CREDENTIALS) for production.');
  process.exit(1);
}

if (onEmulator) {
  admin.initializeApp({ projectId: PROJECT_ID });
} else {
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
}
const db = admin.firestore();

const target = onEmulator ? `EMULATOR (${process.env.FIRESTORE_EMULATOR_HOST})` : 'PRODUCTION';
console.log(`Target: ${target}${dryRun ? '  (--dry-run: reads only, no write)' : ''}`);
console.log(`Aggregating group report for period ${period}...`);

// ── 1. Agencies (licence matrix source) ──
// `key: d.id` is spread FIRST and `...d.data()` after would silently clobber
// it if the doc's own data ever contained a stray `key` field — spread the
// stored data first, then force the canonical Firestore-path id to win.
const agenciesSnap = await db.collection('agencies').get();
const agencies = agenciesSnap.docs.map((d) => ({ ...d.data(), key: d.id }));
console.log(`  ${agencies.length} agencies found.`);

// RUNNING report: use each agency's LATEST snapshot, not just <period>'s.
// Agencies export on different cadences (some monthly, most sporadically), so
// reading only <period> collapses the group view to whoever happened to export
// that exact month — everyone else wrongly drops to "not yet reporting" and a
// whole tool (e.g. LTX) can vanish if nobody exported it that month. Snapshot
// doc ids are YYYY-MM, so the lexically-greatest id is the most recent.
// <period> is retained only as the doc id / "as of" label we write the rollup
// to. Set `period` on each snapshot to the snapshot's OWN month so the
// per-agency view shows when that agency last reported.
async function latestSnapshot(collection, key) {
  const snaps = await db.collection(collection).doc(key).collection('snapshots').get();
  if (snaps.empty) return null;
  const latest = snaps.docs.sort((a, b) => b.id.localeCompare(a.id))[0];
  return { data: latest.data(), period: latest.id };
}

// ── 2. Claude usage — each agency's latest snapshot, skip agencies with none ──
// Same ordering fix: snapshot docs can carry their own stale agencyKey/period
// fields from however they were originally uploaded — always let the canonical
// values (the /agencies doc id + the snapshot's real month) win.
const claudeResults = await Promise.all(agencies.map(async (a) => {
  if (USAGE_EXCLUDED.has(a.key)) return null;
  const r = await latestSnapshot('claude_usage', a.key);
  return r ? { ...r.data, agencyKey: a.key, agencyName: a.name, period: r.period } : null;
}));
const claudeSnapshots = claudeResults.filter(Boolean);
console.log(`  Claude usage: ${claudeSnapshots.length}/${agencies.length} agencies reporting (latest snapshot each).`);

// ── 3. LTX usage — same pattern ──
// Real-world case this guards against: Sold Out's LTX data lives at the
// canonical path ltx_usage/soldout/... but the document's own stored
// `agencyKey` field says "sold-out" (a stale duplicate exists at that
// hyphenated path too, from an earlier mis-keyed upload) — without this
// fix the report's sourceSnapshots audit trail would show the wrong key
// even though the totals themselves were already correct (they're summed
// from .summary fields, not keyed off agencyKey).
const ltxResults = await Promise.all(agencies.map(async (a) => {
  if (USAGE_EXCLUDED.has(a.key)) return null;
  const r = await latestSnapshot('ltx_usage', a.key);
  return r ? { ...r.data, agencyKey: a.key, agencyName: a.name, period: r.period } : null;
}));
const ltxSnapshots = ltxResults.filter(Boolean);
console.log(`  LTX usage: ${ltxSnapshots.length}/${agencies.length} agencies reporting (latest snapshot each).`);

// ── 4. Automations — enumerate whatever exists per agency, don't hardcode
//      known automation keys (a third one will be added someday). ──
const automationEntries = [];
for (const a of agencies) {
  const autosSnap = await db.collection('automation_usage').doc(a.key).collection('automations').get();
  for (const autoDoc of autosSnap.docs) {
    const parent = autoDoc.data(); // { agencyKey, automationKey, latestPeriod, latestAgencyName, latestAutomationName }
    if (!parent.latestPeriod) continue;
    const snap = await autoDoc.ref.collection('snapshots').doc(parent.latestPeriod).get();
    if (!snap.exists) continue;
    automationEntries.push({ agencyKey: a.key, automationKey: autoDoc.id, latestPeriod: parent.latestPeriod, data: snap.data() });
  }
}
console.log(`  Automations: ${automationEntries.length} found (${automationEntries.map((e) => `${e.agencyKey}/${e.automationKey}`).join(', ') || 'none'}).`);

// ── 5. Use-case count (first use of a server-side .count() aggregation in
//      this codebase — existing client code reads the full collection
//      instead; cheaper here since only the number is needed). ──
const useCaseCountSnap = await db.collection('content_use_cases').count().get();
const useCaseCount = useCaseCountSnap.data().count;

// ── 6. Hub engagement — replicate the exact dedup logic the "AI Hub
//      Engagement" admin tab uses (fsGetAllSiteVisits / fsGetSiteVisitors
//      in js/requests.js) so this reconciles with that tab's own numbers. ──
const siteVisitsSnap = await db.collection('site_visits').get();
const allVisits = siteVisitsSnap.docs.map((d) => d.data());
const totalSiteVisits = allVisits.length;
const uniqueByEmail = {};
allVisits.forEach((v) => {
  if (!v.email) return;
  const key = v.email.toLowerCase();
  const thisVisit = v.visitedAt?.toDate?.()?.toISOString() || v.date || null;
  if (!uniqueByEmail[key] || (thisVisit && thisVisit > (uniqueByEmail[key].lastVisit || ''))) {
    uniqueByEmail[key] = { email: key, lastVisit: thisVisit };
  }
});
const uniqueVisitorsAllTime = Object.keys(uniqueByEmail).length;

// ── Claude totals + per-agency + workflow totals + weekly trend ──
const claudeTotals = { conversations: 0, active_users: 0, licensed_users: 0, power_users: 0, shared_projects: 0, total_projects: 0, hoursLow: 0, hoursHigh: 0 };
const workflowMap = {};
const weeklyMap = {}; // week -> { week, conversations, active_users, agenciesReporting }
const perAgency = [];

claudeSnapshots.forEach((snap) => {
  const s = snap.summary || {};
  const powerUsers = s.power_users != null
    ? s.power_users
    : (snap.licences || []).filter((l) => l.power_user).length;

  claudeTotals.conversations += s.total_conversations || 0;
  claudeTotals.active_users += s.active_users || 0;
  claudeTotals.licensed_users += s.licensed_users || 0;
  claudeTotals.power_users += powerUsers;
  claudeTotals.shared_projects += s.shared_projects || 0;
  claudeTotals.total_projects += s.total_projects || 0;
  claudeTotals.hoursLow += snap.time_saved?.hours_low || 0;
  claudeTotals.hoursHigh += snap.time_saved?.hours_high || 0;

  // Raw summary fields only — no precomputed adoption level. The browser
  // recomputes levels via window.levelFor() (js/claude-usage.js) at render
  // time, so there's exactly one place the Exploring/Adopting/Embedded/
  // Leading thresholds live, not two copies that can drift apart.
  perAgency.push({
    agencyKey: snap.agencyKey,
    agencyName: snap.agencyName,
    period: snap.period,
    summary: {
      licensed_users: s.licensed_users || 0,
      active_users: s.active_users || 0,
      total_conversations: s.total_conversations || 0,
      agentic_usage_pct: s.agentic_usage_pct || 0,
      dormant_licences: s.dormant_licences || 0,
      lapsed_licences: s.lapsed_licences || 0,
      recently_active_users: s.recently_active_users || 0,
      power_users: powerUsers,
      shared_projects: s.shared_projects || 0,
    },
  });

  (snap.workflows || []).forEach((w) => {
    if (!workflowMap[w.key]) workflowMap[w.key] = { key: w.key, label: w.label, conversations: 0 };
    workflowMap[w.key].conversations += w.conversations || 0;
  });

  (snap.weekly_activity || []).forEach((wk) => {
    if (!weeklyMap[wk.week]) weeklyMap[wk.week] = { week: wk.week, conversations: 0, active_users: 0, agenciesReporting: 0 };
    weeklyMap[wk.week].conversations += wk.conversations || 0;
    weeklyMap[wk.week].active_users += wk.active_users || 0;
    weeklyMap[wk.week].agenciesReporting += 1;
  });
});

const workflowTotals = Object.values(workflowMap).sort((a, b) => b.conversations - a.conversations);
const weeklyTrend = Object.values(weeklyMap).sort((a, b) => a.week.localeCompare(b.week));
const reportingAgencyKeys = claudeSnapshots.map((s) => s.agencyKey);

// ── LTX totals + generation-type breakdown ──
// Field names confirmed against a real snapshot (ltx_usage docs are a
// verbatim spread of the local dashboard_data.json, same as claude_usage):
// summary.total_generations / summary.active_users, and generations_by_type
// = [{type, count}] with types like "Generate Image" / "Generate Video".
const ltxTotals = { generations: 0, active_users: 0, hoursSaved: 0 };
const genByTypeMap = {};
ltxSnapshots.forEach((snap) => {
  const s = snap.summary || {};
  ltxTotals.generations += s.total_generations || 0;
  ltxTotals.active_users += s.active_users || 0;
  ltxTotals.hoursSaved += s.estimated_hours_saved || 0;
  (snap.generations_by_type || []).forEach((g) => {
    if (!genByTypeMap[g.type]) genByTypeMap[g.type] = { type: g.type, count: 0 };
    genByTypeMap[g.type].count += g.count || 0;
  });
});
const generationsByType = Object.values(genByTypeMap).sort((a, b) => b.count - a.count);

// ── Licence matrix (agency x tool pivot) + tool totals ──
// toolTotals/toolAgencyCounts mirror the exact reduction in admin-panel.js's
// renderGroupOverview() (its `toolMap` accumulator) so these numbers match
// the Group Spend tab. The per-agency pivot rows (`matrix`) are new — Group
// Spend doesn't show this shape today; it's what the one-pager's licence
// table needs.
const toolTotalsMap = {};
const licenceMatrix = agencies.map((a) => {
  const byTool = {};
  let total = 0;
  (a.tools || []).forEach((t) => {
    if (!t.seats) return;
    byTool[t.name] = (byTool[t.name] || 0) + t.seats;
    total += t.seats;
    if (!toolTotalsMap[t.name]) toolTotalsMap[t.name] = { seats: 0, agencyCount: 0 };
    toolTotalsMap[t.name].seats += t.seats;
    toolTotalsMap[t.name].agencyCount += 1;
  });
  return { agencyKey: a.key, agencyName: a.name, byTool, total };
}).filter((r) => r.total > 0);

const toolTotals = {};
const toolAgencyCounts = {};
Object.entries(toolTotalsMap).forEach(([name, v]) => {
  toolTotals[name] = v.seats;
  toolAgencyCounts[name] = v.agencyCount;
});
const grandTotal = Object.values(toolTotals).reduce((s, n) => s + n, 0);

// ── Automations ──
// Each automation's real shape varies (Sold Out: lifetime/byMonth/
// rollingWindows/timeSaved; Maker Lab: kpis/heroMetric/clientFunnel/
// businessCase) — store the full raw snapshot rather than forcing a common
// schema, and pull out only what's genuinely common (a headline number +
// since-date) for the KPI-card layer.
const automations = automationEntries.map((e) => {
  const d = e.data;
  let headlineValue = null;
  let headlineUnit = '';
  let sinceLabel = '';
  if (d.lifetime) {
    // Sold Out-shaped: "lifetime" totals + a periodStart date.
    headlineValue = d.lifetime.ads ?? d.lifetime.uploads ?? null;
    headlineUnit = 'ads';
    sinceLabel = d.periodStart ? `since ${d.periodStart}` : '';
  } else if (d.heroMetric) {
    // Generic-shaped: an explicit hero stat, e.g. Maker Lab's Talent Tool.
    headlineValue = d.heroMetric.value ?? null;
    headlineUnit = (d.heroMetric.label || '').replace(/^candidate /i, '');
    sinceLabel = d.periodStart ? `since ${d.periodStart}` : '';
  }
  // An automation only contributes an hours-saved figure if its own snapshot
  // carries a timeSaved.netHoursSaved (Sold Out: 178h from real run volumes;
  // Maker Lab Talent Tool: 283h from a ClickUp-scoped 34 min/interview x 500+
  // interviews). Automations without a defensible figure stay null and are
  // simply omitted from the value section rather than given a guessed number.
  const hoursSaved = d.timeSaved?.netHoursSaved ?? null;
  const workingDays = d.timeSaved?.netWorkingDays ?? null;

  return {
    agencyKey: e.agencyKey,
    automationKey: e.automationKey,
    automationName: d.automationName || e.automationKey,
    headlineValue,
    headlineUnit,
    sinceLabel,
    hoursSaved,
    workingDays,
    raw: d,
  };
});

// ── Assemble the document ──
const doc = {
  period,
  sourceSnapshots: {
    claude: Object.fromEntries(claudeSnapshots.map((s) => [s.agencyKey, s.period])),
    ltx: Object.fromEntries(ltxSnapshots.map((s) => [s.agencyKey, s.period])),
    automations: Object.fromEntries(automationEntries.map((e) => [`${e.agencyKey}/${e.automationKey}`, e.latestPeriod])),
  },
  allAgencies: agencies.map((a) => ({ key: a.key, name: a.name })),
  claude: { totals: claudeTotals, reportingAgencyKeys, perAgency, weeklyTrend, workflowTotals },
  ltx: { totals: ltxTotals, generationsByType, reportingAgencyCount: ltxSnapshots.length },
  automations,
  licences: { matrix: licenceMatrix, toolTotals, toolAgencyCounts, grandTotal },
  useCaseCount,
  hubEngagement: { totalSiteVisits, uniqueVisitorsAllTime },
  nextSteps: NEXT_STEPS,
};

console.log('\n── Computed group report ──');
console.log(JSON.stringify(doc, null, 2));

if (dryRun) {
  console.log('\n--dry-run set: nothing written. Re-run without --dry-run to publish.');
  process.exit(0);
}

const expireAt = new Date();
expireAt.setMonth(expireAt.getMonth() + 12);

await db.collection('group_reports').doc(period).set({
  ...doc,
  generatedAt: admin.firestore.FieldValue.serverTimestamp(),
  expireAt: admin.firestore.Timestamp.fromDate(expireAt),
});

console.log(`\nWrote /group_reports/${period}. Done.`);
process.exit(0);
