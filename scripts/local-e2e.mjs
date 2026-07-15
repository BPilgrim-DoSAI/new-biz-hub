#!/usr/bin/env node
/**
 * Local E2E test runner for the AI Hub.
 *
 * Usage:
 *   node scripts/local-e2e.mjs [--page <page.html>] [--out <dir>]
 *
 * Requires:
 *   - Firebase emulators running (Auth :9099, Firestore :8080, Hosting :5050, Functions :5001)
 *   - Seed data loaded (node scripts/seed-emulator.mjs)
 *   - Playwright installed (npm i)
 *   - vendor/firebase/ SDK files present
 *
 * What it does:
 *   1. Launches headless Chromium with no proxy (emulators are local-only)
 *   2. Intercepts Firebase CDN requests → serves from vendor/firebase/
 *   3. Signs in as test@miroma.com via the Auth emulator
 *   4. Navigates to the target page and captures screenshots
 *   5. For new-business.html: exercises create flow, workspace, and stepper
 */

import { chromium } from 'playwright';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { createConnection } from 'net';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

// ── CLI args ────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const TARGET_PAGE = getArg('--page', 'new-business.html');
const OUT_DIR = getArg('--out', resolve(PROJECT_ROOT, 'test-screenshots'));
const BASE = 'http://127.0.0.1:5050';
const VENDOR = resolve(PROJECT_ROOT, 'vendor', 'firebase');

// ── Preflight checks ────────────────────────────────────
async function preflight() {
  const errors = [];

  // Check vendor SDK files
  const sdkFiles = [
    'firebase-app-compat.js', 'firebase-auth-compat.js',
    'firebase-firestore-compat.js', 'firebase-functions-compat.js',
  ];
  for (const f of sdkFiles) {
    if (!existsSync(resolve(VENDOR, f))) {
      errors.push(`Missing vendor/${f} — run: cp node_modules/firebase/${f} vendor/firebase/`);
    }
  }

  // Check emulator ports
  for (const [name, port] of [['Auth', 9099], ['Firestore', 8080], ['Hosting', 5050], ['Functions', 5001]]) {
    const up = await checkPort(port);
    if (!up) errors.push(`${name} emulator not running on :${port}`);
  }

  if (errors.length) {
    console.error('Preflight failed:\n  ' + errors.join('\n  '));
    console.error('\nStart emulators first. See: .claude/commands/local-dev.md');
    process.exit(1);
  }
}

function checkPort(port) {
  return new Promise((res) => {
    const sock = createConnection({ host: '127.0.0.1', port }, () => {
      sock.destroy();
      res(true);
    });
    sock.on('error', () => res(false));
    sock.setTimeout(2000, () => { sock.destroy(); res(false); });
  });
}

// ── Find Chromium ────────────────────────────────────────
function findChromium() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
  ];
  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  return undefined; // let Playwright find its own
}

// ── Main ─────────────────────────────────────────────────
await preflight();

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const executablePath = findChromium();
console.log(`Chromium: ${executablePath || '(Playwright default)'}`);
console.log(`Target:   ${BASE}/${TARGET_PAGE}`);
console.log(`Output:   ${OUT_DIR}\n`);

const browser = await chromium.launch({
  executablePath,
  args: ['--no-sandbox', '--no-proxy-server'],
});

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// Intercept Firebase CDN → local vendor files
const SDK_MAP = {};
for (const f of ['firebase-app-compat.js', 'firebase-auth-compat.js',
                  'firebase-firestore-compat.js', 'firebase-functions-compat.js']) {
  SDK_MAP[f] = readFileSync(resolve(VENDOR, f), 'utf-8');
}

await context.route('**/*.gstatic.com/firebasejs/**', async (route) => {
  const filename = route.request().url().split('/').pop();
  if (SDK_MAP[filename]) {
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: SDK_MAP[filename] });
  } else {
    await route.abort();
  }
});
await context.route('**/*googletagmanager.com/**', route => route.abort());
await context.route('**/*google-analytics.com/**', route => route.abort());

const page = await context.newPage();
page.on('console', msg => {
  if (msg.type() === 'error') console.log(`  [BROWSER] ${msg.text()}`);
});

let step = 0;
async function snap(label) {
  step++;
  const name = `${String(step).padStart(2, '0')}-${label}.png`;
  await page.screenshot({ path: resolve(OUT_DIR, name), fullPage: true });
  console.log(`  [${step}] ${label}`);
  return resolve(OUT_DIR, name);
}

