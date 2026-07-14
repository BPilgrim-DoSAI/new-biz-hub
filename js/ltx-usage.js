// ── LTX Studio Usage Dashboard Renderer ────────────────────────────────────
//
// window.renderLtxUsage(container, data, opts)
//
// data shape (from Firestore /ltx_usage/{agencyKey}/snapshots/{period}):
//   { period, agency, agencyKey, summary, credit_by_type, generations_by_type, users }
//
// opts:
//   opts.seats          — number of paid seats (for allocation bar)
//   opts.creditsPerSeat — annual credits per seat (default 1,263,158)
//   opts.monthElapsed   — months elapsed in contract year (default: derived from period)

(function () {
  'use strict';

  var CREDITS_PER_SEAT_DEFAULT = 1263158;

  // ── Design tokens — Miroma Group dark studio system ──────────────────────
  var T = {
    bg:       'var(--ltx-bg)',
    surface:  'var(--ltx-surface)',
    border:   'var(--ltx-border)',
    divider:  'var(--ltx-divider)',
    text:     'var(--ltx-text)',
    muted:    'var(--ltx-muted)',
    sub:      'var(--ltx-sub)',
    track:    'var(--ltx-track)',
    barFill:  'var(--ltx-bar)',
    barMuted: 'var(--ltx-bar-mut)',
    accent:   'var(--ltx-accent)',
    red:      'var(--ltx-red)',
    redLo:    'var(--ltx-red-lo)',
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmt(n) { return Number(n || 0).toLocaleString('en-GB'); }

  function cleanText(v) {
    var t = String(v == null ? '' : v).trim();
    if (!t || t.toLowerCase() === 'null' || t.toLowerCase() === 'undefined') return '—';
    return t;
  }

  function fmtCompact(n) {
    n = Number(n || 0);
    if (n >= 1000000) return (n / 1000000).toFixed(2).replace(/\.?0+$/, '') + 'M';
    if (n >= 1000)    return (n / 1000).toFixed(1).replace(/\.?0+$/, '') + 'K';
    return String(n);
  }

  function fmtDate(s) {
    if (!s) return '—';
    var d = new Date(s);
    return isNaN(d) ? s : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0] ? parts[0].slice(0, 2).toUpperCase() : '?';
  }

  // Inline CSS for an element
  function s(obj) {
    return 'style="' + Object.entries(obj).map(function(kv) { return kv[0] + ':' + kv[1]; }).join(';') + '"';
  }

  function splitUnit(str) {
    str = String(str);
    var m = str.match(/^([\d,\.]+)([A-Za-z%].*)$/);
    return m ? { num: m[1], unit: m[2] } : { num: str, unit: '' };
  }

  // KPI number with half-size unit suffix
  function kpiNum(str, unitOverride) {
    var parts = (unitOverride !== undefined)
      ? { num: String(str), unit: unitOverride }
      : splitUnit(String(str));
    return esc(parts.num) +
      (parts.unit
        ? '<span style="font-size:.42em;font-weight:500;color:' + T.muted + ';letter-spacing:0">' + esc(parts.unit) + '</span>'
        : '');
  }

  var FONT = 'PPNeueMontreal,system-ui,sans-serif';

  // ── Shared card wrapper ───────────────────────────────────────────────────
  function card(content, extra) {
    extra = extra || '';
    return (
      '<div ' + s({ background: T.surface, border: '1px solid ' + T.border, 'border-radius': '8px', padding: '22px 24px', 'margin-bottom': '12px' }) + extra + '>' +
        content +
      '</div>'
    );
  }

  function sectionLabel(text) {
    return '<div ' + s({ 'font-size': '12px', 'font-weight': '500', 'text-transform': 'uppercase', 'letter-spacing': '0.13em', color: T.muted, 'margin-bottom': '16px', 'font-family': FONT }) + '>' + esc(text) + '</div>';
  }

  // ── Badge ─────────────────────────────────────────────────────────────────
  function badge(label, bg, color) {
    return '<span ' + s({
      display: 'inline-block', 'font-size': '9px', 'font-weight': '600',
      'text-transform': 'uppercase', 'letter-spacing': '0.06em',
      padding: '2px 6px', 'border-radius': '0',
      background: bg, color: color, 'margin-left': '5px', 'vertical-align': 'middle',
    }) + '>' + esc(label) + '</span>';
  }

  // ── Working days since first access ──────────────────────────────────────
  // Returns the approximate number of working days (Mon–Fri) between two
  // date strings. Uses a 5/7 ratio — close enough without needing a holiday
  // calendar and avoids misleading false precision.
  function workingDaysSince(firstActive, periodEnd) {
    if (!firstActive) return null;
    var start = new Date(firstActive);
    var end   = periodEnd ? new Date(periodEnd) : new Date();
    if (isNaN(start) || isNaN(end)) return null;
    var calDays = Math.max(1, Math.round((end - start) / 86400000));
    return Math.max(1, Math.round(calDays * 5 / 7));
  }

  // Last day of a YYYY-MM period string
  function periodEndDate(period) {
    if (!period) return null;
    var parts = period.split('-');
    var year  = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);
    // Day 0 of next month = last day of this month
    return new Date(year, month, 0).toISOString().slice(0, 10);
  }

  // ── Actionable insights ───────────────────────────────────────────────────
  // Derives 3-4 short insight bullets from the data that the agency manager
  // can act on — unused seats, power users, pace vs contract, engagement dips.
  function insightBullets(sum, users, allocation, elapsed, period) {
    var bullets = [];
    var used    = sum.total_tokens || 0;
    var pctUsed = allocation ? (used / allocation) * 100 : null;
    var pacePct = (elapsed / 12) * 100;

    // 1. Pace vs contract
    if (pctUsed !== null) {
      if (pctUsed < pacePct - 15) {
        bullets.push('Usage is running <strong>below pace</strong> (' + pctUsed.toFixed(1) + '% used vs ' + Math.round(pacePct) + '% of the year elapsed) — consider a team reminder or a focused project sprint to make use of the allocation.');
      } else if (pctUsed > pacePct + 15) {
        bullets.push('Usage is running <strong>above pace</strong> (' + pctUsed.toFixed(1) + '% used vs ' + Math.round(pacePct) + '% of the year elapsed) — monitor remaining credits and plan workload accordingly.');
      } else {
        bullets.push('Usage is <strong>on track</strong> relative to the contract year (' + pctUsed.toFixed(1) + '% of credits used, ' + Math.round(pacePct) + '% of the year elapsed).');
      }
    }

    if (users && users.length) {
      var periodEnd = periodEndDate(period);

      // 2. Inactive licence holders — low or zero usage
      var inactive = users.filter(function(u) {
        return !u.unlicensed && (u.tokens_consumed || 0) < 50000;
      });
      if (inactive.length) {
        var names = inactive.slice(0, 3).map(function(u) { return u.label.split(' ')[0]; }).join(', ');
        var extra = inactive.length > 3 ? ' and ' + (inactive.length - 3) + ' more' : '';
        bullets.push('<strong>' + inactive.length + ' paid seat' + (inactive.length > 1 ? 's' : '') + ' with minimal activity</strong> (' + names + extra + ') — consider reallocating to colleagues on the waiting list or following up to understand blockers.');
      }

      // 3. Power users — top 2 by tokens
      var sorted = users.slice().sort(function(a, b) { return (b.tokens_consumed || 0) - (a.tokens_consumed || 0); });
      var topTwo = sorted.slice(0, 2).filter(function(u) { return (u.tokens_consumed || 0) > 0; });
      if (topTwo.length) {
        var topShare = topTwo.reduce(function(acc, u) { return acc + (u.tokens_consumed || 0); }, 0);
        var topPct   = used ? Math.round((topShare / used) * 100) : 0;
        var topNames = topTwo.map(function(u) { return u.label.split(' ')[0]; }).join(' and ');
        bullets.push('<strong>Power users identified:</strong> ' + topNames + ' account for ' + topPct + '% of team credits combined — candidates for internal case studies or peer-led training sessions.');
      }

      // 4. Engagement — are people using it regularly?
      var withDays = users.filter(function(u) { return (u.active_days || 0) > 0 && u.first_active; });
      if (withDays.length) {
        var avgPct = withDays.reduce(function(acc, u) {
          var wd = workingDaysSince(u.first_active, periodEnd);
          return acc + (wd ? Math.min(100, Math.round((u.active_days / wd) * 100)) : 0);
        }, 0) / withDays.length;
        if (avgPct < 40) {
          bullets.push('Average working-day engagement across the team is <strong>' + Math.round(avgPct) + '%</strong> — users are logging in less than half their available working days. Structured prompts, project challenges, or a monthly LTX tips session could help build the habit.');
        } else if (avgPct >= 70) {
          bullets.push('Strong day-to-day engagement: team members are active on <strong>' + Math.round(avgPct) + '%</strong> of their available working days on average.');
        }
      }
    }

    return bullets;
  }

  // ── KPI cards ─────────────────────────────────────────────────────────────
  function kpiRow(s_data, allocation, elapsed, users) {
    // "Total Users" replaces "Active Users" — active can mean many things.
    // Show registered (or licensed) as the headline; paid seats underneath.
    var totalUsers = s_data.registered_users != null
      ? s_data.registered_users
      : (s_data.active_users ?? '—');
    var subUsers = (s_data.licensed_active_users != null)
      ? s_data.licensed_active_users + ' paid'
      : '';

    // "Credits Used" headline is now the percentage of allocation rather than
    // a large token number that is hard to contextualise at a glance.
    var pctUsed    = allocation ? ((s_data.total_tokens || 0) / allocation * 100) : null;
    var creditsVal = pctUsed !== null ? pctUsed.toFixed(1) + '%' : fmtCompact(s_data.total_tokens);
    var subCredits = allocation
      ? fmtCompact(s_data.total_tokens || 0) + ' of ' + fmtCompact(allocation) + ' credits'
      : '';

    function kpi(label, valueHtml, sub, highlight) {
      var topBorder = highlight ? T.accent : T.border;
      return (
        '<div class="ltx-kpi" ' + s({ flex: '1', 'min-width': '140px', 'box-sizing': 'border-box', background: T.surface, border: '1px solid ' + T.border, 'border-top': '3px solid ' + topBorder, 'border-radius': '8px', padding: '22px 22px 18px' }) + '>' +
          '<div ' + s({ 'font-size': '12px', 'font-weight': '500', 'text-transform': 'uppercase', 'letter-spacing': '.13em', color: T.muted, 'margin-bottom': '16px', 'font-family': FONT }) + '>' + esc(label) + '</div>' +
          '<div ' + s({ 'font-size': 'clamp(28px,3.8vw,52px)', 'font-weight': '500', 'letter-spacing': '-0.022em', 'line-height': '.92', color: T.text, 'margin-bottom': '8px', 'font-variant-numeric': 'tabular-nums', 'font-family': FONT, 'overflow-wrap': 'anywhere' }) + '>' + valueHtml + '</div>' +
          '<div ' + s({ 'font-size': '13px', color: T.muted }) + '>' + sub + '</div>' +
        '</div>'
      );
    }

    return (
      '<div class="ltx-kpis" ' + s({ display: 'flex', gap: '12px', 'flex-wrap': 'wrap', 'margin-bottom': '12px' }) + '>' +
        kpi('Total Users', kpiNum(String(totalUsers)), subUsers, false) +
        kpi('Credits Used', kpiNum(creditsVal), subCredits, true) +
        kpi('Total Generations', kpiNum(fmt(s_data.total_generations)), s_data.top_gen_type ? 'Top: ' + esc(s_data.top_gen_type) : '', false) +
        (s_data.estimated_hours_saved != null ? (function() {
          var totalDays = Math.round((s_data.estimated_hours_saved / 8) * 10) / 10;
          var activeUsers = s_data.active_users || 1;
          var daysPerUser = Math.round((s_data.estimated_hours_saved / activeUsers / 8) * 10) / 10;
          return kpi('Est. Time Saved', kpiNum(totalDays, ' days'), daysPerUser + ' days per user · see methodology note', false);
        })() : '') +
      '</div>' +
      (s_data.estimated_hours_saved != null
        ? '<p ' + s({ 'font-size': '11px', color: T.sub, 'margin-top': '-4px', 'margin-bottom': '12px', 'font-style': 'italic', 'line-height': '1.6' }) + '>' +
          '<strong ' + s({ color: T.sub }) + '>Estimated time saved — methodology:</strong> ' +
          'Total across all users (' + s_data.estimated_hours_saved + ' hours = ' + Math.round(s_data.estimated_hours_saved / 8 * 10) / 10 + ' days). ' +
          'Each generation is assumed to be one of ~10 iterations needed to reach a usable final output. ' +
          'Image-type generations (stills, upscales, storyboards) are benchmarked at 30 minutes of equivalent manual effort per final output (3 min per generation). ' +
          'Video-type generations (video, audio-to-video, retakes) are benchmarked at 3 hours per final output (18 min per generation). ' +
          'Manual benchmarks are conservative estimates based on typical creative production time at Miroma agencies. ' +
          'Actual time saved will vary by user, project, and output quality required.' +
          '</p>'
        : '')
    );
  }

  // ── Allocation bar ────────────────────────────────────────────────────────
  // Percentage is now the headline figure; raw token counts are secondary.
  function allocationBar(used, allocation, elapsed) {
    if (!allocation) return '';
    var pctUsed    = Math.min((used / allocation) * 100, 100);
    var pctRemain  = Math.max(0, 100 - pctUsed);
    var pacePct    = Math.round((elapsed / 12) * 100);
    var underPace  = pctUsed < pacePct - 10;
    var overPace   = pctUsed > pacePct + 10;
    var statusText  = underPace ? 'Under pace' : (overPace ? 'Above pace' : 'On track');
    var statusColor = underPace ? T.accent : (overPace ? T.muted : T.text);

    return card(
      sectionLabel('Annual Credit Allocation') +
      '<div ' + s({ 'margin-bottom': '20px' }) + '>' +
        '<div ' + s({ 'font-size': '42px', 'font-weight': '500', 'letter-spacing': '-0.022em', color: T.text, 'font-variant-numeric': 'tabular-nums', 'font-family': FONT, 'line-height': '1' }) + '>' + pctUsed.toFixed(1) + '%</div>' +
        '<div ' + s({ 'font-size': '11px', 'font-weight': '500', 'text-transform': 'uppercase', 'letter-spacing': '0.08em', color: T.muted, 'margin-top': '4px' }) + '>Used · ' + fmtCompact(used) + ' of ' + fmtCompact(allocation) + ' credits</div>' +
      '</div>' +
      '<div ' + s({ position: 'relative', height: '8px', background: T.track, 'overflow-x': 'hidden', 'overflow-y': 'visible', 'border-radius': '4px', 'margin-bottom': '10px' }) + '>' +
        '<div ' + s({ position: 'absolute', top: '0', left: '0', height: '100%', width: pctUsed.toFixed(1) + '%', background: T.barFill, 'border-radius': '4px' }) + '></div>' +
        '<div ' + s({ position: 'absolute', top: '-6px', bottom: '-6px', left: pacePct + '%', width: '2px', background: T.accent }) + ' title="Expected pace (' + pacePct + '%)"></div>' +
      '</div>' +
      '<div ' + s({ display: 'flex', 'justify-content': 'space-between', 'font-size': '12px', 'margin-top': '6px' }) + '>' +
        '<span ' + s({ color: statusColor }) + '>' + pctUsed.toFixed(1) + '% used — ' + statusText + ' for month ' + elapsed + ' of 12 <span ' + s({ color: T.accent }) + '>(marker = expected ' + pacePct + '%)</span></span>' +
        '<span ' + s({ color: T.muted }) + '>' + fmtCompact(allocation) + ' total allocation</span>' +
      '</div>'
    );
  }

  // ── Token split ───────────────────────────────────────────────────────────
  function tokenSplit(videoTokens, imageTokens) {
    var total = (videoTokens || 0) + (imageTokens || 0);
    if (!total) return '';
    var vPct = Math.round((videoTokens / total) * 100);
    var iPct = 100 - vPct;
    return (
      '<div ' + s({ background: T.surface, border: '1px solid ' + T.border, 'border-radius': '8px', padding: '22px 24px', 'margin-bottom': '12px' }) + '>' +
        sectionLabel('Token split — video vs image') +
        '<div ' + s({ display: 'flex', height: '8px', overflow: 'hidden', gap: '2px', 'border-radius': '4px', 'margin-bottom': '12px' }) + '>' +
          '<div ' + s({ flex: String(vPct), background: T.barMuted }) + '></div>' +
          '<div ' + s({ flex: String(iPct), background: T.barFill }) + '></div>' +
        '</div>' +
        '<div ' + s({ display: 'flex', gap: '20px', 'font-size': '12px', color: T.muted }) + '>' +
          '<span><span ' + s({ display: 'inline-block', width: '7px', height: '7px', background: T.barMuted, 'margin-right': '5px', 'vertical-align': 'middle' }) + '></span>Video ' + vPct + '%</span>' +
          '<span><span ' + s({ display: 'inline-block', width: '7px', height: '7px', background: T.barFill, 'margin-right': '5px', 'vertical-align': 'middle' }) + '></span>Image ' + iPct + '%</span>' +
        '</div>' +
      '</div>'
    );
  }

  // ── Combined activity chart ────────────────────────────────────────────────
  // One bar per activity type, sized by credits. Both the credit total and
  // generation count are shown as text labels to the right of the bar.
  function activityChart(creditItems, genItems) {
    var genMap = {};
    genItems.forEach(function(g) { genMap[g.label] = g.value; });

    var maxTokens = Math.max.apply(null, creditItems.map(function(i) { return i.value; }).concat([1]));

    return creditItems.map(function(item) {
      var pct      = Math.round((item.value / maxTokens) * 100);
      var genCount = genMap[item.label] || 0;
      return (
        '<div ' + s({ display: 'flex', 'align-items': 'center', gap: '10px', 'margin-bottom': '10px' }) + '>' +
          '<span ' + s({ width: '130px', 'flex-shrink': '0', 'font-size': '12px', color: T.muted, 'text-align': 'right', 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis' }) + ' title="' + esc(item.label) + '">' + esc(item.label) + '</span>' +
          '<div ' + s({ flex: '1', height: '6px', background: T.track, overflow: 'hidden', 'border-radius': '4px' }) + '>' +
            '<div ' + s({ width: pct + '%', height: '100%', background: T.barFill }) + '></div>' +
          '</div>' +
          '<span ' + s({ 'flex-shrink': '0', 'font-size': '11px', color: T.muted, 'text-align': 'right', 'font-variant-numeric': 'tabular-nums', 'white-space': 'nowrap' }) + '>' +
            fmt(genCount) + ' gen' +
          '</span>' +
        '</div>'
      );
    }).join('');
  }

  // ── Credit usage by user ──────────────────────────────────────────────────
  function userRows(users, agencyTotalUsed, period) {
    if (!users || !users.length) {
      return '<p ' + s({ 'font-size': '13px', color: T.muted }) + '>No user data available.</p>';
    }

    var maxTokens = Math.max.apply(null, users.map(function(u) { return u.tokens_consumed || 0; }).concat([1]));
    var periodEnd = periodEndDate(period);

    var rows = users.map(function(u) {
      var barPct   = Math.round(((u.tokens_consumed || 0) / maxTokens) * 100);
      var sharePct = agencyTotalUsed ? ((u.tokens_consumed / agencyTotalUsed) * 100).toFixed(1) : '0';
      var isCode   = u.user_type === 'Code';
      var ini      = initials(u.label);

      var workingDaysTotal = workingDaysSince(u.first_active, periodEnd);
      var activeDaysPct = (workingDaysTotal && u.active_days)
        ? Math.min(100, Math.round((u.active_days / workingDaysTotal) * 100))
        : null;
      var activeDaysLabel = (u.active_days || 0) + ' active days' +
        (activeDaysPct !== null ? ' (' + activeDaysPct + '% of working days)' : '');

      var ssoBadge   = isCode ? badge('Code', 'rgba(255,226,85,0.12)', T.accent) : badge('SSO', 'rgba(255,255,255,0.08)', T.muted);
      var unlicBadge = u.unlicensed ? badge('Unpaid seat', T.redLo, T.red) : '';
      var avatarBg    = u.unlicensed ? T.redLo  : 'transparent';
      var avatarBord  = u.unlicensed ? 'rgba(239,68,68,0.4)' : T.border;
      var avatarColor = u.unlicensed ? T.red     : T.muted;
      var barFill     = u.unlicensed ? T.red     : T.barFill;
      var tokenColor  = u.unlicensed ? T.red     : T.text;

      return (
        '<div ' + s({ display: 'flex', 'align-items': 'center', gap: '12px', padding: '11px 0', 'border-bottom': '1px solid ' + T.divider }) + '>' +
          '<div ' + s({ width: '32px', height: '32px', 'border-radius': '50%', background: avatarBg, border: '1px solid ' + avatarBord, display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'font-size': '11px', 'font-weight': '600', color: avatarColor, 'flex-shrink': '0', 'font-family': FONT }) + '>' + esc(ini) + '</div>' +
          '<div ' + s({ flex: '1', 'min-width': '0' }) + '>' +
            '<div ' + s({ 'font-size': '13px', 'font-weight': '500', display: 'flex', 'align-items': 'center', 'flex-wrap': 'wrap', color: T.text, 'font-family': FONT }) + '>' + esc(u.label) + ssoBadge + unlicBadge + '</div>' +
            '<div ' + s({ 'font-size': '11px', color: T.muted, 'margin-top': '3px', 'margin-bottom': '6px' }) + '>' + esc(cleanText(u.apollo_title)) + ' · ' + activeDaysLabel + ' · last active ' + fmtDate(u.last_active) + '</div>' +
            '<div ' + s({ height: '3px', background: T.track, overflow: 'hidden', 'border-radius': '4px' }) + '>' +
              '<div ' + s({ width: barPct + '%', height: '100%', background: barFill }) + '></div>' +
            '</div>' +
          '</div>' +
          '<div ' + s({ 'text-align': 'right', 'flex-shrink': '0', width: '100px' }) + '>' +
            '<div ' + s({ 'font-size': '13px', 'font-weight': '500', color: tokenColor, 'font-variant-numeric': 'tabular-nums', 'font-family': FONT }) + '>' + fmt(u.tokens_consumed) + '</div>' +
            '<div ' + s({ 'font-size': '11px', color: T.muted }) + '>' + sharePct + '% of pool</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    return (
      '<div ' + s({ background: T.surface, border: '1px solid ' + T.border, 'border-radius': '8px', padding: '22px 24px', 'margin-bottom': '12px' }) + '>' +
        sectionLabel('Credit usage by user') +
        rows +
        '<p ' + s({ 'font-size': '11px', color: T.sub, 'margin-top': '14px', 'font-style': 'italic', 'line-height': '1.6' }) + '>Bars relative to heaviest user. Active-day % = active days ÷ estimated working days since first access (Mon–Fri, approx). Agency pool is shared. Code = SSO not yet configured. Unpaid seat = used credits but not on the paid-seat list.</p>' +
      '</div>'
    );
  }

  // ── Activity type by user ─────────────────────────────────────────────────
  // Shows how each user splits their credits across activity types (image,
  // video, upscale, etc.) as a column per user. Bars are normalised within
  // each user's own total so the pattern of use is easy to compare across the
  // team — it shows *how* they use the tool, not how much.
  function userActivityBreakdown(users, period) {
    var withData = (users || []).filter(function(u) {
      return u.credit_by_type && u.credit_by_type.length;
    });
    if (!withData.length) return '';

    var periodEnd = periodEndDate(period);

    var cols = withData.map(function(u) {
      var total = u.credit_by_type.reduce(function(acc, c) { return acc + c.tokens; }, 0) || 1;
      var bars  = u.credit_by_type.map(function(c) {
        var pct = Math.round((c.tokens / total) * 100);
        return (
          '<div ' + s({ 'margin-bottom': '8px' }) + '>' +
            '<div ' + s({ display: 'flex', 'justify-content': 'space-between', 'font-size': '10px', color: T.muted, 'margin-bottom': '3px', gap: '4px' }) + '>' +
              '<span ' + s({ overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }) + '>' + esc(c.type) + '</span>' +
              '<span ' + s({ 'flex-shrink': '0', 'font-variant-numeric': 'tabular-nums' }) + '>' + pct + '%</span>' +
            '</div>' +
            '<div ' + s({ height: '4px', background: T.track, overflow: 'hidden', 'border-radius': '4px' }) + '>' +
              '<div ' + s({ width: pct + '%', height: '100%', background: T.barFill }) + '></div>' +
            '</div>' +
          '</div>'
        );
      }).join('');

      var wd  = workingDaysSince(u.first_active, periodEnd);
      var pct = (wd && u.active_days) ? Math.min(100, Math.round((u.active_days / wd) * 100)) : null;

      return (
        '<div ' + s({ 'min-width': '160px', flex: '1' }) + '>' +
          '<div ' + s({ 'font-size': '12px', 'font-weight': '500', color: T.text, 'font-family': FONT, 'margin-bottom': '2px', 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis' }) + '>' + esc(u.label) + '</div>' +
          '<div ' + s({ 'font-size': '10px', color: T.muted, 'margin-bottom': '10px' }) + '>' +
            fmtCompact(u.tokens_consumed) + ' credits' +
            (pct !== null ? ' · ' + pct + '% days active' : '') +
          '</div>' +
          bars +
        '</div>'
      );
    }).join('');

    return (
      '<div ' + s({ background: T.surface, border: '1px solid ' + T.border, 'border-radius': '8px', padding: '22px 24px', 'margin-bottom': '12px' }) + '>' +
        sectionLabel('Activity type by user') +
        '<div ' + s({ display: 'flex', gap: '24px', 'flex-wrap': 'wrap' }) + '>' +
          cols +
        '</div>' +
        '<p ' + s({ 'font-size': '11px', color: T.sub, 'margin-top': '14px', 'font-style': 'italic', 'line-height': '1.6' }) + '>Shows each person\'s own credit split — how they use the tool, not how much. Percentages are normalised per user. Monthly period data will enable trend views as reports accumulate.</p>' +
      '</div>'
    );
  }

  // ── Derive months elapsed from period string ──────────────────────────────
  function monthsElapsed(period) {
    // Contract runs Jan 2026 – Jan 2027. Period is 'YYYY-MM'.
    if (!period) return 6;
    var parts = period.split('-');
    var year  = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);
    var elapsed = (year - 2026) * 12 + month;
    return Math.max(1, Math.min(12, elapsed));
  }

  // ── Report head + Export-as-PDF button ────────────────────────────────────
  function ltxHead(agency, period) {
    var monthLabel = period
      ? new Date(period + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      : '';
    return '<div class="cu-head" style="margin-bottom:18px">' +
      '<div><p class="cu-card__sub" style="margin:0">LTX Studio usage · ' + esc(agency || '') + '</p>' +
        (monthLabel ? '<p class="cu-head__period">' + esc(monthLabel) + '</p>' : '') +
      '</div>' +
      '<div class="cu-head__actions">' +
        '<button type="button" class="cu-mode-toggle ltx-mode-toggle" aria-label="Toggle light/dark mode">◐ Light</button>' +
        '<button type="button" class="cu-print" aria-label="Export this report as a PDF to email to the agency">' +
          '<span aria-hidden="true">⤓</span> Export as PDF</button>' +
      '</div>' +
    '</div>';
  }

  // ── Adoption hero ─────────────────────────────────────────────────────────
  // Headline shows the % of annual allocation used. Below it: actionable
  // insights rather than a raw credit count, so the viewer knows what to do.
  function ltxHero(sum, allocation, elapsed, period, users) {
    var periodLabel = period
      ? new Date(period + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) +
        ' · month ' + elapsed + ' of 12'
      : '';
    var used = sum.total_tokens || 0;

    var headline, line;
    if (allocation) {
      var pctUsed  = (used / allocation) * 100;
      var pacePct  = (elapsed / 12) * 100;
      var underPace = pctUsed < pacePct - 10;
      var overPace  = pctUsed > pacePct + 10;
      headline = pctUsed.toFixed(1) + '% of annual allocation used';
      var paceVerdict = underPace ? 'below pace' : (overPace ? 'above pace' : 'on track');
      line = Math.round(pacePct) + '% of the contract year has elapsed — usage is ' + paceVerdict + '.';
    } else {
      headline = fmtCompact(used) + ' credits used';
      line = fmt(used) + ' credits across ' + fmt(sum.total_generations || 0) + ' generations this period.';
    }

    // Actionable insights
    var bullets = insightBullets(sum, users, allocation, elapsed, period);
    var insightsHtml = '';
    if (bullets.length) {
      insightsHtml =
        '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--ltx-border)">' +
          '<div style="font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--ltx-muted);margin-bottom:10px">Key actions &amp; observations</div>' +
          bullets.map(function(b) {
            return '<div style="font-size:13px;line-height:1.55;color:var(--ltx-text);margin-bottom:8px;padding-left:14px;position:relative">' +
              '<span style="position:absolute;left:0;top:.3em;width:5px;height:5px;background:var(--ltx-accent);display:inline-block"></span>' +
              b +
            '</div>';
          }).join('') +
        '</div>';
    }

    return '<div class="cu-hero" style="margin-top:0">' +
      '<div class="cu-hero__top">' +
        '<div>' +
          '<div class="cu-hero__eyebrow">Your team\'s LTX Studio usage</div>' +
          '<div class="cu-hero__level">' +
            (periodLabel ? '<span class="cu-hero__level-num">' + esc(periodLabel) + '</span>' : '') +
            '<span class="cu-hero__level-name">' + esc(headline) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="cu-hero__line">' + esc(line) + '</div>' +
      insightsHtml +
    '</div>';
  }

  // ── Main render ───────────────────────────────────────────────────────────
  function renderLtxUsage(container, data, opts) {
    if (!container || !data) return;
    opts = opts || {};

    var sum         = data.summary || {};
    var seats       = opts.seats || 0;
    var credPerSeat = opts.creditsPerSeat || CREDITS_PER_SEAT_DEFAULT;
    var allocation  = seats ? seats * credPerSeat : 0;
    var elapsed     = opts.monthElapsed || monthsElapsed(data.period);

    var creditItems = (data.credit_by_type || []).slice(0, 8).map(function(g) {
      return { label: g.type, value: g.tokens };
    });
    var genItems = (data.generations_by_type || []).slice(0, 8).map(function(g) {
      return { label: g.type, value: g.count };
    });

    container.innerHTML = (
      '<div class="ltx">' +

      ltxHead(data.agency, data.period) +

      ltxHero(sum, allocation, elapsed, data.period, data.users) +

      kpiRow(sum, allocation, elapsed, data.users) +

      (allocation ? allocationBar(sum.total_tokens || 0, allocation, elapsed) : '') +

      tokenSplit(sum.video_tokens, sum.image_tokens) +

      (creditItems.length
        ? '<div ' + s({ background: T.surface, border: '1px solid ' + T.border, 'border-radius': '8px', padding: '22px 24px', 'margin-bottom': '12px' }) + '>' +
            sectionLabel('Activity breakdown') +
            activityChart(creditItems, genItems) +
            '<p ' + s({ 'font-size': '11px', color: T.sub, 'margin-top': '10px', 'font-style': 'italic' }) + '>Bar sized by credits used. Labels show credits · generations.</p>' +
          '</div>'
        : '') +

      userRows(data.users, sum.total_tokens, data.period) +

      '<div class="cu-print-footer">' + esc(data.agency || '') + ' · LTX Studio usage · ' +
        esc(data.period
          ? new Date(data.period + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
          : '') +
        ' — Internal. Handle per Miroma\'s data-handling policy.</div>' +
      '</div>'
    );

    // Wire the light/dark toggle. Persists preference in localStorage.
    // Also walks up the DOM to flip any dark outer-wrapper backgrounds so the
    // whole page goes white, not just the dashboard card.
    var ltxRoot = container.querySelector('.ltx');
    var modeBtn = container.querySelector('.ltx-mode-toggle');
    if (modeBtn && ltxRoot) {
      // Find the nearest ancestor that has an explicit dark background we need
      // to flip (the admin panel wraps the dashboard in a #0B0B13 container).
      var outerWrap = container.parentElement;

      var darkArrow = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='rgba(255,255,255,0.4)' fill='none' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E\")";
      var lightArrow = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='rgba(0,0,0,0.4)' fill='none' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E\")";
      function applyTheme(light) {
        ltxRoot.classList.toggle('ltx--light', light);
        modeBtn.textContent = light ? '◐ Dark' : '◐ Light';
        modeBtn.classList.toggle('cu-mode-toggle--active', light);
        if (outerWrap) outerWrap.style.background = light ? '#fff' : '#0B0B13';
        document.body.classList.toggle('ltx-light-mode', light);
        // Flip agency dropdown colours (its background/colour are inline styles)
        var sel = document.getElementById('ltxAgencySelect');
        if (sel) {
          sel.style.backgroundColor = light ? '#f5f5f2' : '#111120';
          sel.style.color = light ? '#111' : '#fff';
          sel.style.borderColor = light ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.12)';
          sel.style.backgroundImage = light ? lightArrow : darkArrow;
        }
      }

      var isLight = localStorage.getItem('hub-theme') === 'light';
      applyTheme(isLight);

      modeBtn.addEventListener('click', function () {
        isLight = !isLight;
        applyTheme(isLight);
        localStorage.setItem('hub-theme', isLight ? 'light' : 'dark');
      });

      // Stay in sync if the other dashboard changes the theme
      window.addEventListener('storage', function (e) {
        if (e.key === 'hub-theme') { isLight = e.newValue === 'light'; applyTheme(isLight); }
      });
    }

    var printBtn = container.querySelector('.cu-print');
    if (printBtn) {
      printBtn.addEventListener('click', function () {
        var original = document.title;
        var fname = ((data.agency || 'LTX') + ' LTX Usage ' +
          (data.period
            ? new Date(data.period + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
            : ''))
          .replace(/[^\w \-]+/g, '').trim().replace(/\s+/g, '-');
        document.title = fname;
        var restore = function () {
          document.title = original;
          window.removeEventListener('afterprint', restore);
        };
        window.addEventListener('afterprint', restore);
        window.print();
      });
    }
  }

  window.renderLtxUsage = renderLtxUsage;
})();
