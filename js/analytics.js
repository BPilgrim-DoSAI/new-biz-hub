/* =============================================
   MIROMA AI HUB — Google Analytics bootstrap
   ─────────────────────────────────────────────
   Was an inline <script> block in every HTML <head>. Moved out so
   CSP can drop 'unsafe-inline' on script-src (KNOWN_ISSUES.md S-6
   Part B). Paired with the async loader for gtag.js still in the
   HTML <head>; this file runs *after* that loader is requested but
   doesn't depend on it being parsed first because gtag() pushes
   into dataLayer and is replayed on load.
   ============================================= */

window.dataLayer = window.dataLayer || [];
function gtag(){ dataLayer.push(arguments); }
gtag('js', new Date());
gtag('config', 'G-L7H3N34BG1');
