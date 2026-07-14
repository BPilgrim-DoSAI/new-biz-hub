/* =============================================
   MIROMA AI HUB — Admin nav link visibility
   Shows the Admin nav item for admin users only.
   Loaded on every page after auth.js.
   ============================================= */

(function() {
  'use strict';

  const SSO_KEY     = 'miroma_hub_firebase_user';
  // M-3 Part 2: this key used to store the admin's email value. It now stores
  // the literal '1' as a presence flag — the email is derived from Firebase
  // Auth via hubGetEmail() when needed. Renamed from miroma_hub_admin_email
  // to make it obvious no PII lives here. The legacy key is cleared below.
  const STORAGE_KEY = 'miroma_hub_admin';
  const LEGACY_STORAGE_KEY = 'miroma_hub_admin_email';
  // One-shot cleanup: any browser that signed in before M-3 Part 2 still has
  // the email-keyed legacy entry. Drop it on script load — admin-panel will
  // re-confirm admin status and write the new ('1') entry if appropriate.
  try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch (_) {}

  // M-3: SSO_KEY now stores a boolean signal ('1') rather than the user's
  // email. Email comes from Firebase Auth via hubGetEmail(). This function
  // returns null if the user isn't signed in OR if Firebase Auth hasn't
  // initialised yet (brief window after page load).
  function getSSOEmail() {
    if (!localStorage.getItem(SSO_KEY)) return null;
    return (typeof hubGetEmail === 'function' && hubGetEmail()) || null;
  }

  function showAdminLink() {
    const item    = document.getElementById('nav-admin-item');
    const mobLink = document.getElementById('mob-admin-link');
    if (item)    item.style.display    = '';
    if (mobLink) mobLink.style.display = '';
  }

  function hideAdminLink() {
    const item    = document.getElementById('nav-admin-item');
    const mobLink = document.getElementById('mob-admin-link');
    if (item)    item.style.display    = 'none';
    if (mobLink) mobLink.style.display = 'none';
  }

  function showNewBizLink() {
    var item    = document.getElementById('nav-newbiz-item');
    var mobLink = document.getElementById('mob-newbiz-link');
    if (item)    item.style.display    = '';
    if (mobLink) mobLink.style.display = '';
  }

  function hideNewBizLink() {
    var item    = document.getElementById('nav-newbiz-item');
    var mobLink = document.getElementById('mob-newbiz-link');
    if (item)    item.style.display    = 'none';
    if (mobLink) mobLink.style.display = 'none';
  }

  function checkNewBizClaim() {
    try {
      var user = firebase.auth().currentUser;
      if (!user) { hideNewBizLink(); return; }
      user.getIdTokenResult().then(function(tokenResult) {
        if (tokenResult.claims.newbizAccess || tokenResult.claims.access === 'all' || tokenResult.claims.access === 'finance') {
          showNewBizLink();
        } else {
          hideNewBizLink();
        }
      }).catch(function() { hideNewBizLink(); });
    } catch (_) { hideNewBizLink(); }
  }

  function checkAndShow() {
    const ssoEmail = getSSOEmail();
    // M-3 Part 2: STORAGE_KEY is now a boolean presence flag ('1'). Combined
    // with hubGetEmail() it answers "is the currently-signed-in user a
    // previously-confirmed admin?" — same logic as before, no email in storage.
    const adminCached  = !!localStorage.getItem(STORAGE_KEY);
    const cachedEmail  = adminCached ? ssoEmail : null;
    // Show if already-confirmed admin (cached flag + we can resolve email), or
    // SSO email is in the publicly-known admin list.
    if (cachedEmail && typeof ADMIN_EMAILS !== 'undefined' && ADMIN_EMAILS.includes(cachedEmail)) {
      showAdminLink(); return;
    }
    if (ssoEmail && typeof ADMIN_EMAILS !== 'undefined' && ADMIN_EMAILS.includes(ssoEmail)) {
      showAdminLink(); return;
    }
    // If ADMIN_EMAILS not yet loaded, show for any signed-in user and let admin.html handle access
    if (ssoEmail) {
      showAdminLink();
    }
  }

  document.addEventListener('mirAuthReady', function(e) {
    const email = e.detail && e.detail.email;
    if (email && typeof ADMIN_EMAILS !== 'undefined' && ADMIN_EMAILS.includes(email)) {
      showAdminLink();
    } else if (email && typeof ADMIN_EMAILS === 'undefined') {
      showAdminLink();
    } else {
      hideAdminLink();
    }
    checkNewBizClaim();
  });

  document.addEventListener('mirAuthSignedOut', function() {
    hideAdminLink();
    hideNewBizLink();
  });

  // Also check on load in case mirAuthReady already fired
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      checkAndShow();
      checkNewBizClaim();
    });
  } else {
    checkAndShow();
    checkNewBizClaim();
  }

  // Sign-out button binding — replaces inline onclick attributes across
  // every HTML page (KNOWN_ISSUES.md S-6 Part B). Event delegation on
  // document means we don't have to worry about whether the buttons
  // exist at script-eval time. Covers both the desktop nav button
  // (.nav__signout-btn) and the mobile menu button (.mob-signout-btn).
  document.addEventListener('click', function(e) {
    if (e.target && e.target.closest && e.target.closest('.nav__signout-btn, .mob-signout-btn')) {
      if (typeof window.hubSignOut === 'function') window.hubSignOut();
    }
  });
})();
