/* =============================================
   MIROMA AI HUB — Personalised homepage greeting
   For a signed-in user, fills the hero with "Welcome back, {firstName}"
   plus a nudge showing Claude-pathway progress. Progress is read from the
   SAME localStorage key the learning page writes (miroma_hub_pathway_{uid}),
   not Firestore — pathway_progress is admin-read-only by rule, and this
   avoids both a rule change and an extra read on every homepage visit.
   Degrades gracefully: signed out, or no identity -> the static hero is
   left untouched.
   ============================================= */

(function initHomeGreeting() {
  'use strict';

  var box = document.getElementById('heroWelcome');
  if (!box) return;

  var TOTAL_STAGES = 7;

  function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Friendly first name. Prefer Firebase Auth displayName (Google SSO usually
  // populates it); otherwise derive from the email local-part
  // (e.g. tess.mckean@... -> "Tess").
  function firstName() {
    try {
      var u = firebase.auth().currentUser;
      if (u && u.displayName && u.displayName.trim()) {
        return u.displayName.trim().split(/\s+/)[0];
      }
    } catch (_) {}
    var email = (typeof hubGetEmail === 'function') ? hubGetEmail() : '';
    if (!email) return '';
    var local = email.split('@')[0].split(/[._-]/)[0];
    if (!local) return '';
    return local.charAt(0).toUpperCase() + local.slice(1);
  }

  // Completed Claude-pathway stages (0..7) from the learning page's localStorage.
  function stagesDone() {
    try {
      var uid = (typeof hubGetUid === 'function') ? hubGetUid() : '';
      var p = JSON.parse(localStorage.getItem('miroma_hub_pathway_' + (uid || 'guest')) || '{}');
      var n = 0;
      for (var i = 1; i <= TOTAL_STAGES; i++) { if (p['stage' + i]) n++; }
      return n;
    } catch (_) { return 0; }
  }

  // Nudge copy is static (not user-supplied), so the HTML entities below are safe.
  function nudgeText(done) {
    if (done >= TOTAL_STAGES) return 'You&rsquo;ve completed the Claude pathway &mdash; explore what&rsquo;s next';
    if (done > 0) return 'You&rsquo;re ' + done + ' of ' + TOTAL_STAGES + ' stages into the Claude pathway';
    return 'Start the Claude learning pathway';
  }

  function render() {
    var name = firstName();
    if (!name) { box.hidden = true; box.innerHTML = ''; return; }
    var done = stagesDone();
    box.innerHTML =
      '<p class="hero__welcome__hi">Welcome back, ' + escHtml(name) + '.</p>' +
      '<p class="hero__welcome__nudge"><a href="learning.html">' + nudgeText(done) + ' &rarr;</a></p>';
    box.hidden = false;
  }

  // Race-safe init (pattern from home-news.js / admin-nav.js): listen for the
  // auth-ready event AND check whether auth was already restored first.
  document.addEventListener('mirAuthReady', render);
  document.addEventListener('mirAuthSignedOut', function() { box.hidden = true; box.innerHTML = ''; });
  try { if (firebase.auth().currentUser) render(); } catch (_) {}

})();
