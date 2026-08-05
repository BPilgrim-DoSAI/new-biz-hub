/* =============================================
   MIROMA AI HUB — New Business Hub
   Opportunity list, create, P0–P3 workspaces
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

  // ── Shared: advance phase helper ─────────────────────────

  async function advancePhase(oppId, nextPhase) {
    const fn = firebase.functions();
    await fn.httpsCallable('updateOpportunity')({
      oppId,
      updates: { phase: nextPhase },
    });
    const container = document.getElementById('nbContent');
    if (container) renderWorkspace(container, oppId);
  }

  // ── Render: phase content (P0–P3 + future placeholder) ──

  function renderPhaseContent(opp, oppId) {
    const phaseEl = document.getElementById('nbPhaseContent');
    if (!phaseEl) return;

    var renderers = {
      'intake':       renderIntakePhase,
      'agency-brief': renderAgencyBriefPhase,
      'questions':    renderQuestionsPhase,
      'positioning':  renderPositioningPhase,
    };

    var renderer = renderers[opp.phase];
    if (renderer) {
      renderer(phaseEl, opp, oppId);
    } else {
      phaseEl.innerHTML = '<div class="nb-workspace">' +
        '<p class="nb-workspace__title">Phase: ' + esc(opp.phase) + '</p>' +
        '<p class="nb-workspace__desc">This phase will be available in a future milestone. Creative and knowledge phases are coming in M2, deck export in M3.</p>' +
        '</div>';
    }

    renderContributions(phaseEl, oppId);
  }

  // ── P0: Intake ──────────────────────────────────────────

  function renderIntakePhase(phaseEl, opp, oppId) {
    var existingBrief = opp.rawBrief || '';

    phaseEl.innerHTML =
      '<div class="nb-workspace">' +
        '<p class="nb-workspace__title">P0 — Intake</p>' +
        '<p class="nb-workspace__desc">Upload the client brief document or paste it below. The parser extracts every detail and flags coverage gaps so nothing is missed.</p>' +

        // Upload zone
        '<div class="nb-upload" id="nbUploadZone">' +
          '<div class="nb-upload__inner">' +
            '<div class="nb-upload__icon">' +
              '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
                '<polyline points="17 8 12 3 7 8"/>' +
                '<line x1="12" y1="3" x2="12" y2="15"/>' +
              '</svg>' +
            '</div>' +
            '<p class="nb-upload__label">Drop a client brief here, or <span class="nb-upload__browse">browse</span></p>' +
            '<p class="nb-upload__hint">PDF, Word (.docx), or plain text — max 10 MB</p>' +
            '<input type="file" id="nbFileInput" class="nb-upload__input" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain">' +
          '</div>' +
        '</div>' +
        '<div class="nb-upload__file-info" id="nbFileInfo" style="display:none">' +
          '<span class="nb-upload__file-name" id="nbFileName"></span>' +
          '<button class="nb-upload__file-remove" id="nbFileRemove">×</button>' +
        '</div>' +
        '<p class="nb-upload__status" id="nbUploadStatus"></p>' +

        '<div class="nb-upload__divider"><span>or paste the brief directly</span></div>' +

        '<textarea class="nb-workspace__textarea" id="nbBriefText" placeholder="Paste the client brief here…">' + esc(existingBrief) + '</textarea>' +
        '<div class="nb-workspace__actions">' +
          '<button class="nb-workspace__save" id="nbSaveBrief">Save brief</button>' +
          (existingBrief ? '<button class="nb-workspace__advance" id="nbAdvancePhase">Advance to P1 →</button>' : '') +
        '</div>' +
        '<p class="nb-workspace__status" id="nbBriefStatus"></p>' +
      '</div>';

    // ── File upload handling ──
    var uploadZone = document.getElementById('nbUploadZone');
    var fileInput = document.getElementById('nbFileInput');
    var fileInfo = document.getElementById('nbFileInfo');
    var uploadStatus = document.getElementById('nbUploadStatus');

    // Click-to-browse
    uploadZone.addEventListener('click', function() { fileInput.click(); });

    // Drag-and-drop
    uploadZone.addEventListener('dragover', function(e) {
      e.preventDefault();
      uploadZone.classList.add('nb-upload--dragover');
    });
    uploadZone.addEventListener('dragleave', function() {
      uploadZone.classList.remove('nb-upload--dragover');
    });
    uploadZone.addEventListener('drop', function(e) {
      e.preventDefault();
      uploadZone.classList.remove('nb-upload--dragover');
      if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', function() {
      if (fileInput.files.length) handleFileUpload(fileInput.files[0]);
    });

    // Remove uploaded file
    document.getElementById('nbFileRemove').addEventListener('click', function() {
      fileInfo.style.display = 'none';
      uploadZone.style.display = '';
      fileInput.value = '';
      uploadStatus.textContent = '';
    });

    async function handleFileUpload(file) {
      var maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        uploadStatus.textContent = 'File too large — maximum 10 MB.';
        uploadStatus.className = 'nb-upload__status nb-upload__status--error';
        return;
      }

      var allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
      var nameAllowed = file.name.match(/\.(pdf|docx|txt)$/i);
      if (!allowed.includes(file.type) && !nameAllowed) {
        uploadStatus.textContent = 'Unsupported file type. Use PDF, DOCX, or TXT.';
        uploadStatus.className = 'nb-upload__status nb-upload__status--error';
        return;
      }

      // Show file info
      document.getElementById('nbFileName').textContent = file.name + ' (' + (file.size / 1024).toFixed(0) + ' KB)';
      fileInfo.style.display = '';
      uploadZone.style.display = 'none';
      uploadStatus.textContent = '';
      uploadStatus.className = 'nb-upload__status';

      // Read as base64 and send to parse function
      uploadStatus.textContent = 'Parsing document…';
      uploadStatus.className = 'nb-upload__status';

      try {
        var base64 = await readFileAsBase64(file);
        var fn = firebase.functions();
        var result = await fn.httpsCallable('parseClientBrief')({
          oppId: oppId,
          fileBase64: base64,
          fileName: file.name,
          mimeType: file.type,
        });
        var extracted = result.data.extractedText || '';
        document.getElementById('nbBriefText').value = extracted;
        uploadStatus.textContent = 'Document parsed — review the extracted brief below, then save.';
        uploadStatus.className = 'nb-upload__status nb-upload__status--ok';
      } catch (err) {
        uploadStatus.textContent = 'Parse failed: ' + (err.message || 'Unknown error');
        uploadStatus.className = 'nb-upload__status nb-upload__status--error';
      }
    }

    function readFileAsBase64(file) {
      return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function() {
          var dataUrl = reader.result;
          var base64 = dataUrl.split(',')[1] || '';
          resolve(base64);
        };
        reader.onerror = function() { reject(new Error('Failed to read file')); };
        reader.readAsDataURL(file);
      });
    }

    // ── Save brief (existing logic) ──
    document.getElementById('nbSaveBrief').addEventListener('click', async function() {
      var text = document.getElementById('nbBriefText').value.trim();
      var status = document.getElementById('nbBriefStatus');
      if (!text) { status.textContent = 'Please enter the client brief.'; return; }
      status.textContent = 'Saving…';
      try {
        var fn = firebase.functions();
        await fn.httpsCallable('updateOpportunity')({ oppId, updates: { rawBrief: text } });
        await fn.httpsCallable('savePhaseOutput')({ oppId, phase: 'intake', output: { rawBrief: text, completedAt: new Date().toISOString() } });
        status.textContent = 'Brief saved.';
        if (!document.getElementById('nbAdvancePhase')) {
          var actions = phaseEl.querySelector('.nb-workspace__actions');
          if (actions) {
            var advBtn = document.createElement('button');
            advBtn.id = 'nbAdvancePhase';
            advBtn.className = 'nb-workspace__advance';
            advBtn.textContent = 'Advance to P1 →';
            actions.appendChild(advBtn);
            advBtn.addEventListener('click', function() { advancePhase(oppId, 'agency-brief'); });
          }
        }
      } catch (err) {
        status.textContent = 'Save failed. ' + (err.message || '');
      }
    });

    var advBtn = document.getElementById('nbAdvancePhase');
    if (advBtn) advBtn.addEventListener('click', function() { advancePhase(oppId, 'agency-brief'); });
  }

  // ── P1: Agency Brief ───────────────────────────────────

  function renderAgencyBriefPhase(phaseEl, opp, oppId) {
    var output = opp.phaseOutputs?.['agency-brief'];
    var hasOutput = output && output.clientName;

    var rawBriefPreview = opp.rawBrief
      ? '<details class="nb-ref-brief"><summary>View raw brief from P0</summary><pre class="nb-ref-brief__text">' + esc(opp.rawBrief) + '</pre></details>'
      : '';

    if (!hasOutput) {
      phaseEl.innerHTML =
        '<div class="nb-workspace">' +
          '<p class="nb-workspace__title">P1 — Agency Brief</p>' +
          '<p class="nb-workspace__desc">Generate a structured agency brief from the raw client brief. The AI will extract key details into an editable format.</p>' +
          rawBriefPreview +
          '<div class="nb-workspace__actions">' +
            '<button class="nb-workspace__generate" id="nbGenBrief">' +
              '<span class="nb-workspace__generate-icon">✦</span> Generate structured brief' +
            '</button>' +
          '</div>' +
          '<p class="nb-workspace__status" id="nbP1Status"></p>' +
        '</div>';

      document.getElementById('nbGenBrief').addEventListener('click', async function() {
        var btn = document.getElementById('nbGenBrief');
        var status = document.getElementById('nbP1Status');
        btn.disabled = true;
        btn.innerHTML = '<span class="nb-spinner"></span> Generating brief…';
        status.textContent = '';
        try {
          var fn = firebase.functions();
          var result = await fn.httpsCallable('runAgencyBrief')({ oppId });
          var container = document.getElementById('nbContent');
          if (container) renderWorkspace(container, oppId);
        } catch (err) {
          status.textContent = 'Generation failed. ' + (err.message || '');
          btn.disabled = false;
          btn.innerHTML = '<span class="nb-workspace__generate-icon">✦</span> Generate structured brief';
        }
      });
      return;
    }

    var fields = [
      { key: 'clientName', label: 'Client name' },
      { key: 'clientIndustry', label: 'Industry' },
      { key: 'projectTitle', label: 'Project title' },
      { key: 'projectDescription', label: 'Description' },
      { key: 'budget', label: 'Budget' },
      { key: 'timings', label: 'Timings' },
      { key: 'contacts', label: 'Contacts' },
      { key: 'marketContext', label: 'Market context' },
      { key: 'targetAudience', label: 'Target audience' },
      { key: 'objectives', label: 'Objectives' },
      { key: 'constraints', label: 'Constraints' },
      { key: 'additionalNotes', label: 'Additional notes' },
    ];

    var fieldsHtml = fields.map(function(f) {
      var val = output[f.key] || '';
      return '<div class="nb-brief-field">' +
        '<label class="nb-brief-field__label">' + esc(f.label) + '</label>' +
        '<textarea class="nb-brief-field__input" data-field="' + f.key + '" rows="2">' + esc(val) + '</textarea>' +
      '</div>';
    }).join('');

    var deliverables = Array.isArray(output.deliverables) ? output.deliverables : [];
    var deliverablesHtml =
      '<div class="nb-brief-field">' +
        '<label class="nb-brief-field__label">Deliverables</label>' +
        '<div class="nb-deliverables" id="nbDeliverables">' +
          deliverables.map(function(d, i) {
            return '<div class="nb-deliverable-item">' +
              '<input type="text" class="nb-deliverable-item__input" value="' + esc(d) + '" data-idx="' + i + '">' +
              '<button class="nb-deliverable-item__remove" data-idx="' + i + '">×</button>' +
            '</div>';
          }).join('') +
          '<button class="nb-deliverable-add" id="nbAddDeliverable">+ Add deliverable</button>' +
        '</div>' +
      '</div>';

    phaseEl.innerHTML =
      '<div class="nb-workspace">' +
        '<p class="nb-workspace__title">P1 — Agency Brief</p>' +
        '<p class="nb-workspace__desc">Review and edit the structured brief below. All fields are editable — click into any field to refine it.</p>' +
        rawBriefPreview +
        '<div class="nb-brief-form">' + fieldsHtml + deliverablesHtml + '</div>' +
        '<div class="nb-workspace__actions">' +
          '<button class="nb-workspace__save" id="nbSaveBriefFields">Save changes</button>' +
          '<button class="nb-workspace__generate nb-workspace__generate--secondary" id="nbRegenBrief">' +
            '<span class="nb-workspace__generate-icon">✦</span> Regenerate' +
          '</button>' +
          '<button class="nb-workspace__advance" id="nbAdvanceP1">Confirm brief &amp; advance to P2 →</button>' +
        '</div>' +
        '<p class="nb-workspace__status" id="nbP1Status"></p>' +
      '</div>';

    // Save field edits
    document.getElementById('nbSaveBriefFields').addEventListener('click', async function() {
      var status = document.getElementById('nbP1Status');
      status.textContent = 'Saving…';
      try {
        var fn = firebase.functions();
        var textareas = phaseEl.querySelectorAll('.nb-brief-field__input');
        for (var i = 0; i < textareas.length; i++) {
          var ta = textareas[i];
          var field = ta.dataset.field;
          if (field && ta.value !== (output[field] || '')) {
            await fn.httpsCallable('editPhaseField')({ oppId, phase: 'agency-brief', field: field, value: ta.value });
          }
        }
        var delInputs = phaseEl.querySelectorAll('.nb-deliverable-item__input');
        var newDeliverables = [];
        delInputs.forEach(function(inp) { if (inp.value.trim()) newDeliverables.push(inp.value.trim()); });
        await fn.httpsCallable('editPhaseField')({ oppId, phase: 'agency-brief', field: 'deliverables', value: newDeliverables });
        status.textContent = 'Changes saved.';
      } catch (err) {
        status.textContent = 'Save failed. ' + (err.message || '');
      }
    });

    // Add deliverable
    document.getElementById('nbAddDeliverable').addEventListener('click', function() {
      var container = document.getElementById('nbDeliverables');
      var addBtn = document.getElementById('nbAddDeliverable');
      var idx = container.querySelectorAll('.nb-deliverable-item').length;
      var item = document.createElement('div');
      item.className = 'nb-deliverable-item';
      item.innerHTML = '<input type="text" class="nb-deliverable-item__input" value="" data-idx="' + idx + '" placeholder="New deliverable">' +
        '<button class="nb-deliverable-item__remove" data-idx="' + idx + '">×</button>';
      container.insertBefore(item, addBtn);
      item.querySelector('input').focus();
    });

    // Remove deliverable
    phaseEl.addEventListener('click', function(e) {
      if (e.target.classList.contains('nb-deliverable-item__remove')) {
        e.target.closest('.nb-deliverable-item').remove();
      }
    });

    // Regenerate
    document.getElementById('nbRegenBrief').addEventListener('click', async function() {
      var btn = document.getElementById('nbRegenBrief');
      var status = document.getElementById('nbP1Status');
      btn.disabled = true;
      btn.innerHTML = '<span class="nb-spinner"></span> Regenerating…';
      try {
        var fn = firebase.functions();
        await fn.httpsCallable('runAgencyBrief')({ oppId });
        var container = document.getElementById('nbContent');
        if (container) renderWorkspace(container, oppId);
      } catch (err) {
        status.textContent = 'Regeneration failed. ' + (err.message || '');
        btn.disabled = false;
        btn.innerHTML = '<span class="nb-workspace__generate-icon">✦</span> Regenerate';
      }
    });

    // Advance
    document.getElementById('nbAdvanceP1').addEventListener('click', function() {
      advancePhase(oppId, 'questions');
    });
  }

  // ── P2: Questions ──────────────────────────────────────

  function renderQuestionsPhase(phaseEl, opp, oppId) {
    var output = opp.phaseOutputs?.questions;
    var questions = output?.questions || [];

    if (!questions.length) {
      phaseEl.innerHTML =
        '<div class="nb-workspace">' +
          '<p class="nb-workspace__title">P2 — Question List</p>' +
          '<p class="nb-workspace__desc">Generate decisive questions — strategic and commercial — that will sharpen the pitch. Questions that, if answered, would materially change the strategy.</p>' +
          '<div class="nb-workspace__actions">' +
            '<button class="nb-workspace__generate" id="nbGenQuestions">' +
              '<span class="nb-workspace__generate-icon">✦</span> Generate questions' +
            '</button>' +
          '</div>' +
          '<p class="nb-workspace__status" id="nbP2Status"></p>' +
        '</div>';

      document.getElementById('nbGenQuestions').addEventListener('click', async function() {
        var btn = document.getElementById('nbGenQuestions');
        var status = document.getElementById('nbP2Status');
        btn.disabled = true;
        btn.innerHTML = '<span class="nb-spinner"></span> Generating questions…';
        try {
          var fn = firebase.functions();
          await fn.httpsCallable('runQuestions')({ oppId });
          var container = document.getElementById('nbContent');
          if (container) renderWorkspace(container, oppId);
        } catch (err) {
          status.textContent = 'Generation failed. ' + (err.message || '');
          btn.disabled = false;
          btn.innerHTML = '<span class="nb-workspace__generate-icon">✦</span> Generate questions';
        }
      });
      return;
    }

    var categoryIcon = { strategic: '◆', commercial: '●', creative: '▲', technical: '■' };
    var priorityClass = { high: 'nb-q--high', medium: 'nb-q--medium', low: 'nb-q--low' };

    var qListHtml = questions.map(function(q, i) {
      var icon = categoryIcon[q.category] || '○';
      var cls = priorityClass[q.priority] || '';
      var answered = q.answer && q.answer.trim();
      var gapTag = q.gap
        ? '<span class="nb-q__gap" title="Brief coverage gap: ' + esc(q.gapArea || '') + '">GAP</span>'
        : '';
      return '<div class="nb-q ' + cls + (answered ? ' nb-q--answered' : '') + '" data-idx="' + i + '">' +
        '<div class="nb-q__header">' +
          '<span class="nb-q__icon" title="' + esc(q.category) + '">' + icon + '</span>' +
          gapTag +
          '<span class="nb-q__priority">' + esc(q.priority) + '</span>' +
          '<span class="nb-q__category">' + esc(q.category) + '</span>' +
          (answered ? '<span class="nb-q__check">✓</span>' : '') +
        '</div>' +
        '<p class="nb-q__text">' + esc(q.text) + '</p>' +
        (q.gap && q.gapArea ? '<p class="nb-q__gap-area">Missing from brief: ' + esc(q.gapArea) + '</p>' : '') +
        '<p class="nb-q__reasoning">' + esc(q.reasoning) + '</p>' +
        '<div class="nb-q__answer-wrap">' +
          '<textarea class="nb-q__answer" rows="2" placeholder="Capture the answer here…" data-qi="' + i + '">' + esc(q.answer || '') + '</textarea>' +
          '<button class="nb-q__save-answer" data-qi="' + i + '">Save</button>' +
        '</div>' +
      '</div>';
    }).join('');

    var answeredCount = questions.filter(function(q) { return q.answer && q.answer.trim(); }).length;
    var gapCount = questions.filter(function(q) { return q.gap; }).length;

    phaseEl.innerHTML =
      '<div class="nb-workspace">' +
        '<p class="nb-workspace__title">P2 — Question List</p>' +
        '<p class="nb-workspace__desc">Review the questions below. ' +
          (gapCount ? '<strong>' + gapCount + ' gap' + (gapCount === 1 ? '' : 's') + '</strong> identified from the brief — these fill missing information the pitch team needs. ' : '') +
          'Capture answers from the client or your own intelligence — answered questions feed into P3 positioning.</p>' +
        '<div class="nb-q-summary">' +
          '<span>' + questions.length + ' questions</span>' +
          (gapCount ? '<span class="nb-q-summary__gaps">' + gapCount + ' brief gaps</span>' : '') +
          '<span class="nb-q-summary__answered">' + answeredCount + ' answered</span>' +
        '</div>' +
        '<div class="nb-q-list">' + qListHtml + '</div>' +
        '<div class="nb-workspace__actions">' +
          '<button class="nb-workspace__generate nb-workspace__generate--secondary" id="nbRegenQuestions">' +
            '<span class="nb-workspace__generate-icon">✦</span> Regenerate' +
          '</button>' +
          '<button class="nb-workspace__advance" id="nbAdvanceP2">Advance to P3 →</button>' +
        '</div>' +
        '<p class="nb-workspace__status" id="nbP2Status"></p>' +
      '</div>';

    // Save answer
    phaseEl.addEventListener('click', function(e) {
      var saveBtn = e.target.closest('.nb-q__save-answer');
      if (!saveBtn) return;
      var qi = parseInt(saveBtn.dataset.qi, 10);
      var textarea = phaseEl.querySelector('.nb-q__answer[data-qi="' + qi + '"]');
      if (!textarea) return;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      var fn = firebase.functions();
      fn.httpsCallable('saveQuestionAnswer')({ oppId: oppId, questionIndex: qi, answer: textarea.value.trim() })
        .then(function() {
          saveBtn.textContent = 'Saved ✓';
          var qCard = saveBtn.closest('.nb-q');
          if (textarea.value.trim()) qCard.classList.add('nb-q--answered');
          setTimeout(function() { saveBtn.textContent = 'Save'; saveBtn.disabled = false; }, 1500);
        })
        .catch(function(err) {
          saveBtn.textContent = 'Failed';
          setTimeout(function() { saveBtn.textContent = 'Save'; saveBtn.disabled = false; }, 1500);
        });
    });

    // Regenerate
    document.getElementById('nbRegenQuestions').addEventListener('click', async function() {
      var btn = document.getElementById('nbRegenQuestions');
      var status = document.getElementById('nbP2Status');
      btn.disabled = true;
      btn.innerHTML = '<span class="nb-spinner"></span> Regenerating…';
      try {
        var fn = firebase.functions();
        await fn.httpsCallable('runQuestions')({ oppId });
        var container = document.getElementById('nbContent');
        if (container) renderWorkspace(container, oppId);
      } catch (err) {
        status.textContent = 'Regeneration failed. ' + (err.message || '');
        btn.disabled = false;
        btn.innerHTML = '<span class="nb-workspace__generate-icon">✦</span> Regenerate';
      }
    });

    // Advance
    document.getElementById('nbAdvanceP2').addEventListener('click', function() {
      advancePhase(oppId, 'positioning');
    });
  }

  // ── P3: Positioning ────────────────────────────────────

  function renderPositioningPhase(phaseEl, opp, oppId) {
    var output = opp.phaseOutputs?.positioning;
    var territories = output?.territories || [];

    if (!territories.length) {
      phaseEl.innerHTML =
        '<div class="nb-workspace">' +
          '<p class="nb-workspace__title">P3 — Strategic Positioning</p>' +
          '<p class="nb-workspace__desc">Generate genuinely distinctive positioning territories. The engine rejects the category average first, then develops divergent positions grounded in this brand\'s specific truth.</p>' +
          '<div class="nb-workspace__actions">' +
            '<button class="nb-workspace__generate" id="nbGenPos">' +
              '<span class="nb-workspace__generate-icon">✦</span> Generate territories' +
            '</button>' +
          '</div>' +
          '<p class="nb-workspace__status" id="nbP3Status"></p>' +
        '</div>';

      document.getElementById('nbGenPos').addEventListener('click', async function() {
        var btn = document.getElementById('nbGenPos');
        var status = document.getElementById('nbP3Status');
        btn.disabled = true;
        btn.innerHTML = '<span class="nb-spinner"></span> Generating territories…';
        try {
          var fn = firebase.functions();
          await fn.httpsCallable('runPositioning')({ oppId });
          var container = document.getElementById('nbContent');
          if (container) renderWorkspace(container, oppId);
        } catch (err) {
          status.textContent = 'Generation failed. ' + (err.message || '');
          btn.disabled = false;
          btn.innerHTML = '<span class="nb-workspace__generate-icon">✦</span> Generate territories';
        }
      });
      return;
    }

    var rejectedMean = output.rejectedMean;
    var selectedIdx = output.selectedTerritory;

    var rejectedHtml = rejectedMean
      ? '<div class="nb-rejected-mean">' +
          '<p class="nb-rejected-mean__label">✗ Rejected: the category-average position</p>' +
          '<p class="nb-rejected-mean__territory">' + esc(rejectedMean.territory) + '</p>' +
          '<p class="nb-rejected-mean__reasoning">' + esc(rejectedMean.reasoning) + '</p>' +
        '</div>'
      : '';

    var territoriesHtml = territories.map(function(t, i) {
      var isSelected = selectedIdx === i;
      return '<div class="nb-territory' + (isSelected ? ' nb-territory--selected' : '') + '" data-idx="' + i + '">' +
        '<div class="nb-territory__header">' +
          '<span class="nb-territory__num">Territory ' + (i + 1) + '</span>' +
          (isSelected ? '<span class="nb-territory__badge">✓ Selected</span>' : '') +
        '</div>' +
        '<h3 class="nb-territory__name">' + esc(t.name) + '</h3>' +
        '<p class="nb-territory__headline">' + esc(t.headline) + '</p>' +
        '<div class="nb-territory__details">' +
          '<div class="nb-territory__detail">' +
            '<span class="nb-territory__detail-label">Insight</span>' +
            '<p>' + esc(t.insight) + '</p>' +
          '</div>' +
          '<div class="nb-territory__detail">' +
            '<span class="nb-territory__detail-label">Expression</span>' +
            '<p>' + esc(t.expression) + '</p>' +
          '</div>' +
          '<div class="nb-territory__detail">' +
            '<span class="nb-territory__detail-label">Distinctiveness</span>' +
            '<p>' + esc(t.distinctiveness) + '</p>' +
          '</div>' +
          '<div class="nb-territory__detail">' +
            '<span class="nb-territory__detail-label">Rival test</span>' +
            '<p>' + esc(t.rivalTest) + '</p>' +
          '</div>' +
        '</div>' +
        (!isSelected ? '<button class="nb-territory__select" data-idx="' + i + '">Select this territory</button>' : '') +
      '</div>';
    }).join('');

    var rationaleHtml = selectedIdx !== null && selectedIdx !== undefined
      ? '<div class="nb-rationale">' +
          '<label class="nb-rationale__label">Selection rationale</label>' +
          '<textarea class="nb-rationale__input" id="nbRationale" rows="3" placeholder="Why this territory?">' + esc(output.selectionRationale || '') + '</textarea>' +
          '<button class="nb-workspace__save" id="nbSaveRationale">Save rationale</button>' +
        '</div>'
      : '';

    phaseEl.innerHTML =
      '<div class="nb-workspace">' +
        '<p class="nb-workspace__title">P3 — Strategic Positioning</p>' +
        '<p class="nb-workspace__desc">Review the territories below. Each was tested against the "which rival could also pitch this?" filter. Select one to carry forward into creative.</p>' +
        rejectedHtml +
        '<div class="nb-territory-grid">' + territoriesHtml + '</div>' +
        rationaleHtml +
        '<div class="nb-workspace__actions">' +
          '<button class="nb-workspace__generate nb-workspace__generate--secondary" id="nbRegenPos">' +
            '<span class="nb-workspace__generate-icon">✦</span> Regenerate' +
          '</button>' +
          (selectedIdx !== null && selectedIdx !== undefined
            ? '<button class="nb-workspace__advance" id="nbAdvanceP3">Advance to P4 →</button>'
            : '') +
        '</div>' +
        '<p class="nb-workspace__status" id="nbP3Status"></p>' +
      '</div>';

    // Select territory
    phaseEl.addEventListener('click', function(e) {
      var selectBtn = e.target.closest('.nb-territory__select');
      if (!selectBtn) return;
      var idx = parseInt(selectBtn.dataset.idx, 10);
      selectBtn.disabled = true;
      selectBtn.textContent = 'Selecting…';
      var fn = firebase.functions();
      fn.httpsCallable('selectTerritory')({ oppId: oppId, territoryIndex: idx, rationale: '' })
        .then(function() {
          var container = document.getElementById('nbContent');
          if (container) renderWorkspace(container, oppId);
        })
        .catch(function(err) {
          selectBtn.textContent = 'Failed — try again';
          selectBtn.disabled = false;
        });
    });

    // Save rationale
    var rationaleBtn = document.getElementById('nbSaveRationale');
    if (rationaleBtn) {
      rationaleBtn.addEventListener('click', async function() {
        var status = document.getElementById('nbP3Status');
        var rationale = document.getElementById('nbRationale').value.trim();
        rationaleBtn.disabled = true;
        rationaleBtn.textContent = 'Saving…';
        try {
          var fn = firebase.functions();
          await fn.httpsCallable('selectTerritory')({ oppId: oppId, territoryIndex: selectedIdx, rationale: rationale });
          rationaleBtn.textContent = 'Saved ✓';
          setTimeout(function() { rationaleBtn.textContent = 'Save rationale'; rationaleBtn.disabled = false; }, 1500);
        } catch (err) {
          status.textContent = 'Save failed. ' + (err.message || '');
          rationaleBtn.textContent = 'Save rationale';
          rationaleBtn.disabled = false;
        }
      });
    }

    // Regenerate
    document.getElementById('nbRegenPos').addEventListener('click', async function() {
      var btn = document.getElementById('nbRegenPos');
      var status = document.getElementById('nbP3Status');
      btn.disabled = true;
      btn.innerHTML = '<span class="nb-spinner"></span> Regenerating…';
      try {
        var fn = firebase.functions();
        await fn.httpsCallable('runPositioning')({ oppId });
        var container = document.getElementById('nbContent');
        if (container) renderWorkspace(container, oppId);
      } catch (err) {
        status.textContent = 'Regeneration failed. ' + (err.message || '');
        btn.disabled = false;
        btn.innerHTML = '<span class="nb-workspace__generate-icon">✦</span> Regenerate';
      }
    });

    // Advance
    var advP3 = document.getElementById('nbAdvanceP3');
    if (advP3) advP3.addEventListener('click', function() { advancePhase(oppId, 'creative'); });
  }

  // ── Contributions timeline ─────────────────────────────

  function renderContributions(phaseEl, oppId) {
    var wrap = document.createElement('div');
    wrap.className = 'nb-contributions';
    wrap.innerHTML = '<details class="nb-contributions__details">' +
      '<summary class="nb-contributions__toggle">Activity log</summary>' +
      '<div class="nb-contributions__list" id="nbContribList">Loading…</div>' +
    '</details>';
    phaseEl.appendChild(wrap);

    wrap.querySelector('details').addEventListener('toggle', function(e) {
      if (!e.target.open) return;
      var list = document.getElementById('nbContribList');
      if (list.dataset.loaded) return;
      var fn = firebase.functions();
      fn.httpsCallable('listContributions')({ oppId: oppId })
        .then(function(result) {
          var contribs = result.data.contributions || [];
          if (!contribs.length) {
            list.innerHTML = '<p class="nb-contributions__empty">No activity yet.</p>';
            list.dataset.loaded = '1';
            return;
          }
          list.innerHTML = contribs.map(function(c) {
            var ts = c.createdAt ? new Date(c.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
            var typeIcon = { 'claude-generation': '✦', 'manual-edit': '✎', 'territory-selection': '◆', answer: '→' };
            return '<div class="nb-contrib">' +
              '<span class="nb-contrib__icon">' + (typeIcon[c.type] || '·') + '</span>' +
              '<div class="nb-contrib__body">' +
                '<p class="nb-contrib__summary">' + esc(c.summary) + '</p>' +
                '<p class="nb-contrib__meta">' + esc(c.author || '') + (ts ? ' · ' + ts : '') + '</p>' +
              '</div>' +
            '</div>';
          }).join('');
          list.dataset.loaded = '1';
        })
        .catch(function() {
          list.innerHTML = '<p class="nb-contributions__empty">Failed to load activity.</p>';
        });
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
