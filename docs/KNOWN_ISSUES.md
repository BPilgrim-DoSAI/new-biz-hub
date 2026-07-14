# Known Issues — Miroma AI Hub

Tracker for bugs and tech-debt items that have been identified. Internal — this directory is excluded from Firebase Hosting (see `firebase.json` → `hosting.ignore`).

Last updated: 2026-06-12 (post-merge security review of PRs #14–#16: no exploitable issues; logged A-L-6 and A-L-7)

**Status taxonomy:**
- **Open** — vulnerability/bug present, no fix shipped
- **Mitigated** — interim fix in place, durable fix still pending
- **Fixed in `<commit>`** — closed; entry retained as postmortem trail
- **Accepted-Risk** — known, deliberately not fixing (with reason)
- **Won't-Fix** — not a real issue or out of scope

---

## 1. Production sign-in fails — CSP blocks Firebase Auth helper iframe

**Severity:** High — blocks fresh popup sign-ins on the deployed site
**Status:** Fixed in `deb9a2d` (hygiene/safety-net — original symptom did not reproduce in fresh incognito on 2026-05-27, suggesting Firebase SDK had silently fallen back to a non-iframe path; the CSP now permits the documented iframe path so future SDK updates can't regress)
**Affects:** `https://miroma-ai-hub.web.app` (and the `.firebaseapp.com` mirror) for any user without a cached session

### Symptom

On the deployed site, clicking *Sign in with Google* or *Sign in with Microsoft* runs the OAuth popup, the user completes sign-in at Google/Microsoft, the popup closes, and the page shows:

> Sign-in failed. Please try again.

Local development (`python3 -m http.server`) is unaffected because no CSP header is sent.

### Root cause

`firebase.json` defines a `Content-Security-Policy` response header for `**/*.html` with this `frame-src` directive:

```
frame-src https://www.youtube.com https://www.youtube-nocookie.com https://share.descript.com https://www.loom.com;
```

`firebase.auth().signInWithPopup(...)` does two things in parallel:

1. Opens a popup window to `https://miroma-ai-hub.firebaseapp.com/__/auth/handler?...` (not restricted by CSP — popups are top-level browsing contexts).
2. **Injects a hidden iframe** at `https://miroma-ai-hub.firebaseapp.com/__/auth/iframe`. This iframe is the `postMessage` listener that receives the OAuth result back from the popup.

The current `frame-src` whitelist does not include `https://miroma-ai-hub.firebaseapp.com`, so the browser blocks the iframe load. With no message channel, the SDK never receives the OAuth result, the `signInWithPopup` promise eventually rejects, and `js/auth.js:92` shows the generic failure copy.

### Files involved
- `firebase.json:22` — CSP directive
- `js/auth.js:81` — `auth.signInWithPopup(provider)`
- `js/auth.js:92-97` — `handleError` shows the "Sign-in failed" message

### Recommended fix

Add the project's Firebase Auth domain to `frame-src`:

```diff
- frame-src https://www.youtube.com https://www.youtube-nocookie.com https://share.descript.com https://www.loom.com;
+ frame-src https://www.youtube.com https://www.youtube-nocookie.com https://share.descript.com https://www.loom.com https://miroma-ai-hub.firebaseapp.com;
```

Then deploy via push-to-main (GitHub Actions) or `firebase deploy --only hosting`.

### Verification
- Open the deployed site in a fresh incognito window (no cached session).
- Sign in with a Google or Microsoft work account.
- DevTools → Console should show no `frame-src` violation for `firebaseapp.com`, and the auth overlay should dismiss.

---

## 2. PascalCase admin documents do not grant admin privileges

**Severity:** Medium — eight named "admins" silently lack permissions
**Status:** Fixed. Resolution was two-step:
  1. The S-1 seed (`scripts/seed-agency-data.mjs`, run as part of `ad1c26d`) created lowercase `/admins/{email}` docs for every entry in `ADMIN_USERS`, restoring admin privileges to the eight affected users via the `isAdmin()` rule's `request.auth.token.email.lower()` lookup.
  2. Operator-side cleanup on 2026-06-03: the eight orphaned PascalCase docs (`Adrian.Talbot@miroma.com`, `Ben.Pilgrim@miroma.com`, `Ben@attentive.media`, `Duncan.East@buzz16.uk`, `J.Charrington@dewynters.com`, `Joe.Bennett@buzz16.uk`, `Paul.Summers@miroma.com`, `Thomas.Maycliffe@miroma.com`) deleted manually via Firebase Console. They were unreachable by any rule (no path matched the lowercased lookup) but were visual noise in the collection.

**Prevention:** to avoid recurrence, admin onboarding should always lowercase the email before writing the doc ID. Worth capturing in a future admin-onboarding runbook (currently institutional knowledge).
**Affects:** Eight users across `miroma.com`, `attentive.media`, `buzz16.uk`, `dewynters.com`

### Symptom

The following admin documents exist in Firestore but do **not** grant their owners admin access on the site (the admin nav stays hidden, admin queries hit permission-denied):

| Document ID | Should be |
|---|---|
| `Adrian.Talbot@miroma.com` | `adrian.talbot@miroma.com` |
| `Ben.Pilgrim@miroma.com` | `ben.pilgrim@miroma.com` |
| `Ben@attentive.media` | `ben@attentive.media` |
| `Duncan.East@buzz16.uk` | `duncan.east@buzz16.uk` |
| `J.Charrington@dewynters.com` | `j.charrington@dewynters.com` |
| `Joe.Bennett@buzz16.uk` | `joe.bennett@buzz16.uk` |
| `Paul.Summers@miroma.com` | `paul.summers@miroma.com` |
| `Thomas.Maycliffe@miroma.com` | `thomas.maycliffe@miroma.com` |

### Root cause

`firestore.rules:9-12` defines the admin check as:

```
function isAdmin() {
  return isSignedIn()
    && exists(/databases/$(database)/documents/admins/$(request.auth.token.email.lower()));
}
```

The lookup path uses `email.lower()`, which means the doc ID must be the lowercase email. Mixed-case doc IDs are looked up at a path that doesn't exist, so the `exists()` check returns false and the user is treated as a non-admin.

### Recommended fix

For each affected document, create a new lowercase doc with the same `email` field value, then delete the mixed-case original. Can be done in one batch from the Firebase Console, the Firebase MCP, or a one-off script. Suggested order:

1. Create `admins/adrian.talbot@miroma.com` with `{ email: "adrian.talbot@miroma.com" }` (or preserve the canonical-case value in the `email` field if desired — only the doc ID needs to be lowercase).
2. Delete `admins/Adrian.Talbot@miroma.com`.
3. Repeat for the other seven.

Coordinate with `aiteam@miroma.com` before changing — the affected users may already have lived without admin access, so granting it should be a deliberate decision per row.

### Long-term: make this impossible to repeat

Options:
- Add a `createAdmin(email)` admin-only callable function that always lowercases before write.
- Or change `firestore.rules` to do a case-insensitive lookup (Firestore rules don't natively support this — would require dual-document writes or a different schema).

---

## 3. Source-map fetches blocked by CSP — console noise

**Severity:** Low — cosmetic only, does not affect functionality
**Status:** Fixed in `deb9a2d` (`https://www.gstatic.com` added to `connect-src`)

### Symptom

On every page of the deployed site, DevTools console logs CSP `connect-src` violations like:

```
Connecting to https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js.map
violates the following Content Security Policy directive: 'connect-src 'self' …'.
The request has been blocked.
```

Similar entries appear for `firebase-auth-compat.js.map`, `firebase-firestore-compat.js.map`, etc.

### Root cause

DevTools fetches source maps adjacent to the JS files it loads. The JS itself loads from `https://www.gstatic.com` (allowed under `script-src`), but the source-map fetch counts as a `connect-src` request, and `gstatic.com` is not in `connect-src`.

### Files involved
- `firebase.json:22` — CSP `connect-src` directive

### Recommended fix

Add `https://www.gstatic.com` to `connect-src`:

```diff
- connect-src 'self' https://*.googleapis.com wss://*.firebaseio.com https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com;
+ connect-src 'self' https://www.gstatic.com https://*.googleapis.com wss://*.firebaseio.com https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com;
```

Has zero runtime effect — only silences DevTools noise. Worth doing alongside the fix for issue 1 since both are CSP edits.

---

## 4. `img-src` may not cover Google's avatar host rotation

**Severity:** Low — would only suppress profile images, not block auth
**Status:** Fixed in `deb9a2d` (`img-src` broadened from `lh3.googleusercontent.com` to `*.googleusercontent.com`)

### Symptom

CSP `img-src` violations observed in the deployed site's console for image URLs hosted under `lh*.googleusercontent.com`. Only `lh3.googleusercontent.com` is currently allowed; Google rotates user-content delivery across `lh3`, `lh4`, `lh5`, `lh6`, and sometimes `lhX.googleusercontent.com`.

### Root cause

`firebase.json:22` `img-src` directive:

```
img-src 'self' data: https://img.youtube.com https://lh3.googleusercontent.com;
```

Only one subdomain is allowed.

### Recommended fix

Broaden to a subdomain wildcard:

```diff
- img-src 'self' data: https://img.youtube.com https://lh3.googleusercontent.com;
+ img-src 'self' data: https://img.youtube.com https://*.googleusercontent.com;
```

### Verification

Sign in with a Google account whose avatar happens to be served from `lh4` or `lh5`, or grep your local network log for blocked `googleusercontent.com` requests.

---

## 5. Local development writes to production Firestore

**Severity:** Medium — developer safety
**Status:** Fixed in `8960a09` (Option A — Firebase emulator wiring; `firebase emulators:start` + `useEmulator()` on localhost)

### Symptom

The JS in this repo calls `firebase.firestore()` with no `useEmulator()` configuration. When running locally via `python3 -m http.server` (or `firebase serve --only hosting`), every read and write goes against the live `miroma-ai-hub` Firestore database. Toggling a reaction, submitting an ROI story, logging a use-case usage, or clicking through the admin panel all create real production data.

### Root cause

No emulator-pointing branch in the Firebase SDK init (no equivalent of `if (location.hostname === "localhost") db.useEmulator("localhost", 8080)` exists in `js/auth.js` or `js/main.js`).

### Recommended fix

Either:

**Option A — point Firestore at the emulator when local:**
```js
// in js/auth.js after firebase.initializeApp(...)
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  firebase.firestore().useEmulator('localhost', 8080);
  firebase.auth().useEmulator('http://localhost:9099');
}
```
Then run `firebase emulators:start --only hosting,firestore,auth`. Pre-seed the emulator with `admins/` and any fixtures via an emulator export.

**Option B — leave the wiring alone, document the risk loudly:**
Add a banner in the README and/or a top-of-page warning when `location.hostname` is localhost: "You are connected to the LIVE Miroma AI Hub Firestore. Test interactions will create real records."

Option A is the durable fix; option B is the one-hour mitigation.

---

## S-1. CRITICAL — Sensitive licence and personnel data publicly exposed via `js/admin-data.js`

**Severity:** Critical — data confidentiality breach (publicly exposed since first deploy)
**Status:** Fixed in `ef07654` (file added to `firebase.json` hosting.ignore; URL returns 404 from deploy onwards) preceded by `2284d03` (admin-panel.js refactored to load /admins, /agencies, /agency_contacts from Firestore behind per-agency rules), `4efa602` (rules tightened for strict per-agency isolation), and seed via `scripts/seed-agency-data.mjs`. Note on residual risk: anyone who scraped the file while it was public retains a copy; this fix stops future exposure only.
**Affects:** Anyone on the internet — no Miroma account, no sign-in required

### Symptom

A direct request to the JS file returns the full contents with no auth check:

```
curl https://miroma-ai-hub.web.app/js/admin-data.js
# HTTP/2 200 — body contains everything below
```

The file contains:
- 40+ admin emails with names + agency assignments (`ADMIN_USERS`)
- Primary agency contacts (`AGENCY_CONTACTS`)
- For every agency: every tool, seat count, cost per seat, monthly total, annual total, renewal date, status
- For every agency: full list of licence holders with name + work email + team

### Root cause

Firebase Hosting serves static files unconditionally. The Firebase Auth overlay in `js/auth.js` is enforced **purely in the browser** — it gates the rendered page, not the underlying files. Any `.js`, `.css`, or `.html` path is openly served on direct request, regardless of which page references it.

Commit `a008228` removed `admin-data.js` from non-admin HTML pages, which limits accidental leak via authed users, but does not address the underlying issue: the file URL itself is public.

### Files involved
- `js/admin-data.js` — entire file is sensitive (642 lines)
- `admin.html:96` — only page that still loads it (not the exposure path)

### Recommended fix

Move the data into Firestore behind admin-only rules and fetch at runtime:

1. Create `admin_data/license_data`, `admin_data/admin_users`, `admin_data/agency_contacts` documents.
2. Add rules: `allow read: if isAdmin();` (no client-side writes).
3. Replace the `LICENSE_DATA`, `ADMIN_USERS`, `ADMIN_EMAILS`, `AGENCY_CONTACTS` constants with async loaders that hit Firestore on admin auth-ready.
4. Delete `js/admin-data.js` from the repo. Redeploy.

Interim mitigation (does NOT fix it, only reduces blast radius): strip holder emails and per-seat costs, ship only agency keys + names.

### Verification

```
curl -I https://miroma-ai-hub.web.app/js/admin-data.js
# Should return 404 (or 200 with no sensitive content)
```

Plus a smoke test signed in as an admin to confirm the dashboard still renders end-to-end.

---

## S-2. CRITICAL — Client-side admin "login" is cosmetic and any visitor can spoof the admin UI

**Severity:** Critical in posture, Low in net new data exposure (because S-1 already exposes everything the admin UI shows from `LICENSE_DATA`)
**Status:** Fixed in `2284d03` (`handleLogin` and `buildLoginView` removed; admin status is now confirmed via async Firestore read of `/admins/{email}` in `autoAuthFromSSO`, gated by the per-agency-isolation rule from `4efa602` so the spoof has nowhere to land — setting `localStorage.miroma_hub_admin_email` to an arbitrary string no longer renders the admin shell because no client-side `ADMIN_EMAILS` array exists to validate against).

### Symptom

In DevTools console on `https://miroma-ai-hub.web.app/admin.html`:

```js
localStorage.setItem('miroma_hub_admin_email', 'aiteam@miroma.com');
location.reload();
```

The admin dashboard renders fully — licence tabs, agency tabs, group overview, with all of `LICENSE_DATA` visible. No Firebase sign-in needed.

### Root cause

`admin-panel.js:106-117`:

```js
function handleLogin() {
  const email = input.value.trim().toLowerCase();
  if (ADMIN_EMAILS.includes(email)) {
    localStorage.setItem(STORAGE_KEY, email);   // ← the entire "auth"
    renderContent();
  }
}
```

`ADMIN_EMAILS` is a client-side array (from `admin-data.js`, which is itself publicly fetchable per S-1). There is no server check.

### Mitigating factor

Server-side Firestore reads/writes are gated by `isAdmin()` rules (which check the **server-side** `admins/` collection). So a spoofer cannot read `onboarding_requests`, `prompt_copies`, `roi_stories`, `site_visits`, `uc_usage`, or `pathway_progress`. They only see the static `LICENSE_DATA` baked into the JS — but that data is already exposed via S-1.

The real fix here is therefore mostly about removing misleading code, not about plugging a unique data leak.

### Files involved
- `js/admin-panel.js:9` — `STORAGE_KEY` constant
- `js/admin-panel.js:31-35` — `autoAuthFromSSO` (validates against client-side array)
- `js/admin-panel.js:106-117` — `handleLogin` (the form-based bypass)
- `js/admin-panel.js:200-214` — `buildLoginView` (the form that should be removed)

### Recommended fix

Delete `handleLogin` and `buildLoginView` entirely. Rely on the SSO + `admins/` collection path: render the admin view only when `mirAuthReady` fires AND a server-side `admins/{email}` doc exists (do an actual Firestore read of the admin doc, don't trust the client array).

### Verification

After fix: the DevTools spoof above should produce the "you don't have admin access" view, not the admin dashboard.

---

## S-3. HIGH — Any signed-in user can overwrite another user's `pathway_progress` document

**Severity:** High — data tampering, no detection
**Status:** Fixed in `9a2102a` (docId switched from email-derived to Firebase Auth `uid`; rule enforces `docId == request.auth.uid` plus matching `email` field on the doc body; migration script `scripts/migrate-pathway-progress-to-uid.mjs` re-keyed existing email-derived docs by looking up each email's Firebase Auth user).

### Symptom

Signed in as **any** allowlisted user (e.g. an intern at any agency), run in DevTools:

```js
firebase.firestore().collection('pathway_progress').doc('vix_ross_miroma_com').set({
  email: 'vix.ross@miroma.com',
  agencyKey: 'miroma',
  stagesCompleted: [1, 2, 3, 4, 5, 6],
  totalStages: 6,
  lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
});
```

Vix now shows as having completed all six Learning Pathway stages in the admin dashboard. Or zero it out. Either way the analytics admins rely on are corrupted with no audit trail.

### Root cause

`firestore.rules:36-40`:

```
match /pathway_progress/{docId} {
  allow write: if isSignedIn();
  allow read: if isAdmin();
}
```

There is no constraint that `docId` must correspond to the calling user. `fsSyncPathwayProgress` derives `docId = email.toLowerCase().replace(/[@.]/g, '_')`, but the rule doesn't enforce this convention.

### Files involved
- `firestore.rules:36-40` — the rule
- `js/requests.js:125-135` — `fsSyncPathwayProgress` (the legitimate writer)
- `js/claude-pathway.jsx:282-296` — the consumer that calls it on stage completion

### Recommended fix

Scope writes to the caller's own document:

```
match /pathway_progress/{docId} {
  allow read, list: if isAdmin();
  allow write: if isSignedIn()
    && docId == request.auth.token.email.lower().replace('@', '_').replace('.', '_');
}
```

(Firestore rules `.replace()` only does a single replacement — for multi-dot emails like `j.charrington@dewynters.com` the docId is already `j_charrington_dewynters_com` per the client's regex, so the rule string needs to match. Test carefully or, better, switch the docId scheme to `request.auth.uid` and migrate existing docs.)

### Verification

Sign in as user A, attempt to write to user B's doc — should now fail with PERMISSION_DENIED. Writing to A's own doc should still succeed.

---

## S-4. HIGH — Any signed-in user can read or overwrite any `uc_reactions` document

**Severity:** High — data tampering + privacy leak
**Status:** Fixed in `d7b969f` (schema rewritten to two collections: aggregate `/uc_reactions/{slug}` with count-only docs gated to ±1 transitions, plus per-user `/uc_reaction_users/{slug}__{uid}` records scoped to the owner+admin via rule; client `fsToggleReaction` and `fsGetAllReactions` rewritten; privacy upgrade — regular users can no longer enumerate who reacted to what; UI degraded from named likers to count + own-state; migration via `scripts/migrate-uc-reactions-per-user.mjs`).

### Symptom

Signed in as any allowlisted user, in DevTools:

```js
// Inflate counts on any use case
firebase.firestore().collection('uc_reactions').doc('some-use-case-slug').set({
  count: 99999,
  users: ['vix.ross@miroma.com', 'tess.mckean@miroma.com', /* … fabricated list … */],
  title: 'Some Use Case',
});
```

Or wipe them: `set({ count: 0, users: [], title: '...' })`. Or read another user's reaction list to see what use cases they've liked (privacy leak of internal browsing behaviour).

### Root cause

`firestore.rules:42-44`:

```
match /uc_reactions/{docId} {
  allow read, write: if isSignedIn();
}
```

No restriction at all beyond authentication. `fsToggleReaction` uses a transaction to do the right thing in the legitimate path, but the rule is what's enforceable — and it doesn't restrict who can write what.

### Files involved
- `firestore.rules:42-44`
- `js/requests.js:158-184` — `fsToggleReaction` (legitimate writer)
- `js/main.js:1196-1220` — UI consumer

### Recommended fix

Fine-grained Firestore rules for transactions on a `users` array are painful. Two cleaner options:

**Option A (preferred):** move the toggle into a Cloud Function that runs server-side with admin credentials, validates the caller, and updates the doc. Client calls the function; the rule becomes `allow read: if isSignedIn(); allow write: if false;`.

**Option B:** rewrite the data model so each user's reaction is its own doc keyed by `${slug}_${userEmail}`. Then the rule can lock writes to the caller's email. The count becomes a Firestore aggregation query.

### Verification

After fix: attempting the spoof writes above should return PERMISSION_DENIED. Legitimate toggles via the UI continue to work and the count updates correctly.

---

## S-5. HIGH — Firestore writes do not verify client-supplied `email` / `agencyKey` against the auth token

**Severity:** High — analytics integrity, attribution forgery
**Status:** Fixed in `ababaeb` (client now stamps server-verified `submittedBy`; rules enforce `submittedBy == auth.token.email.lower()` plus per-collection field caps; merge workflow extended to deploy Firestore rules alongside Hosting so future rule changes ship atomically)
**Affects:** `prompt_copies`, `uc_usage`, `site_visits`, `roi_stories`, `onboarding_requests`

### Symptom

Signed in as any allowlisted user:

```js
firebase.firestore().collection('uc_usage').add({
  email: 'someone.else@fold7.com',     // not the signed-in user
  agencyKey: 'fold7',                   // not the signed-in user's agency
  useCaseTitle: 'Whatever',
  category: 'X',
  tool: 'Y',
  timeSavedMinutes: 999999,
  frequencyPerMonth: 99,
  usedAt: firebase.firestore.FieldValue.serverTimestamp(),
});
```

The admin "ROI summary" now reports a Fold7 user just saved ~99 million minutes. Same pattern works to fake prompt copies, site visits, ROI stories, or onboarding requests under any agency.

### Root cause

Each affected rule is:

```
allow create: if isSignedIn();
```

No predicate compares `request.resource.data.email` to `request.auth.token.email`, no comparison of `agencyKey` to the caller's domain, no field-type or length constraints. The client code is the only thing that picks the "right" values, and the client can be replaced.

### Files involved
- `firestore.rules:22-26` (`onboarding_requests`)
- `firestore.rules:28-32` (`prompt_copies`)
- `firestore.rules:46-50` (`uc_usage`)
- `firestore.rules:52-58` (`site_visits`)
- `firestore.rules:60-66` (`roi_stories`)
- `js/requests.js` — all callers

### Recommended fix

Tighten each `create` predicate. Sketch:

```
match /uc_usage/{docId} {
  allow create: if isSignedIn()
    && request.resource.data.email == request.auth.token.email.lower()
    && request.resource.data.size() <= 10
    && request.resource.data.timeSavedMinutes is int
    && request.resource.data.timeSavedMinutes >= 0
    && request.resource.data.timeSavedMinutes <= 1440;
  allow read: if isAdmin();
  allow update, delete: if false;
}
```

Repeat the pattern for each collection. The exact field set differs per collection — keep field caps tight (e.g. `frequencyPerMonth <= 60`, body strings `<= 5000` chars) to prevent stuffing.

### Verification

After fix: the forged-email writes above return PERMISSION_DENIED. Legitimate UI submissions (where client and server emails match) continue to work.

---

## S-6. MEDIUM — CSP `script-src` includes both `'unsafe-inline'` and `'unsafe-eval'`, neutering XSS defence

**Severity:** Medium — significantly weakens defence in depth against any future XSS
**Status:** Fixed in `3ceb8a3` + `aaf3cb7`; follow-up refinement pinning the gstatic.com host allowlist to the `/firebasejs/` path prefix (further commit on `fix/csp-pin-gstatic-paths`). Part A (3ceb8a3): added an esbuild build step (`scripts/build.mjs`, `npm run build`) that compiles `claude-pathway.jsx` + `claude-sandbox.jsx` to plain JS at deploy time, dropping `@babel/standalone` and the need for `'unsafe-eval'`. Part B (aaf3cb7): externalised every inline `<script>` block (GA bootstrap to `js/analytics.js`, share-a-win form handling to `js/share-a-win.js`, our-builds filter to `js/our-builds.js`) and every `onclick=` attribute (replaced by event delegation in `js/admin-nav.js`). Follow-up: csp-evaluator.withgoogle.com flagged the bare `https://www.gstatic.com` allowlist as a known host-bypass (Google hosts AngularJS there, which has client-side template injection equivalent to eval); pinning to `https://www.gstatic.com/firebasejs/` closes that vector while permitting the Firebase SDK paths we actually use. `style-src 'unsafe-inline'` remains for now (lower-risk inline-styles concern, out of scope of S-6).

### Symptom

The CSP currently allows any inline `<script>` block and any `eval()` / `new Function()` / `setTimeout('string')`. So if an attacker lands a string into any of the ~37 `innerHTML` sinks in this codebase that isn't escaped, they can execute arbitrary JS. The CSP provides almost no defence.

### Root cause

- `'unsafe-eval'` is needed today because `learning.html` uses `@babel/standalone` to JIT-transpile `claude-sandbox.jsx` and `claude-pathway.jsx` in the browser.
- `'unsafe-inline'` is needed today for the Google Analytics inline snippet and for several `onclick=`/inline scripts across HTML files.

### Files involved
- `firebase.json:22` — the CSP directive
- `learning.html:10-12, 361-362` — Babel + JSX loads
- `index.html:13-20`, `admin.html:13-20`, others — GA inline snippet

### Recommended fix

1. **Remove `'unsafe-eval'`:** add a small build step (e.g. esbuild) that compiles the two JSX files to JS at deploy time. Drop `@babel/standalone` and update `learning.html` to load the pre-built JS files directly. (~1 day of work, plus minor CI tweak.)
2. **Remove `'unsafe-inline'`:** either move the GA snippet to an external file with a known hash and use `'sha256-…'`, or use a per-deploy CSP nonce. Convert any remaining `onclick=` attributes to addEventListener bindings. (~1–2 days.)

Once both flags are gone, the CSP becomes a real second line of defence against XSS — any injection has to also work around the strict allowlist.

### Verification

- Run the deployed site through https://csp-evaluator.withgoogle.com/ — score should jump from "weak" to "strong".
- Smoke-test learning pathway and GA event delivery to confirm nothing regressed.

---

## S-7. MEDIUM — Email-domain allowlist is enforced purely client-side; non-allowlisted users get a brief authenticated window before signOut

**Severity:** Medium — bypassable in race-condition; non-allowlisted users leave residue in Firebase Auth
**Status:** Mitigated in `5907cec` (Firestore rules now enforce the 15-domain allowlist at the data layer via `isAllowedDomain()`, so a non-allowlisted token holder cannot read or write any data during the race window). **Still pending:** the dead Firebase Auth user records for rejected sign-in attempts. Eliminating those needs a `beforeSignIn` blocking function, which requires the Blaze plan + Identity Platform. Acceptable risk on Spark; revisit if traffic or compliance needs change.

### Symptom

A user signing in via Google/Microsoft with a non-allowlisted domain (e.g. `attacker@gmail.com`):

1. Firebase Auth completes the OAuth handshake and issues a valid ID token.
2. `auth.js:104-120` reads the email, checks against `ALLOWED_DOMAINS`, finds no match, and calls `auth.signOut()`.
3. Between steps 1 and 2 (real but small window), the user holds a valid Firebase token and can call Firestore.

Additionally, a user record is created in Firebase Auth for every non-allowlisted sign-in attempt — the project will accumulate dead user records over time.

### Root cause

The domain allowlist is enforced in the browser. Firebase Auth itself accepts any Google/Microsoft account; the project's "Authorized domains" setting only restricts OAuth redirect URIs, not which email domains can sign in.

### Files involved
- `js/auth.js:14-19` — `ALLOWED_DOMAINS`
- `js/auth.js:104-120` — the post-sign-in check and signOut

### Recommended fix

Enforce server-side via a Firebase Auth blocking function (`beforeCreate` or `beforeSignIn`):

```js
// Cloud Function
exports.beforeSignIn = functions.auth.user().beforeSignIn((user) => {
  const domain = user.email?.split('@')[1]?.toLowerCase();
  if (!ALLOWED_DOMAINS.includes(domain)) {
    throw new functions.auth.HttpsError('permission-denied', 'Restricted to Miroma Group accounts.');
  }
});
```

This rejects the sign-in before any token is issued, prevents the race, and stops dead user records from accumulating.

### Verification

After fix: attempt to sign in with a personal gmail account. Firebase should reject the sign-in entirely (no user record created, no token issued, no client-side `signOut` needed).

---

## Process gaps (not bugs, but noted)

- **No documented admin-onboarding flow.** Granting admin requires direct Firestore write access (the `admins/` collection rule is `allow write: if false`). Currently performed out-of-band via Firebase Console or MCP. Worth documenting who can grant, what the request channel is, and the casing rule (see issue 2).
- **Firebase API key is hardcoded in `js/auth.js:6`.** Intentional and safe for client-side Firebase — security is enforced by Firestore rules + auth-domain allowlist, not key secrecy. Flagged here only because it occasionally raises eyebrows on first read.

---

## Adding new entries

When you find something:

1. Open a PR adding the issue to this file, numbered, with: **Severity / Status / Symptom / Root cause / Files involved / Recommended fix / Verification**.
2. Cross-reference the relevant commit, file:line, or Firebase Console URL — anything that will still be true six months from now.
3. Mark `Status: Fixed in <commit>` instead of deleting the entry, so the file doubles as a postmortem trail.

---

## Security audit — 2026-06-03

A fresh comprehensive code review (separate pass after the S-1 through S-7 batches landed) surfaced nine additional findings. Eight closed in branch `fix/security-audit-followups`; two deferred with explicit reasoning.

### A-H-1. HIGH — Stored XSS via `roi_stories.supportingLink` href attribute

**Status:** Fixed in `bbf3377` (added `esc()` to the href interpolation in `js/admin-panel.js:612`; also upgraded `esc()` itself to additionally escape `"` and `'` so every existing call site becomes attribute-safe).

**Symptom:** Any signed-in allowlisted user could submit an ROI story with a `supportingLink` containing crafted quote-breakout payload; when an admin opened the AI Impact Stories section and clicked the link, JS executed in the admin's session.

### A-M-1. MEDIUM — Stored XSS via Firestore-stored licence data in admin dashboard

**Status:** Fixed in `53d51c2` (wrapped every Firestore-sourced template interpolation across the licence-card, group-spend, holder, audit-log-toggle, manage-admins, agency-tab, and signed-in-bar renders with the upgraded `esc()` helper).

**Symptom:** Super admins authoring licence-edit values (holder name, team, joined-at, tool renewal, currency, status) could inject HTML/JS that executed in every other admin's session.

### A-M-2. MEDIUM — No Subresource Integrity on third-party CDN scripts

**Status:** Fixed in `328df85` (computed SHA-384 hashes of every gstatic Firebase SDK and unpkg React/ReactDOM file actually loaded; added `integrity="sha384-..."` and `crossorigin="anonymous"` attributes to all 9 HTML files. `googletagmanager.com/gtag/js` deliberately not pinned — Google generates content dynamically per measurement-ID, breaks SRI).

**Operational note:** if Firebase SDK / React versions are bumped, the SRI hashes MUST be regenerated or the browser will refuse to load them. CI now enforces this — `scripts/verify-sri.mjs` fetches every CDN-served resource referenced by an `integrity=` attribute, recomputes the hash, and fails the PR + merge workflows on mismatch. Run locally before pushing via `npm run verify:sri`.

### A-M-3. MEDIUM — User email stored in localStorage (XSS identity-leak vector)

**Status:** Fixed in `35ecbf4` (`localStorage.miroma_hub_firebase_user` now holds a boolean signal `'1'` rather than the user's email value. Two new accessors `window.hubGetEmail()` and `window.hubGetUid()` derive the values from `firebase.auth().currentUser` instead. Updated all 7 consumer files to use the accessors. The pathway-progress local storage key now uses uid as scope key instead of email).

**M-3 Part 2 — followup:** A localStorage inspection turned up two more email-bearing entries the original fix missed:
- `miroma_hub_admin_email` (set by `admin-panel.js` after a successful `/admins/{email}` lookup; read by `admin-panel.js` and `admin-nav.js` 7+ times). Renamed to `miroma_hub_admin`, value changed to `'1'`, all read sites now derive the email via a new `getAdminEmail()` helper that gates on the presence flag and reads `hubGetEmail()`.
- `miroma_visit_<YYYY-MM-DD>_<email>` (set by `requests.js#fsLogVisit` as a daily dedupe guard). Switched to `miroma_visit_<date>_<uid>`; falls back to `'anon'` rather than the email when uid is unavailable.

Both renames include one-shot cleanup of the legacy key so existing browsers don't carry the email-bearing entry forward. The orphaned `miroma_hub_pathway_<email>` entries from the first M-3 pass are left alone — code no longer writes them and they're stable orphans, not active leaks.

### A-L-1. LOW — No length limits on share-a-win form fields

**Status:** Fixed in `5322a70` (HTML `maxlength` attributes on every input/textarea; matching server-side `request.resource.data.<field>.size() <= N` checks in the `roi_stories` create rule in `firestore.rules`).

**Bugfix follow-up:** the original L-1 commit also added `request.resource.data.size() <= 20` as a total field-count cap. The actual client write is 21 fields (18 form fields + `submittedBy` + `status` + `submittedAt`), so every legitimate submission was being rejected with `permission-denied`. Caught during XSS-test verification of H-1 — the test surfaced a regression in L-1. Cap raised to 24 (one cushion for future fields) in a follow-up commit; per-field size checks unchanged.

### A-L-2. LOW — `data:` URI allowed in CSP `img-src`

**Status:** Reverted. The initial removal in `5322a70` broke `index.html`: `css/styles.css` uses `background-image: url("data:image/svg+xml,...")` for the noise/grain overlay. `data:` was reinstated in `img-src`. To revisit, the noise SVG would need to move to a `.svg` file served from `self` — left as future cleanup, not a security blocker (`script-src` still excludes `data:`, so the meaningful XSS surface is closed).

### A-L-3. LOW — Email leaked in `console.warn` log

**Status:** Fixed in `5322a70` (dropped the email parameter from `js/admin-panel.js`'s `autoAuthFromSSO: permission denied` log line; investigators can read `firebase.auth().currentUser` themselves without baking PII into log output).

### A-L-4. LOW — Unescaped string interpolation on developer-authored content

**Status:** Closed (2026-06-12, `feature/admin-use-case-editor`; previously partially closed 2026-06-11, `feature/admin-news-editor`). NEWS moved to Firestore-authored content (`content_news` + admin Site Content editor), and the deferral was honoured as planned: all news fields are escaped at output in home-news.js, whats-new.js and admin-content.js; link URLs additionally scheme-validated via `safeUrl()` (https/http/mailto only — same standard as A-H-1) and iframe embeds restricted to CSP frame-src hosts via `safeEmbed()`. The remaining deferred scope — `USE_CASES` — was closed when use cases got the same admin-editing treatment (see the `content_use_cases` entry below): the drawer renderer in main.js now escapes description paragraphs, workflow steps and variable ids, scheme-validates `tutorialUrl`, and allowlists `video` iframe sources; the rebuilt grid cards are built exclusively with `textContent`.

### Runtime-authored use cases — `content_use_cases` security decisions (2026-06-12)

Not a vulnerability — a record of the security posture chosen when the use-case library became admin-editable (`feature/admin-use-case-editor`), mirroring the `content_news` entry above.

**What is runtime-authored now:** every prompt/workflow use case rendered on use-cases.html (title, category, tool, description, card summary, prompt template, customise-your-prompt variables, workflow steps, optional video/tutorial URLs, DPIA badge). The five "Our Build" cards and the submit card remain static HTML and are out of the editor's scope. `js/use-cases-data.js` stays in the repo as the offline/failure fallback and the import source — removing it is a later PR (before that happens, the hand-authored card summaries and thumb codes that `use-cases-content.js` harvests from the static HTML would need backfilling into Firestore).

**What the rules enforce (`firestore.rules`, `content_use_cases`):**
- Reads: any signed-in allowed-domain user (`isAllowedDomain()`), same as `content_news`.
- Writes/deletes: super admins only (`adminProfile().access == 'all'`), matching the Site Content UI gating — agency/finance admins never see the editor and the rules don't quietly grant them the power anyway.
- Slug immutability: the docId IS the slug and the rules require `slug == docId`. Production reaction data (`/uc_reactions/{slug}`, `/uc_reaction_users/{slug}__{uid}`) is keyed by these slugs, so they were minted once from the original titles (identical to `titleToSlug()` output) and never change — retitling a use case keeps its reaction history. `prompt_copies` / `uc_usage` are keyed by title, so retitling forks those analytics buckets; accepted as low-impact.
- Field caps sized from the real data: largest existing prompt is 8,992 chars → cap 20,000 (>2× headroom); description ≤ 5,000 (largest 876); title ≤ 200 (largest 60); ≤ 24 variables (max in use 11); ≤ 20 steps (max in use 8); video/tutorial URLs ≤ 500; total field count ≤ 16. `category`, `tool`, `type` and `dpia` are allowlisted enums. `updatedBy` must equal the caller's token email.
- Ordering: `order` is a required int — the public query is `orderBy('order')` and Firestore silently excludes docs missing the orderBy field, so every save path always writes it.

**Output escaping (A-L-4 discipline):**
- `use-cases-content.js` builds grid cards with `createElement`/`textContent` only — no stored string reaches `innerHTML`.
- The drawer builder in main.js escapes all interpolations (`escHtml` upgraded to escape quotes too), allowlists `video` iframe sources to CSP frame-src hosts (YouTube/youtube-nocookie/Loom/Descript), and scheme-validates `tutorialUrl` (https only).
- The admin editor escapes everything through its `esc()` helper and validates video URLs against the same iframe-host allowlist at input time (defence in depth — the renderer re-checks at output).

**Residual risks / accepted trade-offs:**
- A compromised super-admin account can publish arbitrary *text* site-wide (not script — escaping and CSP hold), same blast radius as `content_news`.
- Public fallback behaviour: on ANY Firestore failure or an empty collection, the static grid simply remains, so the page can never be blank — but that also means a deliberate "unpublish everything" by deleting all docs would resurface the static content rather than an empty page. Acceptable until the static fallback is retired.
- Imported docs in the legacy `Legal` / `HR & People` categories (8 of 108) have no filter buttons or cards on the public page — pre-migration parity preserved. They are editable in the admin panel and will surface if those categories ever get page filters.
- Prompt-copy and usage analytics remain title-keyed (see above); only reactions get slug continuity.

---

### A-L-5. LOW — Iframes lack `sandbox` attribute

**Status:** Deferred. YouTube / Loom / Descript embeds rely on iframe permissions that vary per provider; adding a conservative sandbox value without testing each embed type risks breaking video playback. Out of scope for the security-audit batch. To do: per-embed testing of `sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"` against each provider before applying.

### A-L-6. LOW — Dead news renderer in `main.js` builds an unvalidated iframe `src`

**Status:** Open (not exploitable; earmarked for the fallback-removal tidy-up PR). Found during the post-merge security review of PRs #14–#16 (2026-06-12).

The legacy news-feed renderer in `js/main.js` (`initNewsFeed`, ~line 587) builds `<iframe src="${esc(item.video.embed)}">` with HTML-escaping only — no scheme/host allowlist, unlike the live renderers (`whats-new.js` routes embeds through `safeEmbed()`; `home-news.js` renders no embed at all). It is **currently dead code**: it mounts to `#newsFeed`, an element that exists in no HTML file, and also guards on `typeof NEWS !== 'undefined'` (also absent), so the function returns immediately and the iframe line never executes. Not reachable, therefore not exploitable today.

Compounding (same path): the `content_news` Firestore rule permits `video` to be any `map` (`request.resource.data.video is map`) with no validation of its contents, so an admin *could* store `video.embed = "data:text/html,…"`. The live What's New renderer neutralises this via the `safeEmbed()` host allowlist, and CSP `frame-src` is the backstop — but the rule is looser than it should be.

**Fix (tidy-up PR):** delete the dead `initNewsFeed` block (or route its embed through `safeEmbedUrl()` if ever revived), and tighten the `content_news` rule to validate `video.embed`/`video.url`/`video.thumb` as strings if the field is kept.

### A-L-7. LOW — Runtime-authored link & tutorial URLs are scheme-checked but not host-restricted

**Status:** Accepted-Risk (documented; revisit if a host allowlist is wanted). Found during the same review.

News-card links (`home-news.js` / `whats-new.js` `safeUrl()`) and use-case `tutorialUrl` (drawer builder in `main.js`) are validated for scheme (`https`/`http`/`mailto` for links, `https` only for tutorials) but not for destination host. A malicious or compromised **super-admin** account could therefore publish a link whose visible label looks trustworthy but points to an external phishing page. This is not code injection — escaping and CSP are unaffected; the residual risk is social-engineering via an authored link, and pointing to arbitrary external sites is partly the intended feature (news links out by design). Blast radius is limited to the ~2 super-admin accounts that can write these collections.

**Optional hardening:** restrict link/tutorial hosts to an approved allowlist (requires maintaining the list as new destinations are added), or render the bare destination host next to authored links so users can see where a link goes before clicking.
