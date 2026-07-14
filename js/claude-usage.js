/* =============================================================
   MIROMA AI HUB — Claude Usage dashboard renderer
   -------------------------------------------------------------
   Pure rendering: renderClaudeUsage(container, data, opts) takes a
   dashboard_data.json object (as produced by scripts/usage/analyze_usage.py)
   and paints the per-agency Claude usage view.

   No data fetching here. Phase 1 feeds it a local sample (usage-preview.html);
   Phase 2 will feed it a Firestore doc from /claude_usage/{agencyKey}, mounted
   inside the Agency Oversight admin panel behind canAccessAgency().

   `opts.previous` (optional) is the prior month's data object — when present,
   KPI cards show month-over-month deltas. Without it, cards show a "baseline"
   badge (first reporting month).
   ============================================================= */
(function (global) {
  'use strict';

  // Shared chart palette — keeps colour meaning consistent across the dashboard.
  // Greens form one intensity ramp (darkest = strongest use / most recent); amber
  // is reserved for the single "needs attention" state (lapsed); neutral grey =
  // none / not-yet-active; ink is for plain single-series volume bars.
  // Dark studio palette — monochrome white ramp; yellow is the sole accent.
  // Colours are CSS variables (defined in css/claude-usage.css) so they flip to
  // dark inks when the report is printed / saved as PDF. Do NOT hard-code white
  // here — that's what made charts vanish on the white PDF page.
  var PALETTE = {
    ink:     'var(--cu-bar)',
    green1:  'var(--cu-ramp1)',
    green2:  'var(--cu-ramp2)',
    green3:  'var(--cu-ramp3)',
    amber:   'var(--cu-amber)',
    neutral: 'var(--cu-ramp4)',
    mute:    'var(--c-stone)'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtMonth(period) {
    // "2026-05" -> "May 2026"
    if (!period || period.length < 7) return esc(period || '');
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var y = period.slice(0, 4), m = parseInt(period.slice(5, 7), 10);
    return months[m - 1] + ' ' + y;
  }

  function deltaHTML(curr, prev, suffix) {
    if (prev == null || prev === undefined) {
      return '<span class="cu-kpi__delta cu-kpi__delta--flat">— baseline month</span>';
    }
    var diff = curr - prev;
    if (diff === 0) return '<span class="cu-kpi__delta cu-kpi__delta--flat">no change</span>';
    var up = diff > 0;
    var pct = prev ? Math.round(Math.abs(diff) / prev * 100) : null;
    var cls = up ? 'cu-kpi__delta--up' : 'cu-kpi__delta--down';
    var arrow = up ? '▲' : '▼';
    var mag = pct != null ? pct + '%' : Math.abs(diff);
    return '<span class="cu-kpi__delta ' + cls + '">' + arrow + ' ' + mag + ' ' + (suffix || 'vs last month') + '</span>';
  }

  // `tight` is decided ONCE across the whole KPI row (see the call site),
  // not per-card — sizing each card off its own value independently made a
  // short "354" render large right next to a shrunk "~93–243 h", which read
  // as inconsistent. All four cards in a row now share one size, chosen so
  // the row's longest value still fits without wrapping.
  function kpiCard(label, value, sub, deltaHtml, highlight, tight) {
    return '<div class="cu-kpi' + (highlight ? ' cu-kpi--hl' : '') + '">' +
      '<div class="cu-kpi__label">' + esc(label) + '</div>' +
      '<div class="cu-kpi__value' + (tight ? ' cu-kpi__value--tight' : '') + '">' + value + '</div>' +
      (sub ? '<div class="cu-kpi__sub">' + sub + '</div>' : '') +
      (deltaHtml || '') +
    '</div>';
  }

  // Plain-text length of a KPI value (tags stripped) — used to decide whether
  // the whole row needs the smaller clamp so nothing wraps.
  function kpiValueLen(value) {
    return String(value).replace(/<[^>]*>/g, '').length;
  }

  function trendChart(weekly) {
    if (!weekly || !weekly.length) return '<p class="cu-card__sub">No weekly data.</p>';
    // Show conversations PER ACTIVE USER each week — normalised so a big agency and
    // a small one are comparable, and so one heavy user can't masquerade as a whole
    // engaged team. Each bar's height is the per-user rate; the active-user count
    // for that week rides underneath. Older snapshots have no per-week active_users,
    // so we fall back to raw weekly conversations (the previous behaviour).
    var perUserMode = weekly.some(function (w) { return w.active_users != null; });
    function rate(w) {
      if (!perUserMode) return w.conversations;
      return (w.active_users > 0) ? w.conversations / w.active_users : 0;
    }
    // Fixed proportional coordinate space (kept near the container's real aspect
    // ratio) with uniform scaling, so text and bars never distort. A little extra
    // bottom padding in per-user mode for the "N active" sub-label.
    var W = 720, H = 162, n = weekly.length;
    var padT = 22, padB = perUserMode ? 34 : 20;
    var max = Math.max.apply(null, weekly.map(rate)) || 1;
    var slot = W / n, bw = Math.min(slot * 0.5, 90), gap = (slot - bw) / 2;
    var bars = weekly.map(function (w, i) {
      var r = rate(w);
      var h = (r / max) * (H - padT - padB);
      var x = i * slot + gap, y = H - h - padB;
      var cx = x + bw / 2;
      var label = w.week.slice(5).replace('-', '/');
      var valTxt = perUserMode ? r.toFixed(1) : w.conversations;
      var title = perUserMode
        ? esc(w.week) + ': ' + w.conversations + ' conversations across ' +
          (w.active_users || 0) + ' active user' + ((w.active_users || 0) !== 1 ? 's' : '') +
          ' (~' + r.toFixed(1) + ' each)'
        : esc(w.week) + ': ' + w.conversations + ' conversations';
      var sub = perUserMode
        ? '<text class="cu-trend__xlabel" x="' + cx.toFixed(1) + '" y="' + (H - 5) +
          '" text-anchor="middle" style="opacity:.7">' + (w.active_users || 0) + ' active</text>'
        : '';
      var xlabelY = perUserMode ? (H - 19) : (H - 5);
      return '<rect class="cu-trend__bar" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) +
        '" width="' + bw.toFixed(1) + '" height="' + Math.max(h, 2).toFixed(1) + '" rx="4"><title>' +
        title + '</title></rect>' +
        '<text class="cu-trend__val" x="' + cx.toFixed(1) + '" y="' + (y - 6).toFixed(1) + '" text-anchor="middle">' + valTxt + '</text>' +
        '<text class="cu-trend__xlabel" x="' + cx.toFixed(1) + '" y="' + xlabelY + '" text-anchor="middle">' + esc(label) + '</text>' +
        sub;
    }).join('');
    return '<svg class="cu-trend__svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' + bars + '</svg>';
  }

  function themesBlock(themes) {
    if (!themes || !themes.length) return '';
    var SMALL = 4; // workflows below this fold into one "Smaller volumes" row
    var list = themes.slice().sort(function (a, b) { return b.conversations - a.conversations; });
    var max = Math.max.apply(null, list.map(function (t) { return t.conversations; })) || 1;

    // Split into individually-shown bars vs a collapsed long tail. Only collapse
    // if it actually tidies up (2+ in the tail), else show everything.
    var shown = list.filter(function (t) { return t.conversations >= SMALL; });
    var tail = list.filter(function (t) { return t.conversations < SMALL; });
    if (tail.length < 2) { shown = list; tail = []; }

    function hoverTitle(t) {
      var ex = (t.examples && t.examples.length) ? ' — ' + t.examples.slice(0, 3).join(' · ') : '';
      return esc(t.conversations + ' chats · ~' + t.hours_low + '–' + t.hours_high + ' h' + ex);
    }
    function barRow(label, count, pct, muted, title) {
      var fill = muted ? 'var(--cu-bar-mut)' : 'var(--cu-bar)';
      var col = muted ? 'var(--c-stone)' : 'inherit';
      return '<div title="' + (title || '') + '" style="display:grid;grid-template-columns:168px 1fr 46px;' +
        'align-items:center;gap:10px;padding:5px 0">' +
        '<span style="font-size:13px;line-height:1.3;color:' + col + '">' + esc(label) + '</span>' +
        '<span style="background:var(--cu-track);height:14px;overflow:hidden;border-radius:4px">' +
        '<span style="display:block;height:14px;width:' + pct.toFixed(1) + '%;background:' + fill + '"></span></span>' +
        '<span style="font-size:13px;font-weight:600;text-align:right;color:' + col + '">' + count + '</span></div>';
    }

    var rows = shown.map(function (t) {
      var mut = t.key === 'misc' || t.key === 'other';
      return barRow(t.label, t.conversations, t.conversations / max * 100, mut, hoverTitle(t));
    }).join('');

    if (tail.length) {
      var tailTotal = tail.reduce(function (a, t) { return a + t.conversations; }, 0);
      var tailTitle = esc(tail.map(function (t) { return t.label + ' (' + t.conversations + ')'; }).join(' · '));
      rows += barRow('Smaller volumes (' + tail.length + ' workflows)', tailTotal, tailTotal / max * 100, true, tailTitle);
    }

    // Static "top three" examples strip — screenshot-safe (hover covers the rest).
    var top3 = shown.filter(function (t) {
      return t.key !== 'misc' && t.key !== 'other' && t.examples && t.examples.length;
    }).slice(0, 3);
    var strip = top3.length
      ? '<div style="margin-top:16px;border-top:1px solid var(--c-grey-mid);padding-top:14px">' +
        '<div style="font-size:12px;color:var(--c-stone);margin-bottom:8px">What the top ' +
        (top3.length === 3 ? 'three' : top3.length) + ' look like</div>' +
        top3.map(function (t) {
          return '<div style="font-size:13px;line-height:1.45;margin-bottom:6px"><b>' + esc(t.label) +
            '</b> <span style="color:var(--c-stone)">— ' + esc(t.examples.slice(0, 3).join(' · ')) + '</span></div>';
        }).join('') + '</div>'
      : '';

    return rows + strip +
      '<div style="margin-top:12px;font-size:12px;color:var(--c-stone)">Hover any bar for its hours-saved range and examples.</div>';
  }

  function funnelBlock(summary, licences) {
    var active = summary.active_users || 0;
    var db = summary.depth_breakdown || {};
    var dormant = Math.max(summary.dormant_licences || 0, 0);
    // Power-user count (the one "top user" concept): advanced use + 15+ conversations
    // + active on 6+ days. Prefer the summary field; fall back to the licence roster
    // for snapshots taken before that field existed. Power users are a strict subset
    // of "advanced" users, so the ladder below reconciles to the full roster:
    //   Power user · Regular (rest of advanced + intermediate) · Light (basic) · Not yet active
    var power = summary.power_users != null
      ? summary.power_users
      : (licences || []).filter(function (l) { return l.power_user; }).length;
    var adv = db.advanced || 0, inter = db.intermediate || 0, basic = db.basic || 0;
    var segs = [
      { lab: 'Power user', val: power, col: PALETTE.green1, on: 'var(--cu-on-strong)' },
      { lab: 'Regular', val: Math.max(adv - power, 0) + inter, col: PALETTE.green2, on: '#0b0b0b' },
      { lab: 'Light', val: basic, col: PALETTE.green3, on: '#0b0b0b' },
      { lab: 'Not yet active', val: dormant, col: PALETTE.neutral, on: 'var(--cu-on-faint)' }
    ];
    var total = segs.reduce(function (a, s) { return a + s.val; }, 0) || 1;
    var bar = segs.filter(function (s) { return s.val > 0; }).map(function (s) {
      var w = s.val / total * 100;
      var inside = w >= 9 ? '<span style="color:' + s.on + ';font-size:13px;font-weight:600">' + s.val + '</span>' : '';
      return '<div title="' + esc(s.lab) + ': ' + s.val + '" style="width:' + w.toFixed(1) +
        '%;background:' + s.col + ';display:flex;align-items:center;justify-content:center">' + inside + '</div>';
    }).join('');
    var legend = segs.map(function (s) {
      return '<span style="display:inline-flex;align-items:center;gap:6px;margin:0 16px 0 0;font-size:12px;color:var(--c-stone)">' +
        '<span style="width:10px;height:10px;background:' + s.col + ';border:1px solid var(--c-grey-mid)"></span>' +
        esc(s.lab) + ' ' + s.val + '</span>';
    }).join('');
    var barHtml =
      '<div style="display:flex;height:30px;overflow:hidden;margin:2px 0 12px;gap:2px;background:var(--cu-track);border-radius:4px">' + bar + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;row-gap:6px">' + legend + '</div>';

    // Power users: anonymised — a count and guidance, never names (GDPR). The bar
    // is described from the data's power_user_rule when present (so the explainer
    // always matches the figures), with a sensible fallback for older snapshots.
    var rule = summary.power_user_rule || null;
    var ruleText = rule
      ? 'they average <strong>' + rule.min_convos_per_week + '+ conversations a week</strong> ' +
        '(' + rule.min_convos + '+ across the period), and they were active in <strong>most weeks</strong> ' +
        '(' + rule.min_active_weeks + ' of the ' + rule.reporting_weeks + ')'
      : 'they use Claude with real, recurring volume and keep coming back week after week';
    var powerBlock = power > 0
      ? '<div class="cu-callout cu-callout--ok"><strong>' + power + ' power user' + (power !== 1 ? 's' : '') +
        '</strong><div style="margin-top:4px">Your go-to people — sustained, near-daily, deep use of ' +
        'Claude (' +
        Math.round(power / Math.max(active, 1) * 100) + '% of active licences). ' +
        'Identify them in your Claude admin console and lean on them for peer training.</div></div>'
      : '<div class="cu-callout">No power users yet — nobody has reached sustained, near-daily deep use. ' +
        'That’s normal early on; it comes as the habit builds.</div>';

    // Onboarding: count-based, no names.
    var onboarding = dormant > 0
      ? '<div class="cu-callout">' + dormant + ' licence' + (dormant !== 1 ? 's' : '') +
        ' not yet active.</div>'
      : '<div class="cu-callout cu-callout--ok">Every licence has been active.</div>';

    // ONE definitions disclosure covering all four bar tiers, in the same order and
    // wording as the bar/legend (Power user · Regular · Light · Not yet active). The
    // power-user rule is read from the data when present so it matches the figures;
    // the "not yet active" line folds in the honest note about what the export can't
    // tell us (no sign-in/invitation status).
    var tierDefs = '<details class="cu-explain"><summary>What do these tiers mean?</summary>' +
      '<div class="cu-explain__body">Every licence falls into one tier, so the bar covers your whole team.' +
      '<ul style="margin:8px 0 0;padding-left:18px;line-height:1.6">' +
        '<li><strong>Power user</strong> — sustained, near-daily, deep use. ' +
        'Their conversations lean on Claude’s tools (web search, code, file and data analysis, connected ' +
        'apps) and step-by-step thinking rather than plain Q&amp;A; ' + ruleText + '.</li>' +
        '<li><strong>Regular</strong> — active and using Claude with some depth (regular tool use or ' +
        'multi-step work), but not yet at the power-user bar.</li>' +
        '<li><strong>Light</strong> — active but mostly standard chat: quick questions and one-off tasks, ' +
        'with little tool use.</li>' +
        '<li><strong>Not yet active</strong> — holds a licence but has had no conversations at all. The ' +
        'Claude export only tells us about conversations — it carries no sign-in or invitation status — so ' +
        'this covers everyone from “invited but never signed in” to “signed in but hasn’t tried it yet”; ' +
        'we can’t separate those here.</li>' +
      '</ul></div></details>';

    return barHtml + powerBlock + onboarding + tierDefs;
  }

  // ── Shared ranked-bar row (one scale across a chart) ───────
  // Same visual idiom as themesBlock, factored out for the new charts.
  function cuBarRow(label, countLabel, pct, muted, title) {
    var fill = muted ? 'var(--cu-bar-mut)' : 'var(--cu-bar)';
    var col = muted ? 'var(--c-stone)' : 'inherit';
    return '<div title="' + (title || '') + '" style="display:grid;grid-template-columns:150px 1fr 54px;' +
      'align-items:center;gap:10px;padding:5px 0">' +
      '<span style="font-size:13px;line-height:1.3;color:' + col + '">' + esc(label) + '</span>' +
      '<span style="background:var(--cu-track);height:14px;overflow:hidden;border-radius:4px">' +
      '<span style="display:block;height:14px;width:' + pct.toFixed(1) + '%;background:' + fill + '"></span></span>' +
      '<span style="font-size:13px;font-weight:600;text-align:right;color:' + col + '">' + countLabel + '</span></div>';
  }

  // Tool-use by category — turns a flat tool count into a sophistication story.
  function toolUseBlock(map) {
    var entries = Object.keys(map || {}).map(function (k) { return { label: k, val: map[k] }; })
      .filter(function (e) { return e.val > 0; })
      .sort(function (a, b) { return b.val - a.val; });
    if (!entries.length) return '<p class="cu-card__sub" style="margin:0">No tool use recorded this period.</p>';
    var total = entries.reduce(function (a, e) { return a + e.val; }, 0);
    var max = entries[0].val || 1;
    var rows = entries.map(function (e) {
      var mut = e.label === 'Other tools';
      var pct = Math.round(e.val / total * 100);
      return cuBarRow(e.label, e.val, e.val / max * 100, mut, esc(e.label + ': ' + e.val + ' tool uses (' + pct + '%)'));
    }).join('');
    return rows + '<div style="margin-top:12px;font-size:12px;color:var(--c-stone)">' +
      total + ' tool actions in total — the <em>kind</em> of work Claude is doing, not just the volume.</div>';
  }

  // Raw file extensions mean nothing to an agency lead, so group them into
  // plain-English kinds of work. Unknown/blank extensions fall to "Other files".
  var FILE_GROUPS = {
    'Images': ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'heic', 'bmp', 'tif', 'tiff', 'avif'],
    'Documents': ['doc', 'docx', 'txt', 'md', 'rtf', 'odt', 'pages'],
    'Spreadsheets': ['xls', 'xlsx', 'csv', 'tsv', 'ods', 'numbers'],
    'Presentations': ['ppt', 'pptx', 'key'],
    'PDFs': ['pdf'],
    'Code & technical': ['cs', 'js', 'ts', 'jsx', 'tsx', 'py', 'json', 'html', 'htm', 'css', 'scss',
      'sql', 'xml', 'yaml', 'yml', 'sh', 'java', 'cpp', 'go', 'rb', 'php', 'ipynb', 'log'],
    'Design files': ['psd', 'ai', 'indd', 'idml', 'eps', 'fig', 'sketch', 'xd', 'otf', 'ttf', 'woff', 'woff2'],
    'Audio & video': ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'm4a', 'aac']
  };
  var EXT_TO_GROUP = (function () {
    var m = {};
    Object.keys(FILE_GROUPS).forEach(function (g) {
      FILE_GROUPS[g].forEach(function (ext) { m[ext] = g; });
    });
    return m;
  })();

  // File mix grouped into plain-English kinds — a rough proxy for the kind of work.
  function fileTypeBlock(map) {
    var groups = {};   // group -> total
    var detail = {};   // group -> [{ext,val}] for the hover breakdown
    Object.keys(map || {}).forEach(function (k) {
      var v = map[k];
      if (!v) return;
      var g = EXT_TO_GROUP[(k || '').toLowerCase()] || 'Other files';
      groups[g] = (groups[g] || 0) + v;
      (detail[g] = detail[g] || []).push({ ext: k || 'unknown', val: v });
    });
    var entries = Object.keys(groups).map(function (g) { return { label: g, val: groups[g] }; })
      .filter(function (e) { return e.val > 0; })
      .sort(function (a, b) { return b.val - a.val; });
    if (!entries.length) return '<p class="cu-card__sub" style="margin:0">No files uploaded this period.</p>';
    // Keep "Other files" at the bottom regardless of size (stable sort).
    entries.sort(function (a, b) { return (a.label === 'Other files') - (b.label === 'Other files'); });
    var max = Math.max.apply(null, entries.map(function (e) { return e.val; })) || 1;
    var rows = entries.map(function (e) {
      var mut = e.label === 'Other files';
      var parts = (detail[e.label] || []).sort(function (a, b) { return b.val - a.val; })
        .map(function (d) { return '.' + d.ext + ' (' + d.val + ')'; }).join(' · ');
      return cuBarRow(e.label, e.val, e.val / max * 100, mut, esc(e.label + ' — ' + parts));
    }).join('');
    return rows + '<div style="margin-top:12px;font-size:12px;color:var(--c-stone)">' +
      'Grouped by kind of file — a rough proxy for the work. Hover a bar to see the file types within it.</div>';
  }

  // Prompting quality — uses real scored data when available (produced by the
  // classification step), otherwise falls back to three observable proxy signals.
  function promptQualityBlock(s, pq) {
    if (pq && pq.scored_count > 0) {
      return promptQualityFromScores(pq);
    }
    return promptQualityFromProxies(s);
  }

  // ── Real prompt quality: scored by Claude during classification ────────────
  function promptQualityFromScores(pq) {
    var avg = pq.avg_score || 0;
    var dist = pq.distribution || {};
    var total = pq.scored_count || 1;

    // Score label and colour
    var scoreLabel = avg >= 4 ? 'Good' : avg >= 3 ? 'Developing' : avg >= 2 ? 'Needs work' : 'Basic';
    var scoreColour = avg >= 4 ? PALETTE.green1 : avg >= 3 ? PALETTE.green3 : avg >= 2 ? PALETTE.amber : PALETTE.neutral;
    var scoreTextCol = avg >= 4 ? 'var(--c-black)' : avg >= 3 ? 'var(--c-stone)' : avg >= 2 ? 'var(--cu-amber)' : 'var(--c-stone)';

    // Distribution bar — 5 segments, low (faint) to high (strong); CSS vars so the
    // ramp flips to dark inks in the printed PDF.
    var SCORE_COLS = ['var(--cu-track)', 'var(--cu-ramp4)', 'var(--cu-ramp3)', 'var(--cu-ramp2)', 'var(--cu-ramp1)'];
    var barSegs = [1,2,3,4,5].map(function(i) {
      var count = dist[String(i)] || 0;
      var w = count / total * 100;
      return w > 0
        ? '<div title="Score ' + i + ': ' + count + ' prompts" style="width:' + w.toFixed(1) +
          '%;background:' + SCORE_COLS[i-1] + ';height:100%"></div>'
        : '';
    }).join('');

    var distHtml =
      '<div style="margin:14px 0 6px">' +
        '<div style="display:flex;height:16px;border-radius:var(--radius-sm);overflow:hidden;gap:2px">' +
          barSegs +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--c-stone);margin-top:5px">' +
          '<span>1 — Minimal</span><span>2 — Vague</span><span>3 — Adequate</span><span>4 — Good</span><span>5 — Excellent</span>' +
        '</div>' +
      '</div>';

    // Top issues
    var issuesHtml = (pq.top_issues && pq.top_issues.length)
      ? '<div style="margin-top:14px">' +
          '<div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--c-stone);margin-bottom:8px">Most common gaps</div>' +
          pq.top_issues.map(function(iss) {
            var pct = Math.round(iss.count / total * 100);
            return '<div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid var(--c-grey-light)">' +
              '<span style="flex:1;font-size:13px;color:var(--c-black)">' + esc(iss.label) + '</span>' +
              '<span style="font-size:12px;color:var(--c-stone);white-space:nowrap">' + iss.count + ' prompts (' + pct + '%)</span>' +
            '</div>';
          }).join('') +
        '</div>'
      : '';

    // Tips
    var tipsHtml = (pq.tips && pq.tips.length)
      ? '<div style="margin-top:16px">' +
          '<div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--c-stone);margin-bottom:8px">How to improve</div>' +
          pq.tips.map(function(tip) {
            return '<div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid var(--c-grey-light);font-size:13px;line-height:1.5;color:var(--c-black)">' +
              '<span style="flex:none;color:var(--c-stone);font-size:11px;margin-top:3px">→</span>' +
              esc(tip) +
            '</div>';
          }).join('') +
        '</div>'
      : '';

    return '<div style="display:flex;align-items:baseline;gap:12px;margin-bottom:4px">' +
        '<span style="font-size:28px;font-weight:500;color:' + scoreTextCol + '">' + avg.toFixed(1) + '</span>' +
        '<span style="font-size:13px;color:' + scoreTextCol + ';font-weight:600">' + esc(scoreLabel) + '</span>' +
        '<span style="font-size:12px;color:var(--c-stone)">(out of 5 · ' + pq.scored_count + ' prompts scored)</span>' +
      '</div>' +
      distHtml +
      issuesHtml +
      tipsHtml +
      '<div style="margin-top:14px;font-size:12px;color:var(--c-stone);line-height:1.5">' +
        'Prompts are scored by Claude during the monthly classification step. ' +
        'Only conversations with a first prompt are included. Prompt text is never stored after scoring.' +
      '</div>';
  }

  // ── Fallback: proxy signals when no classification scores exist ─────────────
  function promptQualityFromProxies(s) {
    var convos = s.total_conversations || 1;
    var filesPerConvo   = Math.round(((s.total_files_uploaded  || 0) / convos) * 10) / 10;
    var toolsPerConvo   = Math.round(((s.total_tool_uses       || 0) / convos) * 10) / 10;
    var thinkingPct     = s.thinking_usage_pct != null ? s.thinking_usage_pct : null;
    var realProjects    = s.real_projects || 0;
    var wellConfigured  = s.well_configured_projects || 0;

    function signal(label, value, note, level) {
      // level: 'good' | 'mid' | 'low' — CSS vars so the dots/figures stay visible
      // when the report prints to a white PDF page.
      var dot = level === 'good' ? 'var(--cu-bar)' : level === 'mid' ? 'var(--cu-amber)' : 'var(--cu-ramp4)';
      var textCol = level === 'good' ? 'var(--c-black)' : level === 'mid' ? 'var(--cu-amber)' : 'var(--c-stone)';
      return '<div style="display:flex;align-items:baseline;gap:12px;padding:10px 0;' +
        'border-bottom:1px solid var(--c-grey-light)">' +
        '<span style="flex:none;width:8px;height:8px;border-radius:50%;background:' + dot +
          ';margin-top:5px;flex-shrink:0"></span>' +
        '<div style="flex:1">' +
          '<span style="font-size:13px;font-weight:600;color:var(--c-black)">' + esc(label) + '</span>' +
          '<span style="font-size:13px;color:' + textCol + ';margin-left:8px">' + esc(value) + '</span>' +
          '<div style="font-size:12px;color:var(--c-stone);margin-top:3px;line-height:1.5">' + esc(note) + '</div>' +
        '</div></div>';
    }

    // Context loading
    var contextLevel = filesPerConvo >= 0.5 ? 'good' : filesPerConvo >= 0.2 ? 'mid' : 'low';
    var contextNote  = filesPerConvo >= 0.5
      ? 'Most conversations include an uploaded document or file — strong context-loading habit.'
      : filesPerConvo >= 0.2
        ? 'Some conversations include files. Encourage uploading briefs, reports, or notes rather than re-describing them in text.'
        : 'Rarely attaching files. The team is mostly prompting from scratch rather than giving Claude real content to work with.';

    // Capability use
    var toolLevel = toolsPerConvo >= 2 ? 'good' : toolsPerConvo >= 0.5 ? 'mid' : 'low';
    var toolNote  = toolsPerConvo >= 2
      ? 'Prompts regularly trigger web search, code execution, or file analysis — strong capability use.'
      : toolsPerConvo >= 0.5
        ? 'Some tool use across conversations. Encourage exploring web search and file analysis for research and data tasks.'
        : 'Minimal tool use — conversations are mostly plain Q&A. Prompts that ask Claude to search, analyse, or compute will get higher-quality outputs.';

    // Extended thinking
    var thinkingSignal = thinkingPct != null
      ? signal(
          'Extended thinking',
          thinkingPct + '% of conversations',
          thinkingPct >= 20
            ? 'A healthy share of prompts are complex enough to trigger Claude\'s step-by-step reasoning — a sign of substantive, high-value tasks.'
            : thinkingPct >= 5
              ? 'Some use of extended reasoning. For analysis, strategy, or problem-solving prompts, explicitly asking Claude to "think step by step" or "reason carefully" can unlock deeper outputs.'
              : 'Very few prompts trigger extended reasoning. Worth trying on complex tasks — strategy briefs, analysis, or multi-step problems.',
          thinkingPct >= 20 ? 'good' : thinkingPct >= 5 ? 'mid' : 'low'
        )
      : '';

    // Project setup
    var projectSignal = realProjects > 0
      ? signal(
          'Project context quality',
          wellConfigured + ' of ' + realProjects + ' projects well-configured',
          wellConfigured === realProjects
            ? 'All projects have a title and description — good foundations for context-rich prompting.'
            : wellConfigured > 0
              ? (realProjects - wellConfigured) + ' project' + (realProjects - wellConfigured > 1 ? 's are' : ' is') + ' missing a description. A clear project description means every conversation in that project starts with context already loaded.'
              : 'No projects have descriptions set. Adding a description to each project pre-loads Claude with client or campaign context, reducing the need to re-explain it in every prompt.',
          wellConfigured === realProjects ? 'good' : wellConfigured > 0 ? 'mid' : 'low'
        )
      : '';

    var rows = signal('Context loading', filesPerConvo + ' files per conversation', contextNote, contextLevel) +
      signal('Capability use', toolsPerConvo + ' tool uses per conversation', toolNote, toolLevel) +
      thinkingSignal +
      projectSignal;

    return rows +
      '<div style="margin-top:12px;font-size:12px;color:var(--c-stone);line-height:1.5">' +
        'Prompt text is never stored or shared. These signals are inferred from conversation behaviour — ' +
        'what Claude was asked to do, not what was typed.' +
      '</div>';
  }

  // Adoption status by recency — finds people who started then drifted (lapsed),
  // the best re-engagement targets. Reconciles to the full licence base.
  function statusBlock(s, asOf) {
    var recent = s.recently_active_users || 0;
    var lapsed = Math.max(s.lapsed_licences || 0, 0);
    var dormant = Math.max(s.dormant_licences || 0, 0);
    var active = s.active_users || 0;
    var ongoing = Math.max(active - recent - lapsed, 0); // active this month, not last 7d
    var segs = [
      { lab: 'Active this week', val: recent, col: PALETTE.green1, on: 'var(--cu-on-strong)' },
      { lab: 'Active this month', val: ongoing, col: PALETTE.green2, on: '#0b0b0b' },
      { lab: 'Lapsed (30+ days quiet)', val: lapsed, col: PALETTE.amber, on: '#0b0b0b' },
      { lab: 'Not yet active', val: dormant, col: PALETTE.neutral, on: 'var(--cu-on-faint)' }
    ];
    var total = segs.reduce(function (a, x) { return a + x.val; }, 0) || 1;
    var bar = segs.filter(function (x) { return x.val > 0; }).map(function (x) {
      var w = x.val / total * 100;
      var inside = w >= 9 ? '<span style="color:' + x.on + ';font-size:13px;font-weight:600">' + x.val + '</span>' : '';
      return '<div title="' + esc(x.lab) + ': ' + x.val + '" style="width:' + w.toFixed(1) +
        '%;background:' + x.col + ';display:flex;align-items:center;justify-content:center">' + inside + '</div>';
    }).join('');
    var legend = segs.map(function (x) {
      return '<span style="display:inline-flex;align-items:center;gap:6px;margin:0 16px 0 0;font-size:12px;color:var(--c-stone)">' +
        '<span style="width:10px;height:10px;background:' + x.col + ';border:1px solid var(--c-grey-mid)"></span>' +
        esc(x.lab) + ' ' + x.val + '</span>';
    }).join('');
    var barHtml =
      '<div style="display:flex;height:30px;overflow:hidden;margin:2px 0 12px;gap:2px;background:var(--cu-track);border-radius:4px">' + bar + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;row-gap:6px">' + legend + '</div>';
    var callout;
    if (lapsed > 0) {
      callout = '<div class="cu-callout"><strong>' + lapsed + ' licence' + (lapsed !== 1 ? 's have' : ' has') +
        ' gone quiet (30+ days)</strong><div style="margin-top:4px">These people started then drifted. ' +
        'A quick check-in or a relevant use case often brings them back.</div></div>';
    } else if (dormant > 0) {
      callout = '<div class="cu-callout">Nobody has lapsed — but ' + dormant + ' licence' +
        (dormant !== 1 ? 's have' : ' has') + ' never been used. Start them with one concrete use case.</div>';
    } else {
      callout = '<div class="cu-callout cu-callout--ok">Everyone is active and nobody has lapsed — adoption is sticking.</div>';
    }
    var anchor = asOf
      ? '<div style="margin-top:10px;font-size:12px;color:var(--c-stone)">Recency measured as of ' + esc(asOf) +
        ' (the latest activity in the export).</div>'
      : '';
    return barHtml + callout + anchor;
  }

  // Project hygiene — separates real reusable assets from starter templates.
  function hygieneStrip(s) {
    if (!s) return '';
    var real = s.real_projects, well = s.well_configured_projects, starter = s.starter_projects;
    if (real == null && well == null && starter == null) return '';
    var parts = [];
    if (real != null) parts.push('<div class="cu-stat"><div class="cu-stat__num">' + real +
      '</div><div class="cu-stat__lab">working projects</div></div>');
    if (well != null) parts.push('<div class="cu-stat"><div class="cu-stat__num">' + well +
      '</div><div class="cu-stat__lab">well-configured<br>(instructions + docs)</div></div>');
    if (starter) parts.push('<div class="cu-stat"><div class="cu-stat__num">' + starter +
      '</div><div class="cu-stat__lab">starter templates<br>(excluded)</div></div>');
    return '<div class="cu-stat-strip cu-stat-strip--row">' + parts.join('') + '</div>';
  }

  function projectsTable(projects) {
    if (!projects || !projects.length) return '<p class="cu-card__sub">No projects created.</p>';
    var rows = projects.map(function (p) {
      var shared = !p.is_private;
      // "Last updated" = when the project was last edited. NOT a usage signal —
      // a project can be used daily without being edited, and the export has no
      // per-project usage count. Shown as a neutral fact, no abandonment flag.
      var last = p.last_updated || p.updated_at || '';
      var desc = (p.description || '').trim();
      // Name expands to reveal the project's description (where one exists);
      // plain text otherwise so there's no empty dropdown to click.
      var nameCell = desc
        ? '<details class="cu-proj"><summary><strong>' + esc(p.name || 'Untitled') + '</strong></summary>' +
          '<div class="cu-proj__desc">' + esc(desc) + '</div></details>'
        : '<strong>' + esc(p.name || 'Untitled') + '</strong>';
      return '<tr>' +
        '<td>' + nameCell + '</td>' +
        '<td class="cu-td-date">' + esc(p.created_at || '—') + '</td>' +
        '<td class="cu-td-date">' + esc(last || '—') + '</td>' +
        '<td><span class="cu-pill ' + (shared ? 'cu-pill--shared">Shared' : 'cu-pill--private">Private') + '</span></td>' +
      '</tr>';
    }).join('');
    return '<div class="cu-table-wrap"><table class="cu-table"><thead><tr>' +
      '<th>Project</th><th>Created</th><th>Last updated</th><th>Visibility</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="cu-card__sub" style="margin:10px 0 0">Click a project name to read its description. "Last updated" is when the project was last edited — the export doesn\'t capture how often a project is used in chats.</p>';
  }

  function methodBlock(workflows, timeSaved, totalLow, totalHigh) {
    var rows = workflows.map(function (t) {
      return '<tr><td>' + esc(t.label) + '</td>' +
        '<td>' + t.qualifying + ' conversations × ' + t.minutes_band[0] + '–' + t.minutes_band[1] + ' min each</td>' +
        '<td style="text-align:right;white-space:nowrap">' + t.hours_low + '–' + t.hours_high + ' h</td></tr>';
    }).join('');
    var totalRow = '<tr class="cu-method__total"><td><strong>Total</strong></td><td></td>' +
      '<td style="text-align:right;white-space:nowrap"><strong>' + totalLow + '–' + totalHigh + ' h</strong></td></tr>';
    return '<details class="cu-method"><summary>How time saved is estimated</summary>' +
      '<p style="margin:8px 0">' + esc(timeSaved.method || '') + '</p>' +
      '<table><tbody>' + rows + totalRow + '</tbody></table></details>';
  }

  function winsBlock(wins, workflows) {
    if (!wins || !wins.length) return '';
    var labelByKey = {};
    (workflows || []).forEach(function (w) { labelByKey[w.key] = w.label; });
    var items = wins.map(function (w) {
      var tag = labelByKey[w.workflow] || '';
      return '<li class="cu-win">' +
        (tag ? '<span class="cu-win__tag">' + esc(tag) + '</span>' : '') +
        '<span class="cu-win__text">' + esc(w.text) + '</span></li>';
    }).join('');
    return '<div class="cu-card cu-wins-card" style="margin-bottom:28px">' +
      '<div class="cu-card__title">Standout wins this month</div>' +
      '<div class="cu-card__sub">The most valuable uses this period, in plain English</div>' +
      '<ul class="cu-wins">' + items + '</ul></div>';
  }

  // ── Gamified adoption hero ──────────────────────────────────
  // A TEAM-level adoption "level" + progress + milestones. Deliberately never
  // ranks or scores named individuals (that would re-introduce the per-person
  // monitoring we anonymised). The level rubric is intentionally simple and
  // tunable — adjust the thresholds here if the bands feel off for an agency.
  var LEVELS = ['Exploring', 'Adopting', 'Embedded', 'Leading'];

  // Adoption level — a deliberately HIGH bar (raised Jun 2026). The old rule
  // called an agency "Embedded" on 80% having *ever* chatted + 25% deep use,
  // which over-rated agencies still mid-onboarding. The principle now:
  //   "Embedded" = everyone is onboarded AND using Claude continuously and deeply.
  // So the hard gate for Embedded+ is ZERO not-yet-active licences — any agency
  // still onboarding seats caps at "Adopting", however keen its active users are.
  // On top of that: sustained recent use (a habit, not a one-off), genuine depth,
  // and at least one true power user. "Leading" adds near-universal weekly use,
  // multiple power users and shared team assets.
  function levelFor(s, power) {
    var lic = s.licensed_users || 0, act = s.active_users || 0;
    var activeRatio = lic ? act / lic : 0;
    var recentRatio = lic ? (s.recently_active_users || 0) / lic : 0;
    var deep = s.agentic_usage_pct || 0;
    var pu = power != null ? power : (s.power_users || 0);
    var noDormant = (s.dormant_licences || 0) === 0 && lic > 0;
    var shared = (s.shared_projects || 0) > 0;
    // Leading — the whole team, deeply and continuously, with shared assets.
    if (noDormant && (s.lapsed_licences || 0) === 0 &&
        recentRatio >= 0.8 && deep >= 50 && pu >= 2 && shared) return 4;
    // Embedded — everyone onboarded, a real recurring habit, genuine depth.
    if (noDormant && recentRatio >= 0.6 && deep >= 40 && pu >= 1) return 3;
    // Adopting — uptake building, but not everyone is on board yet.
    if (activeRatio >= 0.5) return 2;
    return 1; // Exploring
  }

  // ── Summary bullet helpers ──────────────────────────────────
  // Both read from the summary object and return arrays of strings.
  // They're kept separate so they can evolve independently.

  // Friendly hours range for a single workflow, e.g. "45–100 hours" / "8 hours".
  // Returns '' when there's no meaningful figure so the caller can omit it.
  function roundHours(lo, hi) {
    var l = Math.round(lo || 0), h = Math.round(hi || 0);
    if (h < 1) return '';
    if (l === h || l < 1) return h + ' hour' + (h === 1 ? '' : 's');
    return l + '–' + h + ' hours';
  }

  // Real, value-generating workflows ranked by volume — excludes the "misc"/
  // "other" catch-alls and "enablement" (learning-Claude chats), which aren't a
  // win to celebrate as a team's headline use.
  function rankedWorkflows(wfs) {
    return (wfs || [])
      .filter(function (w) {
        return (w.conversations || 0) > 0 &&
          w.key !== 'misc' && w.key !== 'other' && w.key !== 'enablement';
      })
      .sort(function (a, b) { return b.conversations - a.conversations; });
  }

  function goingWellBullets(s, wfs, power) {
    // Anchored to the team's OWN data: lead with their biggest real win (a named
    // workflow + hours saved), then habit/depth expressed in head-counts (not
    // percentages), each with a short "keep doing this" steer.
    var bullets = [];
    var lic = s.licensed_users || 0;
    var act = s.active_users || 0;
    var dormant = s.dormant_licences || 0;
    var recent = s.recently_active_users || 0;
    var deep = Math.round(s.agentic_usage_pct || 0);
    var ranked = rankedWorkflows(wfs);
    var wfCount = (wfs || []).filter(function (w) { return (w.conversations || 0) > 0 && w.key !== 'misc'; }).length;

    // 1) Biggest win — the top workflow, with volume and hours saved.
    var top = ranked[0];
    if (top && top.conversations >= 5) {
      var hrs = roundHours(top.hours_low, top.hours_high);
      bullets.push(top.label + ' is your team’s biggest win — ' + top.conversations +
        ' conversations this period' + (hrs ? ', around ' + hrs + ' of work saved' : '') +
        '. Keep feeding it real briefs and live work.');
    }

    // 2) Second embedded workflow — proves breadth is real, not a one-off.
    var second = ranked[1];
    if (second && second.conversations >= 10) {
      bullets.push(second.label + ' is becoming a second habit — ' + second.conversations +
        ' conversations. Two kinds of work now run through Claude, not just one.');
    }

    // 3) Habit — in people, not percentages.
    if (lic > 0 && recent >= Math.max(Math.round(lic * 0.8), 1)) {
      bullets.push(recent + ' of ' + lic + ' licences used Claude in the past week — ' + Math.round(recent / lic * 100) + '% weekly reach across the team.');
    } else if (lic > 0 && recent >= Math.round(lic * 0.5)) {
      bullets.push(recent + ' of ' + lic + ' licences were active this past week — steady, regular use.');
    }

    // 4) Full onboarding — only notable once everyone is in.
    if (dormant === 0 && lic > 0) bullets.push('Every one of your ' + lic + ' licences has been used — nobody was left behind in onboarding.');

    // 5) Power users — the team's in-house coaches.
    if (power >= 2) bullets.push(power + ' people have built a near-daily deep habit — your in-house coaches for everyone else.');
    else if (power === 1) bullets.push('1 person has built a near-daily deep habit — a candidate to lead peer training.');

    // 6) Depth.
    if (deep >= 50) bullets.push(deep + '% of active users go well beyond quick questions — using Claude’s tools and step-by-step reasoning on real work.');

    // 7) Breadth.
    if (wfCount >= 5) bullets.push('Claude is being used across ' + wfCount + ' different kinds of work — broad adoption, not one narrow use.');

    // 8) Shared projects.
    if ((s.shared_projects || 0) > 0) bullets.push((s.shared_projects) + ' shared project' + (s.shared_projects > 1 ? 's' : '') + ' — the team is building on the same context, not working in silos.');

    return bullets.slice(0, 4); // cap at 4 so the card stays readable
  }

  function toNextLevelBullets(s, lvl, wfs, power) {
    // Each bullet maps to ONE gate in levelFor() that the team is currently
    // failing — expressed as a head-count, with a time-boxed first move and the
    // unlock it earns. The gates here MUST mirror levelFor()'s thresholds:
    //   Adopting→Embedded: 0 dormant · ≥60% weekly · ≥40% deep · ≥1 power user
    //   Embedded→Leading:  0 lapsed · ≥80% weekly · ≥50% deep · ≥2 power · shared
    // At Leading (4) we give concrete maintenance nudges instead.
    var lic = s.licensed_users || 0;
    var act = s.active_users || 0;
    var dormant = s.dormant_licences || 0;
    var lapsed = s.lapsed_licences || 0;
    var recent = s.recently_active_users || 0;
    var recentRatio = lic ? recent / lic : 0;
    var deep = Math.round(s.agentic_usage_pct || 0);
    var shared = s.shared_projects || 0;
    var nextName = LEVELS[lvl]; // LEVELS is 0-indexed; lvl is 1-indexed → next level
    var topWf = rankedWorkflows(wfs)[0];
    var topWfLabel = topWf ? topWf.label.toLowerCase() : 'a recurring task';

    if (lvl === 4) {
      // Already Leading — keep it there, concretely.
      var m = [];
      if (lapsed > 0) m.push(lapsed + ' active user' + (lapsed > 1 ? 's have' : ' has') +
        ' gone quiet for 30+ days — send a tailored prompt suggestion this week before the habit fades.');
      m.push('Write up two or three of your strongest workflows and share them with another Miroma agency — you’re the model the group should copy.');
      m.push('Run a monthly show-and-tell so new wins spread and habits stay current as clients and campaigns change.');
      m.push('Review your shared Projects each month — keep descriptions and shared instructions accurate so the team’s context never goes stale.');
      return m.slice(0, 4);
    }

    // Exploring → Adopting: the single gate is getting half the team active.
    if (lvl === 1) {
      var half = Math.ceil(0.5 * lic);
      var need = Math.max(half - act, 1);
      return [
        'Only ' + act + ' of ' + lic + ' licences have been used so far. Getting ' + need +
          ' more ' + (need === 1 ? 'person' : 'people') + ' started this fortnight — a 15-minute first task each — moves you to Adopting.',
        'Pick one everyday job (notes from a meeting, a first-draft email) and do it with Claude in front of the team. Seeing it on their own work is the unlock.'
      ];
    }

    var bullets = [];
    var recentTarget = lvl === 2 ? 0.6 : 0.8; // weekly-use gate for the next level
    var deepTarget = lvl === 2 ? 40 : 50;     // depth gate
    var powerTarget = lvl === 2 ? 1 : 2;      // power-user gate

    // Gate: every licence active (hard gate — caps the level until cleared).
    if (dormant > 0) bullets.push(dormant + ' of your ' + lic + ' licences ' + (dormant > 1 ? 'have' : 'has') +
      ' never been used. Book 15 minutes with each over the next fortnight for a guided first task — this is the hard gate for ' + nextName + ': until everyone has started, the team can’t move up.');

    // Gate (Leading): nobody lapsed.
    if (lvl === 3 && lapsed > 0) bullets.push(lapsed + ' licence' + (lapsed > 1 ? 's have' : ' has') +
      ' lapsed (used Claude before, quiet 30+ days now). Reach out this week with a prompt idea tailored to their work — re-engaging them is part of the ' + nextName + ' bar.');

    // Gate: a power user (or a second one for Leading).
    if (power < powerTarget) {
      if (power === 0) bullets.push('No power user has emerged yet. Give your highest-volume user one advanced workflow to own — a Project or a repeatable prompt sequence — so a near-daily deep habit can form.');
      else bullets.push('You have ' + power + ' power user' + (power > 1 ? 's' : '') + '; ' + nextName + ' needs ' + powerTarget +
        '. Pair your most engaged user with a keen colleague so the deep habit spreads to a second person.');
    }

    // Gate: depth — in people, with a concrete first move tied to their own work.
    if (deep < deepTarget) {
      var notDeep = Math.max(act - Math.round(deep / 100 * act), 1);
      bullets.push(notDeep + ' of your ' + act + ' active users still mostly ask quick questions. Take one recurring task — ' + topWfLabel +
        ' — and run it as a shared Project this month, uploading the real documents. That’s the jump from using Claude to building with it.');
    }

    // Gate: weekly habit — how many more people, to hit the threshold.
    if (recentRatio < recentTarget) {
      var needPeople = Math.max(Math.ceil(recentTarget * lic) - recent, 1);
      bullets.push('Weekly use sits at ' + recent + ' of ' + lic + ' licences — ' + needPeople + ' more ' +
        (needPeople === 1 ? 'person using' : 'people using') + ' Claude in a typical week reaches the ' + Math.round(recentTarget * 100) +
        '% mark. Try a two-week challenge: one Claude task per person per day.');
    }

    // Gate (Leading): a shared Project.
    if (lvl === 3 && shared === 0) bullets.push('No shared Projects yet. Create one for a live client or campaign so the whole team works from the same context — shared assets are part of the ' + nextName + ' bar.');

    return bullets.slice(0, 4);
  }

  function gamifiedHero(s, wfs, power) {
    var lvl = levelFor(s, power);
    var act = s.active_users || 0;
    var wfCount = (wfs || []).filter(function (w) { return (w.conversations || 0) > 0 && w.key !== 'misc'; }).length;
    var milestones = [
      { label: 'Every licence active', done: (s.dormant_licences || 0) === 0 && (s.licensed_users || 0) > 0 },
      { label: 'Power users emerged', done: (power || 0) > 0 },
      { label: 'Projects shared', done: (s.shared_projects || 0) > 0 },
      { label: 'Breadth of use', done: wfCount >= 5 },
      { label: 'Regular habit', done: (s.recently_active_users || 0) >= Math.max(Math.round(act * 0.8), 1) }
    ];
    var next = milestones.filter(function (m) { return !m.done; })[0];
    var nextLine = next
      ? 'Next milestone: <span class="cu-hero__ms-hl">' + esc(next.label.toLowerCase()) + '</span>.'
      : 'Every milestone reached — outstanding adoption.';

    var steps = LEVELS.map(function (_, i) {
      return '<div class="cu-step' + (i < lvl ? ' cu-step--on' : '') + '"></div>';
    }).join('');
    var stepLabels = LEVELS.map(function (name, i) {
      return '<span' + (i + 1 === lvl ? ' class="cu-step__here"' : '') + '>' + name + '</span>';
    }).join('');
    var nextMsIdx = milestones.findIndex(function (m) { return !m.done; });
    var msHtml = milestones.map(function (m, i) {
      var cls = m.done ? 'cu-ms--done' : (i === nextMsIdx ? 'cu-ms--next' : 'cu-ms--todo');
      var icon = m.done
        ? '<span class="cu-ms__mark">✓</span>'
        : (i === nextMsIdx
          ? '<span style="width:13px;height:13px;border:1.5px solid #FFE255;border-radius:50%;display:inline-block;flex-shrink:0"></span>'
          : '<span style="width:13px;height:13px;border:1.5px solid rgba(255,255,255,.25);border-radius:50%;display:inline-block;flex-shrink:0"></span>');
      return '<div class="cu-ms ' + cls + '">' + icon + esc(m.label) + '</div>';
    }).join('');

    // Stage definitions — exactly the rules in levelFor(), in plain English, so a
    // lead can see what earns each level (and what to push for next). Keep these in
    // step with levelFor() if the thresholds are ever retuned.
    var levelDefs =
      '<details class="cu-explain"><summary>How are these levels worked out?</summary>' +
      '<div class="cu-explain__body">A deliberately high bar, and each level builds on the one ' +
      'before — so the team only reaches <strong>Embedded</strong> once every licence is active ' +
      'and in regular, deep use, not just switched on. Levels are recalculated from this period’s ' +
      'figures each time the report is generated.' +
      '<ul style="margin:8px 0 0;padding-left:18px;line-height:1.6">' +
        '<li><strong>Exploring</strong> — the starting point: fewer than half the team’s ' +
        'licences have been used yet.</li>' +
        '<li><strong>Adopting</strong> — uptake is building: at least half the licences are ' +
        'active, but not everyone is on board yet (some are still not active).</li>' +
        '<li><strong>Embedded</strong> — everyone onboarded and using Claude properly: ' +
        '<em>every</em> licence active, at least 60% used Claude in the past week, 40%+ of active ' +
        'users work with it deeply (its tools and step-by-step reasoning, not just quick questions), ' +
        'and at least one power user has emerged.</li>' +
        '<li><strong>Leading</strong> — the whole team, deeply and consistently: every licence ' +
        'active and none lapsed, 80%+ active in the past week, 50%+ of active users working deeply, ' +
        'two or more power users, and projects shared with colleagues.</li>' +
      '</ul></div></details>';

    var wellBullets = goingWellBullets(s, wfs, power);
    var nextBullets = toNextLevelBullets(s, lvl, wfs, power);

    var wellHtml = wellBullets.length
      ? '<div class="cu-blist cu-blist--good"><div class="cu-blist__label">What\'s going well</div><ul>' +
          wellBullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') +
        '</ul></div>'
      : '';
    // Motivating closer: name the payoff for clearing the list above.
    var closer = lvl < 4
      ? 'Tackle these and <strong>' + esc(LEVELS[lvl]) + '</strong> is within reach.'
      : 'Keep these up and your team holds its place at <strong>Leading</strong>.';
    // The conceptual "why" behind the list below — used to live in its own
    // "stage — what it looks like" card, cut for redundancy (the numbered
    // bullets already show what's actually happening for this team; this is
    // the one sentence from that card that wasn't said anywhere else).
    // Indexed by CURRENT level (1–4).
    var LEVEL_SHIFT = [
      'The shift to Adopting happens when people stop asking Claude about the world and start asking it about their specific work — uploading one real work document before their next session.',
      'The shift to Embedded is from extraction to creation: asking Claude to produce a new output — a recommendation, a plan, a draft — based on what it has read, rather than just surfacing what\'s already there.',
      'The shift to Leading is from individual skill to team system — shared projects, prompt libraries, and peer coaching becoming a normal part of how the team works, not just what a few people do.',
      'This team is a model for the group. The focus now is on deepening impact and helping other agencies get here faster.'
    ];
    // "Looking further" horizon — a glimpse of what lies beyond the next rung, so
    // the ladder never feels like it ends. Shown for teams already at Leading and
    // for near-perfect teams with a short gap list (≤2), where the plain next-step
    // list alone would feel thin. Index by current level (1–4); static copy.
    var HORIZON = ['',
      'the real prize is moving from pulling facts out of documents to having Claude draft, plan and recommend.',
      'the strongest teams turn one person’s habits into shared Projects and prompt libraries the whole team reuses.',
      'the best teams become the group’s model — their workflows get adopted by other Miroma agencies.',
      'the frontier is pioneering brand-new workflows — chaining brief → strategy → creative — and helping other agencies reach Leading.'];
    var horizonHtml = (lvl === 4 || nextBullets.length <= 2)
      ? '<div class="cu-blist__horizon"><span class="cu-blist__horizon-label">Looking further</span> ' + HORIZON[lvl] + '</div>'
      : '';
    var nextBulletHtml = nextBullets.length
      ? '<div class="cu-blist"><div class="cu-blist__label">To reach ' + esc(lvl < 4 ? LEVELS[lvl] : 'and maintain Leading') + '</div>' +
          '<p class="cu-ns__shift" style="margin:0 0 12px">' + esc(LEVEL_SHIFT[lvl - 1]) + '</p>' +
          '<ul>' +
          nextBullets.map(function (b) { return '<li><span class="cu-blist__mark">→</span> ' + esc(b) + '</li>'; }).join('') +
        '</ul><div class="cu-blist__close">' + closer + '</div>' + horizonHtml + '</div>'
      : '';
    var bulletsHtml = (wellHtml || nextBulletHtml)
      ? '<div class="cu-hero__bullets">' + wellHtml + nextBulletHtml + '</div>'
      : '';

    return '<div class="cu-hero">' +
      '<div class="cu-hero__top">' +
        '<div><div class="cu-hero__eyebrow">Your team\'s Claude adoption</div>' +
          '<div class="cu-hero__level">' +
            '<span class="cu-hero__level-num">Level ' + lvl + '</span>' +
            '<span class="cu-hero__level-name">' + LEVELS[lvl - 1] + '</span>' +
          '</div></div>' +
        '<div class="cu-hero__chip">' + (s.active_users || 0) + ' / ' + (s.licensed_users || 0) + ' active</div>' +
      '</div>' +
      '<div class="cu-steps">' + steps + '</div>' +
      '<div class="cu-steps__labels">' + stepLabels + '</div>' +
      bulletsHtml +
      '<div class="cu-hero__next" style="margin-top:14px">' + nextLine + '</div>' +
      '<div class="cu-ms-grid">' + msHtml + '</div>' +
      levelDefs +
    '</div>';
  }

  function scopeNote(scope) {
    if (!scope) return '';
    return '<p class="cu-scope"><strong>What this covers:</strong> ' + esc(scope.source) +
      ' — ' + esc(scope.includes) +
      ' <span class="cu-scope__excl">Excludes ' + esc(scope.excludes) + '</span></p>';
  }

  function renderClaudeUsage(container, data, opts) {
    opts = opts || {};
    var prev = opts.previous ? opts.previous.summary : null;
    var prevTime = opts.previous ? opts.previous.time_saved : null;
    var s = data.summary;
    var wfs = data.workflows || data.themes || [];
    var ts = data.time_saved || {};
    // Single "top user" concept = power user. Prefer the summary field; fall back
    // to the licence roster for snapshots taken before that field existed.
    var power = s.power_users != null
      ? s.power_users
      : (data.licences || []).filter(function (l) { return l.power_user; }).length;
    // Derive the headline total by SUMMING the per-workflow rows shown in the
    // breakdown, so the headline can never disagree with the dropdown (and we
    // don't rely on a separately-stored total that could drift).
    var tsLow = Math.round(wfs.reduce(function (a, w) { return a + (w.hours_low || 0); }, 0));
    var tsHigh = Math.round(wfs.reduce(function (a, w) { return a + (w.hours_high || 0); }, 0));

    var html =
      '<div class="cu">' +
        '<div class="cu-head">' +
          '<div><p class="cu-card__sub" style="margin:0">Claude adoption · ' + esc(data.agency) + '</p>' +
          '<p class="cu-head__period">' + fmtMonth(data.period) + '</p></div>' +
          '<div class="cu-head__actions">' +
            (opts.previous ? '' : '<span class="cu-badge">First reporting month</span>') +
            // Export-as-PDF uses the browser's native print → "Save as PDF". No
            // library/canvas, so text stays selectable and fonts stay sharp; the
            // print stylesheet (claude-usage.css @media print) isolates this report
            // from the surrounding admin chrome. Wired below via addEventListener
            // (not inline onclick) to stay within the hub's CSP.
            '<button type="button" class="cu-mode-toggle cu-dash-mode-toggle" aria-label="Toggle light/dark mode">◐ Light</button>' +
            '<button type="button" class="cu-print" aria-label="Export this report as a PDF to email to the agency">' +
              '<span aria-hidden="true">⤓</span> Export as PDF</button>' +
          '</div>' +
        '</div>' +

        gamifiedHero(s, wfs, power) +

        // Wins sits right after "What's going well" (inside the hero above) —
        // the two positive-framed sections read as one deliberate pass this
        // way, rather than being split apart by the KPI row in between.
        winsBlock(data.wins, wfs) +

        '<div class="cu-kpis">' +
          (function () {
            var vActive = s.active_users + '<span style="font-size:.42em;color:var(--c-stone)"> / ' + s.licensed_users + '</span>';
            var vConv = s.total_conversations;
            var vProj = s.total_projects;
            var vTime = '~' + tsLow + '–' + tsHigh + '<span style="font-size:.42em;color:var(--c-stone)"> h</span>';
            var tight = [vActive, vConv, vProj, vTime].some(function (v) { return kpiValueLen(v) > 7; });
            return (
              kpiCard('Active licences', vActive,
                s.agentic_usage_pct + '% using Claude deeply',
                deltaHTML(s.active_users, prev ? prev.active_users : null, 'active vs last month'),
                true, tight) +
              kpiCard('Conversations', vConv,
                (s.active_users
                  ? '<strong>' + (s.total_conversations / s.active_users).toFixed(1) + '</strong> per active licence'
                  : ''),
                deltaHTML(s.total_conversations, prev ? prev.total_conversations : null),
                false, tight) +
              kpiCard('Projects', vProj,
                s.shared_projects + ' shared with the team',
                deltaHTML(s.total_projects, prev ? prev.total_projects : null),
                false, tight) +
              kpiCard('Time saved to date', vTime,
                'cumulative · conservative estimate',
                deltaHTML(tsLow, prevTime ? prevTime.hours_low : null, 'low-end vs last month'),
                false, tight)
            );
          })() +
        '</div>' +

        '<div class="cu-card" style="margin-bottom:28px">' +
          '<div class="cu-card__title">Adoption trend</div>' +
          '<div class="cu-card__sub">Conversations per active user each week — normalised for team ' +
          'size, so it reflects how intensively the team uses Claude, not just how big it is</div>' +
          trendChart(data.weekly_activity) +
        '</div>' +

        '<div class="cu-grid">' +
          '<div class="cu-card">' +
            '<div class="cu-card__title">What the team uses Claude for</div>' +
            '<div class="cu-card__sub">Conversations by workflow, with top examples</div>' +
            themesBlock(data.workflows || data.themes) +
          '</div>' +
          '<div class="cu-card">' +
            '<div class="cu-card__title">Adoption depth</div>' +
            '<div class="cu-card__sub">How deeply your licences use Claude</div>' +
            funnelBlock(s, data.licences) +
          '</div>' +
        '</div>' +

        // Paired by theme, not by whatever happened to be written next to
        // whatever else: this row is "quality of engagement" (recency +
        // prompting skill), the row below is "kind of work" (tool actions +
        // file uploads). Neither card's content changed, just who it sits next to.
        '<div class="cu-grid">' +
          ((s.recently_active_users != null || s.lapsed_licences != null)
            ? '<div class="cu-card">' +
                '<div class="cu-card__title">Who\'s active, who\'s drifting</div>' +
                '<div class="cu-card__sub">Recency of use across every licence — and your re-engagement targets</div>' +
                statusBlock(s, data.as_of) +
              '</div>' : '') +
          '<div class="cu-card">' +
            '<div class="cu-card__title">Prompting quality</div>' +
            (data.prompt_quality
              ? '<div class="cu-card__sub">Scored by Claude during the monthly classification — based on the first prompt of each conversation</div>'
              : '<div class="cu-card__sub">Observable signals of how well the team is prompting — context loaded, capabilities used, and reasoning triggered</div>') +
            promptQualityBlock(s, data.prompt_quality) +
          '</div>' +
        '</div>' +

        // ── Kind-of-work row (progressive — each card renders only when its
        //    data is present, so older snapshots degrade gracefully) ──
        (data.tool_use_by_category || data.file_type_mix
          ? '<div class="cu-grid">' +
              (data.tool_use_by_category
                ? '<div class="cu-card">' +
                    '<div class="cu-card__title">How the team uses Claude\'s tools</div>' +
                    '<div class="cu-card__sub">"Tools" are when Claude goes beyond chat — searching the web, ' +
                    'writing or running code, analysing files and data, or using a connected app</div>' +
                    toolUseBlock(data.tool_use_by_category) +
                  '</div>' : '') +
              (data.file_type_mix
                ? '<div class="cu-card">' +
                    '<div class="cu-card__title">What they\'re working on</div>' +
                    '<div class="cu-card__sub">File types uploaded — a rough proxy for the kind of work</div>' +
                    fileTypeBlock(data.file_type_mix) +
                  '</div>' : '') +
            '</div>' : '') +

        '<div class="cu-card" style="margin-bottom:28px">' +
          '<div class="cu-card__title">Projects created</div>' +
          '<div class="cu-card__sub">What the team is building, and whether it is shared with colleagues</div>' +
          hygieneStrip(s) +
          projectsTable(data.projects) +
        '</div>' +

        '<div class="cu-card">' +
          '<div class="cu-card__title">Estimated time saved to date · ~' + tsLow + '–' + tsHigh + ' hours</div>' +
          '<div class="cu-card__sub">Cumulative since rollout — a deliberately conservative figure you can defend in the room</div>' +
          methodBlock(wfs, ts, tsLow, tsHigh) +
        '</div>' +

        scopeNote(data.scope) +

        // Print-only footer: names the report and stamps the data-handling note so
        // an emailed PDF carries its own context. Hidden on screen (see CSS).
        '<div class="cu-print-footer">' + esc(data.agency) + ' · Claude usage · ' +
          fmtMonth(data.period) + ' — Internal. Figures are anonymised; handle per ' +
          'Miroma\'s Claude usage-data policy.</div>' +
      '</div>';

    container.innerHTML = html;

    // Wire the light/dark toggle. Persists preference in localStorage.
    var cuRoot = container.querySelector('.cu');
    var cuModeBtn = container.querySelector('.cu-dash-mode-toggle');
    if (cuModeBtn && cuRoot) {
      var outerWrapCu = container.parentElement;

      var darkArrowCu = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='rgba(255,255,255,0.4)' fill='none' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E\")";
      var lightArrowCu = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='rgba(0,0,0,0.4)' fill='none' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E\")";
      function applyThemeCu(light) {
        cuRoot.classList.toggle('cu--light', light);
        cuModeBtn.textContent = light ? '◐ Dark' : '◐ Light';
        cuModeBtn.classList.toggle('cu-mode-toggle--active', light);
        if (outerWrapCu) outerWrapCu.style.background = light ? '#fff' : '#0B0B13';
        document.body.classList.toggle('ltx-light-mode', light);
        // Claude Usage uses #cuAgencySelect (.cu-select); LTX uses #ltxAgencySelect (.cu-agency-select).
        // .cu-select light mode is handled by CSS (.cu--light .cu-select), so no inline override needed.
        // #ltxAgencySelect has inline styles that block CSS, so flip those directly.
        var ltxSel = document.getElementById('ltxAgencySelect');
        if (ltxSel) {
          ltxSel.style.backgroundColor = light ? '#f5f5f2' : '#111120';
          ltxSel.style.color = light ? '#111' : '#fff';
          ltxSel.style.borderColor = light ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.12)';
          ltxSel.style.backgroundImage = light ? lightArrowCu : darkArrowCu;
        }
      }

      var cuLight = localStorage.getItem('hub-theme') === 'light';
      applyThemeCu(cuLight);

      cuModeBtn.addEventListener('click', function () {
        cuLight = !cuLight;
        applyThemeCu(cuLight);
        localStorage.setItem('hub-theme', cuLight ? 'light' : 'dark');
      });

      // Stay in sync if the other dashboard changes the theme
      window.addEventListener('storage', function (e) {
        if (e.key === 'hub-theme') { cuLight = e.newValue === 'light'; applyThemeCu(cuLight); }
      });
    }

    // Wire the Export-as-PDF button. Setting document.title gives the browser's
    // "Save as PDF" a sensible default filename (e.g. "Maker-Lab-Claude-Usage-June-2026"),
    // restored afterwards so the admin's tab title isn't left changed.
    var printBtn = container.querySelector('.cu-print');
    if (printBtn) {
      printBtn.addEventListener('click', function () {
        var original = document.title;
        var fname = (data.agency + ' Claude Usage ' + fmtMonth(data.period))
          .replace(/[^\w \-]+/g, '').trim().replace(/\s+/g, '-');
        document.title = fname;
        // Expand any collapsed disclosures (time-saved method, project
        // descriptions) so they appear in the PDF, then restore them after —
        // doing this in JS is more reliable across browsers than CSS alone.
        var reopened = [];
        container.querySelectorAll('details:not([open])').forEach(function (d) {
          d.open = true; reopened.push(d);
        });
        var restore = function () {
          document.title = original;
          reopened.forEach(function (d) { d.open = false; });
          window.removeEventListener('afterprint', restore);
        };
        window.addEventListener('afterprint', restore);
        window.print();
      });
    }
  }

  global.renderClaudeUsage = renderClaudeUsage;
  // Exposed so js/group-report.js can compute each agency's adoption stage
  // the exact same way this file does for its own single-agency hero card —
  // one source of truth for the Exploring/Adopting/Embedded/Leading
  // thresholds, rather than a second copy that can silently drift.
  global.levelFor = levelFor;
})(window);
