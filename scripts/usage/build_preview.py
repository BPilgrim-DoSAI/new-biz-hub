#!/usr/bin/env python3
"""
Build a SELF-CONTAINED Claude Usage design preview.
===================================================
Inlines the design tokens + css/claude-usage.css + js/claude-usage.js +
a synthetic fixture into a single usage-preview.html.

Why self-contained: the preview must work however it is opened — through the
local web server, double-clicked as a file, or shown in an embedded panel.
Pages opened as files can't resolve relative <link>/<script>/fetch URLs, which
is what broke the earlier fetch-based version. With everything inlined, there
are no external requests to fail.

It uses SYNTHETIC data (scripts/usage/sample-fixture.json) so the file is safe
to commit — no real conversation titles, prompts, or client names.

The component files (js/claude-usage.js, css/claude-usage.css) remain the single
source of truth; re-run this whenever they change:
    python3 scripts/usage/build_preview.py
"""

import json
import os
import argparse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

# Design tokens needed by claude-usage.css (subset of css/styles.css :root, so
# the preview doesn't depend on the full stylesheet loading).
TOKENS = """
  :root {
    --c-black:#0A0A0A; --c-white:#FFFFFF; --c-cream:#F4F2EE;
    --c-grey:#C9C5BD; --c-grey-mid:#DDD9D3; --c-grey-light:#ECEAE5;
    --c-stone:#8A8580; --c-yellow:#FFE255;
    --font-display:'Lato',-apple-system,'Helvetica Neue',Arial,sans-serif;
    --font-body:'Lato',-apple-system,'Helvetica Neue',Arial,sans-serif;
    --radius-sm:4px; --radius-md:10px; --radius-lg:20px; --gutter:clamp(20px,5vw,72px);
    --shadow-sm:0 1px 4px rgba(0,0,0,.06); --shadow-md:0 6px 24px rgba(0,0,0,.08);
    --t-fast:140ms; --t-normal:230ms; --t-slow:360ms; --ease:cubic-bezier(.4,0,.2,1);
  }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:var(--font-body); background:var(--c-cream); color:var(--c-black);
    -webkit-font-smoothing:antialiased; }
"""

HARNESS_CSS = """
  .preview-wrap { max-width:1100px; margin:0 auto; padding:48px var(--gutter) 80px; }
  .preview-note { background:#FFF8E1; border:1px solid #F2E2A8; color:#6b5d2a;
    border-radius:10px; padding:12px 16px; font-size:13px; margin-bottom:28px; line-height:1.5; }
  .preview-h { font-family:var(--font-display); font-size:26px; font-weight:700; margin:0 0 4px; }
  .preview-sub { color:var(--c-stone); font-size:13px; margin:0 0 24px; }
"""

TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Usage — Preview (sample) · Miroma AI Hub</title>
  <!-- GENERATED FILE — do not edit by hand. Rebuild with:
       python3 scripts/usage/build_preview.py
       Self-contained on purpose so it works opened any way (file or server). -->
  <style>
{tokens}
{harness}
/* ===== css/claude-usage.css (inlined) ===== */
{component_css}
  </style>
</head>
<body>
  <div class="preview-wrap">
    <h1 class="preview-h">Claude Usage — Dashboard Preview</h1>
    <p class="preview-sub">Design preview rendered from synthetic sample data (a made-up agency).</p>
    <div class="preview-note">
      <strong>Preview only.</strong> This shows the look and layout using invented data so it is
      safe to share. In Phase&nbsp;2 this exact dashboard mounts inside
      <em>Agency Oversight &rarr; Claude Usage</em>, scoped so an agency admin only sees their own
      agency, with real figures loaded securely. Month-over-month deltas activate once a second
      monthly export exists.
    </div>
    <div id="cuMount"></div>
  </div>

  <script>
/* ===== js/claude-usage.js (inlined) ===== */
{component_js}
  </script>
  <script>
    var SAMPLE = {fixture};
    renderClaudeUsage(document.getElementById('cuMount'), SAMPLE);
  </script>
</body>
</html>
"""


def main():
    ap = argparse.ArgumentParser(description="Build a self-contained Claude Usage preview.")
    ap.add_argument("--fixture", "-f", default=os.path.join(os.path.dirname(__file__), "sample-fixture.json"),
                    help="Dashboard data JSON to inline (default: synthetic sample-fixture.json).")
    ap.add_argument("--out", "-o", default=os.path.join(ROOT, "usage-preview.html"),
                    help="Output HTML path (default: usage-preview.html).")
    args = ap.parse_args()

    css = open(os.path.join(ROOT, "css", "claude-usage.css"), encoding="utf-8").read()
    js = open(os.path.join(ROOT, "js", "claude-usage.js"), encoding="utf-8").read()
    fixture = open(args.fixture, encoding="utf-8").read()

    html = TEMPLATE.format(
        tokens=TOKENS,
        harness=HARNESS_CSS,
        component_css=css,
        component_js=js,
        fixture=fixture.strip(),
    )
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Wrote self-contained {args.out} ({len(html):,} bytes) from {os.path.basename(args.fixture)}")


if __name__ == "__main__":
    main()
