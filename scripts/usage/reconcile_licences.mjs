// ============================================================
// Reconcile Claude usage licence counts vs the licence dashboard
// ============================================================
//
// READ-ONLY. This never writes anything — it compares two numbers and
// reports where they disagree, so you can fix the roster by hand. It is the
// "flag mismatches for review" step of the monthly usage routine.
//
// The two numbers it compares, per agency:
//   • Usage report  — summary.licensed_users from the processed metrics.json
//                     (the Claude org members seen in that month's export).
//   • Licence board — the number of Claude *holders* the Agency Oversight
//                     licence dashboard shows for that agency.
//
// They count subtly different things, so before comparing we NORMALISE the
// licence-board count to match what the usage export can possibly contain:
//   – Drop "pending invite" holders: they have no account yet, so they never
//     appear in an export.
//   – Drop the central aiteam@ seat for every agency EXCEPT the AI Team —
//     process_usage.py excludes that testing/training seat there, but keeps it
//     on the AI Team's own report (where it's the genuine primary licence).
//   – "Unassigned"-tier members are already excluded from the board's holders
//     by the reconciliation conventions, so no adjustment is needed.
// After that, a healthy month has usage licensed_users == normalised holders.
//
// WHERE THE LICENCE NUMBERS COME FROM (pick one):
//   --prod                Read LIVE Firestore (/agencies + /license_overrides),
//                         applying overrides exactly as the dashboard does.
//                         Most accurate. Needs GOOGLE_APPLICATION_CREDENTIALS.
//   --licences <file>     Read from a licence backup JSON (the output of
//                         `npm run backup:firestore`). No key needed; may be
//                         stale vs very recent admin Edit-button changes.
//   (neither)             Auto-use the newest firestore-licences-backup-*.json
//                         in the repo root, if one exists.
//
// WHERE THE USAGE NUMBERS COME FROM:
//   --usage-dir <dir>     Folder of processed agencies (default:
//                         scripts/usage/sample-data). Each <key>/metrics.json
//                         is read; the sub-folder name is the agency key.
//   --agency-key <key>    Limit the check to a single agency.
//
// USAGE
//   node scripts/usage/reconcile_licences.mjs                 # offline, all agencies
//   node scripts/usage/reconcile_licences.mjs --agency-key ai-team
//   GOOGLE_APPLICATION_CREDENTIALS=key.json \
//     node scripts/usage/reconcile_licences.mjs --prod        # live, most accurate
//
// A "mismatch" is flagged when the holder counts disagree OR the export contains
// off-roster activity (accounts with no seat in users.json). Both mean the roster
// and the live Claude org have drifted.
//
// PRE-PUBLISH GATE: the monthly routine runs this with --strict before publishing.
// Default exit is 0 even with mismatches (advisory read); --strict exits 1 if any
// mismatch is found, so a stale roster blocks the publish until it's investigated.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const a = { prod: false, strict: false, usageDir: 'scripts/usage/sample-data',
              licences: null, agencyKey: null };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--prod') a.prod = true;
    else if (t === '--strict') a.strict = true;
    else if (t === '--usage-dir') a.usageDir = argv[++i];
    else if (t === '--licences') a.licences = argv[++i];
    else if (t === '--agency-key') a.agencyKey = argv[++i];
    else if (t === '-h' || t === '--help') { a.help = true; }
  }
  return a;
}

