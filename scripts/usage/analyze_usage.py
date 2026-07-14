#!/usr/bin/env python3
"""
Claude Usage Workflow Analysis  (AI Hub edition)
================================================
Reads the privacy-gated digest.json + metrics.json produced by process_usage.py
and writes the final `dashboard_data.json` the hub renders.

It adds the three things raw metadata can't give us:
  - volume by WORKFLOW (the jobs-to-be-done the team uses Claude for) + examples
  - a CONSERVATIVE, TRANSPARENT time-saved estimate (a low–high range, with the
    per-workflow minute bands recorded so the dashboard can show the assumptions)
  - a short plain-English narrative for the monthly meeting

CLASSIFICATION
--------------
Conversations are grouped by WORKFLOW (a job-to-be-done: "summarise a meeting",
"build a media plan", "measure ROI"), not by topic. We do NOT keyword-match —
that proved unreliable (a chat titled "Measuring AI ROI…" got mis-filed under
Creative because its prompt happened to mention the LTX tool). Instead Claude
reads the digest and assigns each conversation to a workflow with judgement,
writing a classification.json (cid -> workflow key). This script applies that
map. In the monthly workflow this is the `/usage-themes` Claude Code command.

If a conversation isn't in the map it falls to "misc" (and is reported), so a
stale map can never silently mis-bucket new chats.

Time-saved philosophy (rev. Jun 2026): driven by the TYPE OF WORKFLOW, not by
how many turns a conversation took. Every titled conversation classified into a
real workflow counts ONCE as one task of that type — a well-prompted one-shot
counts the same as a long back-and-forth, because good prompting shouldn't be
penalised. Each workflow has a minutes-saved band (the manual time that task
would otherwise take); the estimate is sum(conversations x per-workflow minutes),
shown as a LOW–HIGH range. The minute bands are anchored to agency-validated task
times (the ClickUp ROI scoping) and refined by a labelled-sample calibration.
Noise (untitled/abandoned chats and "Other & experiments") earns nothing.
"Getting started with Claude" DOES count — learning a workflow saves time, and
for the AI team it is the core delivery (onboarding the agencies). Better to
under-claim and be believed.
"""

import json
import os
import re
import argparse
from collections import Counter

# Uniform completion discount: the share of classified conversations assumed to
# have produced usable output. 1.0 = no discount (rely on the low end of each
# band for conservatism). A single transparent factor — NOT a per-conversation
# weight. Tune from the calibration sample.
COMPLETION_FACTOR = 1.0

# ── Taxonomy drift check ─────────────────────────────────────────────────────
# Each month, flag when too much of an agency's work is landing in "misc" — the
# signal that their conversation topics have evolved past the current category
# set and a new workflow may be warranted. Deliberately a prompt for a human
# decision, NOT an automatic taxonomy change (categories stay stable for trends).
DRIFT_MISC_SHARE_WARN = 0.15   # misc above this share of titled chats → review
DRIFT_UNMAPPED_WARN = 10       # this many titled-but-unclassified chats → review
_DRIFT_STOPWORDS = set((
    "the a an and or of to for in on with from your you it is are be as at by my our "
    "this that into out up new using use help review check analysis report data file "
    "claude based about over per via not no all can how what when team"
).split())


