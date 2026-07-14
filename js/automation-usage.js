// ── Custom Automation Usage Dashboard Renderer ─────────────────────────────
//
// window.renderAutomationUsage(container, data, opts)
//
// Generic renderer for bespoke, agency-specific automations built by the AI
// team (e.g. Sold Out's Meta Ads Automation). Unlike Claude/LTX Studio, these
// tools aren't a licensed seat-based product — each snapshot describes one
// automation's lifetime usage as of a report date, not a calendar month.
//
// data shape (from Firestore /automation_usage/{agencyKey}/automations/{automationKey}/snapshots/{period}):
//   { automationKey, automationName, agency, agencyKey, service, reportDate,
//     periodStart, periodLabel, daysLive, previous, lifetime, byMonth,
//     rollingWindows, byDayOfWeek, byHour, uploadSize, speed, topArtists,
//     uniqueArtistsTotal, topLocations, budgetStats, creativeVolume,
//     qualityChecks, timeSaved, adoptionSignals, headroom, numbersToShare,
//     headline }
//
// Reuses the same dark "studio" theme as js/ltx-usage.js (--ltx-* tokens,
// now also aliased under .au / .au--light in css/claude-usage.css) so all
// three usage dashboards read as one family.

(function () {
  'use strict';

  var T = {
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
  };
  var FONT = 'PPNeueMontreal,system-ui,sans-serif';

  // ── Helpers ────────────────────────────────────────────────────────────
  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmt(n) { return Number(n || 0).toLocaleString('en-GB'); }
  function pct(n) { return Math.round(Number(n || 0) * 100) + '%'; }
  function gbp(n) {
    return '£' + Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function gbpRound(n) { return '£' + Math.round(Number(n || 0)).toLocaleString('en-GB'); }
  function fmtDate(s) {
    if (!s) return '—';
    var d = new Date(s);
    return isNaN(d) ? s : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function s(obj) {
    return 'style="' + Object.entries(obj).map(function (kv) { return kv[0] + ':' + kv[1]; }).join(';') + '"';
  }
  function splitUnit(str) {
    str = String(str);
    var m = str.match(/^([\d,£.\-]+)([A-Za-z%].*)$/);
    return m ? { num: m[1], unit: m[2] } : { num: str, unit: '' };
  }
  function kpiNum(str, unitOverride) {
    var parts = (unitOverride !== undefined) ? { num: String(str), unit: unitOverride } : splitUnit(String(str));
    return esc(parts.num) +
      (parts.unit ? '<span style="font-size:.42em;font-weight:500;color:' + T.muted + ';letter-spacing:0">' + esc(parts.unit) + '</span>' : '');
  }

  function card(content, extra) {
    extra = extra || '';
    return '<div ' + s({ background: T.surface, border: '1px solid ' + T.border, 'border-radius': '8px', padding: '22px 24px', 'margin-bottom': '12px' }) + extra + '>' + content + '</div>';
  }
  function sectionLabel(text, sub) {
    return '<div ' + s({ 'font-size': '12px', 'font-weight': '500', 'text-transform': 'uppercase', 'letter-spacing': '0.13em', color: T.muted, 'margin-bottom': sub ? '4px' : '16px', 'font-family': FONT }) + '>' + esc(text) + '</div>' +
      (sub ? '<div ' + s({ 'font-size': '12px', color: T.sub, 'margin-bottom': '16px', 'line-height': '1.5' }) + '>' + sub + '</div>' : '');
  }
  function deltaTag(delta, opts) {
    opts = opts || {};
    if (delta === null || delta === undefined) return '';
    var up = delta > 0, flat = delta === 0;
    var color = flat ? T.sub : (opts.downIsGood ? (up ? T.sub : T.accent) : (up ? T.accent : T.sub));
    var sign = up ? '+' : '';
    var text = opts.isPct ? (sign + Math.round(delta * 100) + 'pp') : (sign + fmt(delta));
    return '<span ' + s({ color: color, 'font-size': '12px', 'font-weight': '600', 'margin-left': '8px' }) + '>' + text + '</span>';
  }

  // Generic horizontal bar-chart row — reused for rolling windows, months,
  // day-of-week, hour-of-day and quality-check counts. opts lets a caller
  // with long labels (e.g. the quality-check sentences) widen the label
  // column and cap the bar's width instead of letting it stretch edge to
  // edge — otherwise long text gets ellipsis-truncated.
  function barRow(label, value, maxValue, valueLabel, note, opts) {
    opts = opts || {};
    var labelWidth = opts.labelWidth || 96;
    var barPct = maxValue ? Math.round((value / maxValue) * 100) : 0;
    var barStyle = opts.barMaxWidth
      ? { flex: '0 0 auto', width: opts.barMaxWidth + 'px', height: '8px', background: T.track, overflow: 'hidden', 'border-radius': '4px' }
      : { flex: '1', height: '8px', background: T.track, overflow: 'hidden', 'border-radius': '4px' };
    return (
      '<div ' + s({ display: 'flex', 'align-items': 'center', gap: '10px', 'margin-bottom': '9px' }) + '>' +
        '<span ' + s({ width: labelWidth + 'px', 'flex-shrink': '0', 'font-size': '12px', color: T.muted, 'white-space': opts.labelWidth ? 'normal' : 'nowrap', 'line-height': '1.4', overflow: 'hidden', 'text-overflow': 'ellipsis' }) + '>' + esc(label) + '</span>' +
        '<div ' + s(barStyle) + '>' +
          '<div ' + s({ width: barPct + '%', height: '100%', background: T.barFill }) + '></div>' +
        '</div>' +
        '<span ' + s({ 'flex-shrink': '0', width: '86px', 'text-align': 'right', 'font-size': '12px', color: T.text, 'font-variant-numeric': 'tabular-nums' }) + '>' + esc(valueLabel != null ? valueLabel : fmt(value)) + '</span>' +
        (note ? '<span ' + s({ 'flex-shrink': '0', 'font-size': '11px', color: T.accent }) + '>' + esc(note) + '</span>' : '') +
      '</div>'
    );
  }

  // Vertical column chart — for time series, so it reads left (earliest) to
  // right (most recent) rather than top-to-bottom like barRow.
  function columnChart(items, trackHeight) {
    trackHeight = trackHeight || 150;
    var max = Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1]));
    var cols = items.map(function (i) {
      var barPx = Math.max(3, Math.round((i.value / max) * trackHeight));
      return (
        '<div ' + s({ flex: '1', display: 'flex', 'flex-direction': 'column', 'align-items': 'center', height: trackHeight + 'px', 'justify-content': 'flex-end' }) + '>' +
          '<span ' + s({ 'font-size': '12px', color: T.text, 'margin-bottom': '6px', 'font-variant-numeric': 'tabular-nums', 'white-space': 'nowrap' }) + '>' + esc(i.valueLabel != null ? i.valueLabel : fmt(i.value)) + '</span>' +
          '<div ' + s({ width: '60%', 'max-width': '46px', background: T.barFill, 'border-radius': '4px 4px 0 0', height: barPx + 'px' }) + '></div>' +
        '</div>'
      );
    }).join('');
    var labels = items.map(function (i) {
      return (
        '<div ' + s({ flex: '1', 'text-align': 'center' }) + '>' +
          '<div ' + s({ 'font-size': '11px', color: T.muted, 'white-space': 'nowrap' }) + '>' + esc(i.label) + '</div>' +
          (i.note ? '<div ' + s({ 'font-size': '10px', color: T.accent, 'white-space': 'nowrap' }) + '>' + esc(i.note) + '</div>' : '') +
        '</div>'
      );
    }).join('');
    return (
      '<div ' + s({ display: 'flex', 'align-items': 'flex-end', gap: '10px' }) + '>' + cols + '</div>' +
      '<div ' + s({ display: 'flex', gap: '10px', 'margin-top': '8px' }) + '>' + labels + '</div>'
    );
  }

  // ── Head ───────────────────────────────────────────────────────────────
  function head(data) {
    var sub = esc(data.automationName || 'Automation') + ' usage · ' + esc(data.agency || '');
    var periodLine = data.reportDate
      ? 'As of ' + fmtDate(data.reportDate) + (data.daysLive ? ' · ' + fmt(data.daysLive) + ' days live' : '')
      : '';
    return '<div class="cu-head" style="margin-bottom:18px">' +
      '<div><p class="cu-card__sub" style="margin:0">' + sub + '</p>' +
        (periodLine ? '<p class="cu-head__period">' + esc(periodLine) + '</p>' : '') +
      '</div>' +
      '<div class="cu-head__actions">' +
        '<button type="button" class="cu-mode-toggle au-mode-toggle" aria-label="Toggle light/dark mode">◐ Light</button>' +
        '<button type="button" class="cu-print" aria-label="Export this report as a PDF">' +
          '<span aria-hidden="true">⤓</span> Export as PDF</button>' +
      '</div>' +
    '</div>';
  }

  // ── Hero ───────────────────────────────────────────────────────────────
  // data.heroMetric = { label, value } lets an automation whose headline
  // number isn't a "success rate" (e.g. a candidate/client funnel tool)
  // override the hero line. Falls back to the original reliability-rate
  // framing when absent, so existing automations (Sold Out) are unaffected.
  function hero(data) {
    var periodLabel = data.periodLabel ? esc(data.periodLabel) : '';
    var headlineRate;
    if (data.heroMetric && data.heroMetric.value != null) {
      headlineRate = esc(data.heroMetric.value) + (data.heroMetric.label ? ' ' + esc(data.heroMetric.label) : '');
    } else {
      var rw = (data.rollingWindows || []);
      var last30 = rw.find(function (w) { return /30 days/i.test(w.window); });
      var lifetime = data.lifetime || {};
      headlineRate = (last30 ? pct(last30.rate) : (lifetime.successRate != null ? pct(lifetime.successRate) : '—'))
        + ' success in the last 30 days';
    }

    // The sub-heading under the hero number is bullet points only — no
    // separate prose paragraph above them. data.headline still exists in the
    // data (kept for anything else that reads the Firestore doc directly,
    // e.g. a cross-agency summary), it's just not rendered here.
    var bullets = data.adoptionSignals || [];
    var insightsHtml = bullets.length
      ? '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--ltx-border)">' +
          bullets.map(function (b) {
            return '<div style="font-size:13px;line-height:1.55;color:var(--ltx-text);margin-bottom:8px;padding-left:14px;position:relative">' +
              '<span style="position:absolute;left:0;top:.3em;width:5px;height:5px;background:var(--ltx-accent);display:inline-block"></span>' + b + '</div>';
          }).join('') +
        '</div>'
      : '';

    return '<div class="cu-hero" style="margin-top:0">' +
      '<div class="cu-hero__top"><div>' +
        '<div class="cu-hero__eyebrow">' + esc(data.automationName || 'Automation') + ' — ' + esc(data.agency || '') + '</div>' +
        '<div class="cu-hero__level">' +
          (periodLabel ? '<span class="cu-hero__level-num">' + periodLabel + '</span>' : '') +
          '<span class="cu-hero__level-name">' + headlineRate + '</span>' +
        '</div>' +
      '</div></div>' +
      insightsHtml +
    '</div>';
  }

  // ── KPI row ────────────────────────────────────────────────────────────
  function kpiRow(data) {
    var lifetime = data.lifetime || {}, prev = data.previous || {}, timeSaved = data.timeSaved || {};
    var rw = (data.rollingWindows || []);
    var last30 = rw.find(function (w) { return /30 days/i.test(w.window); });

    function kpi(label, valueHtml, sub, highlight) {
      var topBorder = highlight ? T.accent : T.border;
      return '<div class="au-kpi" ' + s({ flex: '1', 'min-width': '150px', 'box-sizing': 'border-box', background: T.surface, border: '1px solid ' + T.border, 'border-top': '3px solid ' + topBorder, 'border-radius': '8px', padding: '22px 22px 18px' }) + '>' +
        '<div ' + s({ 'font-size': '12px', 'font-weight': '500', 'text-transform': 'uppercase', 'letter-spacing': '.13em', color: T.muted, 'margin-bottom': '16px', 'font-family': FONT }) + '>' + esc(label) + '</div>' +
        '<div ' + s({ 'font-size': 'clamp(26px,3.4vw,44px)', 'font-weight': '500', 'letter-spacing': '-0.022em', 'line-height': '.92', color: T.text, 'margin-bottom': '8px', 'font-variant-numeric': 'tabular-nums', 'font-family': FONT, 'overflow-wrap': 'anywhere' }) + '>' + valueHtml + '</div>' +
        '<div ' + s({ 'font-size': '13px', color: T.muted }) + '>' + (sub || '') + '</div>' +
      '</div>';
    }

    // data.kpis lets an automation define its own 4 headline numbers instead
    // of the Meta Ads-specific ones below (ads/budget/success rate don't mean
    // anything for e.g. a candidate/client funnel tool). Falls back to the
    // original computation when absent, so Sold Out is unaffected.
    if (Array.isArray(data.kpis) && data.kpis.length) {
      return '<div class="au-kpis" ' + s({ display: 'flex', gap: '12px', 'flex-wrap': 'wrap', 'margin-bottom': '12px' }) + '>' +
        data.kpis.map(function (k) { return kpi(k.label, kpiNum(String(k.value)), k.sub, !!k.highlight); }).join('') +
      '</div>';
    }

    var adsDelta = (prev.ads != null && lifetime.ads != null) ? lifetime.ads - prev.ads : null;
    var budgetSub = 'of ~' + gbpRound(lifetime.grossBudget) + ' gross' + (prev.budgetToMeta != null ? ' · +' + gbpRound(lifetime.budgetToMeta - prev.budgetToMeta) + ' vs last report' : '');
    var timeSub = (timeSaved.netWorkingDays != null ? '~' + timeSaved.netWorkingDays + ' working days · ' : '') + 'net of time spent on the tool';
    var successSub = 'vs ' + pct(lifetime.successRate) + ' lifetime';

    return '<div class="au-kpis" ' + s({ display: 'flex', gap: '12px', 'flex-wrap': 'wrap', 'margin-bottom': '12px' }) + '>' +
      kpi('Ads created', kpiNum(fmt(lifetime.ads)), (adsDelta != null ? '+' + fmt(adsDelta) + ' vs last report' : ''), false) +
      kpi('Budget pushed to Meta', kpiNum(gbpRound(lifetime.budgetToMeta)), budgetSub, true) +
      kpi('Time saved so far', kpiNum(fmt(timeSaved.netHoursSaved), ' hrs'), timeSub, false) +
      kpi('Recent success rate', kpiNum(last30 ? pct(last30.rate) : '—'), successSub, true) +
    '</div>';
  }

  // ── Reliability trend (rolling windows) ───────────────────────────────
  function reliabilityTrend(data) {
    var rw = data.rollingWindows || [];
    if (!rw.length) return '';
    var rows = rw.map(function (w) {
      return barRow(w.window, w.rate * 100, 100, pct(w.rate));
    }).join('');
    return card(
      sectionLabel('Reliability — success rate by window', 'The wider the window, the more it includes the noisy launch months. Reading right to left shows the trend that matters: recent performance.') +
      rows
    );
  }

  // ── Activity by month ─────────────────────────────────────────────────
  function activityByMonth(data) {
    var months = data.byMonth || [];
    if (!months.length) return '';
    var items = months.map(function (m) {
      return { label: m.month, value: m.uploads, valueLabel: fmt(m.uploads), note: m.note };
    });
    return card(sectionLabel('Activity by month', 'Uploads run each month. February was the launch ramp; May/June settled into a quieter, cleaner rhythm.') + columnChart(items));
  }

  // ── Usage rhythm (day of week + hour of day) ──────────────────────────
  function usageRhythm(data) {
    var days = data.byDayOfWeek || [];
    var hours = data.byHour || [];
    if (!days.length && !hours.length) return '';
    var maxDay = Math.max.apply(null, days.map(function (d) { return d.uploads; }).concat([1]));
    var maxHour = Math.max.apply(null, hours.map(function (h) { return h.uploads; }).concat([1]));
    var dayRows = days.map(function (d) { return barRow(d.day, d.uploads, maxDay, fmt(d.uploads)); }).join('');
    var hourRows = hours.map(function (h) { return barRow(h.hour, h.uploads, maxHour, fmt(h.uploads), h.note); }).join('');
    return card(
      sectionLabel('When the team uses it', 'Office-hours tool: clear weekday peaks, zero weekend use.') +
      '<div ' + s({ display: 'flex', gap: '28px', 'flex-wrap': 'wrap' }) + '>' +
        '<div ' + s({ flex: '1', 'min-width': '220px' }) + '>' +
          '<div ' + s({ 'font-size': '11px', color: T.sub, 'margin-bottom': '10px' }) + '>By day of week</div>' + dayRows +
        '</div>' +
        '<div ' + s({ flex: '1', 'min-width': '220px' }) + '>' +
          '<div ' + s({ 'font-size': '11px', color: T.sub, 'margin-bottom': '10px' }) + '>By hour (London time)</div>' + hourRows +
        '</div>' +
      '</div>'
    );
  }

  // ── Budget & scale ─────────────────────────────────────────────────────
  function budgetCard(data) {
    var b = data.budgetStats || {};
    if (!b.totalToMeta) return '';
    function stat(label, value) {
      return '<div ' + s({ flex: '1', 'min-width': '110px' }) + '>' +
        '<div ' + s({ 'font-size': '11px', color: T.muted, 'margin-bottom': '4px' }) + '>' + esc(label) + '</div>' +
        '<div ' + s({ 'font-size': '18px', 'font-weight': '500', color: T.text, 'font-family': FONT, 'font-variant-numeric': 'tabular-nums' }) + '>' + esc(value) + '</div>' +
      '</div>';
    }
    var growthNote = (b.medianMay != null && b.medianJun != null)
      ? 'Median ad set budget rose to ' + gbpRound(b.medianMay) + ' (May) and ' + gbpRound(b.medianJun) + ' (June), against ' + gbpRound(b.medianSpring[0]) + '–' + gbpRound(b.medianSpring[1]) + ' in spring — a sign the team trusts the tool with bigger campaigns.'
      : '';
    return card(
      sectionLabel('Budget & scale', 'Spend the automation is setting up per ad set.') +
      '<div ' + s({ display: 'flex', gap: '18px', 'flex-wrap': 'wrap', 'margin-bottom': growthNote ? '16px' : '0' }) + '>' +
        stat('Average', gbpRound(b.avgPerAdset)) +
        stat('Median', gbpRound(b.medianPerAdset)) +
        stat('95th percentile', gbpRound(b.p95PerAdset)) +
        stat('Largest ad set', gbpRound(b.maxAdset)) +
        stat('Smallest ad set', gbpRound(b.minAdset)) +
      '</div>' +
      (growthNote ? '<p ' + s({ 'font-size': '12px', color: T.sub, 'line-height': '1.6', margin: '0' }) + '>' + esc(growthNote) + '</p>' : '')
    );
  }

  // ── Creative volume & quality checks ──────────────────────────────────
  function qualityCard(data) {
    var cv = data.creativeVolume || {};
    var qc = data.qualityChecks || {};
    if (!qc.totalIssuesCaught && !cv.total) return '';
    var vPct = cv.total ? Math.round((cv.videos / cv.total) * 100) : 0;
    var iPct = 100 - vPct;
    var maxIssue = Math.max.apply(null, (qc.issues || []).map(function (i) { return i.count; }).concat([1]));
    var issueRows = (qc.issues || []).slice(0, 6).map(function (i) {
      return barRow(i.issue, i.count, maxIssue, fmt(i.count), null, { labelWidth: 260, barMaxWidth: 180 });
    }).join('');

    return card(
      sectionLabel('Creative volume & quality checks', 'Every one of these checks is a potential mistake caught before spend went live.') +
      '<div ' + s({ display: 'flex', 'align-items': 'baseline', gap: '10px', 'margin-bottom': '14px' }) + '>' +
        '<div ' + s({ 'font-size': '34px', 'font-weight': '500', color: T.text, 'font-family': FONT }) + '>' + fmt(qc.totalIssuesCaught) + '</div>' +
        '<div ' + s({ 'font-size': '13px', color: T.muted }) + '>issues flagged before going live, across ' + fmt(cv.total) + ' creative variants</div>' +
      '</div>' +
      '<div ' + s({ display: 'flex', height: '8px', overflow: 'hidden', gap: '2px', 'margin-bottom': '10px', 'border-radius': '4px' }) + '>' +
        '<div ' + s({ flex: String(iPct), background: T.barFill }) + '></div>' +
        '<div ' + s({ flex: String(vPct), background: T.barMuted }) + '></div>' +
      '</div>' +
      '<div ' + s({ display: 'flex', gap: '20px', 'font-size': '12px', color: T.muted, 'margin-bottom': '18px' }) + '>' +
        '<span><span ' + s({ display: 'inline-block', width: '7px', height: '7px', background: T.barFill, 'margin-right': '5px', 'vertical-align': 'middle' }) + '></span>Image ' + iPct + '% (' + fmt(cv.images) + ')</span>' +
        '<span><span ' + s({ display: 'inline-block', width: '7px', height: '7px', background: T.barMuted, 'margin-right': '5px', 'vertical-align': 'middle' }) + '></span>Video ' + vPct + '% (' + fmt(cv.videos) + ')</span>' +
      '</div>' +
      '<div ' + s({ 'font-size': '11px', color: T.sub, 'margin-bottom': '10px' }) + '>Most common flags</div>' +
      issueRows
    );
  }

  // ── Top artists / top locations ────────────────────────────────────────
  function topListsCard(data) {
    var artists = data.topArtists || [];
    var locations = data.topLocations || [];
    if (!artists.length && !locations.length) return '';

    function list(items, keyLabel, valueLabel) {
      var max = Math.max.apply(null, items.map(function (i) { return i.ads; }).concat([1]));
      return items.map(function (i) {
        return barRow(i.name || i.city, i.ads, max, fmt(i.ads));
      }).join('');
    }

    return card(
      sectionLabel('Top artists / tours and locations', 'From the live ad sample this period.') +
      '<div ' + s({ display: 'flex', gap: '28px', 'flex-wrap': 'wrap' }) + '>' +
        '<div ' + s({ flex: '1', 'min-width': '220px' }) + '>' +
          '<div ' + s({ 'font-size': '11px', color: T.sub, 'margin-bottom': '10px' }) + '>Top artists / tours' +
            (data.uniqueArtistsTotal ? ' · ' + fmt(data.uniqueArtistsTotal) + ' unique in total' : '') + '</div>' +
          list(artists) +
        '</div>' +
        '<div ' + s({ flex: '1', 'min-width': '220px' }) + '>' +
          '<div ' + s({ 'font-size': '11px', color: T.sub, 'margin-bottom': '10px' }) + '>Top locations</div>' +
          list(locations) +
        '</div>' +
      '</div>'
    );
  }

  // ── Monthly trend table (interviews/decisions/engagement) ─────────────
  // For automations tracked by a monthly funnel rather than upload volume —
  // e.g. a candidate-screening tool where "activity" is interviews analysed,
  // client decisions, and how much recruiters refine the AI's first draft.
  function monthlyTrendCard(data) {
    var rows = data.monthlyTrend || [];
    if (!rows.length) return '';
    function th(text, align) {
      return '<th ' + s({ 'text-align': align || 'left', padding: '8px 10px', 'font-size': '11px', 'text-transform': 'uppercase', 'letter-spacing': '.06em', color: T.muted, 'border-bottom': '1px solid ' + T.border }) + '>' + esc(text) + '</th>';
    }
    function td(text, align) {
      return '<td ' + s({ 'text-align': align || 'left', padding: '9px 10px', color: T.text, 'border-bottom': '1px solid ' + T.divider, 'font-size': '13px', 'font-variant-numeric': 'tabular-nums' }) + '>' + text + '</td>';
    }
    var body = rows.map(function (m) {
      return '<tr>' + td(esc(m.month)) + td(fmt(m.interviews), 'right') + td(fmt(m.decisions), 'right') +
        td(m.refinedPct != null ? pct(m.refinedPct) : '—', 'right') + '</tr>';
    }).join('');
    return card(
      sectionLabel('Activity by month', 'Interview volume follows client demand — client decisions and recruiter engagement are the healthier signal to watch alongside it.') +
      '<table ' + s({ width: '100%', 'border-collapse': 'collapse', 'margin-bottom': data.monthlyTrendNote ? '12px' : '0' }) + '>' +
        '<thead><tr>' + th('Month') + th('Interviews analysed', 'right') + th('Client decisions', 'right') + th('Summaries refined by recruiters', 'right') + '</tr></thead>' +
        '<tbody>' + body + '</tbody>' +
      '</table>' +
      (data.monthlyTrendNote ? '<p ' + s({ 'font-size': '12px', color: T.sub, 'line-height': '1.6', margin: '0' }) + '>' + esc(data.monthlyTrendNote) + '</p>' : '')
    );
  }

  // ── Client funnel (shared → opened → decided) ──────────────────────────
  function clientFunnelCard(data) {
    var f = data.clientFunnel;
    if (!f) return '';
    var maxV = f.shared || 1;
    var funnelRows =
      barRow('Shared', f.shared, maxV, fmt(f.shared)) +
      barRow('Opened', f.opened, maxV, fmt(f.opened) + ' (' + pct(f.openedPct) + ')') +
      barRow('Decided', f.decided, maxV, fmt(f.decided) + ' (' + pct(f.decidedPctOfShared) + ' of shared)');

    var clients = data.topReturningClients || [];
    var maxClient = Math.max.apply(null, clients.map(function (c) { return c.shortlists; }).concat([1]));
    var clientRows = clients.map(function (c) { return barRow(c.name, c.shortlists, maxClient, fmt(c.shortlists)); }).join('');
    var reach = data.clientReach || {};

    return card(
      sectionLabel('Client funnel', 'What happens after a recruiter shares a shortlist.') +
      funnelRows +
      (f.typicalOpenTime ? '<p ' + s({ 'font-size': '12px', color: T.sub, 'line-height': '1.6', margin: '12px 0 0' }) + 'Typical time for a client to open a shortlist: <strong style="color:' + T.text + '">' + esc(f.typicalOpenTime) + '</strong>. ' + esc(f.note || '') + '</p>' : '') +
      (clients.length ? (
        '<div ' + s({ 'margin-top': '20px', 'padding-top': '18px', 'border-top': '1px solid ' + T.divider }) + '>' +
          '<div ' + s({ 'font-size': '11px', color: T.sub, 'margin-bottom': '10px' }) + '>Top returning clients' + (reach.companiesServed ? ' · ' + esc(reach.companiesServed) + ' companies served' : '') + '</div>' +
          clientRows +
          (reach.wideRosterNote ? '<p ' + s({ 'font-size': '12px', color: T.sub, 'line-height': '1.6', margin: '12px 0 0' }) + '>' + esc(reach.wideRosterNote) + '</p>' : '') +
          (reach.concentrationNote ? '<p ' + s({ 'font-size': '12px', color: T.accent, 'line-height': '1.6', margin: '8px 0 0' }) + '>' + esc(reach.concentrationNote) + '</p>' : '')
        + '</div>'
      ) : '')
    );
  }

  // ── Decision quality (yes/maybe/no + by role) ──────────────────────────
  function decisionQualityCard(data) {
    var breakdown = data.decisionBreakdown || [];
    var byRole = data.decisionsByRole || [];
    if (!breakdown.length && !byRole.length) return '';

    var barsHtml = '';
    if (breakdown.length) {
      var segs = breakdown.map(function (b, i) {
        var color = i === 0 ? T.barFill : (i === 1 ? T.barMuted : T.border);
        return '<div ' + s({ flex: String(Math.round(b.pct * 100)), background: color }) + '></div>';
      }).join('');
      var legend = breakdown.map(function (b, i) {
        var color = i === 0 ? T.barFill : (i === 1 ? T.barMuted : T.border);
        return '<span ' + s({ 'margin-right': '18px' }) + '><span ' + s({ display: 'inline-block', width: '7px', height: '7px', background: color, 'margin-right': '5px', 'vertical-align': 'middle' }) + '></span>' + esc(b.decision) + ' ' + pct(b.pct) + '</span>';
      }).join('');
      barsHtml =
        '<div ' + s({ display: 'flex', height: '10px', overflow: 'hidden', gap: '2px', 'margin-bottom': '10px', 'border-radius': '4px' }) + '>' + segs + '</div>' +
        '<div ' + s({ 'font-size': '12px', color: T.muted, 'margin-bottom': byRole.length ? '20px' : '0' }) + '>' + legend + '</div>';
    }

    var roleRows = '';
    if (byRole.length) {
      var maxRoleDecisions = Math.max.apply(null, byRole.map(function (r) { return r.decisions; }).concat([1]));
      roleRows =
        '<div ' + s({ 'font-size': '11px', color: T.sub, 'margin-bottom': '10px' }) + '>Positive-decision rate by role (highest-volume searches)</div>' +
        byRole.map(function (r) {
          return barRow(r.role, r.decisions, maxRoleDecisions, fmt(r.decisions) + ' · ' + pct(r.positivePct), null, { labelWidth: 240 });
        }).join('') +
        (data.decisionsByRoleNote ? '<p ' + s({ 'font-size': '12px', color: T.sub, 'line-height': '1.6', margin: '12px 0 0' }) + '>' + esc(data.decisionsByRoleNote) + '</p>' : '');
    }

    return card(
      sectionLabel('Decision quality', 'A client base that rejects roughly a third of what it sees is reviewing carefully, not rubber-stamping.') +
      barsHtml + roleRows
    );
  }

  // ── Business case reality check (assumed vs actual volume/saving) ─────
  function businessCaseCard(data) {
    var bc = data.businessCase;
    if (!bc || !bc.comparison || !bc.comparison.length) return '';
    function th(text, align) {
      return '<th ' + s({ 'text-align': align || 'left', padding: '8px 10px', 'font-size': '11px', 'text-transform': 'uppercase', 'letter-spacing': '.06em', color: T.muted, 'border-bottom': '1px solid ' + T.border }) + '>' + esc(text) + '</th>';
    }
    var rows = bc.comparison.map(function (r) {
      return '<tr>' +
        '<td ' + s({ padding: '9px 10px', color: T.muted, 'border-bottom': '1px solid ' + T.divider, 'font-size': '13px' }) + '>' + esc(r.measure) + '</td>' +
        '<td ' + s({ padding: '9px 10px', color: T.sub, 'border-bottom': '1px solid ' + T.divider, 'font-size': '13px', 'text-align': 'right' }) + '>' + esc(r.assumed) + '</td>' +
        '<td ' + s({ padding: '9px 10px', color: T.text, 'border-bottom': '1px solid ' + T.divider, 'font-size': '13px', 'font-weight': '600', 'text-align': 'right' }) + '>' + esc(r.actual) + '</td>' +
      '</tr>';
    }).join('');
    return card(
      sectionLabel('The business case, checked against reality', 'The per-unit saving logic holds — the gap is volume, which is set by demand, not by the tool.') +
      '<table ' + s({ width: '100%', 'border-collapse': 'collapse', 'margin-bottom': '14px' }) + '>' +
        '<thead><tr>' + th('Measure') + th('Business case assumed', 'right') + th('Running at today', 'right') + '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
      (bc.note ? '<p ' + s({ 'font-size': '13px', color: T.text, 'line-height': '1.65', opacity: '.9', margin: '0' }) + '>' + esc(bc.note) + '</p>' : '')
    );
  }

  // ── Time & money saved ──────────────────────────────────────────────────
  function timeSavedCard(data) {
    var ts = data.timeSaved || {};
    if (!ts.netHoursSaved) return '';
    var rows = (ts.costSaved || []).map(function (c) {
      return '<tr>' +
        '<td ' + s({ padding: '8px 10px', color: T.muted, 'border-bottom': '1px solid ' + T.divider, 'font-size': '13px' }) + '>£' + c.rate + '/hour</td>' +
        '<td ' + s({ padding: '8px 10px', color: T.text, 'border-bottom': '1px solid ' + T.divider, 'font-size': '13px', 'font-weight': '600', 'text-align': 'right' }) + '>' + gbpRound(c.savedSoFar) + '</td>' +
        '<td ' + s({ padding: '8px 10px', color: T.muted, 'border-bottom': '1px solid ' + T.divider, 'font-size': '13px', 'text-align': 'right' }) + '>~' + gbpRound(c.annualisedRunRate) + '</td>' +
      '</tr>';
    }).join('');

    return card(
      sectionLabel('Time & money saved', 'Each ad takes the automation a median of ' + (data.speed ? data.speed.medianSec : ts.perAdToolSec) + ' seconds, versus about ' + ts.perAdHandMin + ' minutes done by hand — roughly ' + ts.speedMultiple + ' times faster.') +
      '<div ' + s({ display: 'flex', gap: '24px', 'flex-wrap': 'wrap', 'margin-bottom': '18px' }) + '>' +
        '<div>' +
          '<div ' + s({ 'font-size': '34px', 'font-weight': '500', color: T.text, 'font-family': FONT }) + '>' + fmt(ts.netHoursSaved) + ' hrs</div>' +
          '<div ' + s({ 'font-size': '12px', color: T.muted }) + '>net time saved so far (~' + ts.netWorkingDays + ' working days of senior time)</div>' +
        '</div>' +
      '</div>' +
      '<table ' + s({ width: '100%', 'border-collapse': 'collapse', 'margin-bottom': '10px' }) + '>' +
        '<thead><tr>' +
          '<th ' + s({ 'text-align': 'left', padding: '8px 10px', 'font-size': '11px', 'text-transform': 'uppercase', 'letter-spacing': '.06em', color: T.muted, 'border-bottom': '1px solid ' + T.border }) + '>Loaded hourly rate</th>' +
          '<th ' + s({ 'text-align': 'right', padding: '8px 10px', 'font-size': '11px', 'text-transform': 'uppercase', 'letter-spacing': '.06em', color: T.muted, 'border-bottom': '1px solid ' + T.border }) + '>Saved so far</th>' +
          '<th ' + s({ 'text-align': 'right', padding: '8px 10px', 'font-size': '11px', 'text-transform': 'uppercase', 'letter-spacing': '.06em', color: T.muted, 'border-bottom': '1px solid ' + T.border }) + '>Annualised run-rate</th>' +
        '</tr></thead><tbody>' + rows + '</tbody>' +
      '</table>' +
      '<details style="margin-top:6px">' +
        '<summary ' + s({ cursor: 'pointer', 'font-size': '12px', color: T.muted }) + '>How this is calculated</summary>' +
        '<div ' + s({ 'font-size': '12px', color: T.sub, 'line-height': '1.7', 'margin-top': '10px' }) + '>' +
          (ts.handBreakdown || []).map(function (h) { return '&bull; ' + esc(h.component) + ' — ' + h.hours + ' hrs<br>'; }).join('') +
          '<strong ' + s({ color: T.muted }) + '>Total by hand: ~' + ts.handHoursTotal + ' hrs</strong><br><br>' +
          (ts.toolBreakdown || []).map(function (t) { return '&bull; ' + esc(t.component) + ' — ' + t.hours + ' hrs<br>'; }).join('') +
          '<strong ' + s({ color: T.muted }) + '>Total time on the tool: ~' + ts.toolHoursTotal + ' hrs</strong>' +
        '</div>' +
      '</details>'
    );
  }

  // ── Headroom ────────────────────────────────────────────────────────────
  function headroomCard(data) {
    var items = data.headroom || [];
    if (!items.length) return '';
    return card(
      sectionLabel('Where there is easy headroom', 'None of these are problems — they are the gap between good adoption and getting the most out of what the tool already does.') +
      items.map(function (h, i) {
        return '<div ' + s({ 'margin-bottom': (i < items.length - 1 ? '16px' : '0'), 'padding-bottom': (i < items.length - 1 ? '16px' : '0'), 'border-bottom': (i < items.length - 1 ? '1px solid ' + T.divider : 'none') }) + '>' +
          '<div ' + s({ 'font-size': '13px', 'font-weight': '600', color: T.accent, 'margin-bottom': '4px' }) + '>' + esc(h.title) + '</div>' +
          '<div ' + s({ 'font-size': '13px', color: T.text, 'line-height': '1.55', opacity: '.9' }) + '>' + esc(h.text) + '</div>' +
        '</div>';
      }).join('')
    );
  }

  // ── Numbers to share ────────────────────────────────────────────────────
  function numbersToShareCard(data) {
    var items = data.numbersToShare || [];
    if (!items.length) return '';
    var rows = items.map(function (n) {
      return '<tr>' +
        '<td ' + s({ padding: '9px 10px', color: T.muted, 'border-bottom': '1px solid ' + T.divider, 'font-size': '13px' }) + '>' + esc(n.metric) + '</td>' +
        '<td ' + s({ padding: '9px 10px', color: T.text, 'border-bottom': '1px solid ' + T.divider, 'font-size': '13px', 'font-weight': '600', 'text-align': 'right' }) + '>' + esc(n.value) + '</td>' +
      '</tr>';
    }).join('');
    return card(
      sectionLabel('Numbers to share', 'Ready to drop into a deck or update.') +
      '<table ' + s({ width: '100%', 'border-collapse': 'collapse' }) + '><tbody>' + rows + '</tbody></table>'
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────
  function renderAutomationUsage(container, data, opts) {
    if (!container || !data) return;
    opts = opts || {};

    container.innerHTML = (
      '<div class="au">' +
      head(data) +
      hero(data) +
      kpiRow(data) +
      reliabilityTrend(data) +
      activityByMonth(data) +
      monthlyTrendCard(data) +
      usageRhythm(data) +
      clientFunnelCard(data) +
      decisionQualityCard(data) +
      budgetCard(data) +
      qualityCard(data) +
      topListsCard(data) +
      businessCaseCard(data) +
      timeSavedCard(data) +
      headroomCard(data) +
      numbersToShareCard(data) +
      '<div class="cu-print-footer">' + esc(data.agency || '') + ' · ' + esc(data.automationName || 'Automation') + ' usage · as of ' + esc(fmtDate(data.reportDate)) +
        ' — Internal. Handle per Miroma\'s data-handling policy.</div>' +
      '</div>'
    );

    // Light/dark toggle — shares the 'hub-theme' key so it stays in sync with
    // the Claude and LTX dashboards if a user flips it on any of them.
    var root = container.querySelector('.au');
    var modeBtn = container.querySelector('.au-mode-toggle');
    if (modeBtn && root) {
      // The admin panel nests `container` inside a per-automation block,
      // itself inside #automationUsageWrap (the actual dark card). Walking up
      // to that stable id keeps this correct regardless of nesting depth —
      // container.parentElement alone broke once multi-automation support
      // added an extra level. Falls back to parentElement for the standalone
      // preview harness, which mounts directly with no per-automation block.
      var outerWrap = (container.closest && container.closest('#automationUsageWrap')) || container.parentElement;
      var darkArrow = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='rgba(255,255,255,0.4)' fill='none' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E\")";
      var lightArrow = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='rgba(0,0,0,0.4)' fill='none' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E\")";
      function applyTheme(light) {
        root.classList.toggle('au--light', light);
        modeBtn.textContent = light ? '◐ Dark' : '◐ Light';
        modeBtn.classList.toggle('cu-mode-toggle--active', light);
        if (outerWrap) outerWrap.style.background = light ? '#fff' : '#0B0B13';
        document.body.classList.toggle('au-light-mode', light);
        var sel = document.getElementById('automationAgencySelect');
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
      window.addEventListener('storage', function (e) {
        if (e.key === 'hub-theme') { isLight = e.newValue === 'light'; applyTheme(isLight); }
      });
    }

    var printBtn = container.querySelector('.cu-print');
    if (printBtn) {
      printBtn.addEventListener('click', function () {
        var original = document.title;
        var fname = ((data.agency || 'Automation') + ' ' + (data.automationName || 'Automation') + ' Usage ' + fmtDate(data.reportDate))
          .replace(/[^\w \-]+/g, '').trim().replace(/\s+/g, '-');
        document.title = fname;
        var restore = function () { document.title = original; window.removeEventListener('afterprint', restore); };
        window.addEventListener('afterprint', restore);
        window.print();
      });
    }
  }

  window.renderAutomationUsage = renderAutomationUsage;
})();
