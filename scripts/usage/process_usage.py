#!/usr/bin/env python3
"""
Claude Org Usage Processor  (AI Hub edition)
============================================
Turns a raw Claude.ai org data export into the inputs the AI Hub's per-agency
"Claude Usage" dashboard needs.

It produces TWO files per agency, deliberately separated:

  1. metrics.json   — aggregated metadata. NO message content. By DEFAULT no
                      personal names or emails either: people are pseudonymised
                      to "User NN". (See the free-text caveat below.)
  2. digest.json    — a compact, privacy-gated summary of each conversation
                      (title + flags, plus an optional truncated first prompt).
                      It is the privacy boundary for CONVERSATION CONTENT: titles
                      and prompts reach the analysis step only through this file,
                      so decide here exactly what crosses over. (The analysis step
                      also reads metrics.json, but only for aggregate numbers.)

A later Claude Code step reads digest.json + metrics.json and writes the final
enriched `dashboard_data.json` (themes, time-saved, narrative).

WHY pseudonymised by default (GDPR data-minimisation): agency admins see counts
and tiers ("3 power users, 1 dormant licence"), not named individuals. People are
mapped to stable labels (User 01, User 02 …) ordered by activity in the export.
Pass --include-names to add masked names ("First L.") for an agency's OWN internal
onboarding view (document a lawful basis first); --include-emails additionally
adds emails and only takes effect with --include-names.

FREE-TEXT CAVEAT: pseudonymisation covers the structured identity fields only.
Conversation titles (digest.json) and project names/descriptions (metrics.json)
are free text and can still contain client names or personal data — they are kept
because the theming step needs them. Treat both files as confidential, restrict
access, and delete the digest once classification is done.

USAGE
-----
Single agency (run from inside, or point at, the export folder):
    python3 process_usage.py --input "<export-folder>" --agency "AI Team" \
        --period 2026-05 --out-dir "<export-folder>"

Add --include-prompts to also place a truncated first human prompt in the
digest (richer themes, slightly higher privacy exposure). Titles-only is the
default and the low-risk option.

EXPORT FOLDER STRUCTURE (as exported from Claude org settings)
--------------------------------------------------------------
<agency-folder>/
    users.json
    conversations.json
    projects/<uuid>.json …
    design_chats/<uuid>.json …
"""

import json
import os
import sys
import math
import argparse
import datetime
from collections import defaultdict, Counter

try:
    # Stdlib since Python 3.9. Used only to localise activity timestamps.
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover - very old Python
    ZoneInfo = None

# How many characters of a first human prompt to keep when --include-prompts
# is set. Kept short on purpose: enough to classify a theme, not a transcript.
PROMPT_SNIPPET_LEN = 280

# Default timezone for the "when does the team use Claude" breakdowns. Export
# timestamps are UTC; we localise so day-of-week / hour-of-day read as the
# team's actual working hours. Override per agency with --timezone.
DEFAULT_TIMEZONE = "Europe/London"
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

# Central support/training licence. The AI team holds a seat on each agency's org
# (e.g. aiteam@miroma.com, aiteam@spotnyc.com) to test workflows and run training
# through it. Its activity is NOT the agency's own, so it's excluded by default —
# both its conversations and its seat (so the active-licence ratio stays honest).
# Matched on the email LOCAL-PART so it works across agency domains; override with
# --include-aiteam. Add other local-parts here if more shared seats appear.
SUPPORT_EMAIL_LOCALPARTS = {"aiteam"}


def is_support_account(email):
    """True if this email is the central AI-team support/training seat."""
    local = (email or "").split("@")[0].strip().lower()
    return local in SUPPORT_EMAIL_LOCALPARTS


# The AI Team is itself an agency on the Hub. On *its own* report the aiteam@…
# seat is the genuine primary licence — not a testing/training seat on someone
# else's org — so it must NOT be excluded. Detected from the agency name so the
# right thing happens automatically, without needing --include-aiteam each run.
OWN_TEAM_AGENCY_KEYS = {"ai-team", "ai team", "aiteam"}


def is_own_team_report(agency_name):
    """True if we're processing the AI Team's own export (vs another agency's)."""
    key = (agency_name or "").strip().lower()
    return key in OWN_TEAM_AGENCY_KEYS


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_json(path):
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def parse_date(dt_str):
    if not dt_str:
        return None
    return dt_str[:10]  # YYYY-MM-DD


def parse_datetime(dt_str, tz=None):
    """Parse an export timestamp (UTC ISO 8601) into an aware datetime.

    Used only for the activity-by-weekday / by-hour breakdowns. If a timezone
    is given the time is localised to it, so "when do they use Claude" reads as
    the team's working hours rather than UTC. Returns None if unparseable.
    """
    if not dt_str:
        return None
    s = dt_str.replace("Z", "+00:00")
    try:
        dt = datetime.datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    if tz is not None:
        dt = dt.astimezone(tz)
    return dt


def week_start(date_str):
    """Return the Monday of the week containing date_str."""
    d = datetime.date.fromisoformat(date_str)
    monday = d - datetime.timedelta(days=d.weekday())
    return str(monday)