def detect_drift(workflows, unmapped, digest, classification):
    """Spot when the workflow taxonomy may no longer fit an agency's work.

    Returns a summary and prints a clear verdict. Drivers: the share of titled
    conversations that fall into misc/unclassified, plus the recurring words in
    those titles (a cluster there often means a missing category). This runs
    every month via analyze_usage, so drift is surfaced rather than relied on
    being spotted by eye.
    """
    cmap = (classification or {}).get("map", {})
    valid = {w["key"] for w in WORKFLOWS} - {"misc", "other"}
    titled = [c for c in digest["conversations"] if (c.get("title") or "").strip()]
    n = len(titled) or 1
    misc_titles = [(c.get("title") or "").strip() for c in titled
                   if cmap.get(c.get("cid")) not in valid]  # None / misc / unknown key
    misc_count = len(misc_titles)
    share = misc_count / n
    words = Counter()
    for t in misc_titles:
        for w in re.findall(r"[a-z]{3,}", t.lower()):
            if w not in _DRIFT_STOPWORDS:
                words[w] += 1
    recurring = [w for w, c in words.most_common(10) if c >= 3]
    flagged = share >= DRIFT_MISC_SHARE_WARN or len(unmapped) >= DRIFT_UNMAPPED_WARN
    drift = {
        "titled_conversations": len(titled),
        "misc_conversations": misc_count,
        "misc_share": round(share, 3),
        "unmapped_conversations": len(unmapped),
        "recurring_terms_in_misc": recurring,
        "review_recommended": flagged,
        "misc_titles": misc_titles[:30],
    }
    print("  ── Taxonomy drift check ──")
    print(f"  misc/unclassified: {misc_count}/{len(titled)} ({round(share * 100)}%)"
          f" · unmapped: {len(unmapped)}")
    if flagged:
        print("  ⚠ REVIEW: a chunk of work isn't fitting the current categories — "
              "consider adding/adjusting a workflow.")
        if recurring:
            print("    recurring terms in misc titles: " + ", ".join(recurring))
        print("    (see misc_titles in drift.json to judge whether a real theme is forming)")
    else:
        print("  ✓ taxonomy fits this month — misc within normal range.")
    return drift


# Time-saved is driven by WORKFLOW TYPE, not conversation length. Every titled
# conversation classified into a creditable workflow counts as one task of that
# type — see analyse(). There is deliberately no turn-based weighting or gate:
# a well-prompted one-shot is real work and counts the same as a long session.

# Workflow taxonomy: the jobs-to-be-done. low/high = conservative minutes saved
# per qualifying conversation (the manual time the job would otherwise take).
# Order here is the canonical display order before sorting by volume.
#
# TAXONOMY POLICY (shared core + per-agency extensions, then locked):
# This list is the SHARED CORE used for every agency. When onboarding a new
# agency, the /usage-themes step reads their conversations and appends any
# agency-specific workflow this core doesn't capture (e.g. a PR agency ->
# "Media relations & press outreach"). Once an agency's set is agreed it is
# LOCKED, so month-over-month trends and cross-agency comparison stay valid.
# Don't regenerate an agency's taxonomy from scratch each month — extend
# deliberately, with a note, only when the work genuinely shifts.
# Refined group taxonomy (Jun 2026): plain-English noun-phrase names, ROI merged
# into Reporting, IT support split out of Research, "People/HR" folded into Process.
# Keys are stable (so prior classification maps still apply); only labels changed,
# except 'roi' (merged -> 'reporting') and the new 'itsupport'.
# Jun 2026 split: the old "comms" (Emails & documents) bucket conflated two
# genuinely different workflows, so it's split into 'email' (inbox/replies — quick)
# and 'docs' (longer-form writing). 'comms' is kept below as a LEGACY entry so any
# older classification map still renders rather than collapsing into misc; new
# classifications should use 'email'/'docs'.
# BAND CALIBRATION (29 Jun 2026): low–high = typical manual minutes saved per task
# of this type. Estimated from a read of real conversation samples across all 8
# agencies (titles + first prompts) and anchored to the agencies' own ClickUp ROI
# scoping (per-task validated minutes: PR 480, Operations 360, Finance 165, Content
# 165, Media buying 120, Social 90, New biz 60, Creative 45, Reporting 30, Account
# 20, HR 18). These are scoped FLAGSHIP-task times, so our per-conversation bands
# sit at or below them — a conversation is not always a full scoped task. Bands now
# represent a TYPICAL task (no turn multiplier scales them up). Provenance: expert-
# estimated + ClickUp-anchored; the calibration worksheet stays open for agencies
# to validate/override, which would upgrade these to agency-signed-off.
WORKFLOWS = [
    {"key": "meetings",   "label": "Meeting & call notes",        "low": 10, "high": 25},
    {"key": "email",      "label": "Emails & inbox",              "low": 5,  "high": 15},
    {"key": "docs",       "label": "Documents & writing",         "low": 15, "high": 40},
    {"key": "newbiz",     "label": "New business & pitches",       "low": 30, "high": 90},
    {"key": "creative",   "label": "Creative & copywriting",      "low": 20, "high": 50},
    {"key": "campaigns",  "label": "Campaign & media planning",   "low": 25, "high": 60},
    {"key": "social",     "label": "Social channel management",   "low": 12, "high": 35},
    {"key": "pr",         "label": "PR & media relations",        "low": 25, "high": 60},
    {"key": "reporting",  "label": "Reporting & ROI",             "low": 15, "high": 40},
    {"key": "finance",    "label": "Finance & reconciliation",    "low": 25, "high": 75},
    {"key": "process",    "label": "Process & operations",        "low": 20, "high": 50},
    {"key": "legal",      "label": "Legal & compliance",          "low": 20, "high": 60},
    {"key": "data",       "label": "Spreadsheets & data prep",    "low": 10, "high": 35},
    {"key": "technical",  "label": "Tech & development",          "low": 30, "high": 90},
    {"key": "itsupport",  "label": "IT & tech support",           "low": 5,  "high": 25},
    {"key": "enablement", "label": "Getting started with Claude", "low": 10, "high": 30},
    {"key": "research",   "label": "Market & audience research",  "low": 10, "high": 40},
    {"key": "misc",       "label": "Other & experiments",         "low": 0,  "high": 0},
    # LEGACY (pre-Jun-2026 split). Not assigned to new conversations — kept only
    # so an older classification map renders as before instead of falling to misc.
    {"key": "comms",      "label": "Emails & documents",          "low": 8,  "high": 20},
]
WORKFLOW_BY_KEY = {w["key"]: w for w in WORKFLOWS}


