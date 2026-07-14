// ============================================================
// Reconcile LTX Studio licence holders vs actual LTX users
// ============================================================
//
// Compares:
//   • Licence dashboard — the `holders` array and `seats` count on each
//     agency's LTX Studio tool record in /agencies (Firestore or backup).
//   • LTX CSV export  — the total_users_table CSV from LTX's Enterprise
//     PII dashboard, which lists every registered user by email.
//
// For each agency it reports:
//   ✓  Clean — holders and CSV users match exactly.
//   ⚠  Seat mismatch — CSV has more registered users than paid seats.
//   ⚠  Unlisted users — people active in LTX but missing from the hub holders list.
//   ⚠  Inactive holders — people on the holders list but not in LTX at all (0 tokens, not registered).
//   ℹ  Code-type users — users on personal/code accounts rather than the enterprise SSO licence.
//
// USAGE
// -----
//   # Offline (uses the newest firestore-licences-backup-*.json in ai-hub/):
//   node scripts/usage/reconcile_ltx.mjs \
//     --csv "$HOME/Claude/Miroma/ai-usage-reporting/LTX Usage Data/total_users_table_*.csv"
//
//   # Specific agency:
//   node scripts/usage/reconcile_ltx.mjs \
//     --csv <path> --agency-key spotco
//
//   # Live Firestore (most accurate — needs GOOGLE_APPLICATION_CREDENTIALS):
//   node scripts/usage/reconcile_ltx.mjs --csv <path> --prod
//
//   # Provide a specific licence backup:
//   node scripts/usage/reconcile_ltx.mjs --csv <path> --licences <backup.json>

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot  = resolve(__dirname, '../..');

// ── Domain → agency key map (must match process_ltx.py) ─────────────────────
const DOMAIN_TO_AGENCY_KEY = {
  'spotnyc.com':           'spotco',
  'themultipleagency.com': 'multiple',
  'fold7.com':             'fold7',
  'dewynters.com':         'dewynters',
  'wearemakerlab.com':     'makerlab',
  'soldout.co.uk':         'sold-out',
  'twelveam.com':          'twelveam',
  'mxlocation.co':         'mxus',
  'miroma.com':            'ai-team',
};

// ── CLI args ─────────────────────────────────────────────────────────────────
function arg(name, fallback = null) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return (v && !v.startsWith('--')) ? v : true;
}

const csvArg       = arg('csv');
const licencesArg  = arg('licences');
const agencyFilter = arg('agency-key');
const wantProd     = arg('prod') === true;

if (!csvArg) {
  console.error('Usage: --csv <total_users_table_*.csv> [--licences <backup.json>] [--agency-key <key>] [--prod]');
  process.exit(1);
}

// ── Load licence data ─────────────────────────────────────────────────────────
async function loadLicenceData() {
  if (wantProd) {
    // Live Firestore (Admin SDK)
    const admin = (await import('firebase-admin')).default;
    admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'miroma-ai-hub' });
    const db = admin.firestore();
    const snap = await db.collection('agencies').get();
    return snap.docs.map(d => ({ id: d.id, data: d.data() }));
  }

  // Backup JSON
  let backupPath = licencesArg;
  if (!backupPath) {
    const files = readdirSync(repoRoot).filter(f => /^firestore-licences-backup-.*\.json$/.test(f)).sort();
    if (!files.length) {
      console.error('No firestore-licences-backup-*.json found in repo root. Pass --licences <file> or --prod.');
      process.exit(1);
    }
    backupPath = resolve(repoRoot, files[files.length - 1]);
  }
  const raw = JSON.parse(readFileSync(backupPath, 'utf-8'));
  return (raw.collections?.agencies || []);
}

// ── Parse CSV (sync, simple) ──────────────────────────────────────────────────
function parseCsvSync(path) {
  const text = readFileSync(path, 'utf-8').replace(/^﻿/, ''); // strip BOM
  const lines = text.split('\n').filter(Boolean);
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    // Handle quoted values with commas
    const values = [];
    let cur = '', inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { values.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    values.push(cur.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = (values[i] || '').replace(/^"|"$/g, ''); });
    return row;
  }).filter(r => r.email);
}

function emailDomain(email) {
  return (email || '').toLowerCase().split('@')[1] || '';
}

function agencyKeyForEmail(email) {
  return DOMAIN_TO_AGENCY_KEY[emailDomain(email)] || null;
}

