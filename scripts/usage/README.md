# Claude Usage dashboards — monthly routine

This folder turns the monthly **Claude.ai org data export** for each agency into the
**Claude Usage** dashboard shown in Agency Oversight.

Most months you don't run these commands by hand — you do it **with Claude Code**, which
runs them for you. This README is the map so you (or Tom) know what's happening and can
pick it up cold.

---

## What you do each month

1. **Export** each agency's data from Claude.ai org settings (Settings → Data export).
2. **Drop the export** (a `.zip` is fine) into that agency's folder under:
   `~/Claude/Miroma/ai-usage-reporting/Claude Usage Data/<Agency Name>/`
   One folder per agency. Empty folders are fine — they just show "no report yet".
3. **Tell Claude Code**: *"update the Claude usage dashboards for <agencies>"*. It will do
   steps A–D below and ask you for a key when it's ready to publish.

That's it. The rest is reference.

---

## What happens under the hood (A–D)

Run from the repo root (`ai-hub/`). `<key>` is the agency key (see table below).

**A. Process** — raw export → anonymised metrics + a privacy-gated digest:
```
python3 scripts/usage/process_usage.py \
  --input "<path to the unzipped export folder>" \
  --agency "<Agency display name>" --include-prompts \
  --out-dir scripts/usage/sample-data/<key>
```
By default this **excludes likely-personal chats** and the **central AI-team support seat**
(`aiteam@…` — used for testing/training, not the agency's own work); it prints what it dropped.
Pass `--include-personal` / `--include-aiteam` to keep them.

**Exception — the AI Team's own report:** when `--agency` is the AI Team itself
(`AI Team` / `ai-team`), the `aiteam@…` seat is that team's genuine primary licence,
not a testing seat on another org, so it is **kept automatically** — no flag needed.

**B. Classify (the judgement step)** — Claude Code reads the digest and writes
`scripts/usage/sample-data/<key>/classification.json`, containing:
- `map` — each conversation → a workflow (a job-to-be-done),
- `examples` — plain-English, **client-name-free** example descriptions per workflow,
- `wins` — the 3–5 standout wins for the month.
Keep the workflow list consistent month-to-month so trends hold (extend it per agency only
when their work genuinely needs a new category, then keep it).

**C. Build the dashboard data**:
```
python3 scripts/usage/analyze_usage.py --in-dir scripts/usage/sample-data/<key>
```
This writes `dashboard_data.json` (workflows, wins, time-saved, narrative, etc.).

**C2. Reconcile licence counts (review only — writes nothing):**
```
GOOGLE_APPLICATION_CREDENTIALS="<path to the service-account key>" \
  npm run usage:reconcile -- --prod
```
Compares each processed agency's usage licence count (`licensed_users`) against the
number of Claude **holders** the licence dashboard shows, and flags any agency that's
out of sync. It normalises for the things the two sides count differently — drops
"pending invite" holders and the central `aiteam@` seat (kept only on the AI Team's
own report) — so a healthy month reads `OK`. A `MISMATCH` means review that agency's
Claude roster in Agency Oversight and update it by hand; the script never writes.
Without `--prod` it reads the newest `firestore-licences-backup-*.json` (no key, but
may be stale — prefer `--prod` for the real check). `--agency-key <key>` checks one.

**D. Publish to production** (needs a key — see below):
```
GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json" \
  npm run usage:upload -- --file scripts/usage/sample-data/<key>/dashboard_data.json \
  --agency-key <key> --prod
```
Each upload is one monthly snapshot at `/claude_usage/<key>/snapshots/<YYYY-MM>`. The
dashboard reads the latest two for month-over-month deltas.

**Preview locally first (optional, no key needed):**
```
python3 scripts/usage/build_preview.py \
  --fixture scripts/usage/sample-data/<key>/dashboard_data.json \
  --out usage-preview.local.html
```
Then open `usage-preview.local.html`.

**E. Aggregate the group-level report (run once, after ALL agencies for the
month are published — steps A–D — and any automation snapshots are current):**
```
GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json" \
  node scripts/usage/aggregate-group-report.mjs --period <YYYY-MM> --prod --dry-run
```
Reads across every agency's Claude/LTX/automation snapshots plus licences, use cases
and site visits, and prints the computed `/group_reports/<period>` document without
writing anything (there's no local-preview HTML step for this one, so `--dry-run` is
the way to sanity-check it). Eyeball the numbers, then drop `--dry-run` to publish for
real:
```
GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json" \
  node scripts/usage/aggregate-group-report.mjs --period <YYYY-MM> --prod
```
This is what powers the Hub's **Group AI Progress** admin tab (super admins only —
`access=='all'`), the live equivalent of the monthly CEO one-pager. Delete the key
afterwards, same as every other step.

---

## The service-account key (for publishing only)

