#!/usr/bin/env node
/**
 * Verify Subresource Integrity hashes in every HTML file at the repo root.
 *
 * For each <script src="https://..." integrity="sha384-..."> tag, fetch the
 * URL, compute the hash of the bytes the browser would receive, and confirm
 * it matches the declared integrity attribute. Fails non-zero on any
 * mismatch with a copy-pasteable replacement hash.
 *
 * Why this exists: SRI hashes are computed once when a library is added,
 * then have to be manually regenerated every time the version bumps. The
 * failure mode is silent and brutal — the browser refuses to load the
 * script, the page goes blank, no useful error in the console for non-
 * devtools users. This check catches the mismatch in CI before deploy.
 *
 * Usage: node scripts/verify-sri.mjs [--verbose]
 *
 * In GitHub Actions output, mismatches use the ::error:: annotation so
 * they surface as red callouts on the workflow log and PR check page.
 */
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// Resolve repo root from script location so this works from any cwd.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(SCRIPT_DIR, '..');
const VERBOSE    = process.argv.includes('--verbose');

// Capture <script ... src="..." integrity="..." ...> in either attribute
// order. Non-greedy [^>]* between attributes so we never eat past the
// closing >. Two regexes (one per src/integrity order) is simpler than
// a single fancier pattern.
const RE_SRC_FIRST = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*\bintegrity=["']([^"']+)["'][^>]*>/gi;
const RE_INT_FIRST = /<script\b[^>]*\bintegrity=["']([^"']+)["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;

async function findHtmlFiles() {
  const entries = await readdir(ROOT, { withFileTypes: true });
  return entries.filter(e => e.isFile() && e.name.endsWith('.html')).map(e => e.name);
}

async function extractPairs(htmlFile) {
  const content = await readFile(join(ROOT, htmlFile), 'utf8');
  const pairs = [];
  for (const m of content.matchAll(RE_SRC_FIRST)) {
    pairs.push({ file: htmlFile, src: m[1], integrity: m[2] });
  }
  for (const m of content.matchAll(RE_INT_FIRST)) {
    pairs.push({ file: htmlFile, src: m[2], integrity: m[1] });
  }
  return pairs;
}

function parseIntegrity(value) {
  // SRI allows space-separated alternatives ("sha256-... sha384-..."). We
  // verify against the strongest declared algorithm we support.
  return value.trim().split(/\s+/).map(token => {
    const dash = token.indexOf('-');
    if (dash < 0) return { algorithm: null, hash: token };
    return { algorithm: token.slice(0, dash), hash: token.slice(dash + 1) };
  });
}

const SUPPORTED_ALGOS = { 'sha256': 'sha256', 'sha384': 'sha384', 'sha512': 'sha512' };

async function computeHash(url, algorithm) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return createHash(SUPPORTED_ALGOS[algorithm]).update(buf).digest('base64');
}

async function main() {
  const htmlFiles = await findHtmlFiles();
  if (htmlFiles.length === 0) {
    console.log('No HTML files at repo root — nothing to verify.');
    return 0;
  }

  // Collect every (src, integrity) pair across every HTML file.
  const allPairs = [];
  for (const f of htmlFiles) {
    allPairs.push(...await extractPairs(f));
  }
  if (allPairs.length === 0) {
    console.log(`Scanned ${htmlFiles.length} HTML files — found no <script> tags with integrity attributes.`);
    return 0;
  }

  // De-dupe by URL. Same Firebase SDK file appears in 9 HTML files; fetch
  // it once. Also catch the case where two files declare different hashes
  // for the same URL — that's already a defect even before we hit the CDN.
  const byUrl = new Map();
  for (const p of allPairs) {
    const existing = byUrl.get(p.src);
    if (!existing) {
      byUrl.set(p.src, { src: p.src, integrity: p.integrity, files: [p.file] });
      continue;
    }
    if (existing.integrity !== p.integrity) {
      console.error(`::error::Inconsistent integrity attributes within the repo for ${p.src}`);
      console.error(`  ${existing.files[0]} has: ${existing.integrity}`);
      console.error(`  ${p.file} has:           ${p.integrity}`);
      console.error(`  Pick one and apply it everywhere.`);
      return 1;
    }
    existing.files.push(p.file);
  }

  let failed = 0;
  for (const { src, integrity, files } of byUrl.values()) {
    const variants = parseIntegrity(integrity);
    // Prefer sha384 (what this codebase uses); accept any supported algo.
    const variant = variants.find(v => v.algorithm === 'sha384')
                 || variants.find(v => SUPPORTED_ALGOS[v.algorithm])
                 || variants[0];
    if (!variant.algorithm || !SUPPORTED_ALGOS[variant.algorithm]) {
      console.error(`::error::Unsupported or malformed integrity for ${src}: "${integrity}"`);
      console.error(`  Supported algorithms: ${Object.keys(SUPPORTED_ALGOS).join(', ')}`);
      failed++;
      continue;
    }

    let actual;
    try {
      actual = await computeHash(src, variant.algorithm);
    } catch (err) {
      console.error(`::error::Could not fetch ${src}: ${err.message}`);
      console.error(`  Referenced in: ${files.join(', ')}`);
      failed++;
      continue;
    }

    if (actual === variant.hash) {
      if (VERBOSE) console.log(`OK   ${src}`);
    } else {
      console.error(`::error::SRI hash mismatch for ${src}`);
      console.error(`  Referenced in: ${files.join(', ')}`);
      console.error(`  Declared: ${variant.algorithm}-${variant.hash}`);
      console.error(`  Actual:   ${variant.algorithm}-${actual}`);
      console.error(`  Fix: replace the integrity attribute in each file with`);
      console.error(`         integrity="${variant.algorithm}-${actual}"`);
      failed++;
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} SRI verification failure(s) across ${byUrl.size} unique resource(s) in ${htmlFiles.length} HTML file(s).`);
    return 1;
  }
  console.log(`Verified ${byUrl.size} SRI-protected resource(s) across ${htmlFiles.length} HTML file(s).`);
  return 0;
}

main().then(code => process.exit(code)).catch(err => {
  console.error('Unexpected error:', err);
  process.exit(2);
});
