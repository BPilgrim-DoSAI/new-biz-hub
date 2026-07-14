#!/usr/bin/env python3
"""
LTX Studio Usage Processor  (AI Hub edition)
=============================================
Reads the four CSV exports from LTX Studio's Enterprise PII Data Dashboard
and produces one `ltx_dashboard_data.json` per agency, ready to be uploaded
to Firestore by upload-ltx.mjs.

The CSVs (all exported on the same date from the LTX admin dashboard):
  - total_users_table_*.csv
  - total_credit_consumption_per_user_*.csv
  - total_generations_per_user_*.csv
  - total_credit_consumption_per_project_*.csv

Agency attribution is done by email domain — each domain maps to one agency.

USAGE
-----
  python3 scripts/usage/process_ltx.py \
      --input-dir "../../ai-usage-reporting/LTX Usage Data" \
      --period 2026-06 \
      --out-dir "../../ai-usage-reporting/LTX Usage Data/processed"

Outputs one file per agency:
  processed/<agency-key>/ltx_dashboard_data.json

PRIVACY
-------
User email addresses are NOT written to the output by default.
Users appear as "User 01", "User 02" etc., ordered by tokens consumed desc.
Pass --include-names to write "First L." masked names instead (for internal use;
document a lawful basis first).
"""

import csv
import json
import os
import sys
import argparse
import datetime
import re
from collections import defaultdict

# ── Domain → agency mapping ──────────────────────────────────────────────────
DOMAIN_TO_AGENCY = {
    'spotnyc.com':            ('spotco',         'Spot Co'),
    'themultipleagency.com':  ('multiple',       'The Multiple Agency'),
    'fold7.com':              ('fold7',          'Fold 7'),
    'dewynters.com':          ('dewynters',      'Dewynters'),
    'wearemakerlab.com':      ('makerlab',       'Maker Lab'),
    'soldout.co.uk':          ('sold-out',       'Sold Out'),
    'twelveam.com':           ('twelveam',       'Twelve AM'),
    'mxlocation.co':          ('mxus',           'MX US'),
    'miroma.com':             ('ai-team',        'AI Team'),
}

# ── Per-email overrides (take precedence over domain mapping) ─────────────────
# Use for individuals whose email domain maps to the wrong agency.
EMAIL_TO_AGENCY = {
    'aidan.shephard@miroma.com': ('miroma-group', 'Miroma Holdings Ltd'),
}

# ── Generation type grouping ──────────────────────────────────────────────────
# The CSVs have ~40 gen_type columns. We collapse them into display groups.
GEN_GROUPS = {
    'Generate Video': r'^Generate Video',
    'Generate Image': r'^Generate Image',
    'Upscale Video':  r'^Upscale Video',
    'Upscale Image':  r'^Upscale Image',
    'Audio to Video': r'^Audio2Video',
    'Background Removal': r'^Background Removal',
    'Retake':         r'^Retake',
    'Dubbing':        r'^Dubbing',
    'Shot Fix':       r'^Shot Fix',
    'SDR to HDR':     r'^SDR to HDR',
    'Storyline':      r'^Storyline',
    'Text to Speech': r'^Text to Speech',
}

def classify_gen_type(col_name):
    for group, pattern in GEN_GROUPS.items():
        if re.match(pattern, col_name):
            return group
    return 'Other'


def email_domain(email):
    if not email or '@' not in email:
        return None
    return email.strip().lower().split('@')[1]


def agency_for_email(email):
    normalised = (email or '').strip().lower()
    if normalised in EMAIL_TO_AGENCY:
        return EMAIL_TO_AGENCY[normalised]
    domain = email_domain(email)
    return DOMAIN_TO_AGENCY.get(domain)


def parse_int(val):
    """Strip commas and parse to int; return 0 on failure."""
    try:
        return int(str(val).replace(',', '').strip())
    except (ValueError, TypeError):
        return 0


def name_from_email(email):
    """Derive a readable name from an email address as a fallback.
    'tess.mckean@miroma.com' → 'Tess McKean'
    'miacovelli@spotnyc.com' → 'Miacovelli'
    """
    local = email.split('@')[0]
    parts = re.split(r'[._\-]', local)
    return ' '.join(p.capitalize() for p in parts if p) or email


