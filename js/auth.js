/* =============================================
   MIROMA AI HUB — Firebase Authentication
   ============================================= */

const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyA8di3oAFJylmVDgj3JtHjnShp9o5r3Slw',
  authDomain:        'miroma-ai-hub.firebaseapp.com',
  projectId:         'miroma-ai-hub',
  storageBucket:     'miroma-ai-hub.firebasestorage.app',
  messagingSenderId: '1016718958213',
  appId:             '1:1016718958213:web:fe94b16c51f01be5ff53ec',
};

const ALLOWED_DOMAINS = [
  'miroma.com', 'spotnyc.com', 'themultipleagency.com',
  'wearemakerlab.com', 'dewynters.com', 'mxlocation.co', 'fold7.com',
  'buzz16.uk', 'miromafounders.com', 'soldout.co.uk', 'twelveam.com',
  'attentive.media', 'storyhousepr.co.uk', 'weareravenagency.com', 'wearehyperactive.com',
];

firebase.initializeApp(FIREBASE_CONFIG);

// Local development — connect to the Firebase emulator suite instead of
// production. Requires `firebase emulators:start` to be running.
// See docs/LOCAL_DEV.md for setup. Production deploys are unaffected
// because location.hostname is the live host.
const IS_LOCAL_DEV = ['localhost', '127.0.0.1'].includes(location.hostname);
if (IS_LOCAL_DEV) {
  try {
    firebase.firestore().useEmulator('localhost', 8080);
    firebase.auth().useEmulator('http://localhost:9099', { disableWarnings: true });
    console.info('[Miroma AI Hub] Local dev — connected to Firebase emulators (Firestore :8080, Auth :9099). Production data is NOT in use.');
  } catch (err) {
    console.warn('[Miroma AI Hub] Failed to connect to emulators — falling back to production. Start them with: firebase emulators:start', err);
  }
}

const auth = firebase.auth();

// ── Inject login overlay as soon as DOM is ready ──────

(function injectOverlay() {
  if (document.body) { doInject(); return; }
  document.addEventListener('DOMContentLoaded', doInject);
  function doInject() {
  const overlay = document.createElement('div');
  overlay.id = 'authOverlay';
  overlay.innerHTML = `
    <div class="auth-box">
      <p class="auth-box__eyebrow">Miroma Group</p>
      <h1 class="auth-box__title">AI Hub</h1>
      <p class="auth-box__sub">Sign in with your work account to continue.</p>
      <div class="auth-box__btns">
        <button class="auth-btn auth-btn--google" id="authGoogleBtn">
          <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google
        </button>
        <button class="auth-btn auth-btn--microsoft" id="authMicrosoftBtn">
          <svg width="18" height="18" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
            <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
            <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
          </svg>
          Sign in with Microsoft
        </button>
      </div>
      <p class="auth-box__error" id="authError"></p>
    </div>`;

  // If a cached session exists, hide overlay immediately to prevent flash
  // on page navigation. onAuthStateChanged will show it if the session is invalid.
  if (localStorage.getItem('miroma_hub_firebase_user')) {
    overlay.style.display = 'none';
  } else {
    document.documentElement.classList.add('auth-pending');
  }

  document.body.insertBefore(overlay, document.body.firstChild);

    document.getElementById('authGoogleBtn').addEventListener('click', signInGoogle);
    document.getElementById('authMicrosoftBtn').addEventListener('click', signInMicrosoft);
  }
})();

// ── Sign-in handlers ──────────────────────────────────

function signInGoogle() {
  showError('');
  setLoading(true);
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(handleError).finally(() => setLoading(false));
}

function signInMicrosoft() {
  showError('');
  setLoading(true);
  const provider = new firebase.auth.OAuthProvider('microsoft.com');
  provider.setCustomParameters({ tenant: 'organizations' });
  auth.signInWithPopup(provider).catch(handleError).finally(() => setLoading(false));
}

function handleError(err) {
  setLoading(false);
  if (err.code !== 'auth/popup-closed-by-user') {
    showError('Sign-in failed. Please try again.');
  }
}

// ── Auth state ────────────────────────────────────────

// Boolean signal that the user was signed in on a previous page load.
// Used by the auth overlay to avoid a flash before onAuthStateChanged
// re-fires after navigation. NOT used to recover the user's actual
// identity — that's always read from firebase.auth().currentUser
// (M-3 from the 2026-06-03 security audit). Storing the email here
// previously made every XSS path an instant identity-leak vector;
// a boolean does not.
const SSO_EMAIL_KEY = 'miroma_hub_firebase_user';
let _wasSignedIn = false;

// Synchronous accessor for the authenticated user's email. Returns ''
// if no user is signed in (typically only during the brief window
// between page load and Firebase Auth init). Replaces every previous
// `localStorage.getItem(SSO_EMAIL_KEY) || ''` use site, so the email
// has a single source of truth (Firebase Auth) rather than a localStorage
// duplicate that an attacker could harvest via XSS.
window.hubGetEmail = function() {
  try {
    const u = firebase.auth().currentUser;
    return (u && u.email) ? u.email.toLowerCase() : '';
  } catch (_) { return ''; }
};

// Same but returns the Firebase Auth uid. Used by code that needs a
// stable per-user identifier (e.g. local storage scoping) without
// touching the user's work email.
window.hubGetUid = function() {
  try {
    const u = firebase.auth().currentUser;
    return (u && u.uid) ? u.uid : '';
  } catch (_) { return ''; }
};

auth.onAuthStateChanged(function(user) {
  if (user && isAllowedEmail(user.email)) {
    _wasSignedIn = true;
    // Boolean flag only — value is '1' rather than the user's email.
    // See block comment above.
    localStorage.setItem(SSO_EMAIL_KEY, '1');
    removeOverlay();
    document.dispatchEvent(new CustomEvent('mirAuthReady', { detail: { email: user.email.toLowerCase() } }));
  } else {
    localStorage.removeItem(SSO_EMAIL_KEY);
    showOverlay(_wasSignedIn);
    document.dispatchEvent(new CustomEvent('mirAuthSignedOut'));
    if (user) {
      auth.signOut();
      setLoading(false);
      showError('Access is restricted to Miroma Group accounts.');
    }
  }
});

function isAllowedEmail(email) {
  if (!email) return false;
  const domain = email.split('@')[1]?.toLowerCase();
  return ALLOWED_DOMAINS.includes(domain);
}

// ── Overlay helpers ───────────────────────────────────

function removeOverlay() {
  const overlay = document.getElementById('authOverlay');
  if (overlay) overlay.style.display = 'none';
  document.documentElement.classList.remove('auth-pending');
}

function showOverlay(signedOut) {
  const overlay = document.getElementById('authOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  document.documentElement.classList.add('auth-pending');
  setLoading(false);

  const sub = overlay.querySelector('.auth-box__sub');
  if (sub) {
    sub.innerHTML = signedOut
      ? 'You\'ve been signed out successfully. Sign in again to continue.'
      : 'Sign in with your work account to continue.';
  }
}

function showError(msg) {
  const el = document.getElementById('authError');
  if (el) el.textContent = msg;
}

function setLoading(on) {
  const btns = document.querySelectorAll('.auth-btn');
  btns.forEach(b => { b.disabled = on; b.style.opacity = on ? '0.6' : ''; });
}

window.hubSignOut = () => auth.signOut();
