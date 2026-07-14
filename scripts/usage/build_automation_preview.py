#!/usr/bin/env python3
"""
Build a SELF-CONTAINED Automation Usage design preview.
=========================================================
Inlines css/claude-usage.css + js/automation-usage.js + a dashboard_data.json
fixture into a single .local.html file, same pattern as build_preview.py
(Claude Usage) — safe to open as a file or via the local server, no external
requests.

Usage:
    python3 scripts/usage/build_automation_preview.py \
      --fixture scripts/usage/sample-data/soldout/automation_dashboard_data.json \
      --out usage-preview-automation-soldout.local.html
"""

import os
import argparse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

HARNESS_CSS = """
  :root { --font-body:'Lato',-apple-system,'Helvetica Neue',Arial,sans-serif; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:var(--font-body); background:#0B0B13; color:#fff; -webkit-font-smoothing:antialiased; }
  .preview-wrap { max-width:1100px; margin:0 auto; padding:48px 24px 80px; }
  .preview-note { background:rgba(255,226,85,0.1); border:1px solid rgba(255,226,85,0.3); color:#FFE255;
    border-radius:10px; padding:12px 16px; font-size:13px; margin-bottom:28px; line-height:1.5; }
  .preview-h { font-family:var(--font-body); font-size:26px; font-weight:700; margin:0 0 4px; color:#fff; }
  .preview-sub { color:rgba(255,255,255,0.5); font-size:13px; margin:0 0 24px; }
  .preview-mount { background:#0B0B13; border-radius:12px; padding:0; }
"""

TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Automation Usage — Preview · Miroma AI Hub</title>
  <!-- GENERATED FILE — do not edit by hand. Rebuild with:
       python3 scripts/usage/build_automation_preview.py
       Self-contained on purpose so it works opened any way (file or server). -->
  <style>
{harness}
/* ===== css/claude-usage.css (inlined) ===== */
{component_css}
  </style>
</head>
<body>
  <div class="preview-wrap">
    <h1 class="preview-h">Automation Usage — Dashboard Preview</h1>
    <p class="preview-sub">Local preview only — not the production Agency Oversight view.</p>
    <div class="preview-note">
      <strong>Preview only.</strong> Rendered from {fixture_name}. In production this mounts inside
      <em>Agency Oversight &rarr; Automation Usage</em>, scoped so an agency admin only sees the
      automations built for their own agency.
    </div>
    <div class="preview-mount"><div id="automationMount"></div></div>
  </div>

  <script>
/* ===== js/automation-usage.js (inlined) ===== */
{component_js}
  </script>
  <script>
    var SAMPLE = {fixture};
    renderAutomationUsage(document.getElementById('automationMount'), SAMPLE);
  </script>
</body>
</html>
"""


def main():
    ap = argparse.ArgumentParser(description="Build a self-contained Automation Usage preview.")
    ap.add_argument("--fixture", "-f", required=True,
                     help="Automation dashboard data JSON to inline.")
    ap.add_argument("--out", "-o", default=os.path.join(ROOT, "usage-preview-automation.local.html"),
                     help="Output HTML path.")
    args = ap.parse_args()

    css = open(os.path.join(ROOT, "css", "claude-usage.css"), encoding="utf-8").read()
    js = open(os.path.join(ROOT, "js", "automation-usage.js"), encoding="utf-8").read()
    fixture = open(args.fixture, encoding="utf-8").read()

    html = TEMPLATE.format(
        harness=HARNESS_CSS,
        component_css=css,
        component_js=js,
        fixture=fixture.strip(),
        fixture_name=os.path.basename(args.fixture),
    )
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Wrote self-contained {args.out} ({len(html):,} bytes) from {os.path.basename(args.fixture)}")


if __name__ == "__main__":
    main()