def load_holder_names(licences_path):
    """
    Build an email → full name lookup from a Firestore licence backup JSON.
    Covers all agencies so one call serves all.
    Returns dict: { normalised_email: 'Full Name' }
    """
    if not licences_path or not os.path.exists(licences_path):
        return {}
    with open(licences_path, encoding='utf-8') as f:
        data = json.load(f)
    lookup = {}
    for agency in data.get('collections', {}).get('agencies', []):
        for tool in agency.get('data', {}).get('tools', []):
            for holder in tool.get('holders', []):
                email = holder.get('email', '').strip().lower()
                name  = holder.get('name', '').strip()
                if email and name:
                    lookup[email] = name
    return lookup


def load_agency_holder_emails(licences_path):
    """
    Build a per-agency holder email set from a Firestore licence backup.
    Returns dict: { agency_key: set(normalised_emails) }
    Only includes LTX Studio holders.

    The group-wide set (all LTX holders across every agency) is stored under
    the special key '__group__'. Use this to avoid false-positive unlicensed
    flags for people whose email domain maps to a different agency than the
    one their holder entry lives under (e.g. miroma.com users split between
    ai-team and miroma-group).
    """
    if not licences_path or not os.path.exists(licences_path):
        return {}
    with open(licences_path, encoding='utf-8') as f:
        data = json.load(f)
    result = {}
    group_all = set()
    for agency in data.get('collections', {}).get('agencies', []):
        agency_key = agency.get('id', '')
        for tool in agency.get('data', {}).get('tools', []):
            if tool.get('name') != 'LTX Studio':
                continue
            emails = set()
            for holder in tool.get('holders', []):
                email = holder.get('email', '').strip().lower()
                if email:
                    emails.add(email)
                    group_all.add(email)
            if emails:
                result[agency_key] = emails
    result['__group__'] = group_all
    return result


# ── CSV loading ───────────────────────────────────────────────────────────────

def find_csv(input_dir, keyword):
    for fname in os.listdir(input_dir):
        if keyword in fname and fname.endswith('.csv'):
            return os.path.join(input_dir, fname)
    raise FileNotFoundError(f"No CSV containing '{keyword}' found in {input_dir}")