def analyse(digest, classification):
    cmap = classification.get("map", {}) if classification else {}
    # Curated, plain-English, client-name-free content written by the /usage-themes
    # step: per-workflow example descriptions, and the standout-wins list. Both
    # are optional — without them we fall back to raw titles and no wins.
    cur_examples = classification.get("examples", {}) if classification else {}
    buckets = {w["key"]: {"label": w["label"], "low": w["low"], "high": w["high"],
                          "count": 0, "qualifying": 0, "credit": 0.0, "examples": []}
               for w in WORKFLOWS}
    unmapped = []

    for c in digest["conversations"]:
        title = (c.get("title") or "").strip()
        # Untitled conversations can't be categorised into a workflow (they're
        # typically very short/abandoned). They still count in the summary totals,
        # but we don't surface them in the "what they use Claude for" breakdown —
        # otherwise they pile into "misc" and overstate experimentation.
        if not title:
            continue
        key = cmap.get(c.get("cid"))
        if key not in WORKFLOW_BY_KEY:
            if title:
                unmapped.append(c.get("cid"))
            key = "misc"
        b = buckets[key]
        b["count"] += 1
        # Every titled conversation in a CREDITABLE workflow counts as one task of
        # that type. No turn gate, no turn weighting — workflow type drives value.
        # Non-creditable buckets (misc/other/enablement, band 0–0) contribute zero.
        if b["high"] > 0:
            b["qualifying"] += 1
            b["credit"] += 1
        if title and len(b["examples"]) < 4:
            b["examples"].append(title)

    workflows_out = []
    total_low = total_high = 0
    for w in WORKFLOWS:
        b = buckets[w["key"]]
        if b["count"] == 0:
            continue
        low = b["credit"] * b["low"] * COMPLETION_FACTOR
        high = b["credit"] * b["high"] * COMPLETION_FACTOR
        total_low += low
        total_high += high
        workflows_out.append({
            "key": w["key"],
            "label": b["label"],
            "conversations": b["count"],
            "qualifying": b["qualifying"],
            # Prefer curated plain-English descriptions; fall back to raw titles,
            # except for misc/other where raw titles are junk ("Numeric reference").
            "examples": cur_examples.get(w["key"]) or ([] if w["key"] in ("misc", "other") else b["examples"][:3]),
            "minutes_band": [b["low"], b["high"]],
            "hours_low": round(low / 60, 1),
            "hours_high": round(high / 60, 1),
        })
    workflows_out.sort(key=lambda w: w["conversations"], reverse=True)
    # Pin "misc/experimentation" to the bottom regardless of volume, so it never
    # competes with real workflows for top billing (stable sort keeps the rest).
    workflows_out.sort(key=lambda w: w["key"] in ("misc", "other"))

    time_saved = {
        "hours_low": round(total_low / 60),
        "hours_high": round(total_high / 60),
        "method": (
            "A deliberately conservative estimate, based on the TYPE of work. Each "
            "conversation is sorted into a workflow and counts once, saving the "
            "typical manual time that task takes (see the bands below). The minute "
            "bands come from time savings the agencies validated when scoping these "
            "workflows. Untitled or "
            "abandoned chats and pure experiments earn nothing. Shown as a low–high "
            "range."
        ),
    }
    # Standout wins (optional): keep only those tagged to a known workflow.
    wins = [w for w in (classification.get("wins", []) if classification else [])
            if isinstance(w, dict) and w.get("text")]
    return workflows_out, time_saved, unmapped, wins