def depth_label(tool_uses, thinking_blocks, human_turns):
    """
    Classify a user's depth of Claude usage:
      - advanced: heavy agentic / extended-thinking use (an embedded power user)
      - intermediate: some tool use / thinking
      - basic: standard chat only
    """
    if human_turns == 0:
        return "basic"
    agentic_ratio = (tool_uses + thinking_blocks) / max(human_turns, 1)
    if agentic_ratio > 5 or tool_uses > 50:
        return "advanced"
    elif agentic_ratio > 1 or tool_uses > 5:
        return "intermediate"
    else:
        return "basic"


def categorise_tool(block):
    """Map a raw tool_use block to a human-friendly category for the dashboard.

    The export names tools precisely (bash_tool, web_search, visualize:show_widget,
    MCP integrations …). Agency leads don't need the raw names, so we bucket them
    into a few plain-English groups. Unknown/new tools fall to "Other tools" so a
    future tool is never silently dropped.
    """
    name = (block.get("name") or "").lower()
    if name.startswith("visualize") or name in {"repl", "analysis"}:
        return "Data & visualisation"
    if block.get("is_mcp_app") or block.get("integration_name"):
        return "Connected apps"
    if name in {"web_search", "web_fetch"}:
        return "Web research"
    if name in {"bash_tool", "view", "str_replace", "str_replace_editor",
                "create_file", "present_files", "make_file", "edit_file"}:
        return "Code & files"
    return "Other tools"


def length_bucket(msg_count):
    """Bucket a conversation by message count for the length-distribution chart."""
    if msg_count <= 1:
        return "1 (abandoned)"
    if msg_count <= 5:
        return "2–5 (quick)"
    if msg_count <= 15:
        return "6–15 (working)"
    if msg_count <= 50:
        return "16–50 (deep)"
    return "51+ (extended)"


LENGTH_BUCKETS = ["1 (abandoned)", "2–5 (quick)", "6–15 (working)",
                  "16–50 (deep)", "51+ (extended)"]


def display_name(full_name, email):
    """Privacy-reduced label for the licence roster: first name + last initial
    (e.g. 'Tess M.'). Identifiable to an admin who knows their team, without
    publishing a full name. Falls back to the email local-part (never the
    domain) only when the export name is blank or a known placeholder, so the
    row still points to a real person for onboarding.
    """
    name = (full_name or "").strip()
    parts = name.split()
    if name.lower() in {"human", "unknown", "user", ""} or not parts:
        local = email.split("@")[0] if "@" in email else ""
        return local or "Unknown"
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][0]}."


# High-precision markers of a PERSONAL (non-work) or special-category chat, used
# to leave personal conversations out of the report entirely. Deliberately PHRASE-
# based (mostly possessive "my …") rather than broad single words, because a
# marketing/theatre agency's work vocabulary overlaps with personal life
# ("family show", "health campaign", "anniversary production"). This is a
# best-effort safety net: HIGH precision (few false positives), NOT high recall —
# it catches the obvious cases; the Claude theming step catches subtler ones.
# Edit this list to tune it for a given agency.
PERSONAL_MARKERS = [
    # family / relationships (possessive phrasing = personal, not "family show")
    "my mum", "my mom", "my dad", "my mother", "my father", "my wife",
    "my husband", "my partner", "my boyfriend", "my girlfriend", "my fiancé",
    "my fiancee", "my son", "my daughter", "my kids", "my family", "my marriage",
    # life admin / finances
    "my mortgage", "my landlord", "my tenancy", "personal loan", "my pension",
    "my tax return", "self assessment", "my visa", "passport application",
    # health / special-category. Includes a few standalone medical terms that are
    # very unlikely in marketing work (so they catch symptom-style titles with no
    # "my", e.g. "Left knee tightness on stairs"). Avoid words that double as work
    # vocabulary (e.g. "shoulder" → travel "shoulder season").
    "my doctor", "my gp", "my symptoms", "my diagnosis", "my medication",
    "my prescription", "my therapist", "my mental health", "my anxiety",
    "knee", "migraine", "physiotherapy", "doctor's appointment", "gp appointment",
    "blood pressure", "blood test", "sprained", "a rash",
    # job-hunting (personal, not the employer's work)
    "my cv", "my résumé", "my resume", "job application for", "cover letter for my",
    # personal occasions / writing
    "birthday message", "birthday card", "wedding speech", "best man speech",
    "maid of honour", "eulogy", "anniversary message",
    # clearly personal / sensitive standalone
    "divorce", "custody", "dating profile", "tinder",
]


def is_personal(title, prompt):
    """True if a conversation looks personal/sensitive (high-precision heuristic).

    Matches PERSONAL_MARKERS against the title and the opening human message. Used
    only locally to drop the conversation before anything is counted or written —
    the matched text never leaves the agency's machine.
    """
    text = f"{title or ''} {prompt or ''}".lower()
    return any(marker in text for marker in PERSONAL_MARKERS)


def first_human_text(convo):
    """Best-effort extraction of the first human prompt's text."""
    for m in convo.get("chat_messages", []):
        if m.get("sender") != "human":
            continue
        txt = (m.get("text") or "").strip()
        if not txt:
            # Fall back to text content blocks
            for b in m.get("content", []):
                if b.get("type") == "text" and (b.get("text") or "").strip():
                    txt = b["text"].strip()
                    break
        if txt:
            return txt
    return ""


# Attachment types on a Claude Design chat message that represent a real file
# the user brought in. "skill" and "text" attachments are system-injected
# project context (the Design Components spec, design-system tokens, tool
# results) — not something a person uploaded, so they're excluded from file
# counts to keep that metric meaningful.
DESIGN_ATTACHMENT_FILE_TYPES = {"file", "image"}