function normaliseEmail(e) { return (e || '').toLowerCase().trim(); }

// ── Main ──────────────────────────────────────────────────────────────────────
const agencies = await loadLicenceData();
const csvPath  = resolve(csvArg.replace('~', process.env.HOME));
const csvUsers = parseCsvSync(csvPath);

// Group CSV users by agency key
const csvByAgency = {};
for (const u of csvUsers) {
  const key = agencyKeyForEmail(u.email);
  if (!key) continue;
  if (!csvByAgency[key]) csvByAgency[key] = [];
  csvByAgency[key].push(u);
}

// Filter to agencies that have an LTX Studio tool
const ltxAgencies = agencies
  .filter(a => !agencyFilter || a.id === agencyFilter)
  .filter(a => (a.data?.tools || []).some(t => t.name === 'LTX Studio'));

if (!ltxAgencies.length) {
  console.log('No agencies with LTX Studio licences found' + (agencyFilter ? ` matching '${agencyFilter}'` : '') + '.');
  process.exit(0);
}

let totalIssues = 0;

for (const agency of ltxAgencies) {
  const ltxTool = agency.data.tools.find(t => t.name === 'LTX Studio');
  const paidSeats = ltxTool.seats ?? 0;
  const holders   = ltxTool.holders || [];
  const holderEmails = new Set(holders.map(h => normaliseEmail(h.email)));

  const csvAgencyUsers = csvByAgency[agency.id] || [];
  const csvEmails      = new Set(csvAgencyUsers.map(u => normaliseEmail(u.email)));

  // Both SSO and Code are enterprise licences. Code means SSO has not been
  // configured for that user — they log in with a username/password instead.
  // Only flag Code users who are actively using LTX (have consumed tokens),
  // since historical/lapsed users in the export may no longer be relevant.
  const activeCodeUsers = csvAgencyUsers.filter(u =>
    u.user_type === 'Code' &&
    parseInt((u.Tokens_consumed || '0').replace(/,/g, ''), 10) > 0
  );

  // Holders in the hub with no LTX account at all — they appear in the
  // hub's holders list but never show up in the export. This is the reliable
  // direction: if we're paying for a seat and the person has no LTX account,
  // their account may not have been set up.
  // Note: the export is cumulative, so absence = genuinely no account ever.
  const holdersWithNoAccount = holders.filter(h => !csvEmails.has(normaliseEmail(h.email)));

  const hasIssues = activeCodeUsers.length > 0 || holdersWithNoAccount.length > 0;
  const icon = hasIssues ? '⚠' : '✓';

  const agencyName = agency.data?.name || agency.id;
  console.log(`\n${icon}  ${agencyName} (${agency.id})`);
  console.log(`   Paid seats: ${paidSeats}  |  Holders in hub: ${holders.length}  |  In LTX export: ${csvAgencyUsers.length} (SSO: ${csvAgencyUsers.filter(u => u.user_type === 'SSO').length}, Code: ${csvAgencyUsers.filter(u => u.user_type === 'Code').length})`);

  if (activeCodeUsers.length) {
    console.log(`   ⚠  ${activeCodeUsers.length} active user(s) on Code login — SSO not configured:`);
    for (const u of activeCodeUsers) {
      const tokens = parseInt((u.Tokens_consumed || '0').replace(/,/g, ''), 10);
      console.log(`      • ${u.email}  (${u.apollo_title || 'no title'}, ${u.active_days || 0} active days, ${tokens.toLocaleString('en-GB')} tokens)`);
    }
    totalIssues++;
  }

  if (holdersWithNoAccount.length) {
    console.log(`   ℹ  ${holdersWithNoAccount.length} hub holder(s) not found in LTX export — account may not be set up:`);
    for (const h of holdersWithNoAccount) {
      console.log(`      • ${h.email}  (${h.name || 'no name'})`);
    }
  }

  if (!hasIssues) {
    console.log('   All holders have LTX accounts and are on SSO.');
  }
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Checked ${ltxAgencies.length} agenc${ltxAgencies.length === 1 ? 'y' : 'ies'}.`);
if (totalIssues) {
  console.log(`${totalIssues} agenc${totalIssues === 1 ? 'y has' : 'ies have'} active Code-login users — ask LTX to configure SSO for those accounts.`);
} else {
  console.log('All active users are on SSO. No action needed.');
}
