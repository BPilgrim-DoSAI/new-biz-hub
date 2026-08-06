// ── New Business Analytics dashboard renderer ───────────────────────────
//
// window.renderNewBizAnalytics(container, data, opts)
//
// Cross-agency pitch-economics view for the admin dashboard: pipeline
// volume by status, win rate, burn rate per pitch, and CAC. Reads the
// shape returned by the getNewBizAnalytics Cloud Function.
//
// Reuses the .gr- design system from group-report.css (KPI tiles, stage
// bars, table) rather than inventing a parallel one — this file MUST load
// after group-report.css is on the page, but has no JS dependency on
// group-report.js itself.
//
// opts.onSaveEconomics(oppId, { teamCostGBP, hardCostsGBP }) — called when
// an admin edits the cost inputs in the per-pitch table. The caller
// (admin-panel.js) owns the actual Cloud Function call and re-render.

(function () {
  'use strict';

  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function gbp(n) {
    return '£' + Math.round(Number(n) || 0).toLocaleString('en-GB');
  }

  function pct(n) {
    if (n === null || n === undefined) return '—';
    return Math.round(n * 100) + '%';
  }

  var STATUS_LABEL = {
    due: 'Due', responding: 'Responding', pitched: 'Pitched',
    procurement: 'Procurement', won: 'Won', lost: 'Lost',
  };
  var STATUS_ORDER = ['due', 'responding', 'pitched', 'procurement', 'won', 'lost'];

  function buildHeader(data) {
    return '<div class="gr-head">' +
      '<div><div class="gr-eyebrow">Miroma Group · New Business Hub</div>' +
      '<h2 class="gr-h1">New Business Analytics</h2></div>' +
      '<div class="gr-badge">' + esc(data.totalOpportunities) + ' opportunities</div>' +
      '</div>';
  }

  function buildKpis(data) {
    var kpis = [
      { label: 'Win rate', val: pct(data.winRate), sub: data.wonCount + ' won · ' + data.lostCount + ' lost', hl: true },
      { label: 'Avg burn / pitch', val: gbp(data.avgBurnPerPitchGBP), sub: 'Team + hard costs + AI, blended' },
      { label: 'CAC', val: data.cac === null ? '—' : gbp(data.cac), sub: 'Total spend per pitch won' },
      { label: 'Total burn', val: gbp(data.totalBurnGBP), sub: 'Across all open + closed pitches' },
      { label: 'Avg cycle time', val: data.avgCycleDays === null ? '—' : data.avgCycleDays + 'd', sub: 'Created → won/lost' },
    ];
    return '<div class="gr-kpis">' + kpis.map(function (k) {
      return '<div class="gr-kpi' + (k.hl ? ' gr-kpi--hl' : '') + '">' +
        '<div class="gr-kpi__lbl">' + esc(k.label) + '</div>' +
        '<div class="gr-kpi__val">' + k.val + '</div>' +
        '<div class="gr-kpi__sub">' + esc(k.sub) + '</div>' +
        '</div>';
    }).join('') + '</div>';
  }

  function buildFunnel(data) {
    var max = Math.max.apply(null, STATUS_ORDER.map(function (s) { return data.byStatus[s] || 0; })) || 1;
    var rows = STATUS_ORDER.map(function (s, i) {
      var count = data.byStatus[s] || 0;
      var widthPct = Math.round((count / max) * 100);
      return '<div class="gr-stage">' +
        '<div class="gr-stage__num">' + (i + 1) + '</div>' +
        '<div>' +
          '<div class="gr-stage__name">' + esc(STATUS_LABEL[s]) + '</div>' +
          '<div class="gr-stage__barrow">' +
            '<div class="gr-stage__track"><div class="gr-stage__fill" style="width:' + widthPct + '%"></div></div>' +
            '<div class="gr-stage__count">' + count + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    return '<div class="gr-card"><h3>Pipeline by status</h3>' +
      '<p class="gr-csub">Every opportunity across every agency, at its current pitch stage.</p>' +
      rows + '</div>';
  }

  function buildPitchTable(data, editable) {
    if (!data.pitches.length) {
      return '<div class="gr-card"><h3>Pitch economics</h3><p class="gr-csub">No opportunities yet.</p></div>';
    }
    var rows = data.pitches.map(function (p) {
      var costCells = editable
        ? '<td><input type="number" min="0" step="50" class="nba-cost-input" data-opp-id="' + esc(p.id) + '" data-field="teamCostGBP" value="' + p.teamCostGBP + '"></td>' +
          '<td><input type="number" min="0" step="50" class="nba-cost-input" data-opp-id="' + esc(p.id) + '" data-field="hardCostsGBP" value="' + p.hardCostsGBP + '"></td>'
        : '<td>' + gbp(p.teamCostGBP) + '</td><td>' + gbp(p.hardCostsGBP) + '</td>';
      return '<tr>' +
        '<td>' + esc(p.title) + '<div style="font-size:11px;color:var(--gr-sub)">' + esc(p.clientName) + ' · ' + esc(p.agencyKey) + '</div></td>' +
        '<td style="text-align:left"><span class="nba-status-chip nba-status-chip--' + esc(p.status) + '">' + esc(STATUS_LABEL[p.status] || p.status) + '</span></td>' +
        costCells +
        '<td>' + gbp(p.aiCostGBP) + '</td>' +
        '<td class="gr-mtx__tot">' + gbp(p.totalCostGBP) + '</td>' +
        '<td>' + (p.cycleDays === null ? '—' : p.cycleDays + 'd') + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="gr-card"><h3>Pitch economics</h3>' +
      '<p class="gr-csub">' + (editable ? 'Team cost and hard costs are editable — AI cost is metered automatically from Claude usage.' : 'Sorted by total cost, highest first.') + '</p>' +
      '<div style="overflow-x:auto"><table class="gr-mtx"><thead><tr>' +
        '<th style="text-align:left">Pitch</th><th style="text-align:left">Status</th>' +
        '<th>Team cost</th><th>Hard costs</th><th>AI cost</th><th>Total</th><th>Cycle</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '</div>';
  }

  window.renderNewBizAnalytics = function (container, data, opts) {
    opts = opts || {};
    var editable = typeof opts.onSaveEconomics === 'function';

    container.innerHTML = '<div class="gr-root">' +
      buildHeader(data) +
      buildKpis(data) +
      buildFunnel(data) +
      buildPitchTable(data, editable) +
      '</div>';

    if (!editable) return;

    var pending = {};
    container.querySelectorAll('.nba-cost-input').forEach(function (input) {
      input.addEventListener('blur', function () {
        var oppId = input.dataset.oppId;
        var field = input.dataset.field;
        var value = Math.max(0, Number(input.value) || 0);
        input.value = value;

        pending[oppId] = pending[oppId] || {};
        var row = input.closest('tr');
        var teamInput = row.querySelector('[data-field="teamCostGBP"]');
        var hardInput = row.querySelector('[data-field="hardCostsGBP"]');
        pending[oppId].teamCostGBP = Number(teamInput.value) || 0;
        pending[oppId].hardCostsGBP = Number(hardInput.value) || 0;

        input.disabled = true;
        opts.onSaveEconomics(oppId, pending[oppId]).then(function () {
          input.disabled = false;
        }).catch(function () {
          input.disabled = false;
        });
      });
    });
  };
})();
