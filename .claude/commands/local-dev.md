# Local Dev — Firebase Emulator E2E Workflow

Start the Firebase Emulator Suite, seed test data, and run end-to-end tests
against the local site with Playwright. Handles all the environment quirks
(proxy stripping, SDK interception, port readiness) automatically.

## What this does

1. **Start emulators** — Auth (:9099), Firestore (:8080), Functions (:5001),
   Hosting (:5050), Emulator UI (:4000). Strips `HTTPS_PROXY`/`HTTP_PROXY`
   to prevent the proxy from interfering with inter-emulator communication.
2. **Seed test data** — runs `scripts/seed-emulator.mjs` with proxy cleared,
   creating admin users, New Business Hub data, and an auth user with claims.
3. **Run E2E tests** — launches Playwright, intercepts Firebase CDN requests
   to serve from `vendor/firebase/` (avoids SRI hash mismatches and proxy
   blocks on gstatic.com), signs in as `test@miroma.com`, and exercises the
   target page's full flow.
4. **Show screenshots** — sends the captured screenshots back for review.

## Instructions

Follow these steps in order. Each step depends on the previous one succeeding.

### Step 1: Ensure dependencies

```bash
# Check firebase-tools is available
which firebase || npm install -g firebase-tools

# Check project deps (includes firebase@10.12.0 and playwright)
ls node_modules/.package-lock.json || npm install

# Check functions deps
ls functions/node_modules/.package-lock.json || (cd functions && npm install)

# Check vendor SDK files exist
ls vendor/firebase/firebase-app-compat.js || (
  mkdir -p vendor/firebase &&
  for f in firebase-app-compat.js firebase-auth-compat.js firebase-firestore-compat.js firebase-functions-compat.js; do
    cp node_modules/firebase/$f vendor/firebase/$f
  done
)
```

### Step 2: Start emulators

Check if emulators are already running first:
```bash
for port in 4000 5001 5050 8080 9099; do
  (echo >/dev/tcp/127.0.0.1/$port) 2>/dev/null && echo "Port $port OPEN" || echo "Port $port CLOSED"
done
```

If any are CLOSED, start them. **Critical**: the proxy must be stripped
or the Functions emulator crashes when registering blocking triggers
with the Auth emulator ("Unable to parse JSON: denied by...").

Write a launcher script that unsets proxy vars:
```bash
cat > /tmp/run-emulators.sh << 'SCRIPT'
#!/bin/bash
unset HTTPS_PROXY HTTP_PROXY https_proxy http_proxy
export NO_PROXY="*" no_proxy="*"
cd <PROJECT_ROOT>
exec firebase emulators:start --project miroma-ai-hub --only auth,firestore,hosting,functions,ui
SCRIPT
chmod +x /tmp/run-emulators.sh
```

Launch it backgrounded with nohup:
```bash
nohup /tmp/run-emulators.sh > /tmp/emulators.log 2>&1 &
disown $!
```

Wait for readiness (check port 8080 every 5s, up to 90s):
```bash
for i in $(seq 1 18); do
  sleep 5
  (echo >/dev/tcp/127.0.0.1/8080) 2>/dev/null && echo "Ready after $((i*5))s" && break
  echo "Waiting... $((i*5))s"
done
```

Verify all ports are open. If emulators crash, check `/tmp/emulators.log`
— the most common cause is the proxy not being fully stripped.

### Step 3: Seed test data

The seed script also needs proxy stripped:
```bash
unset HTTPS_PROXY HTTP_PROXY https_proxy http_proxy
export NO_PROXY="*" no_proxy="*"
node scripts/seed-emulator.mjs
```

Expected output:
```
Seeded admin users.
Seeded newbiz_users/miroma.
Seeded opportunities/opp-seed-001.
Seeded opportunities/opp-seed-002.
Seeded opportunities/opp-seed-003.
Created auth user test@miroma.com.
Set custom claims (agencyKey=miroma, newbizAccess=true, access=all).
```

### Step 4: Run E2E test

```bash
node scripts/local-e2e.mjs --page new-business.html --out test-screenshots
```

This will:
- Launch Chromium with `--no-proxy-server` (local emulators only)
- Intercept `gstatic.com/firebasejs/*` → serve from `vendor/firebase/`
- Block Google Analytics (not needed for testing)
- Sign in as `test@miroma.com` / `testpass123` via the Auth emulator
- Exercise the full New Business Hub flow (list → create → workspace → save)
- Save numbered screenshots to `test-screenshots/`

### Step 5: Show screenshots

Send each screenshot file back to the user using the SendUserFile tool
so they can review the results visually.

## Test user credentials

| Field       | Value                |
|-------------|----------------------|
| Email       | test@miroma.com      |
| Password    | testpass123          |
| agencyKey   | miroma               |
| newbizAccess| true                 |
| access      | all                  |

## Emulator ports

| Service    | Port | URL                             |
|------------|------|---------------------------------|
| Emulator UI| 4000 | http://127.0.0.1:4000           |
| Functions  | 5001 | http://127.0.0.1:5001           |
| Hosting    | 5050 | http://127.0.0.1:5050           |
| Firestore  | 8080 | http://127.0.0.1:8080           |
| Auth       | 9099 | http://127.0.0.1:9099           |

## Troubleshooting

**Emulators crash immediately**: Check that proxy env vars are fully unset.
The `HTTPS_PROXY=""` syntax is not enough — use `unset HTTPS_PROXY`.

**"Unable to parse JSON: denied by..."**: The Functions emulator tried to
reach the Auth emulator through the proxy. Restart with proxy fully cleared.

**Firebase SDK SRI mismatch**: The vendor SDK files must match the version
in the HTML `integrity` attributes. Currently `firebase@10.12.0`. If you
upgrade the CDN version in the HTML, re-copy: `cp node_modules/firebase/firebase-*-compat.js vendor/firebase/`

**Seed script hangs**: The `firebase-admin` SDK tries GCP metadata lookup
through the proxy. Ensure `HTTPS_PROXY` is unset before running.

**Chromium not found**: The script checks `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
first (the Claude Code Remote pre-installed path), then falls back to
Playwright's default. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to override.

**Seeded opportunities don't appear in list**: The `listOpportunities` function
filters by `agencyKey` from the user's auth claim. The `setAgencyClaim`
blocking trigger maps `miroma.com` → `miroma-group`, but seed data uses
`agencyKey: 'miroma'`. Update seed data or the domain map to match.
