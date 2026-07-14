// ============================================================
// Build step — compiles .jsx files into plain JS at deploy time.
// ============================================================
//
// Closes KNOWN_ISSUES.md S-6 Part A: removes the need for
// @babel/standalone (which required CSP 'unsafe-eval' to JIT-
// compile JSX in the browser). After this build runs, the only
// JS shipped is plain compiled JS that the browser can execute
// without an eval allowance.
//
// Inputs:
//   js/claude-pathway.jsx
//   js/claude-sandbox.jsx
//
// Output:
//   js/dist/claude-pathway.js
//   js/dist/claude-sandbox.js
//
// React is NOT bundled — it continues to load from unpkg as a
// global (window.React, window.ReactDOM). jsxFactory points at
// React.createElement so the compiled output references the
// global as the existing setup expected.
//
// bundle: false means esbuild transpiles each file individually
// without resolving imports/exports. The JSX files reference
// helpers from other JS files (e.g. CP_ROLES from
// claude-prompts.js, PromptSandbox from claude-sandbox.jsx
// imported via global) — those references stay as global
// variable accesses, exactly as they were under @babel/standalone.

import esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const result = await esbuild.build({
  entryPoints: [
    join(ROOT, 'js', 'claude-pathway.jsx'),
    join(ROOT, 'js', 'claude-sandbox.jsx'),
  ],
  outdir: join(ROOT, 'js', 'dist'),
  bundle: false,
  loader: { '.jsx': 'jsx' },
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  target: ['chrome100', 'safari16', 'firefox100', 'edge100'],
  format: 'iife',
  // Keep readable in browser DevTools — these files are small enough
  // that minifying saves <5KB and complicates debugging.
  minify: false,
  sourcemap: false,
  // Stop on any warning so CI fails loudly rather than shipping broken code.
  logLevel: 'info',
});

if (result.errors.length || result.warnings.length) {
  console.error('Build had errors/warnings:', result);
  process.exit(1);
}

console.log('Build complete: js/dist/{claude-pathway,claude-sandbox}.js');
