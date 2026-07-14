# AI Hub — Project Context

Internal AI Hub platform: learning pathways, approved toolkit, use cases, AI
policies & usage rules, and an admin section (agency oversight, meeting log,
news/use-case editing, licence data). **Firestore-backed**, static front end.

- Git remote: `Miroma-Holdings-Limited/AI-Hub-Website`
- Firebase project: `miroma-ai-hub`
- Build: `npm install`, then `node scripts/build.mjs` (see `scripts/`)

## ⚠️ Firestore rules: code and rules ship separately

The hub's data lives in **Firestore**, which has a separate security-rules
file (`firestore.rules`). Firestore **denies any collection that isn't
explicitly listed** in that file — there is no default-allow.

Two things follow, and both are easy to forget:

1. **New data → new rule.** Any time a feature stores a *new kind* of data
   (a new top-level collection or subcollection), you MUST add a matching
   `match` block in `firestore.rules`. Without it, every read and write is
   silently denied and the UI shows a generic failure (e.g. "Save failed").
   This is exactly what happened to the meeting-log feature — the code wrote
   to `/agencyMeetings/...` but the rule was never added (fixed June 2026).

2. **Rules deploy on their own.** Editing `firestore.rules` locally does
   nothing until deployed: `firebase deploy --only firestore:rules`. This is
   a **live production change** — flag it before running. It only adds/changes
   permissions (not data) and Firebase keeps a version history for rollback.

When debugging a "save failed" / empty-data bug in the admin panel, check
`firestore.rules` for the relevant collection FIRST — it's the most common
cause, and it never shows up when testing the front end in isolation.

### Rule conventions (helpers in `firestore.rules`)
- `isAdmin()` — signed-in, allowed domain, listed in `/admins`.
- `isFullAccessAdmin()` — the "all" (AI team) or "finance" tiers; cross-agency.
  This is the effective "super admin".
- `canAccessAgency(key)` — full-access admins, the admin's own home agency, or
  agencies they're listed against in `/agency_admins`. Use for per-agency data.

## Related
- `KNOWN_ISSUES.md` — tracked security/issue items (S-1, S-3, … referenced in rules).
- Local preview, roadmap, and build-strategy notes live in Claude memory.