def load_users_table(path):
    """Returns list of dicts keyed by column name."""
    rows = []
    with open(path, newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            rows.append(row)
    return rows


def load_wide_table(path):
    """
    Loads a wide CSV (users/projects as rows, gen_types as columns).
    Returns (rows, gen_type_cols) where gen_type_cols are column names
    after the fixed identity columns.
    """
    rows = []
    gen_cols = []
    with open(path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        # Fixed columns at the start; everything else is a gen_type
        fixed = {'org', 'email', 'user_type', 'lt_id', 'apollo_title',
                 'Project', 'project_name', 'Total'}
        gen_cols = [c for c in fieldnames if c not in fixed and c != 'Total']
        for row in reader:
            rows.append(row)
    return rows, gen_cols


# ── Per-agency aggregation ────────────────────────────────────────────────────

def build_agency_data(agency_key, agency_name, period,
                      users_rows, credit_rows, gen_rows,
                      gen_cols, holder_names=None, holder_emails=None):
    """
    Aggregate all four tables for one agency and return a dashboard dict.
    """
    # Filter to this agency
    def is_agency(row):
        key_email = row.get('email', '')
        result = agency_for_email(key_email)
        return result and result[0] == agency_key

    agency_users  = [r for r in users_rows  if is_agency(r)]
    agency_credit = [r for r in credit_rows if is_agency(r)]
    agency_gens   = [r for r in gen_rows    if is_agency(r)]

    if not agency_users:
        return None

    # ── Summary KPIs ──
    registered_users = len(agency_users)
    active_users = sum(1 for r in agency_users if parse_int(r.get('active_days', 0)) > 0)
    total_tokens = sum(parse_int(r.get('Tokens_consumed', 0)) for r in agency_users)
    group_holder_emails = (holder_emails or {}).get('__group__', set())
    licensed_active_users = sum(
        1 for r in agency_users
        if parse_int(r.get('active_days', 0)) > 0
        and (not group_holder_emails or r.get('email', '').lower().strip() in group_holder_emails)
    )

    # Video vs Image split from credit table
    video_tokens = 0
    image_tokens = 0
    for row in agency_credit:
        for col in gen_cols:
            val = parse_int(row.get(col, 0))
            group = classify_gen_type(col)
            if 'Video' in group:
                video_tokens += val
            elif 'Image' in group:
                image_tokens += val

    # ── Credit by gen group ──
    group_credits = defaultdict(int)
    for row in agency_credit:
        for col in gen_cols:
            val = parse_int(row.get(col, 0))
            if val:
                group_credits[classify_gen_type(col)] += val
    credit_by_type = [
        {'type': k, 'tokens': v}
        for k, v in sorted(group_credits.items(), key=lambda x: -x[1])
        if v > 0
    ]

    # ── Generation counts by group ──
    group_gens = defaultdict(int)
    for row in agency_gens:
        for col in gen_cols:
            val = parse_int(row.get(col, 0))
            if val:
                group_gens[classify_gen_type(col)] += val
    generations_by_type = [
        {'type': k, 'count': v}
        for k, v in sorted(group_gens.items(), key=lambda x: -x[1])
        if v > 0
    ]

    total_generations = sum(g['count'] for g in generations_by_type)

    # Estimated time saved: 10 iterations assumed per usable output.
    # Image-type gens: 30 min manual → 3 min saved each.
    # Video-type gens: 3 hrs manual → 18 min saved each.
    VIDEO_GEN_TYPES = {'Generate Video', 'Audio to Video', 'Retake'}
    IMAGE_GEN_TYPES = {'Generate Image', 'Upscale Image', 'Background Removal', 'Storyline'}
    video_gens = sum(g['count'] for g in generations_by_type if g['type'] in VIDEO_GEN_TYPES)
    image_gens = sum(g['count'] for g in generations_by_type if g['type'] in IMAGE_GEN_TYPES)
    estimated_hours_saved = round((video_gens * 18 + image_gens * 3) / 60, 1)

    # ── User roster ──
    # Sort by tokens desc. Name comes from the licence holders list (matched by
    # email) so the display name matches what's already in the hub. Falls back
    # to deriving a readable name from the email address if not found there.
    sorted_users = sorted(agency_users, key=lambda r: -parse_int(r.get('Tokens_consumed', 0)))
    roster = []
    holder_names = holder_names or {}
    group_emails_for_roster = (holder_emails or {}).get('__group__', set())
    for i, row in enumerate(sorted_users):
        email = row.get('email', '')
        label = holder_names.get(email.lower().strip()) or name_from_email(email)
        is_unlicensed = bool(group_emails_for_roster) and email.lower().strip() not in group_emails_for_roster
        # Find this user's credit breakdown
        credit_row = next((c for c in agency_credit if c.get('email', '') == email), {})
        user_groups = defaultdict(int)
        for col in gen_cols:
            val = parse_int(credit_row.get(col, 0))
            if val:
                user_groups[classify_gen_type(col)] += val

        roster.append({
            'label': label,
            'unlicensed': is_unlicensed,
            'user_type': row.get('user_type', ''),
            'apollo_title': row.get('apollo_title', '') or '',
            'active_days': parse_int(row.get('active_days', 0)),
            'tokens_consumed': parse_int(row.get('Tokens_consumed', 0)),
            'first_active': row.get('Day of first_active_dt', ''),
            'last_active': row.get('Day of last_active_dt', ''),
            'credit_by_type': [
                {'type': k, 'tokens': v}
                for k, v in sorted(user_groups.items(), key=lambda x: -x[1])
                if v > 0
            ],
        })

    # ── Top gen type label ──
    top_gen_type = credit_by_type[0]['type'] if credit_by_type else 'N/A'

    # ── Reconciliation: active LTX users not in hub holder list ──
    agency_holder_emails = (holder_emails or {}).get(agency_key, set())
    unlicensed = []
    if agency_holder_emails:
        for row in agency_users:
            email = row.get('email', '').strip().lower()
            tokens = parse_int(row.get('Tokens_consumed', 0))
            if tokens > 0 and email and email not in agency_holder_emails:
                label = (holder_names or {}).get(email) or name_from_email(email)
                unlicensed.append({
                    'label': label,
                    'user_type': row.get('user_type', ''),
                    'apollo_title': row.get('apollo_title', '') or '',
                    'active_days': parse_int(row.get('active_days', 0)),
                    'tokens_consumed': tokens,
                    'last_active': row.get('Day of last_active_dt', ''),
                })
    unlicensed.sort(key=lambda u: -u['tokens_consumed'])

    return {
        'period': period,
        'agency': agency_name,
        'agencyKey': agency_key,
        'summary': {
            'registered_users': registered_users,
            'active_users': active_users,
            'licensed_active_users': licensed_active_users,
            'total_tokens': total_tokens,
            'video_tokens': video_tokens,
            'image_tokens': image_tokens,
            'total_generations': total_generations,
            'top_gen_type': top_gen_type,
            'estimated_hours_saved': estimated_hours_saved,
        },
        'credit_by_type': credit_by_type,
        'generations_by_type': generations_by_type,
        'users': roster,
        'reconciliation': {
            'unlicensed_users': unlicensed,
        },
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Process LTX Studio usage CSVs into per-agency dashboard JSON.')
    parser.add_argument('--input-dir', required=True, help='Folder containing the four LTX CSV exports')
    parser.add_argument('--period', required=True, help='Reporting period in YYYY-MM format')
    parser.add_argument('--out-dir', required=True, help='Output directory (one subfolder per agency created here)')
    parser.add_argument('--licences', help='Path to a firestore-licences-backup-*.json for matching holder names. '
                        'Falls back to auto-detecting the newest backup in the ai-hub repo root.')
    parser.add_argument('--agency', help='Process only this agency key (omit to process all)')
    args = parser.parse_args()

    if not re.match(r'^\d{4}-\d{2}$', args.period):
        sys.exit(f"ERROR: period must be YYYY-MM, got '{args.period}'")

    input_dir = os.path.expanduser(args.input_dir)
    out_dir   = os.path.expanduser(args.out_dir)

    # Locate licence backup for name matching
    licences_path = args.licences
    if not licences_path:
        repo_root = os.path.join(os.path.dirname(__file__), '..', '..')
        candidates = sorted(
            f for f in os.listdir(repo_root)
            if f.startswith('firestore-licences-backup-') and f.endswith('.json')
        )
        if candidates:
            licences_path = os.path.join(repo_root, candidates[-1])
    holder_names  = load_holder_names(licences_path)
    holder_emails = load_agency_holder_emails(licences_path)
    if holder_names:
        print(f"  Names loaded from: {os.path.basename(licences_path)} ({len(holder_names)} holders)")
    else:
        print("  No licence backup found — names will be derived from email addresses")

    print(f"Loading CSVs from: {input_dir}")

    users_path  = find_csv(input_dir, 'total_users_table')
    credit_path = find_csv(input_dir, 'total_credit_consumption_per_user')
    gen_path    = find_csv(input_dir, 'total_generations_per_user')

    users_rows               = load_users_table(users_path)
    credit_rows, gen_cols    = load_wide_table(credit_path)
    gen_rows, _              = load_wide_table(gen_path)

    print(f"  {len(users_rows)} users, {len(credit_rows)} credit rows, {len(gen_rows)} gen rows")

    # Build the full list: domain-based agencies + override-only agencies
    # (e.g. miroma-group has no domain entry — it only appears via EMAIL_TO_AGENCY)
    seen = set()
    all_agencies = []
    for key, name in DOMAIN_TO_AGENCY.values():
        if key not in seen:
            seen.add(key)
            all_agencies.append((key, name))
    for key, name in EMAIL_TO_AGENCY.values():
        if key not in seen:
            seen.add(key)
            all_agencies.append((key, name))

    # Determine which agencies to process
    if args.agency:
        agencies_to_process = [(k, n) for k, n in all_agencies if k == args.agency]
        if not agencies_to_process:
            sys.exit(f"ERROR: unknown agency key '{args.agency}'")
    else:
        agencies_to_process = all_agencies

    written = 0
    for agency_key, agency_name in agencies_to_process:
        data = build_agency_data(
            agency_key, agency_name, args.period,
            users_rows, credit_rows, gen_rows, gen_cols,
            holder_names=holder_names,
            holder_emails=holder_emails,
        )
        if data is None:
            print(f"  {agency_name}: no users found — skipping")
            continue

        agency_out = os.path.join(out_dir, agency_key)
        os.makedirs(agency_out, exist_ok=True)
        out_path = os.path.join(agency_out, 'ltx_dashboard_data.json')
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        s = data['summary']
        print(f"  {agency_name}: {s['active_users']} active users, "
              f"{s['total_tokens']:,} tokens, "
              f"{s['total_generations']:,} generations → {out_path}")
        written += 1

    print(f"\nDone. {written} agency file(s) written.")


if __name__ == '__main__':
    main()
