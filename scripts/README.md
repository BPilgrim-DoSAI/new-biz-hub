# scripts/ — one-off operational scripts

These scripts are run manually by a human operator with elevated Firebase
credentials. They are NOT invoked by application code, the build pipeline,
or CI. Each script's header comment names the issue or change it relates
to and the date it was first run.

## Inventory

| Script | Purpose | First run |
|---|---|---|
| `seed-agency-data.mjs` | Migrates `ADMIN_USERS`, `LICENSE_DATA`, `AGENCY_CONTACTS` from `js/admin-data.js` into Firestore (closes KNOWN_ISSUES.md S-1) | (pending) |
| `export-firestore-licences.mjs` | Read-only backup of the licence collections (`/agencies`, `/license_overrides`, `/agency_contacts`, `/agency_admins`, `/admins`) to a timestamped JSON file. Run before any seed/clear as a rollback point. | (pending) |
| `clear-claude-overrides.mjs` | Deletes `toolName == 'Claude'` docs from `/license_overrides` so re-seeded Claude base data isn't masked by the override layer. Dry-run by default; `--apply` to delete. | (pending) |

## Licence reconciliation runbook (2026-06)

One-off clean-up of the Claude licence baseline. Run from the project root,
on a checkout that has the corrected `js/admin-data.js` (branch
`licence-reconciliation`), with the key exported (see "Get a service-account
key" below):

```bash
npm run backup:firestore                  # 1. rollback point (read-only)
npm run seed:agency-data                  # 2. write corrected base data
npm run clear:claude-overrides            # 3. dry run — review the list
npm run clear:claude-overrides -- --apply # 4. delete the stale Claude overrides
```

Then verify in Agency Oversight, and delete the key (see "security hygiene"
below). Steps 1–2 are safe/idempotent; step 4 is the only destructive one
and is gated behind `--apply`.

## Running a script

All scripts in this directory expect to be run from the project root with
`firebase-admin` installed and a service-account key available via
`GOOGLE_APPLICATION_CREDENTIALS`.

### One-time setup

```bash
npm install
```

This installs `firebase-admin` (declared as a devDependency in
`package.json`). Run once per clone of the repo.

### Get a service-account key

1. Open the [Firebase Console → Project Settings → Service Accounts](https://console.firebase.google.com/project/miroma-ai-hub/settings/serviceaccounts/adminsdk).
2. Click **Generate new private key**. A JSON file downloads.
3. Save it somewhere **outside this repository** — your home directory or
   a secure note. The repo's `.gitignore` catches the common naming patterns
   (`*-firebase-adminsdk-*.json`, `service-account*.json`) but the only
   reliable safety is keeping the file out of the working tree entirely.
4. Set the environment variable to point at it:

   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/miroma-firebase-sa.json"
   ```

### Run the script

```bash
npm run seed:agency-data
```

Or directly:

```bash
node scripts/seed-agency-data.mjs
```

### After running — security hygiene

**Delete the service-account key** as soon as the script finishes:

```bash
rm "$GOOGLE_APPLICATION_CREDENTIALS"
unset GOOGLE_APPLICATION_CREDENTIALS
```

A service-account key with Firestore admin scope is equivalent to a master
password for the project. It must not sit on disk between operations. Best
practice: generate, run, delete. If you need to re-run, generate a new one.

## Verifying the seed worked

After running `seed-agency-data.mjs` for the first time:

1. Firebase Console → Firestore → Data
2. Confirm three collections exist:
   - `/admins` — should have one doc per admin in `ADMIN_USERS` (some will already exist; the script merges fields in non-destructively)
   - `/agencies` — one doc per agency in `LICENSE_DATA.agencies`
   - `/agency_contacts` — one doc per entry in `AGENCY_CONTACTS`
3. Spot-check field shapes:
   - `/admins/thomas.maycliffe@miroma.com` should have `name`, `access: 'all'`
   - `/agencies/fold7` should have `key`, `name`, `tools: [...]`
   - `/agency_contacts/fold7` should have the agency's contact fields

## Adding a new script

When adding a one-off operational script:

1. Drop it in this directory with a `.mjs` extension (ESM module)
2. Add a header comment naming the issue it closes and the date
3. Add a `scripts/` entry to `package.json` for discoverability
4. Update the inventory table at the top of this README
5. If it depends on a new package, add it to `devDependencies`

Scripts here are committed (not gitignored) so that future engineers can
see exactly how the data took its current shape.