def sanitise_keys(obj):
    """Firestore rejects empty-string field names ("Element at index 0 should
    not be an empty string"). A file with no extension / a blank file_type can
    land as a "" key in file_type_mix or a user's top_file_types. Recursively
    relabel any "" key to "unknown" (merging counts) so the upload can't fail —
    works regardless of who produced the upstream metrics (e.g. an agency that
    ran process_usage.py themselves)."""
    if isinstance(obj, dict):
        if "" in obj:
            v = obj.pop("")
            if isinstance(obj.get("unknown"), (int, float)) and isinstance(v, (int, float)):
                obj["unknown"] += v
            else:
                obj.setdefault("unknown", v)
        for v in obj.values():
            sanitise_keys(v)
    elif isinstance(obj, list):
        for v in obj:
            sanitise_keys(v)
    return obj


def build_prompt_quality(digest, classification):
    """Aggregate per-conversation prompt scores from classification.json into a
    summary block suitable for dashboard_data.json. Returns None if no scores
    are present (older classification files that pre-date this feature)."""
    if not classification:
        return None
    scores_map = classification.get("prompt_scores", {})
    if not scores_map:
        return None

    scored = []
    issue_counts = {}
    # Build a lookup so we can cross-reference cids that have a first_prompt
    prompt_cids = {c["cid"] for c in digest.get("conversations", []) if (c.get("first_prompt") or "").strip()}

    for cid, entry in scores_map.items():
        if cid not in prompt_cids:
            continue  # skip if the prompt was empty when we scored it
        score = entry.get("score")
        issue = entry.get("issue", "")
        if not isinstance(score, (int, float)) or score < 1 or score > 5:
            continue
        scored.append(score)
        if issue and issue != "good":
            issue_counts[issue] = issue_counts.get(issue, 0) + 1

    if not scored:
        return None

    avg = round(sum(scored) / len(scored), 1)
    dist = {str(i): 0 for i in range(1, 6)}
    for s in scored:
        dist[str(int(round(s)))] = dist.get(str(int(round(s))), 0) + 1

    # Top issues sorted by frequency; cap at 3
    top_issues = sorted(issue_counts.items(), key=lambda x: x[1], reverse=True)[:3]

    # Human-readable labels for issue tags
    ISSUE_LABELS = {
        "no_context":     "No background context given",
        "no_role":        "No role or perspective set",
        "no_format":      "Output format not specified",
        "vague_task":     "Task description too vague",
        "no_constraints": "Missing key constraints (audience, tone, brand)",
    }
    top_issues_out = [
        {"tag": tag, "label": ISSUE_LABELS.get(tag, tag), "count": count}
        for tag, count in top_issues
    ]

    tips = classification.get("prompt_quality_tips", [])

    return {
        "scored_count": len(scored),
        "avg_score": avg,
        "distribution": dist,
        "top_issues": top_issues_out,
        "tips": tips[:4],  # cap at 4
    }