def load_design_chats(folder_path):
    """Load every design_chats/<uuid>.json file (Claude Design conversations)."""
    design_dir = os.path.join(folder_path, "design_chats")
    raw = []
    if os.path.isdir(design_dir):
        for fname in os.listdir(design_dir):
            if fname.endswith(".json"):
                d = load_json(os.path.join(design_dir, fname))
                if d:
                    raw.append(d)
    return raw


def normalize_design_chat(raw):
    """Adapt one design_chats/<uuid>.json entry into the same shape as a
    conversations.json entry, so it flows through the existing processing
    loop below unchanged (same counters, same digest format).

    Claude Design chats don't carry one top-level account the way a normal
    conversation does — each message names its own author. There's no
    reliable way to split a single design chat across several people's
    licence stats, so — consistent with how a whole conversation is already
    attributed to one account — the chat is attributed to whoever sent its
    first human message.
    """
    messages = raw.get("messages") or []
    first_author_uuid = None
    chat_messages = []
    for m in messages:
        c = m.get("content")
        if not isinstance(c, dict):
            continue
        role = c.get("role") or m.get("role")
        if role == "user":
            sender = "human"
        elif role == "assistant":
            sender = "assistant"
        else:
            continue
        if sender == "human" and first_author_uuid is None:
            first_author_uuid = c.get("authorAccountUuid")

        files = [{"file_name": att.get("name", "")}
                 for att in (c.get("attachments") or [])
                 if att.get("type") in DESIGN_ATTACHMENT_FILE_TYPES]

        content_blocks = []
        for b in (c.get("contentBlocks") or []):
            if b.get("type") == "tool_call":
                tool = b.get("toolCall") or {}
                content_blocks.append({"type": "tool_use", "name": tool.get("name", "")})
            elif b.get("type") == "thinking":
                content_blocks.append({"type": "thinking"})

        text = c.get("content") if isinstance(c.get("content"), str) else ""
        chat_messages.append({"sender": sender, "text": text, "files": files,
                              "attachments": [], "content": content_blocks})

    if not chat_messages:
        return None

    project_name = ((raw.get("project") or {}).get("name") or "").strip()
    title = (raw.get("title") or "").strip()
    # The project name is almost always far more descriptive than the chat's
    # own title, which the export leaves as "Chat" / "Untitled" by default.
    display_title = project_name or title

    return {
        "uuid": raw.get("uuid", ""),
        "account": {"uuid": first_author_uuid or ""},
        "name": display_title,
        "created_at": raw.get("created_at", ""),
        "chat_messages": chat_messages,
        "kind": "design",
    }


# ---------------------------------------------------------------------------
# Core processor
# ---------------------------------------------------------------------------

