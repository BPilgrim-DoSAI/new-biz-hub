/* =============================================
   MIROMA AI HUB — our-builds.html filter logic
   ─────────────────────────────────────────────
   Filter-by-category buttons for the builds grid. Was inline in
   the HTML <script> at the bottom of the page; moved out so CSP
   can drop 'unsafe-inline' on script-src (KNOWN_ISSUES.md S-6
   Part B).
   ============================================= */

(function() {
  var filterBtns = document.querySelectorAll('.filter-btn');
  var cards = document.querySelectorAll('#buildsGrid .ob-card');

  filterBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      filterBtns.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var filter = btn.dataset.filter;
      cards.forEach(function(card) {
        if (filter === 'all' || card.dataset.function === filter) {
          card.hidden = false;
        } else {
          card.hidden = true;
        }
      });
    });
  });
})();