def build_narrative(metrics, workflows, time_saved):
    s = metrics["summary"]
    # Lead with the most-used workflows, but never let "misc" be the headline.
    ranked = [w for w in workflows if w["key"] != "misc"] or workflows
    top = ranked[0]["label"].lower() if ranked else "general use"
    second = ranked[1]["label"].lower() if len(ranked) > 1 else None
    dormant = s["dormant_licences"]
    lead_in = f"{s['active_users']} of {s['licensed_users']} licences have been active to date"
    focus = f", with most activity in {top}"
    if second:
        focus += f" and {second}"
    action = ""
    if dormant > 0:
        action = f" {dormant} licence{'s' if dormant != 1 else ''} not yet active."
    roi = (f" Estimated time saved to date is roughly "
           f"{time_saved['hours_low']}–{time_saved['hours_high']} hours.")
    return lead_in + focus + "." + action + roi


def main():
    ap = argparse.ArgumentParser(description="Workflow analysis → dashboard_data.json")
    ap.add_argument("--in-dir", "-i", default=".", help="Folder with metrics.json + digest.json")
    ap.add_argument("--classification", "-c", default=None,
                    help="Path to classification.json (cid -> workflow). Default: <in-dir>/classification.json")
    ap.add_argument("--out", "-o", default=None, help="Output path (default: <in-dir>/dashboard_data.json)")
    args = ap.parse_args()

    metrics = json.load(open(os.path.join(args.in_dir, "metrics.json")))
    digest = json.load(open(os.path.join(args.in_dir, "digest.json")))
    cpath = args.classification or os.path.join(args.in_dir, "classification.json")
    classification = json.load(open(cpath)) if os.path.exists(cpath) else None
    if classification is None:
        print(f"  ⚠ No classification.json found at {cpath} — everything falls to 'misc'. "
              "Run the /usage-themes step first.")

    workflows, time_saved, unmapped, wins = analyse(digest, classification)
    narrative = build_narrative(metrics, workflows, time_saved)
    prompt_quality = build_prompt_quality(digest, classification)

    dashboard = dict(metrics)
    dashboard["workflows"] = workflows
    dashboard["time_saved"] = time_saved
    dashboard["narrative"] = narrative
    dashboard["wins"] = wins
    if prompt_quality:
        dashboard["prompt_quality"] = prompt_quality
    sanitise_keys(dashboard)  # strip Firestore-illegal empty-string keys

    out = args.out or os.path.join(args.in_dir, "dashboard_data.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(dashboard, f, indent=2)

    print(f"Wrote {out}")
    if workflows:
        print(f"  {len(workflows)} workflows · top: {workflows[0]['label']} ({workflows[0]['conversations']} convos)")
    print(f"  Time saved: {time_saved['hours_low']}–{time_saved['hours_high']} hours")
    if unmapped:
        print(f"  ⚠ {len(unmapped)} titled conversation(s) not in the classification map → counted as misc.")
    print(f"  Narrative: {narrative}")

    drift = detect_drift(workflows, unmapped, digest, classification)
    with open(os.path.join(args.in_dir, "drift.json"), "w", encoding="utf-8") as f:
        json.dump(drift, f, indent=2)


if __name__ == "__main__":
    main()