def process_agency(folder_path, agency_name, period, include_prompts, tz=None,
                   include_emails=False, include_names=False, exclude_personal=True,
                   exclude_support=True):
    """Process one agency's Claude export folder.

    Returns (metrics_dict, digest_dict, warnings_list).
    """
    warnings = []

    # --- Load raw data ---
    users_raw = load_json(os.path.join(folder_path, "users.json")) or []
    conversations_raw = load_json(os.path.join(folder_path, "conversations.json")) or []
    if not conversations_raw:
        warnings.append("No conversations.json found or it is empty — dashboard will be empty.")

    # --- Fold in Claude Design chats (design_chats/) alongside regular chats ---
    design_chats_raw = load_design_chats(folder_path)
    if design_chats_raw:
        design_normalized = [n for n in (normalize_design_chat(d) for d in design_chats_raw) if n]
        conversations_raw = conversations_raw + design_normalized
        warnings.append(
            f"Included {len(design_normalized)} Claude Design chat(s) from design_chats/, "
            f"each attributed to the first human author of that chat (see normalize_design_chat)."
        )

    # --- Drop the central AI-team support/training seat (default ON) ---
    # Remove it from the licensed roster AND collect its uuid(s) so its
    # conversations are skipped below — otherwise they'd be re-counted under an
    # "Unknown" account. excluded_support_count feeds a transparency line.
    #
    # Exception: on the AI Team's OWN report, aiteam@… is the genuine primary
    # licence (not a testing seat on another agency's org), so we keep it
    # automatically — this overrides the default exclusion regardless of flags.
    own_team = is_own_team_report(agency_name)
    if own_team and exclude_support:
        exclude_support = False
        warnings.append(
            "This is the AI Team's own report, so the aiteam@… seat is kept as "
            "its genuine licence (the default exclusion is for testing/training "
            "seats held on other agencies' orgs)."
        )
    excluded_support_uuids = set()
    excluded_support_count = 0
    if exclude_support:
        kept_users = []
        for u in users_raw:
            if is_support_account(u.get("email_address")):
                excluded_support_uuids.add(u.get("uuid"))
                excluded_support_count += 1
            else:
                kept_users.append(u)
        if excluded_support_count:
            warnings.append(
                f"Excluded {excluded_support_count} central AI-team support seat(s) "
                "(aiteam@…) from this agency's metrics. Use --include-aiteam to keep it."
            )
        users_raw = kept_users

    projects_raw = []
    projects_dir = os.path.join(folder_path, "projects")
    if os.path.isdir(projects_dir):
        for fname in os.listdir(projects_dir):
            if fname.endswith(".json"):
                p = load_json(os.path.join(projects_dir, fname))
                if p:
                    projects_raw.append(p)

    # --- Build user map UUID -> raw identity (used ONLY locally, never emitted) ---
    user_identity = {}
    for u in users_raw:
        user_identity[u["uuid"]] = {
            "name": u.get("full_name", "Unknown"),
            "email": u.get("email_address", ""),
        }

    # --- Per-user stats (keyed by uuid) ---
    def blank_stats():
        return {
            "conversations": 0,
            "human_turns": 0,
            "assistant_turns": 0,
            "total_messages": 0,
            "files_uploaded": 0,
            "attachments_uploaded": 0,
            "tool_uses": 0,
            "thinking_blocks": 0,
            "active_dates": set(),
            "convo_lengths": [],
            "file_types": Counter(),
        }

    user_stats = {uid: blank_stats() for uid in user_identity}
    weekly_convos = Counter()
    weekly_active = defaultdict(set)  # week -> {uuids active that week} (per-user trend)
    weekday_convos = Counter()   # 0=Mon … 6=Sun (localised)
    hourly_convos = Counter()    # 0–23 (localised)
    tool_categories = Counter()  # human-friendly tool-use groups across all convos
    file_type_mix = Counter()    # uploaded file types across all convos
    length_dist = Counter()      # conversation-length buckets across all convos
    thinking_convos = 0          # conversations that used extended thinking
    unknown_accounts = set()

    # --- Process conversations + build digest entries ---
    digest_convos = []
    excluded_personal = 0
    for convo in conversations_raw:
        acct_uuid = convo.get("account", {}).get("uuid", "")
        # Skip the central AI-team support seat's conversations (its seat was
        # already removed from the roster above). Done before any counting so its
        # activity can't slip back in under an "Unknown" account.
        if acct_uuid in excluded_support_uuids:
            continue
        # Drop likely-personal conversations BEFORE anything is counted or written,
        # so they never enter the metrics, the digest, or leave the machine.
        if exclude_personal and is_personal(convo.get("name") or "", first_human_text(convo)):
            excluded_personal += 1
            continue
        if acct_uuid not in user_stats:
            unknown_accounts.add(acct_uuid)
            user_stats[acct_uuid] = blank_stats()

        s = user_stats[acct_uuid]
        s["conversations"] += 1

        created_date = parse_date(convo.get("created_at", ""))
        if created_date:
            s["active_dates"].add(created_date)
            wk = week_start(created_date)
            weekly_convos[wk] += 1
            weekly_active[wk].add(acct_uuid)  # distinct people active that week
        # Localised when-do-they-use-Claude breakdowns (from the same timestamp).
        created_dt = parse_datetime(convo.get("created_at", ""), tz)
        if created_dt:
            weekday_convos[created_dt.weekday()] += 1
            hourly_convos[created_dt.hour] += 1

        msg_count = 0
        c_tool_uses = c_thinking = c_human = c_files = 0
        c_file_types = Counter()
        for msg in convo.get("chat_messages", []):
            sender = msg.get("sender", "")
            s["total_messages"] += 1
            msg_count += 1
            if sender == "human":
                s["human_turns"] += 1
                c_human += 1
            elif sender == "assistant":
                s["assistant_turns"] += 1

            for f in msg.get("files", []):
                s["files_uploaded"] += 1
                c_files += 1
                fname = f.get("file_name") or ""
                ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
                ext = ext or "unknown"  # never an empty key (Firestore-illegal)
                s["file_types"][ext] += 1
                c_file_types[ext] += 1
                file_type_mix[ext] += 1
            for att in msg.get("attachments", []):
                s["attachments_uploaded"] += 1
                ftype = (att.get("file_type") or "unknown")
                s["file_types"][ftype] += 1
                file_type_mix[ftype] += 1

            for block in msg.get("content", []):
                btype = block.get("type", "")
                if btype == "tool_use":
                    s["tool_uses"] += 1
                    c_tool_uses += 1
                    tool_categories[categorise_tool(block)] += 1
                elif btype == "thinking":
                    s["thinking_blocks"] += 1
                    c_thinking += 1

        s["convo_lengths"].append(msg_count)
        length_dist[length_bucket(msg_count)] += 1
        if c_thinking > 0:
            thinking_convos += 1

        # ---- Digest entry (the privacy gate) ----
        entry = {
            "cid": convo.get("uuid", "")[:8],
            "title": (convo.get("name") or "").strip(),
            "week": week_start(created_date) if created_date else None,
            "human_turns": c_human,
            "messages": msg_count,
            "tool_uses": c_tool_uses,
            "thinking_blocks": c_thinking,
            "files": c_files,
            "file_types": dict(c_file_types),
            "kind": convo.get("kind", "chat"),
        }
        if include_prompts:
            entry["first_prompt"] = first_human_text(convo)[:PROMPT_SNIPPET_LEN]
        digest_convos.append(entry)

    if unknown_accounts:
        warnings.append(
            f"{len(unknown_accounts)} conversation account(s) not present in users.json "
            "— reported as off-roster activity (not counted as active users). Likely "
            "leavers, or seats missing from this export; verify the Claude roster."
        )

    # --- Anonymisation map: uuid -> "User NN" ordered by human_turns desc ---
    ordered_uids = sorted(
        user_stats.keys(),
        key=lambda u: user_stats[u]["human_turns"],
        reverse=True,
    )
    anon_label = {uid: f"User {i + 1:02d}" for i, uid in enumerate(ordered_uids)}

    # --- Data-quality validation (names/emails checked here, before they're dropped) ---
    for uid, ident in user_identity.items():
        name = (ident.get("name") or "").strip()
        email = (ident.get("email") or "").strip()
        local = email.split("@")[0].lower() if "@" in email else ""
        # Flag obviously placeholder/mismatched names (e.g. full_name "Human")
        if name.lower() in {"human", "unknown", "user", ""}:
            warnings.append(f"User {email or uid}: placeholder/blank name '{name}' in export.")
        elif local and name and name.split()[0].lower() not in local and local not in name.lower():
            warnings.append(
                f"User {email}: export name '{name}' doesn't match the email — verify identity."
            )

    # --- Per-user tiers (counts + pseudonymous label by default) ---
    # GDPR data-minimisation: the default output carries NO names — only the
    # "User NN" pseudonym. A name is added ONLY with --include-names (an agency
    # running this internally for its own onboarding, with a documented basis).
    users_out = []
    for uid in ordered_uids:
        s = user_stats[uid]
        avg_depth = (sum(s["convo_lengths"]) / len(s["convo_lengths"])) if s["convo_lengths"] else 0
        ident = user_identity.get(uid, {})
        row = {
            "label": anon_label[uid],
            "conversations": s["conversations"],
            "human_turns": s["human_turns"],
            "total_messages": s["total_messages"],
            "avg_msgs_per_convo": round(avg_depth, 1),
            "files_uploaded": s["files_uploaded"],
            "tool_uses": s["tool_uses"],
            "thinking_blocks": s["thinking_blocks"],
            "active_days": len(s["active_dates"]),
            "depth": depth_label(s["tool_uses"], s["thinking_blocks"], s["human_turns"]),
            "top_file_types": dict(s["file_types"].most_common(5)),
        }
        if include_names:
            row["name"] = display_name(ident.get("name"), (ident.get("email") or "").strip())
        users_out.append(row)

    # --- Reference date for "lapsed" detection ---
    # We anchor recency to the LATEST activity in the export (≈ the export date),
    # not the wall clock, so the result is deterministic and reproducible. "Lapsed"
    # therefore means "hadn't used Claude in the 30 days before this export".
    all_active_dates = set()
    for st in user_stats.values():
        all_active_dates |= st.get("active_dates", set())
    as_of = max(all_active_dates) if all_active_dates else None
    as_of_date = datetime.date.fromisoformat(as_of) if as_of else None
    RECENT_DAYS = 7    # active within a week = currently engaged
    LAPSED_DAYS = 30   # active before, but quiet for >30 days = re-engagement target

    # Length of the reporting window in weeks, so the power-user bar can be a
    # consistent per-week RATE rather than a fixed count (fair across a 3-week
    # onboarding export and a full month). Derived from the span of weeks that
    # actually have activity.
    if weekly_convos:
        _wk = sorted(weekly_convos.keys())
        span_weeks = (datetime.date.fromisoformat(_wk[-1]) -
                      datetime.date.fromisoformat(_wk[0])).days // 7 + 1
    else:
        span_weeks = 1
    # Power-user bar — deliberately HIGH ("truly embedded into their workflow",
    # not merely "active"). Sustained, near-daily, deep use:
    #   • advanced depth (heavy tool / extended-thinking use), AND
    #   • real recurring volume — averages POWER_MIN_CONVOS_PER_WEEK+ a week, AND
    #   • sustained — active in at least POWER_MIN_WEEK_SHARE of the period's weeks
    #     (a one-week burst doesn't count; they keep coming back).
    # Tune these two numbers if the bar feels off for an agency.
    POWER_MIN_CONVOS_PER_WEEK = 5
    POWER_MIN_WEEK_SHARE = 0.7
    power_min_convos = POWER_MIN_CONVOS_PER_WEEK * span_weeks
    power_min_weeks = max(math.ceil(POWER_MIN_WEEK_SHARE * span_weeks), 1)

    # --- Licence roster. Powers the "not yet active" onboarding list.
    #     PSEUDONYMOUS by default ("User NN"); a name appears only with
    #     --include-names (agency-internal use, documented basis). Only LICENSED
    #     users (in users.json) appear — ad-hoc/unknown accounts don't hold a seat. ---
    licences_out = []
    for uid, ident in user_identity.items():
        s = user_stats.get(uid, {})
        convos = s.get("conversations", 0)
        active_dates = s.get("active_dates", set())
        last_active = max(active_dates) if active_dates else None
        days_since_active = None
        if last_active and as_of_date:
            days_since_active = (as_of_date - datetime.date.fromisoformat(last_active)).days
        depth = depth_label(s.get("tool_uses", 0), s.get("thinking_blocks", 0), s.get("human_turns", 0))
        # Power user = sustained, near-daily, deep use (see the bar defined above).
        # advanced depth + an average of POWER_MIN_CONVOS_PER_WEEK+ conversations a
        # week + active across at least POWER_MIN_WEEK_SHARE of the reporting weeks.
        active_weeks = {week_start(d) for d in active_dates}
        power_user = (depth == "advanced"
                      and convos >= power_min_convos
                      and len(active_weeks) >= power_min_weeks)
        # Three-way status: never started (dormant), started then went quiet
        # (lapsed), or currently active. Lapsed is the new re-engagement signal.
        if convos == 0:
            status = "dormant"
        elif days_since_active is not None and days_since_active > LAPSED_DAYS:
            status = "lapsed"
        else:
            status = "active"
        # GDPR data-minimisation: default roster is PSEUDONYMOUS ("User NN", the
        # same label as users[]), so "User 04 is dormant" works without a name
        # leaving the agency. Name appears only with --include-names; email only
        # with --include-names AND --include-emails. Without names the agency maps
        # the pseudonym back to a person locally.
        row = {
            "label": anon_label[uid],
            "conversations": convos,
            "active_days": len(active_dates),
            "last_active": last_active,
            "days_since_active": days_since_active,
            "depth": depth,
            "status": status,
            "power_user": power_user,
        }
        if include_names:
            row["name"] = display_name(ident.get("name"), (ident.get("email") or "").strip())
            if include_emails:
                row["email"] = (ident.get("email") or "").strip()
        licences_out.append(row)
    # Order by who needs attention most: dormant → lapsed → active, then by volume.
    status_order = {"dormant": 0, "lapsed": 1, "active": 2}
    licences_out.sort(key=lambda u: (status_order.get(u["status"], 3), u["conversations"]))

    # --- Weekly activity series (gap-filled) ---
    weekly_out = []
    if weekly_convos:
        all_weeks = sorted(weekly_convos.keys())
        cur = datetime.date.fromisoformat(all_weeks[0])
        end = datetime.date.fromisoformat(all_weeks[-1])
        while cur <= end:
            wk = str(cur)
            weekly_out.append({
                "week": wk,
                "conversations": weekly_convos.get(wk, 0),
                # Distinct people active that week — lets the dashboard show
                # conversations PER ACTIVE USER, so agencies of different sizes
                # (and "one heavy user vs the whole team") compare fairly.
                "active_users": len(weekly_active.get(wk, set())),
            })
            cur += datetime.timedelta(weeks=1)

    # --- Activity by weekday & hour (localised "when do they use Claude") ---
    # Always full Mon–Sun and 0–23 so the dashboard renders an even axis with
    # zero bars rather than gaps.
    weekday_out = [{"day": WEEKDAYS[i], "conversations": weekday_convos.get(i, 0)}
                   for i in range(7)]
    hourly_out = [{"hour": h, "conversations": hourly_convos.get(h, 0)}
                  for h in range(24)]

    # --- Projects ---
    # Creator shows who builds reusable assets (the project champions). GDPR
    # data-minimisation: pseudonymous ("User NN") by default, resolved via the
    # creator uuid; a masked name appears only with --include-names. Creators not
    # in the activity map (e.g. left the org) fall back to "Unknown".
    #
    # AI-team projects are KEPT (not dropped with the excluded seat): the central
    # team builds shared Projects FOR the agency's users, so they belong in the
    # agency's report. We just attribute them to "AI Team" rather than "Unknown"
    # (the seat itself is excluded from all the usage/active/power metrics above).
    projects_out = []
    for p in projects_raw:
        creator = p.get("creator") or {}
        c_uuid = creator.get("uuid")
        if c_uuid in excluded_support_uuids:
            created_by = "AI Team"
        elif include_names:
            c_ident = user_identity.get(c_uuid, {})
            created_by = display_name(
                c_ident.get("name") or creator.get("full_name"),
                (c_ident.get("email") or "").strip(),
            )
        else:
            created_by = anon_label.get(c_uuid, "Unknown")
        projects_out.append({
            "name": p.get("name", "") or "Untitled",
            "created_by": created_by,
            "description": (p.get("description") or "")[:200],
            "is_private": p.get("is_private", False),
            "created_at": parse_date(p.get("created_at", "")),
            # last_updated = when the project was last EDITED (its files/instructions
            # changed). It is NOT a usage signal: someone can chat with a project
            # daily without editing it, and the export gives us no per-project usage
            # count (conversations don't link to projects). Shown as a neutral fact.
            "last_updated": parse_date(p.get("updated_at", "")),
            "has_system_prompt": bool((p.get("prompt_template") or "").strip()),
            "docs_count": len(p.get("docs", [])),
            # Starter projects are Claude's built-in demos, not real team assets —
            # flagged so the dashboard can exclude them from "real project" counts.
            "is_starter": p.get("is_starter_project", False),
            # Well-configured = a reusable asset: has instructions AND reference docs.
            "well_configured": bool((p.get("prompt_template") or "").strip()) and len(p.get("docs", [])) > 0,
        })
    projects_out.sort(key=lambda p: p.get("last_updated") or "", reverse=True)

    # --- Summary totals ---
    total_convos = sum(u["conversations"] for u in users_out)
    total_human_turns = sum(u["human_turns"] for u in users_out)
    # "Active" is counted against the LICENCE ROSTER — a licensed seat that logged at
    # least one conversation this period — so the headline reconciles to
    # licensed_users (both are roster-based). Activity from accounts that AREN'T on
    # the roster (people who have since left the org, or seats missing from this
    # export's users.json) is real work, but it isn't a current seat: counting it as
    # an "active user" silently inflated the figure and masked never-used seats
    # (Spot Co showed "1 dormant" hiding 3 never-used seats, Jul 2026). Such activity
    # is now reported separately as offroster_* below instead of inflating active.
    active_licences = [l for l in licences_out if l["conversations"] > 0]
    active_users = len(active_licences)
    advanced = sum(1 for l in active_licences if l["depth"] == "advanced")
    intermediate = sum(1 for l in active_licences if l["depth"] == "intermediate")
    basic = sum(1 for l in active_licences if l["depth"] == "basic")
    # Off-roster activity: accounts present in conversations.json with no seat in
    # users.json. Surfaced as a transparency line (and by the reconcile gate) so a
    # roster/board mismatch is investigated, not hidden.
    offroster_accounts = len(unknown_accounts)
    offroster_conversations = sum(user_stats[uid]["conversations"] for uid in unknown_accounts)
    # Power users = the single "top user" tier on the dashboard: advanced use AND
    # real volume AND recurrence (a strict subset of "advanced"; see power_user flag).
    power_users = sum(1 for l in licences_out if l.get("power_user"))
    shared_projects = sum(1 for p in projects_out if not p["is_private"])

    # Licence engagement states (named-roster based; licensed users only).
    lapsed_licences = sum(1 for l in licences_out if l["status"] == "lapsed")
    recently_active = sum(1 for l in licences_out
                          if l["status"] == "active" and l.get("days_since_active") is not None
                          and l["days_since_active"] <= RECENT_DAYS)
    # Project hygiene.
    starter_projects = sum(1 for p in projects_out if p["is_starter"])
    real_projects = len(projects_out) - starter_projects
    well_configured_projects = sum(1 for p in projects_out if p["well_configured"] and not p["is_starter"])
    # Extended-thinking reach.
    thinking_usage_pct = round(thinking_convos / total_convos * 100, 1) if total_convos else 0

    metrics = {
        "agency": agency_name,
        "period": period,
        "generated_at": period + "-01",  # deterministic; avoids embedding run time
        "summary": {
            "licensed_users": len(users_raw),
            "active_users": active_users,
            "total_conversations": total_convos,
            "total_human_turns": total_human_turns,
            "avg_turns_per_convo": round(total_human_turns / total_convos, 1) if total_convos else 0,
            "total_files_uploaded": sum(u["files_uploaded"] for u in users_out),
            "total_tool_uses": sum(u["tool_uses"] for u in users_out),
            "total_projects": len(projects_out),
            "shared_projects": shared_projects,
            "agentic_usage_pct": round(advanced / active_users * 100, 1) if active_users else 0,
            "depth_breakdown": {"advanced": advanced, "intermediate": intermediate, "basic": basic},
            "power_users": power_users,
            # The bar used for power_users this period (so the dashboard can
            # describe it accurately rather than hard-coding a guess).
            "power_user_rule": {
                "min_convos_per_week": POWER_MIN_CONVOS_PER_WEEK,
                "min_week_share": POWER_MIN_WEEK_SHARE,
                "reporting_weeks": span_weeks,
                "min_convos": power_min_convos,
                "min_active_weeks": power_min_weeks,
            },
            "dormant_licences": max(len(users_raw) - active_users, 0),
            # Real activity from accounts NOT on the current licence roster (likely
            # leavers, or seats missing from this export). Reported, never folded into
            # active_users — see the note by active_licences above.
            "offroster_accounts": offroster_accounts,
            "offroster_conversations": offroster_conversations,
            # Engagement states (licensed roster): started-then-quiet vs currently engaged.
            "lapsed_licences": lapsed_licences,
            "recently_active_users": recently_active,
            # Extended-thinking reach across conversations.
            "thinking_conversations": thinking_convos,
            "thinking_usage_pct": thinking_usage_pct,
            # Project hygiene: starter demos excluded; "well-configured" = reusable asset.
            "starter_projects": starter_projects,
            "real_projects": real_projects,
            "well_configured_projects": well_configured_projects,
        },
        # As-of date used for the lapsed/recently-active calc (latest activity in export).
        "as_of": as_of,
        # Conversations dropped as likely-personal before processing (privacy filter).
        # A transparency count only — the chats themselves are never counted or stored.
        "excluded_personal_conversations": excluded_personal,
        # Central AI-team support/training seat(s) removed from this agency's metrics
        # (excluded by default; see SUPPORT_EMAIL_LOCALPARTS).
        "excluded_support_seats": excluded_support_count,
        "weekly_activity": weekly_out,
        # Localised to activity_timezone (see below). Derived from conversation
        # timestamps only — no extra data exposure beyond what weekly_activity uses.
        "weekday_activity": weekday_out,
        "hourly_activity": hourly_out,
        "activity_timezone": (str(tz) if tz is not None else "UTC"),
        # What kind of power use: tool-uses grouped into plain-English categories.
        "tool_use_by_category": dict(tool_categories.most_common()),
        # Top uploaded file types across all conversations (work-type proxy).
        "file_type_mix": dict(file_type_mix.most_common(10)),
        # Conversation-length distribution (quick lookups vs deep work).
        "length_distribution": [{"bucket": b, "conversations": length_dist.get(b, 0)}
                                for b in LENGTH_BUCKETS],
        "users": users_out,
        "licences": licences_out,
        "projects": projects_out,
        "scope": {
            "source": "Claude.ai — web & desktop apps",
            "includes": "All chats, projects and Claude Design work for licensed users — including when Claude writes code, builds files or runs analysis inside a chat.",
            "excludes": "Direct Claude API / Console usage and other AI tools (LTX, Fireflies, etc.). "
                        + ("Conversations flagged as likely personal are excluded. " if exclude_personal else "")
                        + ("The central AI-team support/training seat is excluded. " if (exclude_support and excluded_support_count) else ""),
        },
    }

    digest = {
        "agency": agency_name,
        "period": period,
        "include_prompts": include_prompts,
        "conversation_count": len(digest_convos),
        "conversations": digest_convos,
    }

    return metrics, digest, warnings


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def infer_period(folder_path):
    """Guess YYYY-MM from the latest conversation created_at, else today."""
    convos = load_json(os.path.join(folder_path, "conversations.json")) or []
    dates = [parse_date(c.get("created_at", "")) for c in convos]
    dates = [d for d in dates if d]
    if dates:
        return max(dates)[:7]
    return datetime.date.today().isoformat()[:7]


