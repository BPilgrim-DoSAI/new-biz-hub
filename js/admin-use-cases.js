/* =============================================
   MIROMA AI HUB — Admin Use Case editor
   =============================================
   Edits the content_use_cases Firestore collection from the admin
   panel's Site Content area, so use cases publish without a code
   deploy. Rendered into #adminContentUseCases by admin-panel.js.
   Follows the same conventions as the news editor (admin-content.js).

   A-L-4 note: everything in content_use_cases is runtime-authored, so
   every interpolation below goes through esc(). The public renderers
   (use-cases-content.js, the drawer builder in main.js) escape on
   their side.

   Slugs are immutable: a document's ID is the slug minted from its
   ORIGINAL title (same derivation as titleToSlug in requests.js).
   Production reaction counts in /uc_reactions are keyed by these
   slugs, so the editor never re-keys a document — retitling keeps the
   original slug, and the Firestore rules enforce slug == docId.
   ============================================= */

(function initAdminUseCases() {
  'use strict';

  var TOOLS = ['Claude', 'LTX Studio', 'Descript', 'Springboards', 'Fireflies'];

  // The eight categories offered on the public use-cases page. (A handful
  // of imported docs sit in legacy categories — Legal, HR & People — which
  // never had cards on the page; editing one keeps its category.)
  var CATEGORIES = [
    'New Business & Strategy', 'Social Media', 'Account Management',
    'Media Planning & Buying', 'Finance', 'Creative & Production',
    'PR & Communications', 'Technology & Development',
  ];

  var TYPES = [['prompt', 'Prompt'], ['workflow', 'Workflow']];

  var DPIA_OPTIONS = [
    ['', 'None / not assessed'],
    ['standard', 'Standard (green)'],
    ['client-check', 'Client check (yellow)'],
    ['legal-review', 'Legal review (orange)'],
    ['dpia-required', 'DPIA required (red)'],
  ];

  // Video URLs render in an iframe on the public page, so they must sit on
  // a host the site's CSP frame-src allows — same allowlist as the news
  // renderers' safeEmbed().
  var VIDEO_HOSTS = /^https:\/\/(www\.youtube\.com|www\.youtube-nocookie\.com|www\.loom\.com|share\.descript\.com)\//i;

  // The use-cases page's pre-migration card order (slugs, top of the grid
  // first), captured from the static HTML so the imported library renders
  // in exactly the order users see today. The USE_CASES array itself is in
  // a different order, so array index alone would visibly reshuffle the
  // page. Items not listed here (Legal / HR & People — no cards on the
  // page) sort after everything else.
  var PAGE_ORDER = ['draft-a-campaign-brief-at-speed', 'generate-social-content-at-scale', 'explore-creative-territory-for-any-brief', 'produce-ai-video-content-for-campaigns', 'turn-every-meeting-into-action-items', 'edit-a-client-podcast-in-10-minutes', 'synthesise-competitor-research-instantly', 'transform-campaign-data-into-client-stories', 'write-email-campaigns-in-minutes', 'expand-creative-concepts-at-volume', 'create-influencer-briefs-at-scale', 'repurpose-long-form-video-for-social', 'prep-for-any-client-meeting-in-5-minutes', 'write-a-media-plan-narrative', 'draft-press-releases-and-media-pitches', 'build-a-social-sentiment-dashboard-in-minutes', 'run-a-creative-ideation-session-with-your-team', 'generate-an-aeo-and-geo-readiness-report', 'pressure-test-a-brief-before-presenting-it', 'get-a-curated-industry-news-digest', 'draft-research-quality-surveys-in-minutes', 'build-a-ppc-campaign-structure-from-a-brief', 'research-creative-ideas-and-references-for-any-brief', 'generate-a-curated-broadway-show-list-instantly', 'run-the-full-new-business-workflow', 'refresh-and-optimise-existing-content-for-seo', 'refine-copy-while-keeping-the-brand-voice-intact', 'create-professional-presentations-from-raw-notes', 'distil-a-lengthy-creative-brief-into-the-essentials', 'format-and-restructure-slides-from-a-word-document', 'build-a-daily-client-account-digest', 'identify-growth-opportunities-in-an-existing-account', 'audience-identification-brief', 'key-period-moments-calendar', 'client-insight-presentation-builder', 'creative-format-identification-brief', 'quarterly-client-review-prep-pack', 'log-and-organise-press-coverage-automatically', 'pull-the-best-quotes-from-press-coverage-instantly', 'extract-ad-specs-from-pdfs-into-a-clean-csv', 'speed-up-html-ad-builds-and-fix-code-errors-fast', 'generate-visual-comps-for-pitch-decks', 'validate-a-sketch-concept-before-production', 'upscale-low-res-images-and-retouch-for-delivery', 'generate-images-and-video-from-a-text-prompt', 'generate-rapid-mockups-for-brand-visual-development', 'create-photo-comps-for-key-art-proposals', 'generate-storyboards-from-a-script-or-concept', 'generate-video-content-from-an-audio-track', 'fix-a-video-scene-without-going-back-to-set', 'generate-bespoke-stock-images-on-demand', 'generate-consistent-creative-using-brand-packs', 'identify-high-potential-moments-from-raw-footage', 'export-a-clean-rough-cut-directly-to-premiere', 'create-a-production-call-sheet-from-pre-pro-notes', 'shot-list-creator', 'animate-a-still-image-into-video', 'write-a-video-script-and-produce-it-end-to-end-in-ltx-studio', 'match-receipts-to-expense-claims-automatically', 'automate-month-end-summaries-and-variance-analysis', 'reconcile-an-invoice-against-the-media-plan', 'draft-forecast-commentary-from-finalised-figures', 'sales-performance-commentary-writer', 'discounting-strategy-recommendation', 'project-profitability-commentary', 'revenue-recognition-memo-helper', 'build-a-pitch-deck-structure-and-narrative-from-a-brief', 'write-a-case-study-for-new-business-pitches', 'draft-an-rfp-response-to-a-client-question', 'brand-strategy-synthesiser', 'pitch-strategy-plan', 'parse-a-complex-media-plan-into-a-clean-data-structure', 'analyse-ad-creative-performance-data', 'draft-a-media-booking-confirmation-email', 'media-plan-review', 'cross-channel-reporting-commentary', 'write-award-entries-from-campaign-results', 'draft-internal-communications-for-any-announcement', 'search-and-compile-press-coverage-for-any-show-or-campaign', 'ghostwrite-thought-leadership-for-a-senior-author', 'plan-a-monthly-social-content-calendar', 'draft-community-management-responses-at-scale', 'shortlist-influencer-talent-for-a-campaign', 'content-calendar-builder', 'community-faq-doc-compilation', 'build-a-monthly-content-performance-report', 'translate-social-copy-for-a-new-market', 'build-a-prospect-research-dossier', 'build-a-weekly-client-status-deck', 'analyse-brand-content-trends-and-plan-next-month', 'create-a-full-influencer-briefing-pack', 'write-a-new-business-outreach-sequence', 'create-a-client-onboarding-pack', 'draft-a-targeted-email-blast', 'build-a-landing-page-or-microsite-from-a-brief', 'debug-and-fix-errors-across-any-codebase', 'review-and-understand-an-unfamiliar-codebase', 'design-and-prototype-ui-components-rapidly', 'generate-technical-documentation-from-existing-code', 'translate-a-client-brief-into-a-technical-specification'];

  var _items  = [];
  var _search = '';
  var _catFilter = 'all';

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function notify(msg) {
    if (typeof window.hubToast === 'function') window.hubToast(msg);
  }

  function slugOf(title) {
    return (typeof titleToSlug === 'function')
      ? titleToSlug(title)
      : String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  function mount() {
    return document.getElementById('adminContentUseCases')
      || document.getElementById('adminSectionContent');
  }

  // Entry point — called by admin-panel.js when the Use Cases tab is opened.
  window.renderAdminUseCaseEditor = async function renderAdminUseCaseEditor() {
    var section = mount();
    if (!section) return;
    section.innerHTML = '<p class="admin-view__loading">Loading use cases…</p>';
    try {
      _items = await fsGetUseCases();
    } catch (err) {
      section.innerHTML = '<p class="admin-view__loading">Could not load use cases — please refresh and try again.</p>';
      console.warn('renderAdminUseCaseEditor:', err);
      return;
    }
    renderList();
  };

  // ── List view ─────────────────────────────────────────

  function importableItems() {
    if (typeof USE_CASES === 'undefined') return [];
    var existing = {};
    _items.forEach(function (i) { existing[i.slug] = true; });
    return USE_CASES.filter(function (u) {
      return u.type !== 'custom-build' && !existing[slugOf(u.title)];
    });
  }

  function visibleItems() {
    var term = _search.toLowerCase();
    return _items.filter(function (i) {
      if (_catFilter !== 'all' && i.category !== _catFilter) return false;
      if (!term) return true;
      return ((i.title || '') + ' ' + (i.tool || '') + ' ' + (i.category || ''))
        .toLowerCase().indexOf(term) !== -1;
    });
  }

  function renderList() {
    var section = mount();
    if (!section) return;

    var missing = importableItems();
    var importHtml = missing.length
      ? '<div class="admin-content-import">' +
          '<p>' + (_items.length
            ? missing.length + ' use case(s) from the site\'s built-in library are not in the database yet.'
            : 'Nothing in the database yet. Import the ' + missing.length + ' use cases currently hard-coded into the site to get started — the public page keeps working either way.') +
          '</p>' +
          '<button class="btn-sm btn-sm--outline" id="ucImportBtn">Import existing items</button>' +
        '</div>'
      : '';

    var categories = CATEGORIES.slice();
    _items.forEach(function (i) {
      if (i.category && categories.indexOf(i.category) === -1) categories.push(i.category);
    });

    section.innerHTML =
      '<p class="admin-view__title">Site Content — Use Case Library</p>' +
      '<p class="admin-view__sub">Use cases published here appear on the Use Cases page immediately — no deployment needed. Reaction counts follow each use case even if it is retitled.</p>' +
      '<div class="admin-content-toolbar" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">' +
        '<button class="btn-sm btn-sm--primary" id="ucAddBtn">+ Add use case</button>' +
        '<input type="search" id="ucAdminSearch" placeholder="Search use cases…" value="' + esc(_search) + '" style="flex:1;min-width:180px;max-width:320px;padding:7px 10px;border:1px solid var(--c-line,#ddd);border-radius:6px;font:inherit;font-size:13px;">' +
        '<select id="ucAdminCatFilter" style="padding:7px 10px;border:1px solid var(--c-line,#ddd);border-radius:6px;font:inherit;font-size:13px;">' +
          '<option value="all">All categories</option>' +
          categories.map(function (c) {
            return '<option value="' + esc(c) + '"' + (_catFilter === c ? ' selected' : '') + '>' + esc(c) + '</option>';
          }).join('') +
        '</select>' +
      '</div>' +
      importHtml +
      '<div class="admin-content-list">' +
        (visibleItems().map(rowHtml).join('') ||
          (_items.length
            ? '<p class="admin-view__loading">No use cases match your search.</p>'
            : (missing.length ? '' : '<p class="admin-view__loading">No use cases yet — add your first above.</p>'))) +
      '</div>';

    section.querySelector('#ucAddBtn').addEventListener('click', function () { openForm(null); });

    var searchEl = section.querySelector('#ucAdminSearch');
    searchEl.addEventListener('input', function () {
      _search = searchEl.value.trim();
      refreshListOnly(section);
    });
    section.querySelector('#ucAdminCatFilter').addEventListener('change', function (e) {
      _catFilter = e.target.value;
      refreshListOnly(section);
    });

    var importBtn = section.querySelector('#ucImportBtn');
    if (importBtn) importBtn.addEventListener('click', importExisting);

    bindRowActions(section);
  }

  // Re-renders only the rows, so typing in the search box doesn't rebuild
  // (and refocus-steal from) the toolbar.
  function refreshListOnly(section) {
    var list = section.querySelector('.admin-content-list');
    if (!list) return;
    list.innerHTML = visibleItems().map(rowHtml).join('') ||
      '<p class="admin-view__loading">No use cases match your search.</p>';
    bindRowActions(section);
  }

  function bindRowActions(section) {
    section.querySelectorAll('[data-uc-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var item = _items.find(function (i) { return i.slug === b.dataset.ucEdit; });
        if (item) openForm(item);
      });
    });
    section.querySelectorAll('[data-uc-del]').forEach(function (b) {
      b.addEventListener('click', function () { deleteItem(b.dataset.ucDel); });
    });
  }

  function rowHtml(item) {
    return (
      '<div class="admin-content-row">' +
        '<div class="admin-content-row__main">' +
          '<span class="admin-content-row__meta">' +
            '<span class="admin-content-row__type">' + esc(item.type) + '</span>' +
            '<span class="admin-content-row__date">' + esc(item.category) + '</span>' +
            '<span class="admin-content-row__tool">' + esc(item.tool) + '</span>' +
          '</span>' +
          '<p class="admin-content-row__title">' + esc(item.title) + '</p>' +
        '</div>' +
        '<div class="admin-content-row__actions">' +
          '<button class="btn-sm btn-sm--ghost" data-uc-edit="' + esc(item.slug) + '">Edit</button>' +
          '<button class="btn-sm btn-sm--ghost admin-content-row__delete" data-uc-del="' + esc(item.slug) + '">Delete</button>' +
        '</div>' +
      '</div>'
    );
  }

  // ── One-click import of the static USE_CASES array ────

  // Maps a static USE_CASES entry to the content_use_cases document shape.
  // The slug is minted here, once, from the original title — after this it
  // never changes (reaction data continuity).
  function normalise(u, fallbackOrder) {
    var slug = slugOf(u.title);
    var pageIdx = PAGE_ORDER.indexOf(slug);
    var item = {
      slug:        slug,
      // Page-ordered items keep their on-page position; the rest (Legal /
      // HR & People, which have no cards) sort after everything else.
      order:       pageIdx !== -1 ? pageIdx : 1000 + fallbackOrder,
      title:       u.title,
      category:    u.category,
      // 16 library entries have no tool in the data file; their static
      // cards have always shown Claude, so that's what we store.
      tool:        u.tool || 'Claude',
      description: u.description || '',
      type:        u.type,
    };
    if (u.variables && u.variables.length) {
      item.variables = u.variables.map(function (v) { return { id: v.id, label: v.label }; });
    }
    if (u.prompt)      item.prompt      = u.prompt;
    if (u.steps && u.steps.length) item.steps = u.steps.slice();
    if (u.video)       item.video       = u.video;
    if (u.tutorialUrl) item.tutorialUrl = u.tutorialUrl;
    if (u.dpia)        item.dpia        = u.dpia;
    return item;
  }

  async function importExisting() {
    var btn = document.getElementById('ucImportBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }
    var missing = importableItems();
    var docs = missing.map(function (u, i) { return normalise(u, i); });
    try {
      await fsImportUseCases(docs);
      notify('All ' + docs.length + ' use cases imported.');
    } catch (err) {
      console.warn('use case import failed:', err);
      notify('Import failed — please try again. If it persists, contact aiteam@miroma.com.');
    }
    window.renderAdminUseCaseEditor();
  }

  // ── Add / edit form (reuses the roi-edit modal styling) ──

  function variableRowHtml(v) {
    return (
      '<div class="uc-edit-var-row" style="display:flex;gap:8px;align-items:center;">' +
        '<input type="text" class="uc-edit-var-id" placeholder="id (e.g. client_name)" maxlength="40" pattern="[a-z0-9_]+" value="' + esc(v ? v.id : '') + '" style="flex:0 0 32%;padding:7px 10px;border:1px solid var(--c-line,#ddd);border-radius:6px;font:inherit;font-size:13px;">' +
        '<input type="text" class="uc-edit-var-label" placeholder="Label shown to the user" maxlength="120" value="' + esc(v ? v.label : '') + '" style="flex:1;padding:7px 10px;border:1px solid var(--c-line,#ddd);border-radius:6px;font:inherit;font-size:13px;">' +
        '<button type="button" class="btn-sm btn-sm--ghost uc-edit-var-remove" aria-label="Remove variable">✕</button>' +
      '</div>'
    );
  }

  function openForm(item) {
    var isNew = !item;
    item = item || { title: '', category: CATEGORIES[0], tool: TOOLS[0], type: 'prompt', description: '' };

    var formCategories = CATEGORIES.slice();
    if (item.category && formCategories.indexOf(item.category) === -1) formCategories.push(item.category);

    var overlay = document.getElementById('ucEditOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ucEditOverlay';
      overlay.className = 'roi-edit-overlay';
      document.body.appendChild(overlay);
    }

    overlay.innerHTML =
      '<div class="roi-edit-modal" style="max-height:90vh;overflow:auto;">' +
        '<div class="roi-edit-modal__header">' +
          '<p class="roi-edit-modal__title">' + (isNew ? 'Add use case' : 'Edit use case') + '</p>' +
          '<button class="roi-edit-modal__close" id="ucEditClose" aria-label="Close">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<form id="ucEditForm" class="roi-edit-form">' +
          '<div class="roi-edit-field">' +
            '<label>Title</label>' +
            '<input type="text" name="title" maxlength="200" value="' + esc(item.title) + '" required>' +
          '</div>' +
          (!isNew
            ? '<p class="admin-content-form-note">Renaming is safe — likes and usage stats stay attached to this use case.</p>'
            : '') +
          '<div class="roi-edit-field">' +
            '<label>Category</label>' +
            '<select name="category">' +
              formCategories.map(function (c) {
                return '<option value="' + esc(c) + '"' + (item.category === c ? ' selected' : '') + '>' + esc(c) + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<div class="roi-edit-field">' +
            '<label>Tool</label>' +
            '<select name="tool">' +
              TOOLS.map(function (t) {
                return '<option value="' + t + '"' + (item.tool === t ? ' selected' : '') + '>' + t + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<div class="roi-edit-field">' +
            '<label>Type</label>' +
            '<select name="type" id="ucEditType">' +
              TYPES.map(function (t) {
                return '<option value="' + t[0] + '"' + (item.type === t[0] ? ' selected' : '') + '>' + t[1] + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<div class="roi-edit-field">' +
            '<label>Description — shown in the detail drawer; blank line between paragraphs</label>' +
            '<textarea name="description" rows="5" maxlength="5000" required>' + esc(item.description) + '</textarea>' +
          '</div>' +
          '<div class="roi-edit-field">' +
            '<label>Card summary (optional — short text for the card on the grid; if blank, the card keeps its current text or uses the first lines of the description)</label>' +
            '<textarea name="summary" rows="2" maxlength="500">' + esc(item.summary || '') + '</textarea>' +
          '</div>' +
          '<div class="roi-edit-field" id="ucEditVarsField">' +
            '<label>Customise-your-prompt variables — each id must appear in the prompt as {{id}}</label>' +
            '<div id="ucEditVars" style="display:flex;flex-direction:column;gap:8px;">' +
              (item.variables || []).map(variableRowHtml).join('') +
            '</div>' +
            '<button type="button" class="btn-sm btn-sm--outline" id="ucEditVarAdd" style="align-self:flex-start;margin-top:6px;">+ Add variable</button>' +
          '</div>' +
          '<div class="roi-edit-field" id="ucEditPromptField">' +
            '<label>Prompt template</label>' +
            '<textarea name="prompt" rows="14" maxlength="20000" style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.5;">' + esc(item.prompt || '') + '</textarea>' +
          '</div>' +
          '<div class="roi-edit-field" id="ucEditStepsField">' +
            '<label>Workflow steps — one per line</label>' +
            '<textarea name="steps" rows="8" maxlength="6000">' + esc((item.steps || []).join('\n')) + '</textarea>' +
          '</div>' +
          '<div class="roi-edit-field">' +
            '<label>Video URL (optional — must be a YouTube, Loom or Descript share link; it renders in an embedded player)</label>' +
            '<input type="url" name="video" maxlength="500" placeholder="https://www.youtube.com/embed/…" value="' + esc(item.video || '') + '">' +
          '</div>' +
          '<div class="roi-edit-field">' +
            '<label>Tutorial URL (optional — "LTX Tutorial →" button on workflow use cases)</label>' +
            '<input type="url" name="tutorialUrl" maxlength="500" placeholder="https://…" value="' + esc(item.tutorialUrl || '') + '">' +
          '</div>' +
          '<div class="roi-edit-field">' +
            '<label>Data-handling badge (optional)</label>' +
            '<select name="dpia">' +
              DPIA_OPTIONS.map(function (o) {
                return '<option value="' + o[0] + '"' + ((item.dpia || '') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<p class="roi-edit-error" id="ucEditError" style="display:none;color:var(--c-coral,#e55);font-size:13px;margin:0;"></p>' +
          '<div class="roi-edit-modal__footer">' +
            '<button type="button" class="btn-sm btn-sm--ghost" id="ucEditCancel">Cancel</button>' +
            '<button type="submit" class="btn-sm btn-sm--primary" id="ucEditSubmit">' + (isNew ? 'Publish use case' : 'Save changes') + '</button>' +
          '</div>' +
        '</form>' +
      '</div>';

    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    function close() {
      overlay.style.display = 'none';
      document.body.style.overflow = '';
    }
    overlay.querySelector('#ucEditClose').addEventListener('click', close);
    overlay.querySelector('#ucEditCancel').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    // Show/hide the prompt vs steps fields by type.
    var typeSel     = overlay.querySelector('#ucEditType');
    var promptField = overlay.querySelector('#ucEditPromptField');
    var stepsField  = overlay.querySelector('#ucEditStepsField');
    var varsField   = overlay.querySelector('#ucEditVarsField');
    function applyTypeVisibility() {
      var isPrompt = typeSel.value === 'prompt';
      promptField.style.display = isPrompt ? '' : 'none';
      varsField.style.display   = isPrompt ? '' : 'none';
      stepsField.style.display  = isPrompt ? 'none' : '';
    }
    typeSel.addEventListener('change', applyTypeVisibility);
    applyTypeVisibility();

    // Variable row add/remove (delegated so rows added later work too).
    var varsWrap = overlay.querySelector('#ucEditVars');
    overlay.querySelector('#ucEditVarAdd').addEventListener('click', function () {
      varsWrap.insertAdjacentHTML('beforeend', variableRowHtml(null));
    });
    varsWrap.addEventListener('click', function (e) {
      var btn = e.target.closest('.uc-edit-var-remove');
      if (btn) btn.closest('.uc-edit-var-row').remove();
    });

    overlay.querySelector('#ucEditForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var form  = e.target;
      var btn   = form.querySelector('#ucEditSubmit');
      var errEl = form.querySelector('#ucEditError');
      var data  = Object.fromEntries(new FormData(form).entries());

      function fail(msg) {
        errEl.textContent = msg;
        errEl.style.display = '';
        btn.disabled = false;
        btn.textContent = isNew ? 'Publish use case' : 'Save changes';
      }

      btn.disabled = true; btn.textContent = 'Saving…';
      errEl.style.display = 'none';

      var title = data.title.trim();
      if (!title) return fail('A title is required.');

      // Validate the video URL against the embed allowlist (it renders in
      // an iframe, so only CSP frame-src hosts can play).
      var video = data.video.trim();
      if (video && !VIDEO_HOSTS.test(video)) {
        return fail('The video URL must start with https:// and be hosted on youtube.com, youtube-nocookie.com, loom.com or share.descript.com.');
      }
      var tutorialUrl = data.tutorialUrl.trim();
      if (tutorialUrl && !/^https:\/\//i.test(tutorialUrl)) {
        return fail('The tutorial URL must start with https://.');
      }

      // Collect variables; ids must be lowercase letters/digits/underscores
      // so they slot into {{id}} placeholders cleanly.
      var variables = [];
      var varRows = overlay.querySelectorAll('.uc-edit-var-row');
      for (var r = 0; r < varRows.length; r++) {
        var id    = varRows[r].querySelector('.uc-edit-var-id').value.trim();
        var label = varRows[r].querySelector('.uc-edit-var-label').value.trim();
        if (!id && !label) continue; // wholly empty row — ignore
        if (!/^[a-z0-9_]+$/.test(id)) {
          return fail('Variable ids can only contain lowercase letters, numbers and underscores (e.g. client_name).');
        }
        if (!label) return fail('Every variable needs a label — that\'s the field name people see.');
        variables.push({ id: id, label: label });
      }
      if (variables.length > 24) return fail('A use case can have at most 24 variables.');

      var steps = data.steps.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      if (steps.length > 20) return fail('A workflow can have at most 20 steps.');

      if (data.type === 'prompt' && !data.prompt.trim()) {
        return fail('Prompt-type use cases need a prompt template.');
      }
      if (data.type === 'workflow' && !steps.length) {
        return fail('Workflow-type use cases need at least one step.');
      }

      // Existing docs keep their slug and order forever; new docs mint a
      // slug from the title and go to the end of the grid.
      var slug, order;
      if (isNew) {
        slug = slugOf(title);
        if (!slug) return fail('The title needs at least one letter or number.');
        order = _items.reduce(function (m, i) { return Math.max(m, i.order || 0); }, 0) + 1;
        try {
          if (await fsUseCaseExists(slug)) {
            return fail('A use case with this title already exists. Edit the existing one, or choose a different title.');
          }
        } catch (err) {
          console.warn('fsUseCaseExists:', err);
          return fail('Could not check for duplicates — please try again.');
        }
      } else {
        slug  = item.slug;
        order = (typeof item.order === 'number') ? item.order : 0;
      }

      var doc = {
        slug:        slug,
        order:       order,
        title:       title,
        category:    data.category,
        tool:        data.tool,
        description: data.description.trim(),
        type:        data.type,
      };
      var summary = data.summary.trim();
      if (summary) doc.summary = summary;
      if (data.type === 'prompt') {
        doc.prompt = data.prompt;
        if (variables.length) doc.variables = variables;
      } else {
        doc.steps = steps;
      }
      if (video)       doc.video = video;
      if (tutorialUrl) doc.tutorialUrl = tutorialUrl;
      if (data.dpia)   doc.dpia = data.dpia;

      try {
        await fsSaveUseCase(doc);
        close();
        notify(isNew ? 'Use case published.' : 'Changes saved.');
        window.renderAdminUseCaseEditor();
      } catch (err) {
        console.warn('fsSaveUseCase:', err);
        fail('Could not save — please try again. If it persists, contact aiteam@miroma.com.');
      }
    });
  }

  // ── Delete ────────────────────────────────────────────

  async function deleteItem(slug) {
    var item = _items.find(function (i) { return i.slug === slug; });
    if (!item) return;
    if (!window.confirm('Delete "' + item.title + '"? This removes it from the live Use Cases page immediately and cannot be undone.')) return;
    try {
      await fsDeleteUseCase(slug);
      notify('Use case deleted.');
    } catch (err) {
      console.warn('fsDeleteUseCase:', err);
      notify("Couldn't delete the use case — please try again.");
    }
    window.renderAdminUseCaseEditor();
  }

})();