1. Firebase Console → **Project Settings → Service accounts → Generate new private key**:
   https://console.firebase.google.com/project/miroma-ai-hub/settings/serviceaccounts/adminsdk
2. Save it **outside the repo** (your home folder), point `GOOGLE_APPLICATION_CREDENTIALS`
   at it, run the upload(s).
3. **Delete the key afterwards.** It grants full database access — never leave it lying
   around, never commit it. Regenerate a fresh one next month.

---

## Agency keys

Folder name (display) → key used in the database:

| Folder | key | | Folder | key |
|---|---|---|---|---|
| AI Team | `ai-team` | | Sold Out | `soldout` |
| Attentive | `attentive` | | Spot Co | `spotco` |
| Dewynters | `dewynters` | | The Multiple Agency | `multiple` |
| Miroma Founders Network | `mfn` | | Fold 7 | `fold7` |
| Maker Lab | `makerlab` | | MX UK / MX US | `mxuk` / `mxus` |
| Buzz 16 | `buzz16` | | Twelve AM | `twelveam` |
| Miroma Holdings Ltd | `miroma-group` | | | |

A new agency must exist in `/agencies/<key>` (managed in admin-data.js + Firestore) before
its report will show a tab.

---

## What the data covers

Claude.ai — **web & desktop apps** — including code/files/analysis Claude does **inside a
chat**. It does **not** include Claude Code sessions (terminal or desktop app) that edit
local files, direct API/Console usage, or other tools (LTX, Fireflies). Usage stats are
anonymised; only the onboarding and power-user lists are named, and reads are locked to
each agency's own admins (see `firestore.rules` → `/claude_usage`, tested by
`npm run test:rules`).

## Retention (DPIA: 12 months)

The DPIA commits to keeping Claude usage data for **12 months**. This is enforced
automatically by a **Firestore TTL policy**: `upload-usage.mjs` stamps every
snapshot with an `expireAt` timestamp set to upload date + 12 months, and Firestore
deletes the document shortly after that time passes — no manual clean-up.

**One-off setup** (run once, by someone with Owner/Editor on the project):

```
gcloud firestore fields ttls update expireAt \
  --collection-group=snapshots --enable-ttl \
  --database='(default)' --project=miroma-ai-hub
```

> ⚠️ **Requires the Blaze (pay-as-you-go) billing plan.** On the free Spark plan this
> command fails with `billing disabled`. Firestore TTL itself has no charge, but the
> project must have billing enabled for the feature to be available. As of 2026-06-29
> the project is on Spark, so the policy is **not yet active**.

Notes:
- The policy applies to the `snapshots` collection-group (`/claude_usage/*/snapshots/*`).
- Snapshots uploaded **before** `expireAt` was added have no such field and are left
  untouched — backfill an `expireAt` on them if you want them on the same clock.
- TTL deletion is automatic and **irreversible**; deletions can lag the expiry by up
  to ~24–72 hours. Confirm the policy in Firestore Console → Databases → Time-to-live.

**On the Spark (free) plan we enforce retention by pruning instead** — run this as the
last step of the monthly routine. It deletes any snapshot whose period is older than 12
months. It is **dry-run by default** (lists what it would delete, changes nothing) and
**refuses to touch production** unless you pass `--prod`:

```
# 1. Safe preview against production (read-only):
export GOOGLE_APPLICATION_CREDENTIALS="/secure/path/key.json"
npm run usage:prune -- --prod

# 2. If the list looks right, actually delete:
npm run usage:prune -- --prod --apply
# then delete the service-account key from disk
```

The `expireAt` field is written regardless, so if the project later moves to Blaze you
can switch to the automatic TTL policy (the one command above) and drop the prune step.

## Files here

| File | What it does |
|---|---|
| `process_usage.py` | Export → `metrics.json` + privacy-gated `digest.json` (+ validation) |
| `analyze_usage.py` | `digest` + `classification` → `dashboard_data.json` (workflows, wins, time-saved) |
| `upload-usage.mjs` | Publishes a snapshot to Firestore (`npm run usage:upload`) |
| `aggregate-group-report.mjs` | Rolls up every agency's already-published Firestore data into `/group_reports/<period>` (powers the Group AI Progress admin tab) |
| `prune-old-snapshots.mjs` | Deletes snapshots older than 12 months — retention (`npm run usage:prune`) |
| `reconcile_licences.mjs` | Flags usage-vs-licence-dashboard count drift, read-only (`npm run usage:reconcile`) |
| `build_preview.py` | Builds a self-contained local preview HTML |
| `test-rules.mjs` | Security-rules regression test (`npm run test:rules`) |
| `sample-fixture.json` | Synthetic demo data for the committed preview (no real data) |
| `sample-data/` | Real processed data — **gitignored**, never committed |