def main():
    ap = argparse.ArgumentParser(description="Process a Claude org export for the AI Hub usage dashboard.")
    ap.add_argument("--input", "-i", default=".", help="Path to the agency export folder")
    ap.add_argument("--agency", "-a", default="Agency", help="Agency display name")
    ap.add_argument("--period", "-p", default=None, help="Reporting period YYYY-MM (inferred if omitted)")
    ap.add_argument("--out-dir", "-o", default=None, help="Where to write metrics.json / digest.json (default: input folder)")
    ap.add_argument("--include-prompts", action="store_true",
                    help="Include a truncated first prompt per conversation in the digest (richer themes, higher exposure).")
    ap.add_argument("--timezone", "-z", default=DEFAULT_TIMEZONE,
                    help=f"Timezone for the weekday/hour activity breakdowns (default: {DEFAULT_TIMEZONE}). "
                         "Set to the agency's working timezone, e.g. America/New_York.")
    ap.add_argument("--include-personal", action="store_true",
                    help="Keep conversations that look personal/sensitive. DEFAULT: OFF — likely-personal "
                         "chats (matched on title/first message against PERSONAL_MARKERS) are dropped entirely "
                         "before counting. High-precision heuristic, not a guarantee.")
    ap.add_argument("--include-aiteam", action="store_true",
                    help="Keep the central AI-team support/training seat (aiteam@…) in this agency's metrics. "
                         "DEFAULT: OFF — it's excluded (both its conversations and its seat) because it's used "
                         "for testing workflows and running training, not the agency's own work.")
    ap.add_argument("--include-names", action="store_true",
                    help="Include personal names (masked 'First L.') in users/licences/projects. "
                         "DEFAULT: OFF — output is fully pseudonymised ('User NN') for GDPR data-minimisation. "
                         "Turn on only for an agency's own internal onboarding view, with a documented lawful basis.")
    ap.add_argument("--include-emails", action="store_true",
                    help="Include full email addresses in the licence roster. Only takes effect together with "
                         "--include-names. Use only when central onboarding genuinely needs contact addresses.")
    args = ap.parse_args()

    folder = args.input
    if not os.path.isdir(folder):
        print(f"ERROR: input folder not found: {folder}", file=sys.stderr)
        sys.exit(1)

    period = args.period or infer_period(folder)
    out_dir = args.out_dir or folder

    # Resolve the timezone; fall back to UTC (with a warning) if unavailable.
    tz = None
    tz_warning = None
    if ZoneInfo is not None:
        try:
            tz = ZoneInfo(args.timezone)
        except Exception:
            tz_warning = f"Unknown timezone '{args.timezone}' — activity breakdowns left in UTC."
    else:
        tz_warning = "zoneinfo unavailable — activity breakdowns left in UTC."

    metrics, digest, warnings = process_agency(folder, args.agency, period, args.include_prompts, tz,
                                               args.include_emails, args.include_names,
                                               exclude_personal=not args.include_personal,
                                               exclude_support=not args.include_aiteam)
    if tz_warning:
        warnings.append(tz_warning)

    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "metrics.json"), "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)
    with open(os.path.join(out_dir, "digest.json"), "w", encoding="utf-8") as f:
        json.dump(digest, f, indent=2)

    s = metrics["summary"]
    print(f"Agency:  {args.agency}   Period: {period}")
    print(f"  {s['active_users']}/{s['licensed_users']} licences active · "
          f"{s['total_conversations']} conversations · {s['total_projects']} projects "
          f"({s['shared_projects']} shared)")
    print(f"  Wrote metrics.json + digest.json ({digest['conversation_count']} convos) to {out_dir}")
    excluded = metrics.get("excluded_personal_conversations", 0)
    if excluded:
        print(f"  Excluded {excluded} conversation(s) flagged as likely personal (privacy filter).")
    support = metrics.get("excluded_support_seats", 0)
    if support:
        print(f"  Excluded {support} central AI-team support seat(s) (aiteam@…) — pass --include-aiteam to keep.")
    off_acc = s.get("offroster_accounts", 0)
    if off_acc:
        print(f"  {off_acc} account(s) with {s.get('offroster_conversations', 0)} conversation(s) are NOT on the "
              f"licence roster (likely leavers / missing from this export) — reported separately, not counted as active. "
              f"Check the roster in Agency Oversight.")
    if warnings:
        print("\n  Validation warnings:")
        for w in warnings:
            print(f"   ⚠ {w}")


if __name__ == "__main__":
    main()
