/* =============================================
   MIROMA AI HUB — Use-case library Firestore upgrade
   =============================================
   Mirrors the home-news.js / whats-new.js pattern: the static grid in
   use-cases.html paints immediately (zero latency, works offline), then
   once auth is ready we fetch the admin-managed content_use_cases
   collection and rebuild the prompt/workflow cards from it. On ANY
   Firestore failure or an empty collection we do nothing — the static
   grid simply remains, so the page can never be blank.

   What stays untouched on upgrade:
     - the five "Our Build" cards (data-type="custom-build") and the
       submit card at the end of the grid — they are not part of the
       editable library;
     - the filter buttons, search box and drawer chrome (static HTML).

   A-L-4 note: everything in content_use_cases is runtime-authored, so
   all card content below is built with createElement/textContent — no
   stored string ever lands in innerHTML. The drawer renderer in main.js
   escapes on its side.

   Slug continuity: each Firestore doc carries an immutable `slug`
   (minted from the original title at import time, same derivation as
   titleToSlug in requests.js). Reactions in /uc_reactions are keyed by
   these slugs, so they survive retitling. main.js prefers uc.slug over
   re-deriving from the title.
   ============================================= */

(function initUseCasesContent() {
  'use strict';

  var grid = document.getElementById('ucGrid');
  if (!grid || typeof USE_CASES === 'undefined') return;

  // The eight categories with filter buttons on this page. Docs in other
  // categories (e.g. Legal, HR & People — imported but never rendered
  // here pre-migration either) are kept out of the grid for parity.
  var PAGE_CATEGORIES = [
    'New Business & Strategy', 'Social Media', 'Account Management',
    'Media Planning & Buying', 'Finance', 'Creative & Production',
    'PR & Communications', 'Technology & Development',
  ];

  var TOOL_TAG_CLASSES = {
    'Claude':       'tag--claude',
    'LTX Studio':   'tag--ltx',
    'Descript':     'tag--descript',
    'Springboards': 'tag--springboards',
    'Fireflies':    'tag--fireflies',
  };

  function categoryKey(category) {
    return (typeof titleToSlug === 'function')
      ? titleToSlug(category)
      : String(category || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  // Minimal shape check — the rules enforce this server-side; this guard
  // just means one malformed doc can't take the whole grid down.
  function isRenderable(item) {
    return item
      && typeof item.slug === 'string' && item.slug
      && typeof item.title === 'string' && item.title
      && typeof item.description === 'string'
      && (item.type === 'prompt' || item.type === 'workflow')
      && PAGE_CATEGORIES.indexOf(item.category) !== -1;
  }

  // The four-letter thumb codes (BRIEF, SOCIAL, …) and short card
  // summaries are hand-authored in the static HTML and not part of the
  // data file, so harvest them from the static cards (keyed by the slug
  // of the static title — which equals the stored slug for every
  // imported item) before we replace the grid. New or retitled-at-import
  // items fall back to a derived code / truncated description.
  function harvestStatic() {
    var map = {};
    grid.querySelectorAll('.uc-card').forEach(function (card) {
      if (card.id === 'ucSubmitCard' || card.dataset.type === 'custom-build') return;
      var title = card.querySelector('.uc-card__title');
      if (!title) return;
      var slug = (typeof titleToSlug === 'function') ? titleToSlug(title.textContent.trim()) : '';
      if (!slug) return;
      map[slug] = {
        code:    (card.querySelector('.uc-card__thumb-bg') || {}).textContent || '',
        summary: (card.querySelector('.uc-card__desc') || {}).textContent || '',
      };
    });
    return map;
  }

  function fallbackCode(title) {
    var words = String(title || '').replace(/[^A-Za-z0-9 ]/g, '').trim().split(/\s+/);
    // Prefer the first word with some substance ("A brand new…" → BRAND).
    var word = words.filter(function (w) { return w.length >= 3; })[0] || words[0] || '';
    return (word.slice(0, 5).toUpperCase()) || 'AI';
  }

  function fallbackSummary(description) {
    var first = String(description || '').split('\n\n')[0];
    return first.length > 220 ? first.slice(0, 217) + '…' : first;
  }

  // Builds one card with the exact markup of the static grid. All stored
  // values land via textContent.
  function buildCard(item, statics) {
    var key  = categoryKey(item.category);
    var meta = statics[item.slug] || {};

    var card = document.createElement('article');
    card.className = 'uc-card';
    card.dataset.category = key;
    card.dataset.type = item.type;
    // Cards arrive after the initial scroll-reveal pass, so mark them
    // revealed immediately — re-animating an already-visible grid would
    // read as a flicker. Newly filtered-in cards behave as before.
    card.setAttribute('data-motion', 'up');
    card.classList.add('is-visible');

    var thumb = document.createElement('div');
    thumb.className = 'uc-card__thumb uc-card__thumb--' + key;
    var thumbBg = document.createElement('div');
    thumbBg.className = 'uc-card__thumb-bg';
    thumbBg.textContent = meta.code || fallbackCode(item.title);
    var thumbLabel = document.createElement('p');
    thumbLabel.className = 'uc-card__thumb-label';
    thumbLabel.textContent = item.category;
    thumb.appendChild(thumbBg);
    thumb.appendChild(thumbLabel);

    var body = document.createElement('div');
    body.className = 'uc-card__body';
    var title = document.createElement('h2');
    title.className = 'uc-card__title';
    title.textContent = item.title;
    var desc = document.createElement('p');
    desc.className = 'uc-card__desc';
    desc.textContent = item.summary || meta.summary || fallbackSummary(item.description);
    body.appendChild(title);
    body.appendChild(desc);

    var footer = document.createElement('div');
    footer.className = 'uc-card__footer';
    var catTag = document.createElement('span');
    catTag.className = 'tag';
    catTag.textContent = item.category;
    var toolTag = document.createElement('span');
    toolTag.className = 'tag ' + (TOOL_TAG_CLASSES[item.tool] || 'tag--claude');
    toolTag.textContent = item.tool || 'Claude';
    footer.appendChild(catTag);
    footer.appendChild(toolTag);

    card.appendChild(thumb);
    card.appendChild(body);
    card.appendChild(footer);
    return card;
  }

  function rebuild(items) {
    var statics = harvestStatic();

    // Keep custom-build entries in USE_CASES (their cards stay in the
    // grid and the drawer still needs their data), swap everything else
    // for the Firestore content. Mutated in place because use-cases-data.js
    // declares USE_CASES with const — the array reference is shared by
    // main.js (drawer, filters, engagement), so in-place mutation updates
    // every consumer at once.
    var customBuilds = USE_CASES.filter(function (u) { return u.type === 'custom-build'; });
    USE_CASES.length = 0;
    Array.prototype.push.apply(USE_CASES, items);
    Array.prototype.push.apply(USE_CASES, customBuilds);

    // Remove the old prompt/workflow cards; keep custom-build + submit.
    grid.querySelectorAll('.uc-card').forEach(function (card) {
      if (card.id === 'ucSubmitCard' || card.dataset.type === 'custom-build') return;
      card.remove();
    });

    // Insert the new cards ahead of the first remaining card (the first
    // custom-build card, or the submit card), preserving the grid layout.
    var anchor = grid.querySelector('.uc-card');
    var frag = document.createDocumentFragment();
    items.forEach(function (item) { frag.appendChild(buildCard(item, statics)); });
    grid.insertBefore(frag, anchor);

    // Re-apply behaviours from main.js: DPIA badges + View affordance,
    // filter/search/counter state, and engagement bars (if already loaded).
    if (typeof window._ucDecorateCards === 'function') window._ucDecorateCards();
    if (typeof window._ucFiltersRefresh === 'function') window._ucFiltersRefresh();
    if (typeof window._ucRenderEngagement === 'function') window._ucRenderEngagement();
  }

  var _upgraded = false;
  async function upgradeToFirestore() {
    if (_upgraded) return;
    if (typeof fsGetUseCases !== 'function') return;
    try {
      var all = await fsGetUseCases();
      var items = (all || []).filter(isRenderable);
      if (!items.length) return; // empty collection — static grid remains
      _upgraded = true;
      rebuild(items);
    } catch (err) {
      // Firestore unreachable (e.g. local dev without the emulator, flaky
      // network) — the static grid simply remains.
      console.warn('use cases: Firestore unavailable, static grid shown', err);
    }
  }

  document.addEventListener('mirAuthReady', upgradeToFirestore);
  try {
    if (firebase.auth().currentUser) upgradeToFirestore();
  } catch (_) {}

})();
