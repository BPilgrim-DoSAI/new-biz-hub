/* =============================================
   MIROMA AI HUB — New Business Hub
   Opportunity list, create, P0 intake workspace
   ============================================= */

(function initNewBusiness() {
  'use strict';

  const PHASES = [
    { key: 'intake',       label: 'Intake',        num: '0' },
    { key: 'agency-brief', label: 'Agency Brief',   num: '1' },
    { key: 'questions',    label: 'Questions',      num: '2' },
    { key: 'positioning',  label: 'Positioning',    num: '3' },
    { key: 'creative',     label: 'Creative',       num: '4' },
    { key: 'ltx-prompts',  label: 'LTX Prompts',    num: '5' },
    { key: 'knowledge',    label: 'Knowledge',      num: '6' },
    { key: 'deck',         label: 'Deck',           num: '7' },
  ];

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  let _accessState = null;

  function getFunctions() {
    return firebase.app().functions('europe-west2');
  }

  async function checkAccess() {
    if (_accessState) return _accessState;
    try {
      const fn = firebase.functions();
      const result = await fn.httpsCallable('checkNewBizAccess')({});
      _accessState = result.data;
      return _accessState;
    } catch (err) {
      console.warn('checkNewBizAccess error:', err);
      return { hasAccess: false };
    }
  }

  // ── Routing ─────────────────────────────────────────────

  function getOppIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('opp') || null;
  }

  // ── Render: access gate ─────────────────────────────────

  function renderGate(container) {
    container.innerHTML = `
      <div class="nb-gate">
        <div class="nb-gate__icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <p class="nb-gate__title">Access required</p>
        <p class="nb-gate__sub">You don't currently have New Business Hub access. Ask your agency admin to nominate you, or contact the AI team.</p>
      </div>`;
  }

  // ── Render: opportunity list ────────────────────────────

  async function renderList(container) {
    container.innerHTML = '<p style="padding:24px;color:var(--c-stone)">Loading opportunities…</p>';

    try {
      const fn = firebase.functions();
      const result = await fn.httpsCallable('listOpportunities')({});
      const opps = result.data.opportunities || [];

      const phaseLabel = (key) => {
        const p = PHASES.find(ph => ph.key === key);
        return p ? 'P' + p.num + ' ' + p.label : key;
      };

      const formatDate = (iso) => {
        if (!iso) return '';
        return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      };

      if (!opps.length) {
        container.innerHTML = `
          <div class="nb-empty-state">
            <p class="nb-empty-state__title">No opportunities yet</p>
            <p class="nb-empty-state__sub">Create your first opportunity to start taking a client brief through to a pitch-ready deck.</p>
            <button class="nb-create-btn" id="nbCreateBtn">+ New opportunity</button>
          </div>`;
        wireCreateBtn();
        return;
      }

      const cardsHtml = opps.map(function(opp) {
        return `
          <div class="nb-opp-card" data-opp-id="${esc(opp.id)}">
            <p class="nb-opp-card__title">${esc(opp.title)}</p>
            <p class="nb-opp-card__client">${esc(opp.clientName || 'No client set')}</p>
            <div class="nb-opp-card__meta">
              <span class="nb-opp-card__phase">${esc(phaseLabel(opp.phase))}</span>
              <span class="nb-opp-card__status nb-opp-card__status--${esc(opp.status || 'active')}">${esc((opp.status || 'active').charAt(0).toUpperCase() + (opp.status || 'active').slice(1))}</span>
              ${opp.updatedAt ? '<span>' + esc(formatDate(opp.updatedAt)) + '</span>' : ''}
            </div>
          </div>`;
      }).join('');

      container.innerHTML = `
        <div class="nb-actions">
          <span class="nb-actions__count">${opps.length} opportunit${opps.length === 1 ? 'y' : 'ies'}</span>
          <button class="nb-create-btn" id="nbCreateBtn">+ New opportunity</button>
        </div>
        <div class="nb-opp-grid">${cardsHtml}</div>`;

      container.querySelectorAll('.nb-opp-card').forEach(function(card) {
        card.addEventListener('click', function() {
          const oppId = card.dataset.oppId;
          window.history.pushState({}, '', 'new-business.html?opp=' + encodeURIComponent(oppId));
          renderWorkspace(container, oppId);
        });
      });

      wireCreateBtn();
    } catch (err) {
      console.warn('renderList error:', err);
      container.innerHTML = '<p style="padding:24px;color:#c0392b">Failed to load opportunities. Please try again.</p>';
    }
  }

  // ── Create modal ────────────────────────────────────────

  function wireCreateBtn() {
    const btn = document.getElementById('nbCreateBtn');
    if (btn) btn.addEventListener('click', openCreateModal);
  }

  function openCreateModal() {
    const existing = document.getElementById('nbModalOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'nbModalOverlay';
    overlay.className = 'nb-modal-overlay';
    overlay.innerHTML = `
      <div class="nb-modal">
        <p class="nb-modal__title">New opportunity</p>
        <div class="nb-modal__field">
          <label class="nb-modal__label" for="nbOppTitle">Opportunity title</label>
          <input type="text" id="nbOppTitle" class="nb-modal__input" placeholder="e.g. Q4 Brand Campaign" maxlength="200" autofocus>
        </div>
        <div class="nb-modal__field">
          <label class="nb-modal__label" for="nbOppClient">Client name</label>
          <input type="text" id="nbOppClient" class="nb-modal__input" placeholder="e.g. Acme Corp" maxlength="200">
        </div>
        <p class="nb-modal__error" id="nbCreateError"></p>
        <div class="nb-modal__actions">
          <button class="nb-modal__cancel" id="nbModalCancel">Cancel</button>
          <button class="nb-modal__submit" id="nbModalSubmit">Create</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    document.getElementById('nbModalCancel').addEventListener('click', function() {
      overlay.remove();
    });
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });

    document.getElementById('nbModalSubmit').addEventListener('click', async function() {
      const title = document.getElementById('nbOppTitle').value.trim();
      const clientName = document.getElementById('nbOppClient').value.trim();
      const errorEl = document.getElementById('nbCreateError');

      if (!title) {
        errorEl.textContent = 'Please enter an opportunity title.';
        return;
      }

      errorEl.textContent = '';
      const submitBtn = document.getElementById('nbModalSubmit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating…';

      try {
        const fn = firebase.functions();
        const result = await fn.httpsCallable('createOpportunity')({ title, clientName });
        overlay.remove();
        const oppId = result.data.oppId;
        window.history.pushState({}, '', 'new-business.html?opp=' + encodeURIComponent(oppId));
        const container = document.getElementById('nbContent');
        if (container) renderWorkspace(container, oppId);
      } catch (err) {
        console.warn('createOpportunity error:', err);
        errorEl.textContent = 'Failed to create opportunity. ' + (err.message || '');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create';
      }
    });

    document.getElementById('nbOppTitle').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('nbModalSubmit').click();
      }
    });
  }

  // ── Render: workspace (single opportunity) ──────────────

  async function renderWorkspace(container, oppId) {
    container.innerHTML = '<p style="padding:24px;color:var(--c-stone)">Loading opportunity…</p>';

    try {
      const fn = firebase.functions();
      const result = await fn.httpsCallable('getOpportunity')({ oppId });
      const opp = result.data;

      const currentPhaseIdx = PHASES.findIndex(p => p.key === opp.phase);

      const stepperHtml = PHASES.map(function(p, i) {
        let cls = 'nb-phase-step';
        if (i === currentPhaseIdx) cls += ' nb-phase-step--current';
        else if (i < currentPhaseIdx) cls += ' nb-phase-step--done';
        return `<div class="${cls}">
          <span class="nb-phase-step__num">${i < currentPhaseIdx ? '✓' : p.num}</span>
          ${esc(p.label)}
        </div>`;
      }).join('');

      const backLink = `<a href="new-business.html" style="font-size:13px;color:var(--c-stone);text-decoration:none;display:inline-flex;align-items:center;gap:4px;margin-bottom:16px">← All opportunities</a>`;

      container.innerHTML = `
        ${backLink}
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
          <h2 style="font-size:22px;font-weight:700">${esc(opp.title)}</h2>
          <span class="nb-opp-card__status nb-opp-card__status--${esc(opp.status || 'active')}" style="font-size:12px">${esc((opp.status || 'active').charAt(0).toUpperCase() + (opp.status || 'active').slice(1))}</span>
        </div>
        <p style="font-size:14px;color:var(--c-stone);margin-bottom:24px">${esc(opp.clientName || 'No client set')} · Created by ${esc(opp.createdBy || '—')}</p>
        <div class="nb-phase-stepper">${stepperHtml}</div>
        <div id="nbPhaseContent"></div>`;

      renderPhaseContent(opp, oppId);

      // Wire back link to avoid full page reload
      const back = container.querySelector('a[href="new-business.html"]');
      if (back) {
        back.addEventListener('click', function(e) {
          e.preventDefault();
          window.history.pushState({}, '', 'new-business.html');
          renderList(container);
        });
      }
    } catch (err) {
      console.warn('renderWorkspace error:', err);
      container.innerHTML = '<p style="padding:24px;color:#c0392b">Failed to load opportunity. ' + esc(err.message || '') + '</p>';
    }
  }

  // ── Render: phase content (P0 intake for M0) ────────────

  function renderPhaseContent(opp, oppId) {
    const phaseEl = document.getElementById('nbPhaseContent');
    if (!phaseEl) return;

    if (opp.phase === 'intake') {
      renderIntakePhase(phaseEl, opp, oppId);
    } else {
      phaseEl.innerHTML = `
        <div class="nb-workspace">
          <p class="nb-workspace__title">Phase: ${esc(opp.phase)}</p>
          <p class="nb-workspace__desc">This phase will be available in a future milestone. The agentic engine (M1) will power phases P1–P3, with knowledge and creative phases following in M2.</p>
        </div>`;
    }
  }

  function renderIntakePhase(phaseEl, opp, oppId) {
    const existingBrief = opp.rawBrief || '';
    const phaseOutput = opp.phaseOutputs?.intake;

    phaseEl.innerHTML = `
      <div class="nb-workspace">
        <p class="nb-workspace__title">P0 — Intake</p>
        <p class="nb-workspace__desc">Paste or type the raw client brief below. This is the starting point — the agent will help refine it into a structured agency brief in the next phase.</p>
        <textarea class="nb-workspace__textarea" id="nbBriefText" placeholder="Paste the client brief here…">${esc(existingBrief)}</textarea>
        <div class="nb-workspace__actions">
          <button class="nb-workspace__save" id="nbSaveBrief">Save brief</button>
          ${existingBrief ? '<button class="nb-workspace__save" id="nbAdvancePhase" style="background:var(--c-stone)">Advance to P1 →</button>' : ''}
        </div>
        <p class="nb-workspace__status" id="nbBriefStatus"></p>
      </div>`;

    document.getElementById('nbSaveBrief').addEventListener('click', async function() {
      const text = document.getElementById('nbBriefText').value.trim();
      const status = document.getElementById('nbBriefStatus');
      if (!text) {
        status.textContent = 'Please enter the client brief.';
        return;
      }
      status.textContent = 'Saving…';
      try {
        const fn = firebase.functions();
        await fn.httpsCallable('updateOpportunity')({
          oppId,
          updates: { rawBrief: text },
        });
        await fn.httpsCallable('savePhaseOutput')({
          oppId,
          phase: 'intake',
          output: { rawBrief: text, completedAt: new Date().toISOString() },
        });
        status.textContent = 'Brief saved.';

        // Show the advance button if it wasn't there before
        if (!document.getElementById('nbAdvancePhase')) {
          const actions = phaseEl.querySelector('.nb-workspace__actions');
          if (actions) {
            const advBtn = document.createElement('button');
            advBtn.id = 'nbAdvancePhase';
            advBtn.className = 'nb-workspace__save';
            advBtn.style.background = 'var(--c-stone)';
            advBtn.textContent = 'Advance to P1 →';
            actions.appendChild(advBtn);
            wireAdvanceBtn(oppId);
          }
        }
      } catch (err) {
        status.textContent = 'Save failed. ' + (err.message || '');
      }
    });

    wireAdvanceBtn(oppId);
  }

  function wireAdvanceBtn(oppId) {
    const advBtn = document.getElementById('nbAdvancePhase');
    if (!advBtn) return;
    advBtn.addEventListener('click', async function() {
      const status = document.getElementById('nbBriefStatus');
      if (status) status.textContent = 'Advancing…';
      try {
        const fn = firebase.functions();
        await fn.httpsCallable('updateOpportunity')({
          oppId,
          updates: { phase: 'agency-brief' },
        });
        if (status) status.textContent = 'Advanced to P1. Reloading…';
        const container = document.getElementById('nbContent');
        if (container) renderWorkspace(container, oppId);
      } catch (err) {
        if (status) status.textContent = 'Failed to advance. ' + (err.message || '');
      }
    });
  }

  // ── Bootstrap ─────────────────────────────────────────────

  async function boot(email) {
    const container = document.getElementById('nbContent');
    if (!container) return;

    container.innerHTML = '<p style="padding:24px;color:var(--c-stone)">Checking access…</p>';

    const access = await checkAccess();
    if (!access.hasAccess) {
      renderGate(container);
      return;
    }

    const oppId = getOppIdFromUrl();
    if (oppId) {
      renderWorkspace(container, oppId);
    } else {
      renderList(container);
    }
  }

  // Handle browser back/forward
  window.addEventListener('popstate', function() {
    const container = document.getElementById('nbContent');
    if (!container) return;
    if (_accessState && !_accessState.hasAccess) return;
    const oppId = getOppIdFromUrl();
    if (oppId) {
      renderWorkspace(container, oppId);
    } else {
      renderList(container);
    }
  });

  document.addEventListener('mirAuthReady', function(e) {
    boot(e.detail.email);
  });

  // If auth already resolved before this script loaded
  try {
    const u = firebase.auth().currentUser;
    if (u && u.email) boot(u.email.toLowerCase());
  } catch (_) {}
})();
