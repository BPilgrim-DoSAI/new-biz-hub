/* =============================================
   MIROMA AI HUB — What's New page
   Renders the curated NEWS array from news-data.js,
   sorted newest first, with tool filtering.
   ============================================= */

(function initWhatsNew() {
  'use strict';

  const PER_PAGE = 15;

  const TOOL_COLORS = {
    'Claude':       '#DA7756',
    'LTX Studio':   '#111111',
    'Descript':     '#E8503A',
    'Springboards': '#EEE135',
    'Fireflies':    '#7B5CF6',
  };

  const TOOL_BLOG_LINKS = [
    { tool: 'Claude',       label: 'Claude release notes',          url: 'https://support.claude.com/en/articles/12138966-release-notes' },
    { tool: 'LTX Studio',  label: 'LTX Studio product updates',    url: 'https://ltx.studio/blog-category/product-updates' },
    { tool: 'Descript',    label: 'Descript product updates',       url: 'https://www.descript.com/blog/category/product-updates' },
    { tool: 'Springboards',label: 'Springboards blog',              url: 'https://springboards.ai/blog' },
    { tool: 'Fireflies',   label: 'Fireflies what\'s new',          url: 'https://fireflies.ai/blog/tag/whats-new' },
  ];

  // ── State ─────────────────────────────────────────────

  let allItems     = [];
  let activeFilter = 'all';
  let showing      = PER_PAGE;

  // ── DOM refs ──────────────────────────────────────────

  const container    = document.getElementById('whatsNewFeed');
  const filterBtns   = document.querySelectorAll('.wn-filter-btn');
  const loadMoreWrap = document.getElementById('wnLoadMoreWrap');
  const loadMoreBtn  = document.getElementById('wnLoadMore');
  const blogLinks    = document.getElementById('wnBlogLinks');

  if (!container) return;

  // ── Official blog links ───────────────────────────────

  if (blogLinks) {
    blogLinks.innerHTML = TOOL_BLOG_LINKS.map(function(item) {
      var color = TOOL_COLORS[item.tool] || '#6B7280';
      return '<a href="' + item.url + '" target="_blank" rel="noopener noreferrer" class="wn-blog-link">' +
        '<span class="wn-blog-link__dot" style="background:' + color + '"></span>' +
        '<span>' + item.label + '</span>' +
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>' +
      '</a>';
    }).join('');
  }

  // ── Filters ───────────────────────────────────────────

  filterBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      filterBtns.forEach(function(b) {
        b.classList.remove('is-active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-selected', 'true');
      activeFilter = btn.dataset.filter;
      showing = PER_PAGE;
      render();
    });
  });

  loadMoreBtn && loadMoreBtn.addEventListener('click', function() {
    showing += PER_PAGE;
    render();
  });

  // Read-more toggle (event delegation — cards are re-rendered on filter)
  container.addEventListener('click', function(e) {
    var btn = e.target.closest('.wn-card__more');
    if (!btn) return;
    var excerpt = btn.previousElementSibling;
    if (!excerpt || !excerpt.classList.contains('wn-card__excerpt')) return;
    var expanded = !excerpt.classList.toggle('is-clamped');
    btn.textContent = expanded ? 'Show less' : 'Read more';
    btn.setAttribute('aria-expanded', String(expanded));
  });

  // ── Load ──────────────────────────────────────────────

  function sortByDate(items) {
    return items.slice().sort(function(a, b) {
      return new Date(b.date) - new Date(a.date);
    });
  }

  function load() {
    // Paint immediately from the static file (zero-latency, works offline),
    // then upgrade to the admin-managed Firestore feed once auth is ready.
    // If Firestore is empty or unreachable, the static feed simply remains.
    if (typeof NEWS !== 'undefined' && NEWS.length) {
      allItems = sortByDate(NEWS);
      render();
    } else {
      container.innerHTML = '<p class="wn-empty">No updates yet — check back soon.</p>';
    }

    document.addEventListener('mirAuthReady', upgradeToFirestore);
    try {
      if (firebase.auth().currentUser) upgradeToFirestore();
    } catch (_) {}
  }

  async function upgradeToFirestore() {
    if (typeof fsGetNews !== 'function') return;
    try {
      var items = await fsGetNews();
      if (items && items.length) {
        allItems = sortByDate(items);
        render();
      }
    } catch (err) {
      console.warn("what's new: Firestore unavailable, static feed shown", err);
    }
  }

  // ── Render ────────────────────────────────────────────

  function render() {
    var filtered = activeFilter === 'all'
      ? allItems
      : allItems.filter(function(i) { return i.tool === activeFilter; });

    var visible = filtered.slice(0, showing);

    if (!visible.length) {
      container.innerHTML = '<p class="wn-empty">No updates for this tool yet.</p>';
      if (loadMoreWrap) loadMoreWrap.hidden = true;
      return;
    }

    container.innerHTML = visible.map(buildCard).join('');
    if (loadMoreWrap) loadMoreWrap.hidden = filtered.length <= showing;
  }

  // Bodies longer than this are clamped to four lines with a Read-more toggle.
  var CLAMP_AT = 220;

  function buildCard(item) {
    var color    = TOOL_COLORS[item.tool] || '#6B7280';
    var date     = formatDate(new Date(item.date));
    var badgeLabel = item.type === 'tip' ? 'Tip' : item.type === 'video' ? 'Watch' : 'Update';
    var isLong   = !!(item.body && item.body.length > CLAMP_AT);

    var videoHtml = '';
    if (item.type === 'video' && item.video) {
      var embedUrl = safeEmbed(item.video.embed);
      if (embedUrl) {
        videoHtml = '<div class="wn-card__video"><iframe src="' + escHtml(embedUrl) + '" allowfullscreen loading="lazy"></iframe></div>';
      } else if (item.video.thumb && item.video.url) {
        videoHtml = '<a href="' + escHtml(safeUrl(item.video.url)) + '" target="_blank" rel="noopener noreferrer" class="wn-card__thumb">' +
          '<img src="' + escHtml(safeUrl(item.video.thumb)) + '" alt="" loading="lazy">' +
          '<div class="wn-card__play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>' +
        '</a>';
      }
    }

    var linkHtml = '';
    var allLinks = [];
    if (item.links && item.links.length) {
      allLinks = item.links;
    } else if (item.link) {
      allLinks = [item.link];
    } else if (item.type === 'video' && item.video && item.video.url) {
      allLinks = [{ label: 'Watch →', url: item.video.url }];
    }
    if (allLinks.length) {
      linkHtml = allLinks.map(function(l) {
        return '<a href="' + escHtml(safeUrl(l.url)) + '" target="_blank" rel="noopener noreferrer" class="wn-card__read">' + escHtml(l.label || 'Read more →') + '</a>';
      }).join('');
    }

    return '<article class="wn-card">' +
      '<div class="wn-card__stripe" style="background:' + color + '"></div>' +
      '<div class="wn-card__inner">' +
        '<div class="wn-card__top">' +
          (item.tool ? '<span class="wn-badge" style="color:' + color + ';background:' + color + '1a;">' + escHtml(item.tool) + '</span>' : '') +
          '<span class="wn-tag">' + badgeLabel + '</span>' +
          '<span class="wn-card__date">' + date + '</span>' +
        '</div>' +
        '<p class="wn-card__title">' + escHtml(item.title) + '</p>' +
        (item.body ? '<p class="wn-card__excerpt' + (isLong ? ' is-clamped' : '') + '">' + escHtml(item.body) + '</p>' : '') +
        (isLong ? '<button type="button" class="wn-card__more" aria-expanded="false">Read more</button>' : '') +
        videoHtml +
        (linkHtml ? '<div class="wn-card__footer">' + linkHtml + '</div>' : '') +
      '</div>' +
    '</article>';
  }

  // ── Helpers ───────────────────────────────────────────

  function formatDate(date) {
    if (!date || isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // News links are runtime-authored (admin editor), so URLs must be both
  // scheme-validated (no javascript: etc.) and escaped before landing in
  // an href attribute. Same standard as A-H-1 in KNOWN_ISSUES.
  function safeUrl(url) {
    url = String(url || '').trim();
    return /^(https?:|mailto:)/i.test(url) ? url : '#';
  }

  // Embeds render in an iframe, so they get a stricter allowlist: only
  // the video hosts already permitted by the site's CSP frame-src.
  function safeEmbed(url) {
    url = String(url || '').trim();
    return /^https:\/\/(www\.youtube\.com|www\.youtube-nocookie\.com|www\.loom\.com|share\.descript\.com)\//i.test(url) ? url : '';
  }

  load();

})();