const HELP = `Reconcile Claude usage licence counts vs the licence dashboard (read-only).
  --prod                 read live Firestore (needs GOOGLE_APPLICATION_CREDENTIALS)
  --licences <file>      read a licence backup JSON instead
  --usage-dir <dir>      processed-usage folder (default scripts/usage/sample-data)
  --agency-key <key>     check a single agency
  --strict               exit 1 if any mismatch is found
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const localPart = (email) => String(email || '').split('@')[0].trim().toLowerCase();
const isAiteamSeat = (h) => localPart(h && h.email) === 'aiteam';
const isPendingHolder = (h) =>
  /pending/i.test(String((h && h.team) || '')) || !String((h && h.email) || '').trim();

// Find the Claude tool record the dashboard would show for an agency, i.e.
// the base /agencies tool unless a /license_overrides entry replaces it.
function claudeToolFor(agencyKey, baseTools, overridesByKeyTool) {
  const ovr = overridesByKeyTool.get(`${agencyKey}::Claude`);
  if (ovr) return ovr;
  return (baseTools || []).find((t) => t && t.name === 'Claude') || null;
}

// Build { agencies: [{key, name, tools}], overrides: Map<"key::Tool", toolData> }
// from either a backup-JSON shape or a live-Firestore read. Both share the
// { collections: { agencies:[{id,data}], license_overrides:[{id,data}] } } shape
// once we normalise the Firestore reads into it.
function indexLicenceData(collections) {
  const agencies = (collections.agencies || []).map((d) => {
    const data = d.data || d; // backup entries are {id,data}; tolerate plain too
    return { key: data.key || d.id, name: data.name || d.id,
             tools: Array.isArray(data.tools) ? data.tools : [] };
  });
  const overridesByKeyTool = new Map();
  for (const d of (collections.license_overrides || [])) {
    const data = d.data || d;
    if (!data.agencyKey || !data.toolName) continue;
    const toolData = { ...data };
    delete toolData.agencyKey; delete toolData.toolName; delete toolData.updatedAt;
    overridesByKeyTool.set(`${data.agencyKey}::${data.toolName}`, toolData);
  }
  return { agencies, overridesByKeyTool };
}

async function loadLicencesFromFirestore() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('GOOGLE_APPLICATION_CREDENTIALS not set — needed for --prod. See scripts/README.md.');
    process.exit(2);
  }
  const { default: admin } = await import('firebase-admin');
  admin.initializeApp({ projectId: 'miroma-ai-hub' });
  const db = admin.firestore();
  const grab = async (name) =>
    (await db.collection(name).get()).docs.map((d) => ({ id: d.id, data: d.data() }));
  return { agencies: await grab('agencies'), license_overrides: await grab('license_overrides') };
}

function loadLicencesFromBackup(path) {
  const j = JSON.parse(readFileSync(path, 'utf-8'));
  const c = j.collections || j;
  return { agencies: c.agencies || [], license_overrides: c.license_overrides || [] };
}

function newestBackupInRepoRoot() {
  const root = resolve('.');
  const files = readdirSync(root)
    .filter((f) => /^firestore-licences-backup-.*\.json$/.test(f))
    .sort(); // ISO timestamps sort lexicographically = chronologically
  return files.length ? join(root, files[files.length - 1]) : null;
}

// Read processed usage metrics for each agency under usageDir.
function loadUsage(usageDir, onlyKey) {
  const dir = resolve(usageDir);
  if (!existsSync(dir)) {
    console.error(`Usage dir not found: ${dir}`);
    process.exit(2);
  }
  const out = [];
  for (const key of readdirSync(dir)) {
    if (onlyKey && key !== onlyKey) continue;
    const metricsPath = join(dir, key, 'metrics.json');
    if (!existsSync(metricsPath)) continue;
    try {
      const m = JSON.parse(readFileSync(metricsPath, 'utf-8'));
      const s = m.summary || {};
      out.push({
        key,
        agency: m.agency || key,
        period: m.period || '?',
        licensed: s.licensed_users ?? null,
        active: s.active_users ?? null,
        // Activity from accounts not on the export roster (likely leavers / a stale
        // Claude org). An independent staleness signal a holder-count check can miss.
        offroster: s.offroster_accounts ?? 0,
        offrosterConvos: s.offroster_conversations ?? 0,
      });
    } catch (e) {
      console.warn(`  ! could not read ${metricsPath}: ${e.message}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); process.exit(0); }

  // 1) Licence data + its source label.
  let raw, source;
  if (args.prod) {
    source = 'LIVE Firestore';
    raw = await loadLicencesFromFirestore();
  } else if (args.licences) {
    source = `backup ${args.licences}`;
    raw = loadLicencesFromBackup(resolve(args.licences));
  } else {
    const backup = newestBackupInRepoRoot();
    if (!backup) {
      console.error('No licence source. Pass --prod (live) or --licences <backup.json>,\n'
        + 'or place a firestore-licences-backup-*.json in the repo root.');
      process.exit(2);
    }
    source = `backup ${backup} (auto)`;
    raw = loadLicencesFromBackup(backup);
    console.warn('⚠ Using an offline licence backup — it may pre-date the latest admin edits/re-seed.');
    console.warn('  For the authoritative check, re-run with --prod (live Firestore).\n');
  }
  const { agencies, overridesByKeyTool } = indexLicenceData(raw);
  const agencyByKey = new Map(agencies.map((a) => [a.key, a]));

  // 2) Usage counts.
  const usage = loadUsage(args.usageDir, args.agencyKey);
  if (!usage.length) {
    console.error(`No processed usage found under ${args.usageDir}`
      + (args.agencyKey ? ` for agency "${args.agencyKey}"` : '') + '.');
    process.exit(2);
  }

  console.log(`Licence reconciliation — usage vs licence dashboard`);
  console.log(`  Licence source: ${source}`);
  console.log(`  Usage source  : ${resolve(args.usageDir)}`);
  console.log('');

  const rows = [];
  for (const u of usage.sort((a, b) => a.key.localeCompare(b.key))) {
    const agency = agencyByKey.get(u.key);
    const tool = agency ? claudeToolFor(u.key, agency.tools, overridesByKeyTool) : null;

    if (!tool) {
      rows.push({ ...u, status: 'NO-LICENCE',
        note: agency ? 'no Claude licence recorded on the dashboard for this agency'
                     : `agency "${u.key}" not found in licence data` });
      continue;
    }

    const holders = Array.isArray(tool.holders) ? tool.holders : [];
    const isAITeam = u.key === 'ai-team';
    const pending = holders.filter(isPendingHolder).length;
    const aiteam = holders.filter(isAiteamSeat).length;
    // Normalise the board count to what an export can contain.
    let comparable = holders.filter((h) => !isPendingHolder(h));
    if (!isAITeam) comparable = comparable.filter((h) => !isAiteamSeat(h));
    const expected = comparable.length;

    const delta = (u.licensed ?? 0) - expected;
    const adj = [];
    if (pending) adj.push(`-${pending} pending`);
    if (!isAITeam && aiteam) adj.push(`-${aiteam} aiteam seat`);

    let note;
    if (delta === 0) {
      note = adj.length ? `reconciles (board ${holders.length} holders, ${adj.join(', ')})` : 'reconciles';
    } else if (delta < 0) {
      note = `usage has ${-delta} fewer than the board lists — members who didn't log in this month, or roster lists people no longer on the org`;
    } else {
      note = `usage has ${delta} more than the board lists — new members not yet added to the licence dashboard`;
    }

    if (u.offroster > 0) {
      note += `${note ? ' · ' : ''}⚠ ${u.offroster} off-roster account(s) (${u.offrosterConvos} convo(s)) not in this export's users.json — likely leavers or a stale Claude org; verify the roster`;
    }
    // "MISMATCH" if the holder counts disagree OR there's off-roster activity —
    // either means the roster and the actual Claude org have drifted apart.
    const needsAttention = delta !== 0 || u.offroster > 0;
    rows.push({
      ...u, seats: tool.seats ?? '?', holders: holders.length, expected,
      status: needsAttention ? 'MISMATCH' : 'OK', delta, note,
    });
  }

  // 3) Print a table.
  const pad = (v, n) => String(v ?? '').padEnd(n);
  const padL = (v, n) => String(v ?? '').padStart(n);
  console.log(pad('AGENCY', 22) + pad('PERIOD', 9) + padL('USAGE', 6) + padL('EXP', 5)
            + padL('SEATS', 7) + '  STATUS    NOTE');
  console.log('-'.repeat(110));
  for (const r of rows) {
    const expCol = r.expected === undefined ? '—' : r.expected;
    console.log(
      pad(r.agency, 22) + pad(r.period, 9) + padL(r.licensed ?? '—', 6) + padL(expCol, 5)
      + padL(r.seats ?? '—', 7) + '  ' + pad(r.status, 9) + ' ' + (r.note || ''));
  }

  const mismatches = rows.filter((r) => r.status === 'MISMATCH');
  const noLicence = rows.filter((r) => r.status === 'NO-LICENCE');
  console.log('');
  console.log(`Summary: ${rows.length} agency(ies) checked · `
    + `${rows.filter((r) => r.status === 'OK').length} reconcile · `
    + `${mismatches.length} mismatch · ${noLicence.length} no-licence.`);
  if (mismatches.length) {
    console.log('\nAction: review the mismatched agencies in Agency Oversight and update the');
    console.log('Claude holders/seats to match the actual Claude org (this script writes nothing).');
    if (args.strict) {
      console.log('--strict: exiting non-zero — resolve the roster before publishing this agency.');
    }
  }

  process.exit(args.strict && mismatches.length ? 1 : 0);
}

main().catch((err) => { console.error('Reconciliation failed:', err); process.exit(1); });
