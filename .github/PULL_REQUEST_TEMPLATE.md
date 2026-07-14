<!--
Thanks for opening a PR. Filling these sections out gives reviewers
(and future-you, six months from now) enough context to understand the
change without reading every line of diff.

If the change is trivial (docs, typo, dependency bump), feel free to
shorten — but don't delete the headings entirely; they're scaffolding.
-->

## Summary

<!-- 1–3 sentences: what does this PR change, and why? Focus on
intent rather than mechanics. The diff shows mechanics. -->

## What changed

<!-- Bulleted list grouped by file or by concern. Worth calling out
anything subtle: schema changes, rule changes, behaviour changes
visible to users, new dependencies. -->

## Risk

<!-- Honest assessment: low / medium / high, and why. What's the
worst-case failure mode? Is the change reversible by a single
`git revert`? Does it require an out-of-band operation (Firestore
migration, manual config change, secret rotation)? -->

## Test plan

<!-- Pre-merge checks you've already done, plus things a reviewer
should validate. Use checkboxes so the list can be ticked off. -->

- [ ] Local: <what you tested in the emulator / on localhost>
- [ ] Preview URL: <what behaviour you verified on the PR preview>
- [ ] (If applicable) Migration script: <ran successfully against
      Firestore, X docs touched>

## Post-merge verification

<!-- What you'll check immediately after merging. Useful as the
rollback trigger — if any of these fail, revert and diagnose. -->

- [ ] Both deploy steps green in Actions tab
- [ ] <smoke test 1>
- [ ] <smoke test 2>

## Linked issues / docs

<!-- KNOWN_ISSUES.md entries this PR closes, related PRs, design
docs, Slack threads. Reference by commit hash or URL where helpful. -->

Closes:
Related:
