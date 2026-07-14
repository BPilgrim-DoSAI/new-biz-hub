/* =============================================
   MIROMA AI HUB — Homepage What's New preview
   Renders the 3 most recent NEWS items to #homeNewsFeed.
   ============================================= */

(function initHomeNews() {
  'use strict';

  var container = document.getElementById('homeNewsFeed');
  if (!container) return;

  var TOOL_COLORS = {
    'Claude':       '#DA7756',
    'LTX Studio':   '#111111',
    'Descript':     '#E8503A',
    'Springboards': '#EEE135',
    'Fireflies':    '#7B5CF6',
  };

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

  function formatDate(date) {
    if (!date || isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // Bodies longer than this are clamped to four lines with a Read-more toggle.
  var CLAMP_AT = 220;

  function buildCard(item) {
    var color      = TOOL_COLORS[item.tool] || '#6B7280';
    var date       = formatDate(new Date(item.date));
    var badgeLabel = item.type === 'tip' ? 'Tip' : item.type === 'video' ? 'Watch' : 'Update';
    var isLong     = !!(item.body && item.body.length > CLAMP_AT);

    var linkHtml = '';
    var allLinks = [];
    if (item.links && item.links.length) {
      allLinks = item.links;
    } else if (item.link) {
      allLinks = [item.link];
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
        (linkHtml ? '<div class="wn-card__footer">' + linkHtml + '</div>' : '') +
      '</div>' +
    '</article>';
  }

  function latestOf(items) {
    return items.slice().sort(function(a, b) {
      return new Date(b.date) - new Date(a.date);
    }).slice(0, 3);
  }

  function render(items) {
    container.innerHTML = latestOf(items).map(buildCard).join('');
  }

  // Paint immediately from the static file (zero-latency, works offline),
  // then upgrade to the admin-managed Firestore feed once auth is ready.
  // If Firestore is empty or unreachable, the static feed simply remains.
  if (typeof NEWS !== 'undefined' && NEWS.length) render(NEWS);

  async function upgradeToFirestore() {
    if (typeof fsGetNews !== 'function') return;
    try {
      var items = await fsGetNews();
      if (items && items.length) render(items);
    } catch (err) {
      console.warn('home news: Firestore unavailable, static feed shown', err);
    }
  }
  document.addEventListener('mirAuthReady', upgradeToFirestore);
  try {
    if (firebase.auth().currentUser) upgradeToFirestore();
  } catch (_) {}

  // Read-more toggle
  container.addEventListener('click', function(e) {
    var btn = e.target.closest('.wn-card__more');
    if (!btn) return;
    var excerpt = btn.previousElementSibling;
    if (!excerpt || !excerpt.classList.contains('wn-card__excerpt')) return;
    var expanded = !excerpt.classList.toggle('is-clamped');
    btn.textContent = expanded ? 'Show less' : 'Read more';
    btn.setAttribute('aria-expanded', String(expanded));
  });

})();