// ── Step 1: Load page ────────────────────────────────────
console.log('Loading page...');
await page.goto(`${BASE}/${TARGET_PAGE}`, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(1000);
await snap('auth-overlay');

const firebaseOk = await page.evaluate(() => typeof firebase !== 'undefined');
if (!firebaseOk) {
  console.error('Firebase SDK did not load. Check vendor/firebase/ files.');
  await browser.close();
  process.exit(1);
}

// ── Step 2: Sign in ──────────────────────────────────────
console.log('Signing in as test@miroma.com...');
const signIn = await page.evaluate(async () => {
  try {
    const r = await firebase.auth().signInWithEmailAndPassword('test@miroma.com', 'testpass123');
    return { ok: true, email: r.user.email, uid: r.user.uid };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

if (!signIn.ok) {
  console.error('Sign-in failed:', signIn.error);
  console.error('Did you run: node scripts/seed-emulator.mjs ?');
  await snap('sign-in-error');
  await browser.close();
  process.exit(1);
}
console.log(`  Signed in as ${signIn.email} (${signIn.uid})`);

await page.waitForTimeout(4000);
await snap('after-login');

// ── Step 3: Wait for app to fully load ───────────────────
// Cloud Functions (checkNewBizAccess, listOpportunities) can take a few
// seconds on the emulator. Wait until nbContent stops showing "Loading"
// or "Checking", up to 15 seconds.
for (let i = 0; i < 6; i++) {
  const text = await page.evaluate(() =>
    document.getElementById('nbContent')?.textContent?.trim() || ''
  );
  if (!text.includes('Loading') && !text.includes('Checking')) break;
  console.log('  Waiting for Cloud Functions...');
  await page.waitForTimeout(2500);
}
await snap('content-loaded');

// ── Step 4: Page-specific tests ──────────────────────────
if (TARGET_PAGE === 'new-business.html') {
  await testNewBusinessPage(page);
} else {
  console.log(`No specific E2E flow for ${TARGET_PAGE} — screenshot captured.`);
}

await browser.close();
console.log(`\nDone. Screenshots in ${OUT_DIR}`);

// ── New Business Hub E2E flow ────────────────────────────
async function testNewBusinessPage(page) {
  const state = await page.evaluate(() => ({
    hasCards: document.querySelectorAll('.nb-opp-card').length,
    hasGate: !!document.querySelector('.nb-gate'),
    hasEmpty: !!document.querySelector('.nb-empty-state'),
    hasCreate: !!document.getElementById('nbCreateBtn'),
    content: document.getElementById('nbContent')?.textContent?.substring(0, 100)?.trim() || '',
  }));

  console.log(`  State: ${state.hasCards} cards, gate=${state.hasGate}, empty=${state.hasEmpty}`);

  if (state.hasGate) {
    console.log('  Access gate showing — user may lack newbizAccess claim.');
    await snap('access-gate');
    return;
  }

  if (state.hasCards > 0) {
    await snap('opportunity-list');
    console.log('Opening first opportunity...');
    await page.click('.nb-opp-card');
    await page.waitForTimeout(4000);
    await snap('workspace');

    const back = await page.$('a[href="new-business.html"]');
    if (back) { await back.click(); await page.waitForTimeout(3000); }
  }

  // Create flow
  if (state.hasCreate || state.hasEmpty) {
    console.log('Testing create flow...');
    await page.click('#nbCreateBtn');
    await page.waitForTimeout(500);
    await snap('create-modal');

    await page.fill('#nbOppTitle', 'E2E Test Opportunity');
    await page.fill('#nbOppClient', 'Test Corp');
    await snap('create-filled');

    await page.click('#nbModalSubmit');
    await page.waitForTimeout(5000);
    await snap('after-create');

    const result = await page.evaluate(() => ({
      hasStepper: !!document.querySelector('.nb-phase-stepper'),
      hasTextarea: !!document.getElementById('nbBriefText'),
      title: document.querySelector('h2')?.textContent?.trim() || '',
    }));
    console.log(`  Created: "${result.title}" stepper=${result.hasStepper} textarea=${result.hasTextarea}`);

    if (result.hasTextarea) {
      console.log('Testing brief save...');
      await page.fill('#nbBriefText', 'This is an automated E2E test brief for the Q4 campaign.');
      await page.click('#nbSaveBrief');
      await page.waitForTimeout(3000);
      await snap('brief-saved');
    }
  }
}
