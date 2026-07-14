/* =============================================
   MIROMA AI HUB — Admin Site Content editor
   =============================================
   Edits the content_news Firestore collection from the admin panel,
   so news items publish without a code deploy. Rendered into
   #adminSectionContent by admin-panel.js switchSection().

   A-L-4 note: everything in content_news is runtime-authored, so every
   interpolation below goes through esc(). The public renderers
   (home-news.js, whats-new.js) do the same on their side.
   ============================================= */

(function initAdminContent() {
  'use strict';

  var TOOLS = ['Claude', 'LTX Studio', 'Descript', 'Springboards', 'Fireflies'];
  var TYPES = [['update', 'Update'], ['tip', 'Quick tip'], ['video', 'Video']];

  var _items = [];

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function notify(msg) {
    if (typeof window.hubToast === 'function') window.hubToast(msg);
  }

  // The Site Content section is split into sub-tabs (news / use cases) by
  // admin-panel.js; this editor renders into its own mount div. Falls back
  // to the whole section for safety if the scaffold isn't present.
  function mount() {
    return document.getElementById('adminContentNews')
      || document.getElementById('adminSectionContent');
  }

  // Entry point — called by admin-panel.js when the section is opened.
  window.renderAdminNewsEditor = async function renderAdminNewsEditor() {
    var section = mount();
    if (!section) return;
    section.innerHTML = '<p class="admin-view__loading">Loading news items…</p>';
    try {
      _items = await fsGetNews();
    } catch (err) {
      section.innerHTML = '<p class="admin-view__loading">Could not load news items — please refresh and try again.</p>';
      console.warn('renderAdminNewsEditor:', err);
      return;
    }
    renderList();
  };

  // ── List view ─────────────────────────────────────────

  function renderList() {
    var section = mount();
    if (!section) return;

    var canImport = !_items.length && typeof NEWS !== 'undefined' && NEWS.length;
    var importHtml = canImport
      ? '<div class="admin-content-import">' +
          '<p>Nothing in the database yet. Import the ' + NEWS.length + ' items currently hard-coded into the site to get started — the public feed keeps working either way.</p>' +
          '<button class="btn-sm btn-sm--outline" id="newsImportBtn">Import existing items</button>' +
        '</div>'
      : '';

    section.innerHTML =
      '<p class="admin-view__title">Site Content — News Feed</p>' +
      '<p class="admin-view__sub">Items published here appear on the homepage Latest Updates and the What\'s New page immediately — no deployment needed. Sorted newest first.</p>' +
      '<div class="admin-content-toolbar">' +
        '<button class="btn-sm btn-sm--primary" id="newsAddBtn">+ Add news item</button>' +
      '</div>' +
      importHtml +
      '<div class="admin-content-list">' +
        (_items.map(rowHtml).join('') || (canImport ? '' : '<p class="admin-view__loading">No items yet — add your first above.</p>')) +
      '</div>';

    section.querySelector('#newsAddBtn').addEventListener('click', function () { openForm(null); });
    var importBtn = section.querySelector('#newsImportBtn');
    if (importBtn) importBtn.addEventListener('click', importExisting);
    section.querySelectorAll('[data-news-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var item = _items.find(function (i) { return i.id === b.dataset.newsEdit; });
        if (item) openForm(item);
      });
    });
    section.querySelectorAll('[data-news-del]').forEach(function (b) {
      b.addEventListener('click', function () { deleteItem(b.dataset.newsDel); });
    });
  }

  function rowHtml(item) {
    return (
      '<div class="admin-content-row">' +
        '<div class="admin-content-row__main">' +
          '<span class="admin-content-row__meta">' +
            '<span class="admin-content-row__date">' + esc(item.date) + '</span>' +
            '<span class="admin-content-row__type">' + esc(item.type) + '</span>' +
            (item.tool ? '<span class="admin-content-row__tool">' + esc(item.tool) + '</span>' : '') +
          '</span>' +
          '<p class="admin-content-row__title">' + esc(item.title) + '</p>' +
        '</div>' +
        '<div class="admin-content-row__actions">' +
          '<button class="btn-sm btn-sm--ghost" data-news-edit="' + esc(item.id) + '">Edit</button>' +
          '<button class="btn-sm btn-sm--ghost admin-content-row__delete" data-news-del="' + esc(item.id) + '">Delete</button>' +
        '</div>' +
      '</div>'
    );
  }

  // ── One-click import of the static NEWS array ─────────

  async function importExisting() {
    var btn = document.getElementById('newsImportBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }
    var failures = 0;
    for (var i = 0; i < NEWS.length; i++) {
      try {
        await fsSaveNewsItem(normalise(NEWS[i]));
      } catch (err) {
        failures++;
        console.warn('news import failed for item', i, err);
      }
    }
    notify(failures
      ? 'Imported with ' + failures + ' failure(s) — check the list and retry missing items.'
      : 'All ' + NEWS.length + ' items imported.');
    window.renderAdminNewsEditor();
  }

  // Maps a static NEWS entry to the content_news document shape.
  function normalise(n) {
    var item = { date: n.date, type: n.type, title: n.title, body: n.body || '' };
    if (n.tool) item.tool = n.tool;
    var links = n.links || (n.link ? [n.link] : null);
    if (links) item.links = links;
    if (n.video) item.video = n.video;
    return item;
  }

  // ── Add / edit form (reuses the roi-edit modal styling) ──

  function openForm(item) {
    var isNew = !item;
    item = item || { date: new Date().toISOString().slice(0, 10), type: 'update', title: '', body: '' };
    var firstLink = (item.links && item.links[0]) || null;

    var overlay = document.getElementById('newsEditOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'newsEditOverlay';
      overlay.className = 'roi-edit-overlay';
      document.body.appendChild(overlay);
    }

    overlay.innerHTML =
      '<div class="roi-edit-modal">' +
        '<div class="roi-edit-modal__header">' +
          '<p class="roi-edit-modal__title">' + (isNew ? 'Add news item' : 'Edit news item') + '</p>' +
          '<button class="roi-edit-modal__close" id="newsEditClose" aria-label="Close">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<form id="newsEditForm" class="roi-edit-form">' +
          '<div class="roi-edit-field">' +
            '<label>Date</label>' +
            '<input type="date" name="date" value="' + esc(item.date) + '" required>' +
          '</div>' +
          '<div class="roi-edit-field">' +
            '<label>Type</label>' +
            '<select name="type">' +
              TYPES.map(function (t) {
                return '<option value="' + t[0] + '"' + (item.type === t[0] ? ' selected' : '') + '>' + t[1] + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<div class="roi-edit-field">' +
            '<label>Tool (optional — leave blank if not tool-specific)</label>' +
            '<select name="tool">' +
              '<option value="">None / general</option>' +
              TOOLS.map(function (t) {
                return '<option value="' + t + '"' + (item.tool === t ? ' selected' : '') + '>' + t + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<div class="roi-edit-field">' +
            '<label>Headline</label>' +
            '<input type="text" name="title" maxlength="200" value="' + esc(item.title) + '" required>' +
          '</div>' +
          '<div class="roi-edit-field">' +
            '<label>Body — 1–3 sentences reads best; long bodies clamp with a Read more</label>' +
            '<textarea name="body" rows="6" maxlength="5000">' + esc(item.body) + '</textarea>' +
          '</div>' +
          '<div class="roi-edit-field">' +
            '<label>Link label (optional, e.g. "Read the announcement →")</label>' +
            '<input type="text" name="linkLabel" maxlength="120" value="' + esc(firstLink ? firstLink.label : '') + '">' +
          '</div>' +
          '<div class="roi-edit-field">' +
            '<label>Link URL (optional)</label>' +
            '<input type="url" name="linkUrl" maxlength="1000" placeholder="https://…" value="' + esc(firstLink ? firstLink.url : '') + '">' +
          '</div>' +
          ((item.links && item.links.length > 1)
            ? '<p class="admin-content-form-note">This item has ' + item.links.length + ' links. Saving keeps them all unless you change the link fields above, which replaces them with the single link shown.</p>'
            : '') +
          (item.video
            ? '<p class="admin-content-form-note">This item has an attached video, which is kept as-is when you save.</p>'
            : '') +
          '<p class="roi-edit-error" id="newsEditError" style="display:none;color:var(--c-coral,#e55);font-size:13px;margin:0;"></p>' +
          '<div class="roi-edit-modal__footer">' +
            '<button type="button" class="btn-sm btn-sm--ghost" id="newsEditCancel">Cancel</button>' +
            '<button type="submit" class="btn-sm btn-sm--primary" id="newsEditSubmit">' + (isNew ? 'Publish item' : 'Save changes') + '</button>' +
          '</div>' +
        '</form>' +
      '</div>';

    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    function close() {
      overlay.style.display = 'none';
      document.body.style.overflow = '';
    }
    overlay.querySelector('#newsEditClose').addEventListener('click', close);
    overlay.querySelector('#newsEditCancel').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    overlay.querySelector('#newsEditForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var form   = e.target;
      var btn    = form.querySelector('#newsEditSubmit');
      var errEl  = form.querySelector('#newsEditError');
      var data   = Object.fromEntries(new FormData(form).entries());

      var doc = {
        date:  data.date,
        type:  data.type,
        title: data.title.trim(),
        body:  data.body.trim(),
      };
      if (data.tool) doc.tool = data.tool;

      // Link handling: unchanged fields preserve the original links array
      // (multi-link items survive an unrelated edit); changed fields
      // replace it with the single pair; cleared fields drop it.
      var label = data.linkLabel.trim();
      var url   = data.linkUrl.trim();
      var origLabel = firstLink ? firstLink.label : '';
      var origUrl   = firstLink ? firstLink.url : '';
      if (label === origLabel && url === origUrl) {
        if (item.links) doc.links = item.links;
      } else if (label && url) {
        doc.links = [{ label: label, url: url }];
      }
      if (item.video) doc.video = item.video;

      btn.disabled = true; btn.textContent = 'Saving…';
      errEl.style.display = 'none';
      try {
        await fsSaveNewsItem(doc, isNew ? null : item.id);
        close();
        notify(isNew ? 'News item published.' : 'Changes saved.');
        window.renderAdminNewsEditor();
      } catch (err) {
        console.warn('fsSaveNewsItem:', err);
        errEl.textContent = 'Could not save — please try again. If it persists, contact aiteam@miroma.com.';
        errEl.style.display = '';
        btn.disabled = false; btn.textContent = isNew ? 'Publish item' : 'Save changes';
      }
    });
  }

  // ── Delete ────────────────────────────────────────────

  async function deleteItem(id) {
    var item = _items.find(function (i) { return i.id === id; });
    if (!item) return;
    if (!window.confirm('Delete "' + item.title + '"? This removes it from the live feed immediately and cannot be undone.')) return;
    try {
      await fsDeleteNewsItem(id);
      notify('Item deleted.');
    } catch (err) {
      console.warn('fsDeleteNewsItem:', err);
      notify("Couldn't delete the item — please try again.");
    }
    window.renderAdminNewsEditor();
  }

})();
