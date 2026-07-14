/* =============================================
   MIROMA AI HUB — Share-a-Win form
   ─────────────────────────────────────────────
   Form submission + agency pre-fill for share-a-win.html. Was
   inline in the HTML <script> at the bottom of the page; moved out
   so CSP can drop 'unsafe-inline' on script-src (KNOWN_ISSUES.md
   S-6 Part B). Depends on fsSubmitROIStory and emailToAgencyKey
   from js/requests.js — load order in share-a-win.html ensures
   requests.js is parsed first.
   ============================================= */

window.mirAuthReady = function(email) {
  if (!email || email === 'guest') return;
  const agencyMap = {
    'spotnyc.com':           'Spot Co',
    'themultipleagency.com': 'Multiple',
    'wearemakerlab.com':     'Maker Lab',
    'dewynters.com':         'Dewynters',
    'mxlocation.co':         'MX US',
    'fold7.com':             'Fold7',
    'miroma.com':            'Miroma Group',
    'miromafounders.com':    'MFN',
    'buzz16.uk':             'Buzz16',
    'soldout.co.uk':         'Sold Out',
    'twelveam.com':          'Twelve AM',
    'attentive.media':       'Attentive',
    'storyhousepr.co.uk':    'Storyhouse',
    'weareravenagency.com':  'Raven',
    'wearehyperactive.com':  'Hyperactive',
  };
  const domain = email.split('@')[1]?.toLowerCase();
  const agencyEl = document.getElementById('saw-agency');
  if (agencyEl && agencyMap[domain]) agencyEl.value = agencyMap[domain];
};

document.getElementById('sawForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const form  = e.target;
  const btn   = document.getElementById('sawSubmitBtn');
  const errEl = document.getElementById('sawError');
  errEl.style.display = 'none';

  const name         = form.querySelector('#saw-name').value.trim();
  const agency       = form.querySelector('#saw-agency').value.trim();
  const title        = form.querySelector('#saw-title').value.trim();
  const client       = form.querySelector('#saw-client').value.trim();
  const businessArea = form.querySelector('#saw-business-area').value;
  const goal         = form.querySelector('#saw-goal').value.trim();
  const detail       = form.querySelector('#saw-detail').value.trim();

  if (!name || !agency || !title || !client || !businessArea || !goal || !detail) {
    errEl.textContent = 'Please fill in all required fields.';
    errEl.style.display = 'block';
    return;
  }

  const tools       = [...form.querySelectorAll('[name="tools"]:checked')].map(el => el.value);
  const impactTypes = [...form.querySelectorAll('[name="impactTypes"]:checked')].map(el => el.value);
  // M-3: email comes from Firebase Auth, not localStorage. The localStorage
  // SSO key is now a boolean signal only — no email value to read.
  const email       = (typeof hubGetEmail === 'function') ? hubGetEmail() : '';
  const agencyKey   = typeof emailToAgencyKey === 'function' ? emailToAgencyKey(email) : '';

  btn.disabled    = true;
  btn.textContent = 'Submitting…';

  try {
    await fsSubmitROIStory({
      name,
      agency,
      role:            form.querySelector('#saw-role').value,
      title,
      email:           email.toLowerCase(),
      agencyKey:       agencyKey || 'unknown',
      client,
      businessArea,
      goal,
      tools,
      impactTypes,
      commercialValue: form.querySelector('#saw-value').value.trim(),
      timeSaved:       form.querySelector('#saw-time-saved').value.trim(),
      withoutAI:       form.querySelector('#saw-without-ai').value,
      detail,
      clientQuote:     form.querySelector('#saw-quote').value.trim(),
      supportingLink:  form.querySelector('#saw-link').value.trim(),
      shareable:       form.querySelector('#saw-shareable').checked,
    });
    form.style.display = 'none';
    document.getElementById('sawSuccess').style.display = '';
  } catch (err) {
    console.error(err);
    errEl.textContent = 'Something went wrong — please try again or email aiteam@miroma.com.';
    errEl.style.display = 'block';
    btn.disabled    = false;
    btn.textContent = 'Submit story →';
  }
});

document.querySelectorAll('#sawForm select').forEach(sel => {
  sel.addEventListener('change', () => sel.classList.toggle('has-value', sel.value !== ''));
});
