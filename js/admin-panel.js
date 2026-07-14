/* =============================================
   MIROMA AI HUB — Admin page
   Renders inline into #adminPanelBody on admin.html
   ============================================= */

(function initAdminDashboard() {
  'use strict';

  // M-3 Part 2: STORAGE_KEY used to hold the admin's email value as both an
  // "is admin?" flag and a source of the email itself. It now stores the
  // literal '1' as a presence flag — the email comes from Firebase Auth via
  // hubGetEmail() at every read site. Renamed so the key name no longer
  // implies PII storage. The legacy key is one-shot cleared below.
  const STORAGE_KEY        = 'miroma_hub_admin';
  const LEGACY_STORAGE_KEY = 'miroma_hub_admin_email';
  const SSO_KEY            = 'miroma_hub_firebase_user';
  try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch (_) {}

  // Centralised: returns the currently-signed-in user's email IF they're a
  // confirmed admin (STORAGE_KEY present), else ''. Replaces every previous
  // localStorage.getItem('miroma_hub_admin_email') read site. The STORAGE_KEY
  // check gates the lookup so non-admin users don't get an email back here —
  // matches the old behaviour where the key being absent meant "no admin".
  function getAdminEmail() {
    if (!localStorage.getItem(STORAGE_KEY)) return '';
    return (typeof hubGetEmail === 'function') ? (hubGetEmail() || '') : '';
  }

  // Cached Firestore data. After the S-1 migration these are the sole source
  // of truth — admin-data.js no longer loads in the browser. Defaults are
  // safe empty values so renderContent() can run before the async load
  // completes (it shows a loading state in that window).
  let _licenseData = { agencies: [] };
  let _adminUsers  = [];
  let _cachedOwnProfile = null;

  // True while autoAuthFromSSO + reloadAdminContext are in flight. Used by
  // renderContent to show a "Verifying admin access…" placeholder rather
  // than the wrong "you're signed in but not an admin" view — which flashed
  // for ~1s in Safari private windows before the async check returned.
  let _authChecking = false;

  // Shared agency selection across the three per-agency admin sections
  // (Licence Dashboard, Claude Usage, Meeting Log). Each section used to
  // default independently to agencies[0], so picking "Dewynters" on the
  // Licence tab left the others on whatever they showed last — a real risk
  // when a super admin is screen-sharing and switches tabs. These helpers
  // give all three a single source of truth, persisted to localStorage so
  // the choice also survives a page reload.
  const SELECTED_AGENCY_KEY = 'miroma_hub_selected_agency';

  // Return the agency key to show, validated against what this admin can
  // actually see. Falls back to the first visible agency if nothing is
  // stored or the stored key isn't in their list (e.g. an agency admin who
  // only ever sees their own agency, or a stale value from a wider role).
  function getSelectedAgency(agencies) {
    let key = '';
    try { key = localStorage.getItem(SELECTED_AGENCY_KEY) || ''; } catch (_) {}
    const valid = key && agencies.some(function (a) { return a.key === key; });
    return valid ? key : ((agencies[0] && agencies[0].key) || '');
  }

  // Record the admin's choice so the other sections pick it up.
  function setSelectedAgency(key) {
    if (!key) return;
    try { localStorage.setItem(SELECTED_AGENCY_KEY, key); } catch (_) {}
  }

  // Which report (Claude / LTX / a specific bespoke automation) is showing on
  // the merged Usage Reports tab. Persisted so it survives a reload, but the
  // caller must re-validate against the CURRENTLY SELECTED agency's available
  // reports (getAvailableReports) — a stored automation name that was valid
  // for one agency means nothing for another.
  const SELECTED_REPORT_KEY = 'miroma_hub_selected_report';

  function getSelectedReport(availableReports) {
    let val = '';
    try { val = localStorage.getItem(SELECTED_REPORT_KEY) || ''; } catch (_) {}
    const valid = val && availableReports.some(function (r) { return r.value === val; });
    return valid ? val : ((availableReports[0] && availableReports[0].value) || 'claude');
  }

  function setSelectedReport(value) {
    if (!value) return;
    try { localStorage.setItem(SELECTED_REPORT_KEY, value); } catch (_) {}
  }

  // ── Bootstrap ─────────────────────────────────────────

  function init() {
    wireEvents();
    wireAuthEvents();
    // If there's a cached SSO email already in localStorage (returning user),
    // mirAuthReady will fire shortly — pre-mark _authChecking so the first
    // render shows the verifying state instead of an incorrect default.
    if (localStorage.getItem(SSO_KEY)) _authChecking = true;
    renderContent();
    // mirAuthReady may already have fired before this script wired its
    // listener (Firebase Auth restores the session asynchronously, and on a
    // warm cache it can beat later scripts in the load order). Without this
    // check the panel waits forever on "Verifying admin access…" — the same
    // missed-event race admin-nav.js guards against. If auth is already
    // ready, run the handler directly with the current user's email.
    try {
      const u = firebase.auth().currentUser;
      if (u && u.email) onAuthReady(u.email.toLowerCase());
    } catch (_) {}
  }

  // Shared by the mirAuthReady listener and the already-signed-in check in
  // init(). Safe to run twice: autoAuthFromSSO and reloadAdminContext are
  // idempotent reads, and renderContent just repaints from caches.
  async function onAuthReady(email) {
    // Show verifying state immediately, before the awaits below begin —
    // gives the UI a stable "checking" appearance for the whole duration
    // of auth-check + data load.
    _authChecking = true;
    renderContent();
    try {
      await autoAuthFromSSO(email);
      await reloadAdminContext();
    } finally {
      _authChecking = false;
      renderContent();
    }
  }

  function wireAuthEvents() {
    document.addEventListener('mirAuthReady', function(e) {
      onAuthReady(e.detail.email);
    });
    document.addEventListener('mirAuthSignedOut', function() {
      localStorage.removeItem(STORAGE_KEY);
      _adminUsers   = [];
      _licenseData  = { agencies: [] };
      _authChecking = false;
      _cachedOwnProfile = null;
      renderContent();
    });
  }

  // Server-authoritative admin check. Replaces the old client-side
  // ADMIN_USERS.includes(email) test, which relied on the publicly-served
  // admin-data.js. Now: try to read /admins/{email}; the rule permits the
  // caller to read their own doc only. If the doc exists, they're an admin.
  //
  // Two error classes to handle distinctly:
  //
  //   - permission-denied or doc-not-exists:
  //     definitive answer "not an admin". Clear any cached STORAGE_KEY so
  //     the UI shows the non-admin view.
  //
  //   - any other error (network, unavailable, transient):
  //     we don't actually know whether they're an admin. Retry with short
  //     backoff (Safari private mode and other ITP-strict browsers can
  //     fail the initial Firestore connect — the SDK self-recovers within
  //     a few hundred ms). If all retries fail, leave STORAGE_KEY alone:
  //     don't downgrade a previously-confirmed admin to non-admin just
  //     because a single network blip happened.
  //
  // This eliminates the Safari-private-window race where a first-load
  // network glitch left users on the "you don't have admin access" view
  // until they refreshed.
  async function autoAuthFromSSO(email) {
    if (!email) { localStorage.removeItem(STORAGE_KEY); _cachedOwnProfile = null; return; }
    const db = firebase.firestore();
    const ref = db.collection('admins').doc(email.toLowerCase());
    const ATTEMPTS = 3;
    for (let i = 0; i < ATTEMPTS; i++) {
      try {
        const snap = await ref.get();
        if (snap.exists) {
          // M-3 Part 2: store a boolean presence flag, not the email value.
          localStorage.setItem(STORAGE_KEY, '1');
          const data = snap.data() || {};
          _cachedOwnProfile = {
            email:  email.toLowerCase(),
            name:   data.name   || '',
            access: data.access || 'agency',
            agency: data.agency || undefined,
          };
          console.log('✅ [Cache] Fetched profile from Firestore and saved to memory');
        } else {
          localStorage.removeItem(STORAGE_KEY);
          _cachedOwnProfile = null;
        }
        return;
      } catch (err) {
        // Definitive denial — stop retrying, treat as non-admin.
        if (err && err.code === 'permission-denied') {
          console.warn('autoAuthFromSSO: permission denied');
          localStorage.removeItem(STORAGE_KEY);
          _cachedOwnProfile = null;
          return;
        }
        // Transient. Back off and retry. 300ms then 600ms (~900ms total).
        if (i < ATTEMPTS - 1) {
          await new Promise(function(r) { setTimeout(r, 300 * (i + 1)); });
          continue;
        }
        // All retries exhausted. Don't touch STORAGE_KEY — if the user was
        // a confirmed admin from a previous session, leave them able to
        // see the cached admin view; if they were never confirmed, they
        // see the non-admin view and can refresh.
        console.warn('autoAuthFromSSO transient error after retries (cache unchanged):', err);
      }
    }
  }

  // Refreshes _adminUsers and _licenseData caches from Firestore.
  // Called after auth-ready and after any admin-side write that needs to
  // update the local view (e.g. admin edit modal save).
  async function reloadAdminContext() {
    try {
      const [licenseData, adminUsers] = await Promise.all([
        loadLicenseData(),
        loadAdminUsers(),
      ]);
      _licenseData = licenseData;
      _adminUsers  = adminUsers;
    } catch (err) {
      console.warn('reloadAdminContext failed:', err);
    }
  }

  // ── Event delegation ──────────────────────────────────

  function wireEvents() {
    document.addEventListener('click', function(e) {
      if (e.target.closest('.admin-signout')) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(SSO_KEY);
        if (typeof firebase !== 'undefined') firebase.auth().signOut();
        renderContent(); return;
      }
      const visitorsToggle = e.target.closest('.visitors-toggle');
      if (visitorsToggle) {
        const table = visitorsToggle.previousElementSibling.querySelector('.admin-act-table');
        const expanded = table.classList.toggle('is-expanded');
        const total = table.querySelectorAll('tbody tr').length;
        visitorsToggle.textContent = expanded ? 'Show fewer' : `Show all ${total} visitors`;
        return;
      }
      const licenceEditBtn = e.target.closest('.licence-edit-btn');
      if (licenceEditBtn) {
        openLicenceEditModal(licenceEditBtn.dataset.agency, licenceEditBtn.dataset.tool); return;
      }
      const adminsEditBtn = e.target.closest('.agency-admins-edit-btn');
      if (adminsEditBtn) {
        openAdminEditModal(adminsEditBtn.dataset.agency); return;
      }
      const auditToggle = e.target.closest('.audit-log-toggle');
      if (auditToggle) {
        const section = auditToggle.closest('.audit-log-section');
        const list    = section.querySelector('.audit-log-list');
        const isOpen  = list.style.display !== 'none';
        if (isOpen) { list.style.display = 'none'; auditToggle.textContent = 'Change history'; return; }
        auditToggle.textContent = 'Loading…';
        fsGetAuditLog(section.dataset.agency, section.dataset.tool).then(function(entries) {
          if (!entries.length) {
            list.innerHTML = '<p class="audit-log-empty">No changes recorded yet.</p>';
          } else {
            list.innerHTML = entries.map(function(entry) {
              const ts = entry.timestamp && entry.timestamp.toDate ? entry.timestamp.toDate() : new Date();
              const dateStr = ts.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
              const timeStr = ts.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
              return `<div class="audit-log-entry">
                <p class="audit-log-entry__meta">${dateStr} · ${timeStr} · ${esc(entry.adminEmail)}</p>
                <ul class="audit-log-entry__changes">${(entry.changes || []).map(function(c) { return '<li>' + esc(c) + '</li>'; }).join('')}</ul>
              </div>`;
            }).join('');
          }
          list.style.display = 'block';
          auditToggle.textContent = 'Hide history';
        }).catch(function() {
          list.innerHTML = '<p class="audit-log-empty">Failed to load history.</p>';
          list.style.display = 'block';
          auditToggle.textContent = 'Change history';
        });
        return;
      }
      const toolHead = e.target.closest('.admin-tool__head');
      if (toolHead && !e.target.closest('.admin-tool__head-actions')) {
        toolHead.closest('.admin-tool').classList.toggle('is-open'); return;
      }
      // Licence Dashboard tabs only. Meeting Log tabs share the .admin-tab
      // class but carry data-ml-agency (not data-agency) and have their own
      // handler, so gate on data-agency to avoid hijacking those clicks.
      const tab = e.target.closest('.admin-tab[data-agency]');
      if (tab) {
        document.querySelectorAll('.admin-tab[data-agency]').forEach(t => t.classList.remove('is-active'));
        tab.classList.add('is-active');
        setSelectedAgency(tab.dataset.agency);
        renderAgencyContent(tab.dataset.agency); return;
      }
      const sectionBtn = e.target.closest('.admin-section-btn');
      if (sectionBtn) {
        switchSection(sectionBtn.dataset.section); return;
      }
    });

  }
  // (handleLogin removed — closes KNOWN_ISSUES.md S-2. Admin status is now
  // server-authoritative via /admins/{email}; there is no client-side login
  // form to spoof. Sign-in happens via Firebase Auth's SSO overlay, and
  // autoAuthFromSSO() reads the user's admin doc directly.)

  // ── Section switching ─────────────────────────────────

  function switchSection(section) {
    document.querySelectorAll('.admin-section-btn').forEach(b => b.classList.remove('is-active'));
    document.querySelector(`.admin-section-btn[data-section="${section}"]`)?.classList.add('is-active');
    document.getElementById('adminSectionLicenses').style.display  = section === 'licenses'       ? '' : 'none';
    // The Licences section is built once at page load and only hidden/shown on
    // section switches (unlike Claude Usage / Meeting Log, which re-render each
    // time). So when returning to it, re-apply the shared agency selection —
    // otherwise a choice made on another tab wouldn't reflect here.
    if (section === 'licenses') {
      const lEmail = getAdminEmail();
      const lUser  = lEmail ? getUser(lEmail) : null;
      if (lUser) {
        const lAgencies = visibleFor(lUser);
        const lSelKey   = getSelectedAgency(lAgencies);
        document.querySelectorAll('.admin-tab[data-agency]').forEach(function (t) {
          t.classList.toggle('is-active', t.dataset.agency === lSelKey);
        });
        if (lSelKey) renderAgencyContent(lSelKey);
      }
    }
    document.getElementById('adminSectionActivity').style.display  = section === 'activity'       ? '' : 'none';
    const goEl = document.getElementById('adminSectionGroupOverview');
    if (goEl) goEl.style.display = section === 'group-overview' ? '' : 'none';
    const roiEl = document.getElementById('adminSectionROI');
    if (roiEl) {
      roiEl.style.display = section === 'roi-stories' ? '' : 'none';
      if (section === 'roi-stories') renderROIStories();
    }
    if (section === 'activity') renderActivitySection();
    if (section === 'group-overview') renderGroupOverview();
    const gpEl = document.getElementById('adminSectionGroupProgress');
    if (gpEl) {
      gpEl.style.display = section === 'group-progress' ? '' : 'none';
      if (section === 'group-progress') renderGroupProgressSection();
    }
    const urEl = document.getElementById('adminSectionUsageReports');
    if (urEl) {
      urEl.style.display = section === 'usage-reports' ? '' : 'none';
      if (section === 'usage-reports') renderUsageReportsSection();
    }
    const contentEl = document.getElementById('adminSectionContent');
    if (contentEl) {
      contentEl.style.display = section === 'site-content' ? '' : 'none';
      if (section === 'site-content') renderSiteContent();
    }
    const mlEl = document.getElementById('adminSectionMeetingLog');
    if (mlEl) {
      mlEl.style.display = section === 'meeting-log' ? '' : 'none';
      if (section === 'meeting-log') renderMeetingLogSection();
    }
  }

  // ── Claude Usage section ──────────────────────────────
  // Per-agency Claude adoption dashboard. Reads monthly snapshots from
  // /claude_usage/{agencyKey}/snapshots and hands the latest (+ previous,
  // for month-over-month deltas) to renderClaudeUsage() in js/claude-usage.js.
  // Reads are gated by canAccessAgency in firestore.rules, so an agency admin
  // only ever receives their own agency's data.

  // Fetch the latest two snapshots for one agency (latest + previous).
  async function fsGetClaudeUsage(agencyKey) {
    const db = fsDb ? fsDb() : (typeof firebase !== 'undefined' ? firebase.firestore() : null);
    if (!db || !agencyKey) return { latest: null, previous: null };
    try {
      const snap = await db.collection('claude_usage').doc(agencyKey)
        .collection('snapshots').orderBy('period', 'desc').limit(2).get();
      const docs = snap.docs.map(function (d) { return d.data(); });
      return { latest: docs[0] || null, previous: docs[1] || null };
    } catch (e) {
      console.warn('fsGetClaudeUsage failed for', agencyKey, e);
      return { latest: null, previous: null, error: e };
    }
  }

  // ── LTX Studio fetch helper ────────────────────────────
  // Fetch the latest LTX snapshot for every agency in parallel.
  // Returns an array of { agencyKey, data } — skips agencies with no snapshot.
  async function fsGetAllLtxSnapshots(agencies) {
    const db = fsDb ? fsDb() : (typeof firebase !== 'undefined' ? firebase.firestore() : null);
    if (!db) return [];
    const results = await Promise.all(agencies.map(async function (a) {
      try {
        const snap = await db.collection('ltx_usage').doc(a.key)
          .collection('snapshots').orderBy('period', 'desc').limit(1).get();
        if (snap.empty) return null;
        return { agencyKey: a.key, agencyName: a.name, data: snap.docs[0].data() };
      } catch (e) {
        return null;
      }
    }));
    return results.filter(Boolean);
  }

  async function fsGetLtxUsage(agencyKey) {
    const db = fsDb ? fsDb() : (typeof firebase !== 'undefined' ? firebase.firestore() : null);
    if (!db || !agencyKey) return { latest: null };
    try {
      const snap = await db.collection('ltx_usage').doc(agencyKey)
        .collection('snapshots').orderBy('period', 'desc').limit(1).get();
      const docs = snap.docs.map(function (d) { return d.data(); });
      return { latest: docs[0] || null };
    } catch (e) {
      console.warn('fsGetLtxUsage failed for', agencyKey, e);
      return { latest: null, error: e };
    }
  }

  // Bespoke automations the AI team has built for a specific agency (e.g.
  // Sold Out's Meta Ads Automation) — distinct from Claude/LTX Studio, which
  // every agency is expected to have a seat-based licence for. There's no
  // seat data to key off, so the catalogue of what exists is a small,
  // hand-maintained list here. Extend it whenever a new bespoke automation
  // goes live for an agency; each entry maps to one
  // /automation_usage/{agencyKey}/automations/{automationKey}/snapshots/{period}
  // stream. `name` is shown as its own entry in the Report dropdown below —
  // plain (no agency prefix), since the agency is already picked separately.
  const CUSTOM_AUTOMATIONS = [
    { agencyKey: 'soldout', automationKey: 'meta-ads', name: 'Meta Ads Automation' },
    { agencyKey: 'makerlab', automationKey: 'talent-tool', name: 'Talent Tool' },
  ];

  async function fsGetAutomationUsage(agencyKey, automationKey) {
    const db = fsDb ? fsDb() : (typeof firebase !== 'undefined' ? firebase.firestore() : null);
    if (!db || !agencyKey || !automationKey) return { latest: null };
    try {
      const snap = await db.collection('automation_usage').doc(agencyKey)
        .collection('automations').doc(automationKey)
        .collection('snapshots').orderBy('period', 'desc').limit(1).get();
      const docs = snap.docs.map(function (d) { return d.data(); });
      return { latest: docs[0] || null };
    } catch (e) {
      console.warn('fsGetAutomationUsage failed for', agencyKey, automationKey, e);
      return { latest: null, error: e };
    }
  }

  // Report choices for one agency, in dropdown order. Claude and LTX always
  // appear — every agency is expected to have these, with an empty state
  // below covering "no report published yet" — while a bespoke automation
  // only appears for the agency it was actually built for, named plainly
  // ("Talent Tool"), so an agency with several shows several flat options
  // rather than a nested "Our builds" sub-menu.
  function getAvailableReports(agencyKey) {
    var reports = [
      { value: 'claude', label: 'Claude' },
      { value: 'ltx', label: 'LTX' },
    ];
    CUSTOM_AUTOMATIONS.filter(function (a) { return a.agencyKey === agencyKey; })
      .forEach(function (a) { reports.push({ value: 'automation:' + a.automationKey, label: a.name }); });
    return reports;
  }

  // ── Usage Reports section (Claude / LTX / bespoke automations, merged) ──
  // Replaces three former tabs that each carried their own copy of the
  // agency picker. One agency picker + one report picker; picking a report
  // just swaps which existing loader fills the one mount point below — none
  // of the three renderers (renderClaudeUsage / renderLtxUsage /
  // renderAutomationUsage) changed at all.
  function usageSelectStyle() {
    return 'background:#111120;border:1px solid rgba(255,255,255,0.12);border-radius:8px;font-size:13px;' +
      'font-weight:500;padding:7px 32px 7px 12px;appearance:none;background-image:url(\'data:image/svg+xml,' +
      '%3Csvg xmlns=\\\'http://www.w3.org/2000/svg\\\' width=\\\'10\\\' height=\\\'6\\\' viewBox=\\\'0 0 10 6\\\'' +
      '%3E%3Cpath d=\\\'M1 1l4 4 4-4\\\' stroke=\\\'rgba(255,255,255,0.4)\\\' fill=\\\'none\\\' stroke-width=\\\'1.5\\\' ' +
      'stroke-linecap=\\\'round\\\'/%3E%3C/svg%3E\');background-repeat:no-repeat;background-position:right 10px center;cursor:pointer';
  }

  async function renderUsageReportsSection() {
    const section = document.getElementById('adminSectionUsageReports');
    if (!section) return;
    const email = getAdminEmail();
    const user = getUser(email);
    if (!user) return;

    // Agencies we deliberately don't gather Claude usage data for (data-security
    // decision) are hidden from the usage-reports agency picker — they still
    // appear in the Licences/Group Spend views. Keep in sync with
    // USAGE_EXCLUDED_KEYS in js/group-report.js.
    const USAGE_EXCLUDED_AGENCIES = ['hr', 'miroma-group', 'legal'];
    const agencies = ((typeof visibleFor === 'function') ? visibleFor(user) : [])
      .filter(function (a) { return USAGE_EXCLUDED_AGENCIES.indexOf(a.key) === -1; });
    const isFull = user.access === 'all' || user.access === 'finance';
    const selAgencyKey = getSelectedAgency(agencies) || user.agency;
    const availableReports = getAvailableReports(selAgencyKey);
    const selReport = getSelectedReport(availableReports);

    var agencyPickerHtml = (isFull && agencies.length > 1)
      ? '<div style="display:flex;align-items:center;gap:10px">' +
          '<span class="cu-agency-label" style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em">Agency</span>' +
          '<select id="urAgencySelect" class="cu-agency-select" style="' + usageSelectStyle() + '">' +
          agencies.map(function (a) { return '<option value="' + esc(a.key) + '"' + (a.key === selAgencyKey ? ' selected' : '') + '>' + esc(a.name) + '</option>'; }).join('') +
          '</select></div>'
      : '';

    var reportPickerHtml =
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<span class="cu-agency-label" style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em">Report</span>' +
        '<select id="urReportSelect" class="cu-agency-select" style="' + usageSelectStyle() + '">' +
        availableReports.map(function (r) { return '<option value="' + esc(r.value) + '"' + (r.value === selReport ? ' selected' : '') + '>' + esc(r.label) + '</option>'; }).join('') +
        '</select></div>';

    section.innerHTML =
      '<p class="admin-view__title">Usage Reports</p>' +
      '<p class="admin-view__sub">Claude, LTX Studio, and any bespoke automations built for this agency — for reporting and ROI conversations with agency leads. Agency admins see their own agency only.</p>' +
      '<div id="automationUsageWrap" style="background:#0B0B13;border-radius:12px;padding:28px;margin-top:8px">' +
        '<div style="display:flex;flex-wrap:wrap;gap:20px;margin-bottom:24px">' + agencyPickerHtml + reportPickerHtml + '</div>' +
        '<div id="urMount"><p style="font-size:13px;color:rgba(255,255,255,0.45);padding:4px 0">Loading…</p></div>' +
      '</div>';

    const agencyPicker = document.getElementById('urAgencySelect');
    if (agencyPicker) agencyPicker.addEventListener('change', function () {
      setSelectedAgency(agencyPicker.value);
      // The report dropdown's OPTIONS depend on the agency (which bespoke
      // automations, if any, it has) — re-render the whole section so the
      // <select> itself is rebuilt with the right choices, not just the mount.
      renderUsageReportsSection();
    });

    const reportPicker = document.getElementById('urReportSelect');
    if (reportPicker) reportPicker.addEventListener('change', function () {
      setSelectedReport(reportPicker.value);
      loadReport(selAgencyKey, reportPicker.value);
    });

    loadReport(selAgencyKey, selReport);

    async function loadReport(agencyKey, reportValue) {
      const mount = document.getElementById('urMount');
      if (!mount) return;
      if (!agencyKey) { mount.innerHTML = emptyState('No agency is associated with your admin profile.'); return; }
      if (reportValue === 'ltx') {
        await loadClaudeOrLtx('ltx', agencyKey);
      } else if (reportValue && reportValue.indexOf('automation:') === 0) {
        await loadAutomation(agencyKey, reportValue.slice('automation:'.length));
      } else {
        await loadClaudeOrLtx('claude', agencyKey);
      }
    }

    async function loadClaudeOrLtx(kind, agencyKey) {
      const mount = document.getElementById('urMount');
      if (kind === 'ltx') {
        mount.innerHTML = '<p class="admin-loading">Loading LTX usage…</p>';
        const res = await fsGetLtxUsage(agencyKey);
        if (res.error) { mount.innerHTML = emptyState('Could not load LTX usage data. Please try again or contact the AI team.'); return; }
        if (!res.latest) { mount.innerHTML = emptyState('No LTX usage report has been published for this agency yet. Reports are added monthly.'); return; }
        if (typeof window.renderLtxUsage !== 'function') { mount.innerHTML = emptyState('LTX usage view failed to load.'); return; }
        // Look up the LTX Studio seat count for this agency from the licence
        // data so the renderer can display the allocation bar.
        const agencyLicenceData = (_licenseData.agencies || []).find(function (a) { return a.key === agencyKey; });
        const ltxTool = agencyLicenceData
          ? (agencyLicenceData.tools || []).find(function (t) { return t.name === 'LTX Studio'; })
          : null;
        const seats = ltxTool ? (ltxTool.seats || 0) : 0;
        window.renderLtxUsage(mount, res.latest, { seats: seats });
        return;
      }
      mount.innerHTML = '<p class="admin-loading">Loading Claude usage…</p>';
      const res = await fsGetClaudeUsage(agencyKey);
      if (res.error) { mount.innerHTML = emptyState('Could not load usage data. Please try again or contact the AI team.'); return; }
      if (!res.latest) { mount.innerHTML = emptyState('No Claude usage report has been published for this agency yet. Reports are added monthly.'); return; }
      if (typeof window.renderClaudeUsage !== 'function') { mount.innerHTML = emptyState('Usage view failed to load.'); return; }
      window.renderClaudeUsage(mount, res.latest, { previous: res.previous });
    }

    async function loadAutomation(agencyKey, automationKey) {
      const mount = document.getElementById('urMount');
      const a = CUSTOM_AUTOMATIONS.find(function (x) { return x.agencyKey === agencyKey && x.automationKey === automationKey; });
      const name = a ? a.name : 'automation';
      mount.innerHTML = '<p class="admin-loading">Loading ' + esc(name) + '…</p>';
      const res = await fsGetAutomationUsage(agencyKey, automationKey);
      if (res.error) { mount.innerHTML = emptyState('Could not load "' + esc(name) + '". Please try again or contact the AI team.'); return; }
      if (!res.latest) { mount.innerHTML = emptyState('No usage report has been published yet for "' + esc(name) + '".'); return; }
      if (typeof window.renderAutomationUsage !== 'function') { mount.innerHTML = emptyState('Automation usage view failed to load.'); return; }
      window.renderAutomationUsage(mount, res.latest);
    }

    function emptyState(msg) {
      return '<div class="cu-empty" style="padding:28px;border:1px solid var(--c-grey-mid);border-radius:var(--radius-md);color:var(--c-stone);font-size:14px">' + esc(msg) + '</div>';
    }
  }

  // ── Site Content section (news feed + use-case library) ──
  // Builds a small sub-tab scaffold inside #adminSectionContent; the two
  // editors (admin-content.js, admin-use-cases.js) each render into their
  // own mount div so switching tabs doesn't lose the other's state.
  // NOTE: the sub-tab buttons deliberately do NOT use the .admin-section-btn
  // class — the delegated click handler above would route them through
  // switchSection() with an undefined section and blank the panel.
  // ── Meeting Log ───────────────────────────────────────
  // Per-agency rolling log of monthly oversight meetings.
  // Each entry covers one month: what's going well, needs attention, and actions agreed.
  // Super admins can add and edit entries; agency admins can read them.

  async function renderMeetingLogSection() {
    const section = document.getElementById('adminSectionMeetingLog');
    if (!section) return;

    const adminEmail = getAdminEmail();
    const user = getUser(adminEmail);
    if (!user) return;

    const isSuperAdmin = user.access === 'all';
    const agencies = visibleFor(user);
    if (!agencies.length) {
      section.innerHTML = '<p class="admin-view__loading">No agencies available.</p>';
      return;
    }

    // Agency tabs (same pattern as the licence dashboard)
    const selKey = getSelectedAgency(agencies);
    const tabsHtml = agencies.length > 1
      ? `<div class="admin-tabs ml-agency-tabs" role="tablist">
          ${agencies.map((a) =>
            `<button class="admin-tab${a.key === selKey ? ' is-active' : ''}" data-ml-agency="${esc(a.key)}">${esc(a.name)}</button>`
          ).join('')}
         </div>`
      : '';

    section.innerHTML = `
      <p class="admin-view__title">Meeting Log</p>
      <p class="admin-view__sub">A rolling record of monthly agency oversight meetings — what's going well, what needs attention, and actions agreed. Covers all AI tools, not just Claude.</p>
      ${tabsHtml}
      <div id="mlAgencyContent"></div>`;

    // Tab switching
    section.querySelectorAll('[data-ml-agency]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        section.querySelectorAll('[data-ml-agency]').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        setSelectedAgency(btn.dataset.mlAgency);
        loadMeetingLog(btn.dataset.mlAgency);
      });
    });

    // Wire "add entry" and "save entry" via delegation
    section.addEventListener('click', function(e) {
      if (e.target.closest('.ml-add-btn')) {
        openMeetingEntryForm(null);
      }
      if (e.target.closest('.ml-edit-btn')) {
        const btn = e.target.closest('.ml-edit-btn');
        const entryId = btn.dataset.entry;
        const agencyKey = btn.dataset.agency;
        const entries = _mlCache[agencyKey] || [];
        const entry = entries.find(function(en) { return en._id === entryId; });
        if (entry) openMeetingEntryForm(entry);
      }
      if (e.target.closest('.ml-accordion-head')) {
        const head = e.target.closest('.ml-accordion-head');
        const item = head.closest('.ml-item');
        item.classList.toggle('ml-item--open');
      }
    });

    loadMeetingLog(selKey);
  }

  // Cache so switching tabs doesn't always re-fetch
  var _mlCache = {};

  async function loadMeetingLog(agencyKey) {
    const content = document.getElementById('mlAgencyContent');
    if (!content) return;
    content.innerHTML = '<p class="admin-view__loading">Loading…</p>';

    const adminEmail = getAdminEmail();
    const user = getUser(adminEmail);
    const isSuperAdmin = user && user.access === 'all';

    let entries = _mlCache[agencyKey];
    if (!entries) {
      entries = await fsGetMeetingLog(agencyKey);
      _mlCache[agencyKey] = entries;
    }

    const addBtn = isSuperAdmin
      ? `<button class="btn-sm ml-add-btn" data-agency="${esc(agencyKey)}">+ Add entry</button>`
      : '';

    if (!entries.length) {
      content.innerHTML = `
        <div class="ml-empty">
          <p>No meeting entries yet for this agency.</p>
          ${addBtn}
        </div>`;
      return;
    }

    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    function fmtPeriod(p) {
      if (!p || p.length < 7) return p;
      var m = parseInt(p.slice(5,7), 10) - 1;
      return MONTHS[m] + ' ' + p.slice(0,4);
    }

    const itemsHtml = entries.map(function(en) {
      const editBtn = isSuperAdmin
        ? `<button class="btn-sm btn-sm--outline ml-edit-btn" data-entry="${esc(en._id)}" data-agency="${esc(en.agencyKey || agencyKey)}">Edit</button>`
        : '';
      return `
        <div class="ml-item">
          <div class="ml-accordion-head">
            <span class="ml-item__period">${esc(fmtPeriod(en.period))}</span>
            ${en.meetingDate ? `<span class="ml-item__date">${esc(en.meetingDate)}</span>` : ''}
            <span class="ml-item__chevron">▾</span>
          </div>
          <div class="ml-accordion-body">
            ${en.goingWell ? `
              <div class="ml-field">
                <p class="ml-field__label">Going well</p>
                <p class="ml-field__text">${esc(en.goingWell)}</p>
              </div>` : ''}
            ${en.needsAttention ? `
              <div class="ml-field">
                <p class="ml-field__label">Needs attention</p>
                <p class="ml-field__text">${esc(en.needsAttention)}</p>
              </div>` : ''}
            ${en.actionsAgreed ? `
              <div class="ml-field">
                <p class="ml-field__label">Actions agreed</p>
                <p class="ml-field__text">${esc(en.actionsAgreed)}</p>
              </div>` : ''}
            <div class="ml-field__footer">
              ${en.updatedBy ? `<span>Last updated by ${esc(en.updatedBy)}</span>` : ''}
              ${editBtn}
            </div>
          </div>
        </div>`;
    }).join('');

    content.innerHTML = `
      <div class="ml-header">
        <span class="ml-header__count">${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}</span>
        ${addBtn}
      </div>
      <div class="ml-list">${itemsHtml}</div>`;
  }

  function openMeetingEntryForm(existing) {
    const section = document.getElementById('adminSectionMeetingLog');
    const activeTab = section && section.querySelector('[data-ml-agency].is-active');
    const agencyKey = activeTab ? activeTab.dataset.mlAgency : null;
    if (!agencyKey) return;

    let overlay = document.getElementById('mlModalOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'mlModalOverlay';
      overlay.className = 'ledit-overlay';
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const isEdit = !!existing;
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    function fmtPeriod(p) {
      if (!p || p.length < 7) return p;
      var m = parseInt(p.slice(5,7), 10) - 1;
      return MONTHS[m] + ' ' + p.slice(0,4);
    }

    overlay.innerHTML = `
      <div class="ledit-modal">
        <div class="ledit-modal__header">
          <p class="ledit-modal__title">${isEdit ? 'Edit entry — ' + esc(fmtPeriod(existing.period)) : 'Add meeting entry'}</p>
          <button class="ledit-modal__close" id="mlEditClose" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="ledit-form">
          ${!isEdit ? `
          <div class="ledit-field">
            <label for="mlPeriod">Month</label>
            <input type="month" id="mlPeriod" class="ledit-input" required>
          </div>` : ''}
          <div class="ledit-field">
            <label for="mlMeetingDate">Meeting date <span style="color:var(--c-stone);font-weight:400">(optional)</span></label>
            <input type="text" id="mlMeetingDate" class="ledit-input" placeholder="e.g. 26 June 2026"
              value="${esc(existing ? existing.meetingDate || '' : '')}">
          </div>
          <div class="ledit-field">
            <label for="mlGoingWell">What's going well</label>
            <textarea id="mlGoingWell" class="ledit-input ledit-textarea" rows="4" placeholder="Adoption highlights, strong engagement, wins…">${esc(existing ? existing.goingWell || '' : '')}</textarea>
          </div>
          <div class="ledit-field">
            <label for="mlNeedsAttention">What needs attention</label>
            <textarea id="mlNeedsAttention" class="ledit-input ledit-textarea" rows="4" placeholder="Low adoption, lapsed licences, tooling issues…">${esc(existing ? existing.needsAttention || '' : '')}</textarea>
          </div>
          <div class="ledit-field">
            <label for="mlActionsAgreed">Actions agreed</label>
            <textarea id="mlActionsAgreed" class="ledit-input ledit-textarea" rows="4" placeholder="What was agreed for next time…">${esc(existing ? existing.actionsAgreed || '' : '')}</textarea>
          </div>
          <p id="mlSaveError" style="color:#dc2626;font-size:13px;display:none;margin-top:4px"></p>
        </div>
        <div class="ledit-modal__footer">
          <button class="btn-sm btn-sm--outline" id="mlCancelBtn">Cancel</button>
          <button class="btn-sm" id="mlSaveBtn">${isEdit ? 'Save changes' : 'Save entry'}</button>
        </div>
      </div>`;

    function closeModal() {
      var o = document.getElementById('mlModalOverlay');
      if (o) { o.style.display = 'none'; o.innerHTML = ''; }
      document.body.style.overflow = '';
    }

    document.getElementById('mlEditClose').addEventListener('click', closeModal);
    document.getElementById('mlCancelBtn').addEventListener('click', closeModal);

    document.getElementById('mlSaveBtn').addEventListener('click', async function() {
      const saveBtn = document.getElementById('mlSaveBtn');
      const errEl   = document.getElementById('mlSaveError');
      errEl.style.display = 'none';

      const period = isEdit
        ? existing.period
        : (document.getElementById('mlPeriod').value || '').trim();

      if (!period) {
        errEl.textContent = 'Please select a month.';
        errEl.style.display = '';
        return;
      }

      const data = {
        meetingDate:    (document.getElementById('mlMeetingDate').value    || '').trim(),
        goingWell:      (document.getElementById('mlGoingWell').value      || '').trim(),
        needsAttention: (document.getElementById('mlNeedsAttention').value || '').trim(),
        actionsAgreed:  (document.getElementById('mlActionsAgreed').value  || '').trim(),
      };

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      try {
        await fsSetMeetingEntry(agencyKey, period, data);
        // Invalidate cache and reload
        delete _mlCache[agencyKey];
        closeModal();
        await loadMeetingLog(agencyKey);
      } catch (e) {
        console.error('fsSetMeetingEntry failed:', e);
        errEl.textContent = 'Save failed — please try again.';
        errEl.style.display = '';
        saveBtn.disabled = false;
        saveBtn.textContent = isEdit ? 'Save changes' : 'Save entry';
      }
    });
  }

  function renderSiteContent() {
    const wrap = document.getElementById('adminSectionContent');
    if (!wrap) return;
    if (!document.getElementById('adminContentSubnav')) {
      wrap.innerHTML = `
        <div id="adminContentSubnav" style="display:flex;gap:8px;margin-bottom:18px;">
          <button type="button" class="btn-sm btn-sm--primary" data-content-tab="news">News Feed</button>
          <button type="button" class="btn-sm btn-sm--ghost" data-content-tab="use-cases">Use Cases</button>
        </div>
        <div id="adminContentNews"></div>
        <div id="adminContentUseCases" style="display:none"></div>`;
      wrap.querySelectorAll('[data-content-tab]').forEach(btn => {
        btn.addEventListener('click', () => switchContentTab(btn.dataset.contentTab));
      });
      switchContentTab('news');
    } else {
      // Re-entering the section: re-render the tab that's currently active
      // so it reflects any changes made elsewhere.
      const active = document.querySelector('#adminContentSubnav .btn-sm--primary');
      switchContentTab(active ? active.dataset.contentTab : 'news');
    }
  }

  function switchContentTab(tab) {
    document.querySelectorAll('#adminContentSubnav [data-content-tab]').forEach(btn => {
      const isActive = btn.dataset.contentTab === tab;
      btn.classList.toggle('btn-sm--primary', isActive);
      btn.classList.toggle('btn-sm--ghost', !isActive);
    });
    const newsEl = document.getElementById('adminContentNews');
    const ucEl   = document.getElementById('adminContentUseCases');
    if (newsEl) newsEl.style.display = tab === 'news' ? '' : 'none';
    if (ucEl)   ucEl.style.display   = tab === 'use-cases' ? '' : 'none';
    if (tab === 'news' && typeof window.renderAdminNewsEditor === 'function') {
      window.renderAdminNewsEditor();
    }
    if (tab === 'use-cases' && typeof window.renderAdminUseCaseEditor === 'function') {
      window.renderAdminUseCaseEditor();
    }
  }

  // ── Helpers ───────────────────────────────────────────

  // Loads the caller's own /admins/{email} doc. Required first step
  // because the rule allows a `get` on the caller's own doc by ID but
  // denies an unconstrained `list` on /admins for agency-scoped admins
  // (Firestore can't prove the LIST won't return docs the caller
  // shouldn't see). We need the access level from this doc to decide
  // which collection-level queries are safe.
  async function loadOwnProfile() {
    if (_cachedOwnProfile) {
      console.log('⚡️ [Cache] Reused profile from memory, skipped Firestore network trip!');
      return _cachedOwnProfile;
    }
    const db = fsDb ? fsDb() : (typeof firebase !== 'undefined' ? firebase.firestore() : null);
    if (!db) return null;
    const email = firebase.auth().currentUser && firebase.auth().currentUser.email
      ? firebase.auth().currentUser.email.toLowerCase()
      : null;
    if (!email) return null;
    try {
      const snap = await db.collection('admins').doc(email).get();
      if (!snap.exists) return null;
      const data = snap.data() || {};
      _cachedOwnProfile = {
        email:  email,
        name:   data.name   || '',
        access: data.access || 'agency',
        agency: data.agency || undefined,
      };
      console.log('✅ [Cache] Fetched profile from loadOwnProfile and saved to memory');
      return _cachedOwnProfile;
    } catch (e) {
      console.warn('loadOwnProfile failed:', e);
      return null;
    }
  }

  // Loads the merged admin user list:
  //   base = /admins collection (full LIST for full-access admins; just
  //          own doc for agency admins, because Firestore denies the
  //          unconstrained LIST for them)
  //   overrides = /agency_admins/{key}.admins (per-agency runtime list)
  // Merge preserves Tess's pattern from the previous version: per-agency
  // overrides REPLACE static admins for that agency; agencies with no
  // override fall through to the base /admins data.
  async function loadAdminUsers() {
    const db = fsDb ? fsDb() : (typeof firebase !== 'undefined' ? firebase.firestore() : null);
    if (!db) return [];

    // 1) Own profile — required to know if we can LIST or must fetch by ID.
    const own = await loadOwnProfile();
    if (!own) return [];
    const isFullAccess = own.access === 'all' || own.access === 'finance';

    // 2) Base admin set. Branches on access level so the query Firestore
    // sees is one its rules can validate.
    let baseAdmins;
    if (isFullAccess) {
      try {
        const snap = await db.collection('admins').get();
        baseAdmins = snap.docs.map(function(d) {
          const data = d.data() || {};
          return {
            email:  d.id,
            name:   data.name   || '',
            access: data.access || 'agency',
            agency: data.agency || undefined,
            homeAgency: data.homeAgency || undefined,
          };
        });
      } catch (e) {
        console.warn('loadAdminUsers /admins list failed:', e);
        baseAdmins = [own];
      }
    } else {
      // Agency-scoped admin can only read their own profile by ID. They
      // see other admins for their agency through agency_admins overrides.
      baseAdmins = [own];
    }

    const superAdmins        = baseAdmins.filter(function(u) { return u.access === 'all'; });
    const financeAdmins      = baseAdmins.filter(function(u) { return u.access === 'finance'; });
    const baseAgencyAdmins   = baseAdmins.filter(function(u) { return u.access === 'agency'; });
    const agencyKeys         = [...new Set(baseAgencyAdmins.map(function(u) { return u.agency; }))];

    if (typeof fsGetAgencyAdminOverrides !== 'function') {
      return [...superAdmins, ...financeAdmins, ...baseAgencyAdmins];
    }

    try {
      // Branch: full-access admins can LIST /agency_admins; agency-scoped
      // admins can only fetch their own agency's override doc by ID.
      const overrides = isFullAccess
        ? await fsGetAgencyAdminOverrides()
        : (own.agency && typeof fsGetAgencyAdminsForAgency === 'function'
            ? await fsGetAgencyAdminsForAgency(own.agency)
            : {});
      const merged = [...superAdmins];

      // Finance: override if present, else base
      if (overrides['finance']) {
        overrides['finance'].forEach(function(a) {
          merged.push({ name: a.name, email: a.email, access: 'finance' });
        });
      } else {
        merged.push(...financeAdmins);
      }

      // Per-agency: override replaces base when present
      agencyKeys.forEach(function(key) {
        if (overrides[key]) {
          overrides[key].forEach(function(a) {
            merged.push({ name: a.name, email: a.email, access: 'agency', agency: key });
          });
        } else {
          baseAgencyAdmins.filter(function(u) { return u.agency === key; }).forEach(function(u) { merged.push(u); });
        }
      });

      // Any override agency that wasn't in the base
      Object.keys(overrides).forEach(function(key) {
        if (key !== 'finance' && !agencyKeys.includes(key)) {
          overrides[key].forEach(function(a) {
            merged.push({ name: a.name, email: a.email, access: 'agency', agency: key });
          });
        }
      });

      return merged;
    } catch (e) {
      console.warn('loadAdminUsers overrides read failed:', e);
      return [...superAdmins, ...financeAdmins, ...baseAgencyAdmins];
    }
  }

  // Loads the merged licence data:
  //   base = /agencies (full LIST for full-access; own agency by ID for
  //          agency-scoped — Firestore denies the unconstrained LIST when
  //          the rule's canAccessAgency() can't be proven safe for all docs)
  //   overrides = /license_overrides (Tess's per-tool runtime edits)
  // Override merge preserves the existing logic — including re-applying
  // joinedAt from base holders so edits don't strip the join date.
  async function loadLicenseData() {
    const db = fsDb ? fsDb() : (typeof firebase !== 'undefined' ? firebase.firestore() : null);
    if (!db) return { agencies: [] };

    // 1) Own profile to determine which query strategy is safe.
    const own = await loadOwnProfile();
    if (!own) return { agencies: [] };
    const isFullAccess = own.access === 'all' || own.access === 'finance';

    // 2) Base agency data. Branches on access level.
    let baseAgencies = [];
    if (isFullAccess) {
      try {
        const snap = await db.collection('agencies').get();
        baseAgencies = snap.docs.map(function(d) {
          const data = d.data() || {};
          return {
            key:   data.key   || d.id,
            name:  data.name  || d.id,
            tools: Array.isArray(data.tools) ? data.tools : [],
          };
        });
      } catch (e) {
        console.warn('loadLicenseData /agencies list failed:', e);
      }
    } else if (own.agency) {
      // Agency-scoped admin: fetch just their own agency by ID.
      try {
        const snap = await db.collection('agencies').doc(own.agency).get();
        if (snap.exists) {
          const data = snap.data() || {};
          baseAgencies = [{
            key:   data.key   || snap.id,
            name:  data.name  || snap.id,
            tools: Array.isArray(data.tools) ? data.tools : [],
          }];
        }
      } catch (e) {
        console.warn('loadLicenseData own-agency read failed:', e);
      }
    }
    const base = { agencies: baseAgencies };

    if (typeof fsGetLicenseOverrides !== 'function') return base;
    try {
      // Branch: full-access uses unconstrained LIST; agency-scoped uses
      // the where('agencyKey', '==', own.agency) variant matching the
      // /license_overrides allow list rule.
      const overrides = isFullAccess
        ? await fsGetLicenseOverrides()
        : (own.agency && typeof fsGetLicenseOverridesForAgency === 'function'
            ? await fsGetLicenseOverridesForAgency(own.agency)
            : {});
      // Read when admin-data.js was last seeded into Firestore — more accurate
      // than override timestamps, which only update when edited via the UI.
      try {
        const metaDoc = await db.collection('_meta').doc('licence_data').get();
        if (metaDoc.exists && metaDoc.data().seededAt) {
          const ts = metaDoc.data().seededAt;
          base.lastUpdated = ts.toDate ? ts.toDate() : new Date(ts);
        }
      } catch (_) { /* non-fatal */ }

      Object.values(overrides).forEach(function(override) {
        const agency = base.agencies.find(function(a) { return a.key === override.agencyKey; });
        if (!agency) return;
        const toolData = Object.assign({}, override);
        delete toolData.agencyKey; delete toolData.toolName; delete toolData.updatedAt;
        const idx = agency.tools.findIndex(function(t) { return t.name === override.toolName; });
        if (idx >= 0) {
          // Re-apply joinedAt from base holders (matched by email) so edits don't lose it
          const baseAgency = baseAgencies.find(function(a) { return a.key === override.agencyKey; });
          const baseTool   = baseAgency && baseAgency.tools.find(function(t) { return t.name === override.toolName; });
          if (baseTool && toolData.holders && baseTool.holders) {
            toolData.holders = toolData.holders.map(function(h) {
              const baseH = baseTool.holders.find(function(sh) { return sh.email === h.email; });
              return (baseH && baseH.joinedAt) ? Object.assign({}, h, { joinedAt: baseH.joinedAt }) : h;
            });
          }
          agency.tools[idx] = toolData;
        } else { agency.tools.push(toolData); }
      });
      // Take whichever is more recent: last UI edit or last seed run
      if (latestUpdatedAt) {
        if (!base.lastUpdated || latestUpdatedAt > base.lastUpdated) {
          base.lastUpdated = latestUpdatedAt;
        }
      }
    } catch (e) { /* base only */ }
    return base;
  }

  function allAdmins() { return _adminUsers; }

  function getUser(email) {
    return allAdmins().find(function(u) { return u.email === email; }) || null;
  }

  function visibleFor(user) {
    const data = _licenseData;
    return (user.access === 'all' || user.access === 'finance')
      ? data.agencies
      : data.agencies.filter(a => a.key === user.agency);
  }

  // ── Content rendering ─────────────────────────────────

  function renderContent() {
    const body = document.getElementById('adminPanelBody');
    if (!body) return;

    // M-3: SSO_KEY is now a boolean signal only; the actual email comes from
    // Firebase Auth via hubGetEmail(). Treat the boolean as "did the user
    // sign in on a previous load?" and read the email from the auth state.
    const signedInCached = !!localStorage.getItem(SSO_KEY);
    const ssoEmail       = (typeof hubGetEmail === 'function') ? (hubGetEmail() || null) : null;

    // M-3 Part 2: STORAGE_KEY is now a presence flag; email comes from
    // Firebase Auth. getAdminEmail() returns '' if the flag isn't set OR if
    // auth hasn't initialised yet — both cases were previously represented
    // by getItem() returning null, so downstream logic is unchanged.
    const email = getAdminEmail();
    // STORAGE_KEY is set by autoAuthFromSSO only after confirming a /admins
    // doc exists for the email. So if it's present we know the email IS an
    // admin — we just may not have loaded their profile into _adminUsers yet.
    const cached = email ? getUser(email) : null;

    if (cached) {
      const agencies = visibleFor(cached);
      body.innerHTML = buildAdminView(cached, agencies);
      if (agencies.length > 0) renderAgencyContent(getSelectedAgency(agencies));
      // Super admins land on Group AI Progress (the group-wide view) rather
      // than Licences. buildAdminView already marks the nav button active and
      // leaves the Licences panel visible; switchSection swaps the panels to
      // match. Everyone else stays on the default Licences view.
      if (cached.access === 'all') switchSection('group-progress');
    } else if (email) {
      // STORAGE_KEY set but _adminUsers cache empty — between auth and load.
      body.innerHTML = '<div class="admin-loading" style="padding:48px 24px;text-align:center;color:var(--c-stone);">Loading admin dashboard…</div>';
    } else if (_authChecking && (ssoEmail || signedInCached)) {
      // We know (or strongly suspect) the user is signed in, but we don't yet
      // know if they're an admin. signedInCached covers the gap between page
      // load and firebase.auth().currentUser becoming available — without it
      // post-M-3 we'd briefly render the signed-out view on every fresh load.
      body.innerHTML = '<div class="admin-loading" style="padding:48px 24px;text-align:center;color:var(--c-stone);">Verifying admin access…</div>';
    } else if (ssoEmail) {
      body.innerHTML = buildSignedInView(ssoEmail);
    } else {
      body.innerHTML = buildSignedOutView();
    }
  }

  function buildSignedInView(email) {
    return `
      <div class="admin-user-bar">
        <span class="admin-user-bar__email">${esc(email)}</span>
        <button class="admin-signout">Sign out</button>
      </div>
      <div class="admin-login" style="min-height:40vh;">
        <div class="admin-login__icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <p class="admin-login__title">You're signed in</p>
        <p class="admin-login__sub">You don't currently have admin access to the licence dashboard. Contact the AI team if you need access.</p>
      </div>`;
  }

  // Fallback view when no SSO session is present. In normal usage the auth
  // overlay in js/auth.js blocks the entire page before we reach this point,
  // so this is a defensive empty state rather than a real workflow.
  function buildSignedOutView() {
    return `
      <div class="admin-login">
        <div class="admin-login__icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <p class="admin-login__title">Sign in required</p>
        <p class="admin-login__sub">Sign in with your Miroma Group account to continue.</p>
      </div>`;
  }

  function buildAdminView(user, agencies) {
    const isSuperAdmin = user.access === 'all';
    const selKey = getSelectedAgency(agencies);
    const tabsHtml = agencies.length > 1
      ? `<div class="admin-tabs" role="tablist">
          ${agencies.map((a) =>
            `<button class="admin-tab${a.key === selKey ? ' is-active' : ''}" data-agency="${esc(a.key)}" role="tab">${esc(a.name)}</button>`
          ).join('')}
         </div>`
      : '';

    return `
      <div class="admin-user-bar">
        <span class="admin-user-bar__email">${esc(user.email)}</span>
        <button class="admin-signout">Sign out</button>
      </div>
      <div class="admin-section-nav">
        <!-- Group AI Progress leads for super admins — the group-wide landing view. -->
        ${user.access === 'all' ? '<button class="admin-section-btn is-active" data-section="group-progress">Group AI Progress</button>' : ''}
        <!-- Agency-filtered sections (they share one agency selection). -->
        <button class="admin-section-btn${user.access === 'all' ? '' : ' is-active'}" data-section="licenses">Licences</button>
        ${user.access !== 'finance' ? '<button class="admin-section-btn" data-section="usage-reports">Usage Reports</button>' : ''}
        ${user.access !== 'finance' ? '<button class="admin-section-btn" data-section="meeting-log">Meeting Log</button>' : ''}
        <!-- Remaining sections. -->
        ${(user.access === 'all' || user.access === 'finance') ? '<button class="admin-section-btn" data-section="group-overview">Group Spend</button>' : ''}
        ${user.access === 'all' ? '<button class="admin-section-btn" data-section="activity">AI Hub Engagement</button>' : ''}
        ${user.access !== 'finance' ? '<button class="admin-section-btn" data-section="roi-stories">AI Impact Stories</button>' : ''}
        ${user.access === 'all' ? '<button class="admin-section-btn" data-section="site-content">Site Content</button>' : ''}
      </div>
      <div id="adminSectionLicenses">
        <p class="admin-view__title">License Dashboard</p>
        <p class="admin-view__sub">License holders, costs and renewal dates by agency. Super admins and finance admins see all agencies; agency admins see their own agency only.</p>
        ${tabsHtml}
        <div id="adminAgencyContent"></div>
      </div>
      <div id="adminSectionActivity" style="display:none"></div>
      <div id="adminSectionGroupProgress" style="display:none"></div>
      <div id="adminSectionROI" style="display:none"></div>
      <div id="adminSectionGroupOverview" style="display:none"></div>
      <div id="adminSectionUsageReports" style="display:none"></div>
      <div id="adminSectionMeetingLog" style="display:none"></div>
      <div id="adminSectionContent" style="display:none"></div>`;
  }

  // ── Onboarding & Offboarding section ──────────────────

  // ── AI Impact Stories ─────────────────────────────────

  function renderROIStories() {
    const section = document.getElementById('adminSectionROI');
    if (!section) return;
    section.innerHTML = '<p class="admin-view__loading">Loading stories…</p>';

    // M-3 Part 2: getAdminEmail() gates on the STORAGE_KEY presence flag and
    // reads the email from Firebase Auth — same gating logic as before, no
    // PII in localStorage. Returns '' for non-admins or pre-auth race; the
    // !_user guard below handles both.
    const email      = getAdminEmail();
    const _user      = getUser(email);
    if (!_user) return;
    const agencies   = visibleFor(_user);
    const myAgencyKeys = _user.access === 'all' ? null : agencies.map(a => a.key);

    if (typeof fsGetROIStories !== 'function') {
      section.innerHTML = '<p class="admin-view__loading">AI Impact Stories not available.</p>';
      return;
    }

    // Single source of truth — Firebase Auth via getAdminEmail() (was a
    // hubGetEmail / STORAGE_KEY fallback chain before M-3 Part 2; collapsed
    // now that STORAGE_KEY no longer carries an email value).
    const currentEmail = getAdminEmail().toLowerCase();

    // Fetch all stories; agency admins see all shareable stories + their own agency's private ones
    fsGetROIStories(null).then(function(allStories) {
      const stories = myAgencyKeys
        ? allStories.filter(s => myAgencyKeys.includes(s.agencyKey) || s.shareable !== false)
        : allStories;
      const WITHOUT_AI_LABEL = {
        'impossible':    'Couldn\'t have happened without AI',
        'not-viable':    'Wouldn\'t have been viable without AI',
        'slower':        'Would have taken significantly longer without AI',
        'lower-quality': 'Would have been lower quality without AI',
        'same':          'Would have happened roughly the same way',
      };

      function storyCard(s) {
        const date       = s.submittedAt ? new Date(s.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
        const isOwner    = currentEmail && s.email && currentEmail === s.email.toLowerCase();
        const isFeatured = s.status === 'featured';
        const safeLink   = s.supportingLink && s.supportingLink.startsWith('https://') ? s.supportingLink : null;
        const aiLabel    = WITHOUT_AI_LABEL[s.withoutAI];
        const isStrongWin = s.withoutAI === 'impossible' || s.withoutAI === 'not-viable';

        const toolTags   = (s.tools || []).map(t => `<span class="roi-story__tag roi-story__tag--tool">${esc(t)}</span>`).join('');
        const impactTags = (s.impactTypes || []).map(t => `<span class="roi-story__tag roi-story__tag--impact">${esc(t)}</span>`).join('');

        return `
          <div class="roi-story${isFeatured ? ' roi-story--featured' : ''}" data-id="${s.id}">
            <div class="roi-story__header">
              <div class="roi-story__header-meta">
                ${isFeatured ? `<span class="roi-story__featured-label">★ Featured</span>` : ''}
                ${s.businessArea ? `<span class="roi-story__area-badge">${esc(s.businessArea)}</span>` : ''}
                <div class="roi-story__byline">
                  <strong class="roi-story__agency">${esc(s.agency || s.agencyKey || '—')}</strong>
                  <span class="roi-story__sep">·</span>
                  <span>${esc(s.client || '—')}</span>
                  <span class="roi-story__sep">·</span>
                  <span>${date}</span>
                </div>
              </div>
              ${s.commercialValue ? `<div class="roi-story__value-stat">${esc(s.commercialValue)}</div>` : ''}
            </div>
            <div class="roi-story__body">
              <h3 class="roi-story__headline">${esc(s.title || s.goal || '—')}</h3>
              ${s.title && s.goal ? `<p class="roi-story__goal">${esc(s.goal)}</p>` : ''}
              ${s.timeSaved ? `<p class="roi-story__time-saved">⏱ ${esc(s.timeSaved)} saved</p>` : ''}
              <p class="roi-story__detail">${esc(s.detail || '')}</p>
              ${s.clientQuote ? `<blockquote class="roi-story__quote">${esc(s.clientQuote)}</blockquote>` : ''}
              ${(toolTags || impactTags) ? `<div class="roi-story__tags">${toolTags}${impactTags}</div>` : ''}
              <div class="roi-story__footer">
                ${safeLink ? `<a class="roi-story__link" href="${esc(safeLink)}" target="_blank" rel="noopener noreferrer">View supporting material ↗</a>` : '<span></span>'}
                <span class="roi-story__submitted">
                  ${esc(s.name || s.email || '—')}${s.role ? ` · ${esc(s.role)}` : ''}
                  ${s.shareable === false
                    ? `<span class="roi-story__consent roi-story__consent--no">Not for sharing</span>`
                    : `<span class="roi-story__consent roi-story__consent--yes">Happy to share</span>`}
                </span>
                <div class="roi-story__actions">
                  ${!isFeatured ? `<button class="btn-sm btn-sm--primary roi-action" data-id="${s.id}" data-status="featured">Feature</button>` : ''}
                  ${isFeatured  ? `<button class="btn-sm btn-sm--ghost roi-action" data-id="${s.id}" data-status="active">Unfeature</button>` : ''}
                  ${isOwner ? `<button class="btn-sm btn-sm--outline roi-edit-btn" data-story='${JSON.stringify(s).replace(/'/g, '&#39;')}'>Edit</button>` : ''}
                </div>
              </div>
            </div>
            ${aiLabel ? `<div class="roi-story__verdict${isStrongWin ? ' roi-story__verdict--strong' : ''}">${aiLabel.toUpperCase()}</div>` : ''}
          </div>`;
      }

      const featured = stories.filter(s => s.status === 'featured');
      const rest     = stories.filter(s => s.status !== 'featured');

      const submitBtn = `<a href="share-a-win.html" class="btn-sm btn-sm--primary" style="margin-left:auto;text-decoration:none;white-space:nowrap;">Submit a Win →</a>`;

      if (!stories.length) {
        section.innerHTML = `
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:4px;">
            <p class="admin-view__title" style="margin:0;">AI Impact Stories</p>
            ${submitBtn}
          </div>
          <p class="admin-view__sub">No stories submitted yet. Super admins see all stories. Agency admins see all shareable stories plus their own agency's private submissions.</p>`;
        return;
      }

      section.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:4px;">
          <p class="admin-view__title" style="margin:0;">AI Impact Stories</p>
          ${submitBtn}
        </div>
        <p class="admin-view__sub">${stories.length} submission${stories.length !== 1 ? 's' : ''} — ${featured.length} featured. Super admins see all stories. Agency admins see all shareable stories plus their own agency's private submissions.</p>
        ${featured.length  ? `<h3 class="roi-group-label">Featured</h3>${featured.map(storyCard).join('')}`  : ''}
        ${rest.length      ? `<h3 class="roi-group-label">All Stories</h3>${rest.map(storyCard).join('')}`   : ''}`;

      section.querySelectorAll('.roi-action').forEach(function(btn) {
        btn.addEventListener('click', function() {
          const id     = btn.dataset.id;
          const status = btn.dataset.status;
          btn.disabled = true;
          fsUpdateROIStoryStatus(id, status)
            .then(function() { renderROIStories(); })
            .catch(function() { btn.disabled = false; });
        });
      });

      section.querySelectorAll('.roi-edit-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          const story = JSON.parse(btn.dataset.story);
          openROIEditModal(story);
        });
      });
    }).catch(function() {
      section.innerHTML = '<p class="admin-view__loading">Failed to load stories.</p>';
    });
  }

  // ── ROI Edit Modal ────────────────────────────────────

  const ROI_TOOLS        = ['Claude', 'LTX Studio', 'Descript', 'Springboards', 'Fireflies', 'Gemini', 'Writer', 'Custom automation', 'Other'];
  const ROI_IMPACT_TYPES = ['Production cost reduced', 'Faster turnaround', 'Team time saved', 'New revenue', 'Client satisfaction'];

  function openROIEditModal(story) {
    let overlay = document.getElementById('roiEditOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'roiEditOverlay';
      overlay.className = 'roi-edit-overlay';
      document.body.appendChild(overlay);
    }

    const toolCheckboxes = ROI_TOOLS.map(function(t) {
      const checked = (story.tools || []).includes(t) ? 'checked' : '';
      return `<label class="roi-edit-check"><input type="checkbox" name="tools" value="${t}" ${checked}> ${t}</label>`;
    }).join('');

    const impactCheckboxes = ROI_IMPACT_TYPES.map(function(t) {
      const checked = (story.impactTypes || []).includes(t) ? 'checked' : '';
      return `<label class="roi-edit-check"><input type="checkbox" name="impactTypes" value="${t}" ${checked}> ${t}</label>`;
    }).join('');

    overlay.innerHTML = `
      <div class="roi-edit-modal">
        <div class="roi-edit-modal__header">
          <p class="roi-edit-modal__title">Edit Story</p>
          <button class="roi-edit-modal__close" id="roiEditClose" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <form id="roiEditForm" class="roi-edit-form">
          <div class="roi-edit-field">
            <label>Title</label>
            <input type="text" name="title" value="${esc(story.title || '')}" required>
          </div>
          <div class="roi-edit-field">
            <label>Client</label>
            <input type="text" name="client" value="${esc(story.client || '')}" required>
          </div>
          <div class="roi-edit-field">
            <label>Business area</label>
            <select name="businessArea">
              <option value="">Select one</option>
              ${['Strategy','Creative','Media / Planning','PR & Comms','Account Management','Production','New Business / Pitch','Operations','Data & Insights','Finance','Legal','Technology & Development','Other'].map(function(a) {
                return `<option value="${a}" ${story.businessArea === a ? 'selected' : ''}>${a}</option>`;
              }).join('')}
            </select>
          </div>
          <div class="roi-edit-field">
            <label>Goal</label>
            <textarea name="goal" rows="2">${esc(story.goal || '')}</textarea>
          </div>
          <div class="roi-edit-field">
            <label>Tools used</label>
            <div class="roi-edit-checks">${toolCheckboxes}</div>
          </div>
          <div class="roi-edit-field">
            <label>Impact types</label>
            <div class="roi-edit-checks">${impactCheckboxes}</div>
          </div>
          <div class="roi-edit-field">
            <label>Commercial value (e.g. £25,000)</label>
            <input type="text" name="commercialValue" value="${esc(story.commercialValue || '')}">
          </div>
          <div class="roi-edit-field">
            <label>Estimated time saved (optional)</label>
            <input type="text" name="timeSaved" placeholder="e.g. 2 days, 6 hours" value="${esc(story.timeSaved || '')}">
          </div>
          <div class="roi-edit-field">
            <label>Would this have happened without AI?</label>
            <select name="withoutAI">
              <option value="impossible"   ${story.withoutAI === 'impossible'   ? 'selected' : ''}>Wouldn't have been possible — AI unlocked a new capability</option>
              <option value="not-viable"   ${story.withoutAI === 'not-viable'   ? 'selected' : ''}>Wouldn't have been viable — too expensive or time-intensive without AI</option>
              <option value="slower"       ${story.withoutAI === 'slower'       ? 'selected' : ''}>Would have happened, but taken significantly longer</option>
              <option value="lower-quality" ${story.withoutAI === 'lower-quality' ? 'selected' : ''}>Would have happened, but at lower quality</option>
              <option value="same"         ${story.withoutAI === 'same'         ? 'selected' : ''}>Would have happened roughly the same way</option>
            </select>
          </div>
          <div class="roi-edit-field">
            <label>Story detail</label>
            <textarea name="detail" rows="5">${esc(story.detail || '')}</textarea>
          </div>
          <div class="roi-edit-field">
            <label>Client or stakeholder quote (optional)</label>
            <textarea name="clientQuote" rows="2">${esc(story.clientQuote || '')}</textarea>
          </div>
          <div class="roi-edit-field">
            <label>Supporting link (optional)</label>
            <input type="url" name="supportingLink" placeholder="https://…" value="${esc(story.supportingLink || '')}">
          </div>
          <p class="roi-edit-error" id="roiEditError" style="display:none;color:var(--c-coral,#e55);font-size:13px;margin:0;"></p>
          <div class="roi-edit-modal__footer">
            <button type="button" class="btn-sm btn-sm--ghost" id="roiEditCancel">Cancel</button>
            <button type="submit" class="btn-sm btn-sm--primary" id="roiEditSubmit">Save changes</button>
          </div>
        </form>
      </div>`;

    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    overlay.querySelector('#roiEditClose').addEventListener('click', closeROIEditModal);
    overlay.querySelector('#roiEditCancel').addEventListener('click', closeROIEditModal);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeROIEditModal(); });

    overlay.querySelector('#roiEditForm').addEventListener('submit', function(e) {
      e.preventDefault();
      const form       = e.target;
      const submitBtn  = form.querySelector('#roiEditSubmit');
      const errEl      = form.querySelector('#roiEditError');
      const tools      = [...form.querySelectorAll('[name="tools"]:checked')].map(function(el) { return el.value; });
      const impactTypes = [...form.querySelectorAll('[name="impactTypes"]:checked')].map(function(el) { return el.value; });

      submitBtn.disabled    = true;
      submitBtn.textContent = 'Saving…';
      errEl.style.display   = 'none';

      fsUpdateROIStory(story.id, {
        title:           form.querySelector('[name="title"]').value.trim(),
        client:          form.querySelector('[name="client"]').value.trim(),
        businessArea:    form.querySelector('[name="businessArea"]').value,
        goal:            form.querySelector('[name="goal"]').value.trim(),
        tools:           tools,
        impactTypes:     impactTypes,
        commercialValue: form.querySelector('[name="commercialValue"]').value.trim(),
        timeSaved:       form.querySelector('[name="timeSaved"]').value.trim(),
        withoutAI:       form.querySelector('[name="withoutAI"]').value,
        detail:          form.querySelector('[name="detail"]').value.trim(),
        clientQuote:     form.querySelector('[name="clientQuote"]').value.trim(),
        supportingLink:  form.querySelector('[name="supportingLink"]').value.trim(),
      }).then(function() {
        closeROIEditModal();
        renderROIStories();
      }).catch(function() {
        errEl.textContent   = 'Something went wrong — please try again.';
        errEl.style.display = 'block';
        submitBtn.disabled    = false;
        submitBtn.textContent = 'Save changes';
      });
    });
  }

  function closeROIEditModal() {
    const overlay = document.getElementById('roiEditOverlay');
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  // ── Group Overview ────────────────────────────────────

  function renderGroupOverview() {
    const section = document.getElementById('adminSectionGroupOverview');
    if (!section || !_licenseData.agencies.length) return;

    const fmt = function(n) { return n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

    // 1 — Cross-tool spend summary
    const liveData = _licenseData;
    const toolMap = {};
    liveData.agencies.forEach(function(agency) {
      agency.tools.forEach(function(tool) {
        if (!toolMap[tool.name]) toolMap[tool.name] = { name: tool.name, seats: 0, monthly: 0, annual: 0, agencyCount: 0, currency: tool.currency || '£' };
        toolMap[tool.name].seats   += tool.seats        || 0;
        toolMap[tool.name].monthly += tool.monthlyTotal || 0;
        toolMap[tool.name].annual  += tool.annualTotal  || 0;
        toolMap[tool.name].agencyCount++;
      });
    });
    const toolRows = Object.values(toolMap).filter(function(t) { return t.seats > 0; }).sort(function(a, b) { return b.monthly - a.monthly; });
    const grandMonthly = toolRows.reduce(function(s, t) { return s + t.monthly; }, 0);
    const grandAnnual  = toolRows.reduce(function(s, t) { return s + t.annual;  }, 0);

    const toolTableHtml = `
      <div class="go-section">
        <h3 class="go-section__title">Spend by Tool</h3>
        <table class="go-table">
          <thead><tr><th>Tool</th><th>Agencies</th><th>Seats</th><th>Monthly</th><th>Annual</th></tr></thead>
          <tbody>
            ${toolRows.map(function(t) {
              return `<tr><td><strong>${esc(t.name)}</strong></td><td>${t.agencyCount}</td><td>${t.seats}</td><td>${esc(t.currency)}${fmt(t.monthly)}</td><td>${esc(t.currency)}${fmt(t.annual)}</td></tr>`;
            }).join('')}
          </tbody>
          <tfoot><tr><td colspan="3"><strong>Total</strong></td><td><strong>£${fmt(grandMonthly)}</strong></td><td><strong>£${fmt(grandAnnual)}</strong></td></tr></tfoot>
        </table>
      </div>`;


    // 4 — Seat utilisation
    const utilRows = [];
    liveData.agencies.forEach(function(agency) {
      agency.tools.forEach(function(tool) {
        if (!tool.seats) return;
        const filled = tool.holders.length;
        const pct    = Math.round((filled / tool.seats) * 100);
        utilRows.push({ agency: agency.name, tool: tool.name, seats: tool.seats, filled: filled, pct: pct, gap: tool.seats - filled });
      });
    });
    utilRows.sort(function(a, b) { return a.pct - b.pct; });
    const utilRowsFiltered = utilRows.filter(function(r) { return r.gap > 0; });

    const utilHtml = `
      <div class="go-section">
        <h3 class="go-section__title">Seat Utilisation</h3>
        <table class="go-table">
          <thead><tr><th>Agency</th><th>Tool</th><th>Seats Paid</th><th>Holders Named</th><th>Utilisation</th></tr></thead>
          <tbody>
            ${utilRowsFiltered.map(function(r) {
              const warn = r.gap > 0;
              return `<tr${warn ? ' class="go-table__row--warn"' : ''}>
                <td>${esc(r.agency)}</td><td>${esc(r.tool)}</td><td>${r.seats}</td>
                <td>${r.filled}${warn ? ` <span class="go-gap-badge">${r.gap} unfilled</span>` : ''}</td>
                <td>
                  <div class="go-util-bar"><div class="go-util-bar__fill${warn ? ' go-util-bar__fill--warn' : ''}" style="width:${r.pct}%"></div></div>
                  <span class="go-util-pct">${r.pct}%</span>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    section.innerHTML = `
      <p class="admin-view__title">Group Spend</p>
      <p class="admin-view__sub">Licence spend and seat utilisation across all agencies. Visible to super admins and finance admins.</p>
      ${toolTableHtml}${utilHtml}
      <div id="ltxGroupMount"></div>`;

    loadLtxGroupOverview(liveData.agencies);
  }

  async function loadLtxGroupOverview(agencies) {
    const mount = document.getElementById('ltxGroupMount');
    if (!mount) return;
    const snapshots = await fsGetAllLtxSnapshots(agencies);
    if (!snapshots.length) { mount.innerHTML = ''; return; }

    const CREDITS_PER_SEAT = 1263158;
    const MONTH_ELAPSED = 6;
    const EXPECTED_PCT = Math.round((MONTH_ELAPSED / 12) * 100);

    snapshots.sort(function (a, b) {
      return (b.data.summary.total_tokens || 0) - (a.data.summary.total_tokens || 0);
    });

    let totalUsed = 0, totalAllocation = 0;
    const sortedRows = snapshots.map(function (s) {
      const agencyLicData = (agencies || []).find(function (a) { return a.key === s.agencyKey; });
      const ltxTool = agencyLicData ? (agencyLicData.tools || []).find(function (t) { return t.name === 'LTX Studio'; }) : null;
      const seats = ltxTool ? (ltxTool.seats || 0) : 0;
      const allocation = seats * CREDITS_PER_SEAT;
      const used = (s.data.summary && s.data.summary.total_tokens) || 0;
      const activeUsers = (s.data.summary && s.data.summary.active_users) || 0;
      const pctUsed = allocation ? (used / allocation * 100) : 0;
      const isLow = pctUsed < EXPECTED_PCT - 10;
      const barW = Math.min(pctUsed, 100).toFixed(1);
      const badgeStyle = isLow
        ? 'background:#fef3c7;color:#92400e'
        : 'background:#d1fae5;color:#065f46';
      totalUsed += used;
      totalAllocation += allocation;
      return (
        '<div style="display:grid;grid-template-columns:160px 48px 1fr 100px 100px 68px;gap:8px;align-items:center;padding:8px 0;border-bottom:0.5px solid var(--c-grey-light,#f0ede8)">' +
          '<div style="font-size:12px;font-weight:500">' + esc(s.agencyName) + '</div>' +
          '<div style="font-size:13px;font-weight:500;text-align:center">' + activeUsers + '</div>' +
          '<div style="position:relative;height:8px;background:var(--c-grey-light,#f0ede8);border-radius:4px;overflow:visible">' +
            '<div style="position:absolute;top:0;left:0;height:100%;width:' + barW + '%;background:var(--c-accent,#5850ec);border-radius:4px"></div>' +
            '<div style="position:absolute;top:-3px;bottom:-3px;left:' + EXPECTED_PCT + '%;width:1.5px;background:var(--c-stone,#888);border-radius:1px"></div>' +
          '</div>' +
          '<div style="font-size:12px;color:var(--c-body);text-align:right">' + Number(used).toLocaleString('en-GB') + '</div>' +
          '<div style="font-size:12px;color:var(--c-stone);text-align:right">' + (allocation ? Number(allocation).toLocaleString('en-GB') : '—') + '</div>' +
          '<div style="text-align:right"><span style="display:inline-block;font-size:10px;padding:2px 7px;border-radius:20px;font-weight:500;' + badgeStyle + '">' + pctUsed.toFixed(1) + '%</span></div>' +
        '</div>'
      );
    }).join('');

    const GROUP_TOTAL_CREDITS = 48000000;
    const unallocated = GROUP_TOTAL_CREDITS - totalAllocation;
    const totalPct = totalAllocation ? (totalUsed / totalAllocation * 100) : 0;
    const totalsRow =
      '<div style="display:grid;grid-template-columns:160px 48px 1fr 100px 100px 68px;gap:8px;align-items:center;padding:8px 0;border-top:1px solid var(--c-grey-mid,#e8e4dc);margin-top:2px">' +
        '<div style="font-size:12px;font-weight:600">Total allocated</div>' +
        '<div></div><div></div>' +
        '<div style="font-size:12px;font-weight:600;text-align:right">' + Number(totalUsed).toLocaleString('en-GB') + '</div>' +
        '<div style="font-size:12px;font-weight:600;color:var(--c-stone);text-align:right">' + Number(totalAllocation).toLocaleString('en-GB') + '</div>' +
        '<div style="text-align:right"><span style="font-size:11px;font-weight:600;color:var(--c-stone)">' + totalPct.toFixed(1) + '%</span></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:160px 48px 1fr 100px 100px 68px;gap:8px;align-items:center;padding:6px 0;border-top:1px dashed var(--c-grey-mid,#e8e4dc)">' +
        '<div style="font-size:12px;font-weight:600">Available to allocate</div>' +
        '<div></div><div></div><div></div>' +
        '<div style="font-size:12px;font-weight:600;color:var(--c-stone);text-align:right">' + Number(unallocated).toLocaleString('en-GB') + '</div>' +
        '<div style="text-align:right"><span style="font-size:10px;color:var(--c-stone)">' + ((unallocated / GROUP_TOTAL_CREDITS) * 100).toFixed(1) + '% of 48M</span></div>' +
      '</div>';

    // Group pacing bar (against the 48M group total, not just allocated)
    const groupUsedPct  = (totalUsed / GROUP_TOTAL_CREDITS * 100);
    const groupBarW     = Math.min(groupUsedPct, 100).toFixed(2);
    const ROLLOVER_PCT  = 85; // must use >85% to avoid forfeiting the 15% rollover allowance
    const rolloverCredits = GROUP_TOTAL_CREDITS * (ROLLOVER_PCT / 100);
    const onTrackForRollover = totalUsed >= (rolloverCredits * (MONTH_ELAPSED / 12));
    const groupStatusColour = onTrackForRollover ? '#065f46' : '#92400e';
    const groupStatusBg     = onTrackForRollover ? '#d1fae5' : '#fef3c7';
    const groupStatusLabel  = onTrackForRollover ? 'On track' : 'Forfeiture risk above rollover cap';

    const groupPacingBar =
      '<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--c-grey-mid,#e8e4dc)">' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">' +
          '<span style="font-size:12px;font-weight:600">Group credit pacing — 48M annual total</span>' +
          '<span style="font-size:10px;padding:2px 8px;border-radius:20px;font-weight:500;background:' + groupStatusBg + ';color:' + groupStatusColour + '">' + groupStatusLabel + '</span>' +
        '</div>' +
        '<div style="position:relative;height:10px;background:var(--c-grey-light,#f0ede8);border-radius:5px;overflow:visible;margin-bottom:8px">' +
          '<div style="position:absolute;top:0;left:0;height:100%;width:' + groupBarW + '%;background:#5850ec;border-radius:5px"></div>' +
          // Expected pace marker (50% at month 6)
          '<div style="position:absolute;top:-4px;bottom:-4px;left:' + EXPECTED_PCT + '%;width:2px;background:#888;border-radius:1px" title="Expected pace: ' + EXPECTED_PCT + '%"></div>' +
          // Rollover threshold marker (85%)
          '<div style="position:absolute;top:-4px;bottom:-4px;left:' + ROLLOVER_PCT + '%;width:2px;background:#f59e0b;border-radius:1px" title="Rollover threshold: 85% — use at least this much to protect your 15% rollover allowance"></div>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--c-stone)">' +
          '<span>' + groupUsedPct.toFixed(1) + '% used (' + Number(totalUsed).toLocaleString('en-GB') + ' of 48,000,000) · month ' + MONTH_ELAPSED + ' of 12</span>' +
          '<div style="display:flex;gap:12px;align-items:center">' +
            '<span>&#x2502; grey = expected pace (' + EXPECTED_PCT + '%)</span>' +
            '<span style="color:#f59e0b">&#x2502; amber = rollover threshold (85%)</span>' +
          '</div>' +
        '</div>' +
        '<p style="font-size:11px;color:var(--c-stone);margin-top:6px;font-style:italic">Your agreement allows up to 15% of the group total (7.2M credits) to carry forward to year two. Any unused credits up to 7.2M roll automatically — but if unused credits exceed 7.2M, only 7.2M carries and the remainder is forfeited. The amber marker shows 85% usage: finishing below this line means more than 7.2M is left unused, and credits above the cap will be lost.</p>' +
      '</div>';

    mount.innerHTML =
      '<div class="go-section">' +
        '<h3 class="go-section__title">LTX Studio — Credit Usage</h3>' +
        '<div style="display:grid;grid-template-columns:160px 48px 1fr 100px 100px 68px;gap:8px;padding-bottom:6px;border-bottom:1px solid var(--c-grey-mid,#e8e4dc);margin-bottom:2px">' +
          '<span style="font-size:11px;color:var(--c-stone)">Agency</span>' +
          '<span style="font-size:11px;color:var(--c-stone);text-align:center">Users</span>' +
          '<span style="font-size:11px;color:var(--c-stone)">Used vs allocation</span>' +
          '<span style="font-size:11px;color:var(--c-stone);text-align:right">Used</span>' +
          '<span style="font-size:11px;color:var(--c-stone);text-align:right">Allocated</span>' +
          '<span style="font-size:11px;color:var(--c-stone);text-align:right">%</span>' +
        '</div>' +
        sortedRows +
        totalsRow +
        '<p style="font-size:11px;color:var(--c-stone);margin-top:8px;font-style:italic">Jan 2026–Jan 2027 · month 6 of 12 · marker = expected 50% pace · green = on/above pace · amber = under pace</p>' +
        groupPacingBar +
      '</div>';
  }

  // ── Agency content ────────────────────────────────────

  const BILLING_CYCLE_DEFAULT = {
    'LTX Studio':   'monthly',
    'Claude':       'annual',
    'Descript':     'monthly',
    'Fireflies':    'monthly',
    'Springboards': 'monthly',
  };

  function renderAgencyContent(agencyKey) {
    const container = document.getElementById('adminAgencyContent');
    if (!container) return;


    const data   = _licenseData;
    const agency = data.agencies.find(a => a.key === agencyKey);
    // M-3 Part 2: email from Firebase Auth (gated by STORAGE_KEY presence flag).
    const adminEmail = getAdminEmail();
    const isSuperAdmin = !!getUser(adminEmail);
    if (!agency) return;

    if (!agency.tools.length) {
      container.innerHTML = '<p class="admin-no-holders" style="padding:24px 0;">No licence data on record for this agency yet.</p>';
      return;
    }

    const STATUS_LABELS = {
      active:      'Active',
      negotiation: 'In negotiation',
      expiring:    'Not renewing',
      expired:     'Expired',
    };

    const activeTools = agency.tools.filter(function(t) { return t.monthlyTotal > 0; });
    const totalMonthly = activeTools.reduce(function(s, t) { return s + t.monthlyTotal; }, 0);
    const totalAnnual  = activeTools.reduce(function(s, t) { return s + t.annualTotal;  }, 0);
    const currency     = (agency.tools[0] && agency.tools[0].currency) || '£';

    const summaryHtml = totalMonthly > 0 ? `
      <div class="admin-licence-summary">
        <div class="admin-licence-summary__item">
          <p class="admin-tool__cost-label">Total Monthly Cost</p>
          <p class="admin-tool__cost-value">${currency}${totalMonthly.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div class="admin-licence-summary__item">
          <p class="admin-tool__cost-label">Total Annual Cost</p>
          <p class="admin-tool__cost-value">${currency}${totalAnnual.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>` : '';

    const lastUpdated = _licenseData.lastUpdated;
    const lastUpdatedHtml = lastUpdated
      ? `<p class="admin-licence-updated">Licence data last updated: ${lastUpdated.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>`
      : '';

    container.innerHTML = summaryHtml + lastUpdatedHtml + agency.tools.map(function(tool) {
      const statusLabel  = STATUS_LABELS[tool.status] || tool.status;
      const seatsLabel   = tool.seats === 0 ? '0 seats' : `${tool.seats} seat${tool.seats > 1 ? 's' : ''}`;
      const costLabel    = tool.costPerSeat > 0 ? `${tool.currency}${tool.costPerSeat}/seat` : '—';
      const monthly      = tool.monthlyTotal > 0 ? `${tool.currency}${tool.monthlyTotal.toLocaleString()}` : '—';
      const annual       = tool.annualTotal  > 0 ? `${tool.currency}${tool.annualTotal.toLocaleString()}`  : '—';
      const billingCycle = tool.billingCycle || BILLING_CYCLE_DEFAULT[tool.name] || 'monthly';
      const billingLabel = billingCycle === 'annual' ? 'Billed annually' : 'Billed monthly';

      let holdersHtml;
      if (tool.holders.length) {
        holdersHtml = `
          <p class="admin-tool__holders-label">License holders</p>
          <div class="admin-tool__holders">
            ${tool.holders.map(function(h) {
              return `
                <div class="admin-holder">
                  <div>
                    <p class="admin-holder__name">${esc(h.name)}</p>
                    ${h.team ? `<p class="admin-holder__detail">${esc(h.team)}</p>` : ''}
                    ${h.joinedAt ? `<p class="admin-holder__detail admin-holder__joined">Joined ${esc(h.joinedAt)}</p>` : ''}
                  </div>
                  <p class="admin-holder__email">${esc(h.email)}</p>
                </div>`;
            }).join('')}
          </div>`;
      } else if (tool.status === 'negotiation') {
        holdersHtml = `<p class="admin-no-holders">Seat holders to be confirmed once contract is finalised.</p>`;
      } else {
        holdersHtml = `<p class="admin-no-holders">No active license holders.</p>`;
      }

      return `
        <div class="admin-tool">
          <div class="admin-tool__head">
            <div>
              <p class="admin-tool__name">${esc(tool.name)}</p>
              <div class="admin-tool__meta">
                <span class="admin-tool__stat"><strong>${esc(seatsLabel)}</strong></span>
                <span class="admin-tool__stat">${esc(costLabel)}</span>
                ${tool.renewal ? `<span class="admin-tool__stat">${esc(tool.renewal)}</span>` : ''}
                <span class="admin-tool__stat admin-tool__stat--billing">${esc(billingLabel)}</span>
                <span class="admin-status admin-status--${esc(tool.status)}">${esc(statusLabel)}</span>
              </div>
            </div>
            <div class="admin-tool__head-actions">
              ${isSuperAdmin ? `<button class="btn-sm btn-sm--outline licence-edit-btn" data-agency="${esc(agencyKey)}" data-tool="${esc(tool.name)}" title="Edit licence">Edit</button>` : ''}
              <svg class="admin-tool__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>
          <div class="admin-tool__body">
            <div class="admin-tool__costs">
              <div class="admin-tool__cost-item">
                <p class="admin-tool__cost-label">Per Seat / Month</p>
                <p class="admin-tool__cost-value">${tool.costPerSeat > 0 ? `${esc(tool.currency)}${tool.costPerSeat}` : '—'}</p>
              </div>
              <div class="admin-tool__cost-item">
                <p class="admin-tool__cost-label">Monthly Total</p>
                <p class="admin-tool__cost-value">${esc(monthly)}</p>
              </div>
              <div class="admin-tool__cost-item">
                <p class="admin-tool__cost-label">Annual Total</p>
                <p class="admin-tool__cost-value">${esc(annual)}</p>
              </div>
            </div>
            <p class="admin-tool__renewal">Renewal: <strong>${esc(tool.renewal)}</strong></p>
            ${holdersHtml}
            <div class="audit-log-section" data-agency="${esc(agencyKey)}" data-tool="${esc(tool.name)}">
              <button type="button" class="audit-log-toggle">Change history</button>
              <div class="audit-log-list" style="display:none"></div>
            </div>
          </div>
        </div>`;
    }).join('');

    // ── Agency Admins section ──────────────────────────
    const isSuperAdmin2  = getUser(adminEmail)?.access === 'all';
    const isFinanceDept  = agencyKey === 'finance';

    function adminRow(u, badge) {
      return `<div class="agency-admin-row">
        <span class="agency-admin-row__name">${esc(u.name)}</span>
        <span class="agency-admin-row__email">${esc(u.email)}</span>
        ${badge ? `<span class="agency-admin-row__badge">${badge}</span>` : ''}
      </div>`;
    }

    let adminRows = '';
    let adminSectionTitle, adminSectionSub;
    if (isFinanceDept) {
      adminSectionTitle = 'Finance Admin Access';
      adminSectionSub   = 'Finance admins have view-only access to licence costs and group spend across all agencies.';
      const financeAdmins = allAdmins().filter(function(u) { return u.access === 'finance'; });
      adminRows = financeAdmins.length
        ? financeAdmins.map(function(u) { return adminRow(u, 'Finance admin'); }).join('')
        : '<p class="admin-no-holders">No finance admins configured.</p>';
    } else {
      adminSectionTitle = 'Admin Access';
      adminSectionSub   = 'People with admin access to this agency\'s dashboard.';
      // Super admins (access:'all') keep full cross-agency access but are listed
      // under their homeAgency (default miroma-group when unset) for clarity.
      const superAdmins  = allAdmins().filter(function(u) { return u.access === 'all' && (u.homeAgency || 'miroma-group') === agencyKey; });
      const agencyAdmins = allAdmins().filter(function(u) { return u.access === 'agency' && u.agency === agencyKey; });
      if (superAdmins.length) adminRows += superAdmins.map(function(u) { return adminRow(u, 'Super admin'); }).join('');
      if (agencyAdmins.length) adminRows += agencyAdmins.map(function(u) { return adminRow(u, ''); }).join('');
      if (!adminRows) adminRows = '<p class="admin-no-holders">No agency admins configured.</p>';
    }

    container.insertAdjacentHTML('beforeend', `
      <div class="agency-admins-section">
        <div class="agency-admins-section__header">
          <div>
            <p class="agency-admins-section__title">${adminSectionTitle}</p>
            <p class="agency-admins-section__sub">${adminSectionSub}</p>
          </div>
          ${isSuperAdmin2 ? `<button class="btn-sm btn-sm--outline agency-admins-edit-btn" data-agency="${esc(agencyKey)}">Manage admins</button>` : ''}
        </div>
        <div class="agency-admins-list">${adminRows}</div>
      </div>`);
  }

  // ── Licence Edit Modal ────────────────────────────────

  function openLicenceEditModal(agencyKey, toolName) {
    const data       = _licenseData;
    const agency     = data.agencies.find(function(a) { return a.key === agencyKey; });
    const tool       = agency && agency.tools.find(function(t) { return t.name === toolName; });
    // M-3 Part 2: email from Firebase Auth (gated by STORAGE_KEY presence flag).
    const adminEmail = getAdminEmail();
    if (!tool) return;

    let holders = (tool.holders || []).map(function(h) { return { name: h.name, email: h.email, team: h.team || '', joinedAt: h.joinedAt || '' }; });

    function renderHolderRows() {
      return holders.map(function(h, i) {
        return `<div class="ledit-holder-row" data-index="${i}">
          <span class="ledit-holder-name">${esc(h.name)}</span>
          <span class="ledit-holder-email">${esc(h.email)}</span>
          ${h.joinedAt ? `<span class="ledit-holder-joined">${esc(h.joinedAt)}</span>` : ''}
          <button type="button" class="ledit-holder-remove" data-index="${i}" title="Remove">✕</button>
        </div>`;
      }).join('') || '<p class="ledit-no-holders">No holders assigned yet.</p>';
    }

    let overlay = document.getElementById('licenceEditOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'licenceEditOverlay';
      overlay.className = 'ledit-overlay';
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    overlay.innerHTML = `
      <div class="ledit-modal">
        <div class="ledit-modal__header">
          <p class="ledit-modal__title">Edit Licence — ${esc(agency.name)} / ${esc(toolName)}</p>
          <button class="ledit-modal__close" id="leditClose" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <form id="leditForm" class="ledit-form">
          <div class="ledit-row">
            <div class="ledit-field">
              <label>Seats</label>
              <input type="number" name="seats" min="0" value="${tool.seats || 0}" required>
            </div>
            <div class="ledit-field">
              <label>Cost per seat / month</label>
              <input type="number" name="costPerSeat" min="0" step="0.01" value="${tool.costPerSeat || 0}">
            </div>
            <div class="ledit-field ledit-field--sm">
              <label>Currency</label>
              <select name="currency">
                <option value="£" ${(tool.currency || '£') === '£' ? 'selected' : ''}>£</option>
                <option value="$" ${tool.currency === '$' ? 'selected' : ''}>$</option>
              </select>
            </div>
          </div>
          <div class="ledit-calc" id="leditCalc">
            Monthly: <strong id="leditMonthly">—</strong> &nbsp;·&nbsp; Annual: <strong id="leditAnnual">—</strong>
          </div>
          <div class="ledit-row">
            <div class="ledit-field">
              <label>Renewal date</label>
              <input type="text" name="renewal" value="${esc(tool.renewal || '')}" placeholder="e.g. May 2027">
            </div>
            <div class="ledit-field">
              <label>Status</label>
              <select name="status">
                <option value="active"      ${tool.status === 'active'      ? 'selected' : ''}>Active</option>
                <option value="negotiation" ${tool.status === 'negotiation' ? 'selected' : ''}>In negotiation</option>
                <option value="expiring"    ${tool.status === 'expiring'    ? 'selected' : ''}>Not renewing</option>
                <option value="expired"     ${tool.status === 'expired'     ? 'selected' : ''}>Expired</option>
              </select>
            </div>
            <div class="ledit-field ledit-field--sm">
              <label>Billing cycle</label>
              <select name="billingCycle">
                <option value="monthly" ${(tool.billingCycle || BILLING_CYCLE_DEFAULT[tool.name] || 'monthly') === 'monthly' ? 'selected' : ''}>Monthly</option>
                <option value="annual"  ${(tool.billingCycle || BILLING_CYCLE_DEFAULT[tool.name] || 'monthly') === 'annual'  ? 'selected' : ''}>Annual</option>
              </select>
            </div>
          </div>
          <div class="ledit-field">
            <label>Licence holders <span class="ledit-holder-count" id="leditHolderCount">${holders.length} / ${tool.seats || 0}</span></label>
            <div id="leditHolders">${renderHolderRows()}</div>
          </div>
          <div class="ledit-add-holder">
            <p class="ledit-add-holder__label">Add holder</p>
            <div class="ledit-row">
              <div class="ledit-field"><input type="text" id="leditAddName" placeholder="Full name"></div>
              <div class="ledit-field"><input type="email" id="leditAddEmail" placeholder="Email address"></div>
              <div class="ledit-field"><input type="text" id="leditAddJoined" placeholder="Joined (e.g. January 2025)"></div>
              <button type="button" class="btn-sm btn-sm--primary" id="leditAddBtn">Add</button>
            </div>
          </div>
          <div class="ledit-modal__footer">
            <button type="button" class="btn-sm btn-sm--ghost" id="leditCancel">Cancel</button>
            <button type="submit" class="btn-sm btn-sm--primary" id="leditSave">Save changes</button>
          </div>
        </form>
      </div>`;

    function updateCalc() {
      const seats = parseFloat(overlay.querySelector('[name="seats"]').value) || 0;
      const cost  = parseFloat(overlay.querySelector('[name="costPerSeat"]').value) || 0;
      const cur   = overlay.querySelector('[name="currency"]').value;
      const monthly = seats * cost;
      const annual  = monthly * 12;
      overlay.querySelector('#leditMonthly').textContent = monthly > 0 ? cur + monthly.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
      overlay.querySelector('#leditAnnual').textContent  = annual  > 0 ? cur + annual.toLocaleString('en-GB',  { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
      overlay.querySelector('#leditHolderCount').textContent = holders.length + ' / ' + seats;
    }
    updateCalc();

    overlay.querySelector('[name="seats"]').addEventListener('input', updateCalc);
    overlay.querySelector('[name="costPerSeat"]').addEventListener('input', updateCalc);
    overlay.querySelector('[name="currency"]').addEventListener('change', updateCalc);

    overlay.querySelector('#leditHolders').addEventListener('click', function(e) {
      const btn = e.target.closest('.ledit-holder-remove');
      if (!btn) return;
      holders.splice(parseInt(btn.dataset.index, 10), 1);
      overlay.querySelector('#leditHolders').innerHTML = renderHolderRows();
      updateCalc();
    });

    overlay.querySelector('#leditAddBtn').addEventListener('click', function() {
      const name     = overlay.querySelector('#leditAddName').value.trim();
      const email    = overlay.querySelector('#leditAddEmail').value.trim();
      const joinedAt = overlay.querySelector('#leditAddJoined').value.trim();
      if (!name || !email) return;
      holders.push({ name: name, email: email, team: '', joinedAt: joinedAt });
      overlay.querySelector('#leditHolders').innerHTML = renderHolderRows();
      overlay.querySelector('#leditAddName').value   = '';
      overlay.querySelector('#leditAddEmail').value  = '';
      overlay.querySelector('#leditAddJoined').value = '';
      updateCalc();
    });

    overlay.querySelector('#leditClose').addEventListener('click', closeLicenceEditModal);
    overlay.querySelector('#leditCancel').addEventListener('click', closeLicenceEditModal);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeLicenceEditModal(); });

    overlay.querySelector('#leditForm').addEventListener('submit', function(e) {
      e.preventDefault();
      const seats        = parseInt(overlay.querySelector('[name="seats"]').value, 10)     || 0;
      const costPerSeat  = parseFloat(overlay.querySelector('[name="costPerSeat"]').value) || 0;
      const currency     = overlay.querySelector('[name="currency"]').value;
      const renewal      = overlay.querySelector('[name="renewal"]').value.trim();
      const status       = overlay.querySelector('[name="status"]').value;
      const billingCycle = overlay.querySelector('[name="billingCycle"]').value;

      const updated = {
        name:          toolName,
        seats:         seats,
        costPerSeat:   costPerSeat,
        currency:      currency,
        monthlyTotal:  seats * costPerSeat,
        annualTotal:   seats * costPerSeat * 12,
        renewal:       renewal,
        status:        status,
        billingCycle:  billingCycle,
        holders:       holders,
      };

      // Build field-level diff for audit log
      const changes = [];
      const statusLabels = { active: 'Active', negotiation: 'In negotiation', expiring: 'Not renewing', expired: 'Expired' };
      if ((tool.seats || 0) !== seats) changes.push('Seats: ' + (tool.seats || 0) + ' → ' + seats);
      if ((tool.costPerSeat || 0) !== costPerSeat) changes.push('Cost per seat: ' + (tool.currency || '£') + (tool.costPerSeat || 0) + ' → ' + currency + costPerSeat);
      if ((tool.currency || '£') !== currency) changes.push('Currency: ' + (tool.currency || '£') + ' → ' + currency);
      if ((tool.renewal || '') !== renewal) changes.push('Renewal date: ' + (tool.renewal || '—') + ' → ' + (renewal || '—'));
      if ((tool.status || 'active') !== status) changes.push('Status: ' + (statusLabels[tool.status] || tool.status) + ' → ' + (statusLabels[status] || status));
      const prevBilling = tool.billingCycle || BILLING_CYCLE_DEFAULT[tool.name] || 'monthly';
      if (prevBilling !== billingCycle) changes.push('Billing cycle: ' + prevBilling + ' → ' + billingCycle);

      const prevEmails = (tool.holders || []).map(function(h) { return h.email; });
      const newEmails  = holders.map(function(h) { return h.email; });
      holders.forEach(function(h) {
        if (!prevEmails.includes(h.email)) changes.push('Holder added: ' + h.name + ' (' + h.email + ')' + (h.joinedAt ? ', joined ' + h.joinedAt : ''));
      });
      (tool.holders || []).forEach(function(h) {
        if (!newEmails.includes(h.email)) changes.push('Holder removed: ' + h.name + ' (' + h.email + ')');
      });

      const saveBtn = overlay.querySelector('#leditSave');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';

      fsSetLicenseOverride(agencyKey, toolName, updated).then(function() {
        if (changes.length > 0) {
          return fsWriteAuditLog({
            agencyKey:  agencyKey,
            toolName:   toolName,
            adminEmail: adminEmail,
            changes:    changes,
          });
        }
      }).then(function() {
        return loadLicenseData();
      }).then(function(freshData) {
        _licenseData = freshData;
        closeLicenceEditModal();
        renderAgencyContent(agencyKey);
      }).catch(function(err) {
        console.error('Save failed:', err);
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save changes';
        alert('Failed to save. Please try again.');
      });
    });
  }

  function closeLicenceEditModal() {
    const overlay = document.getElementById('licenceEditOverlay');
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  // ── Agency Admin Edit Modal ───────────────────────────

  function openAdminEditModal(agencyKey) {
    const isFinance = agencyKey === 'finance';
    const data   = _licenseData;
    const agency = isFinance ? { name: 'Finance' } : data.agencies.find(function(a) { return a.key === agencyKey; });
    if (!agency) return;

    let admins = isFinance
      ? allAdmins().filter(function(u) { return u.access === 'finance'; }).map(function(u) { return { name: u.name, email: u.email }; })
      : allAdmins().filter(function(u) { return u.access === 'agency' && u.agency === agencyKey; }).map(function(u) { return { name: u.name, email: u.email }; });

    function renderRows() {
      return admins.map(function(a, i) {
        return `<div class="ledit-holder-row" data-index="${i}">
          <span class="ledit-holder-name">${esc(a.name)}</span>
          <span class="ledit-holder-email">${esc(a.email)}</span>
          <button type="button" class="ledit-holder-remove" data-index="${i}" title="Remove">✕</button>
        </div>`;
      }).join('') || '<p class="ledit-no-holders">No admins assigned yet.</p>';
    }

    let overlay = document.getElementById('adminEditOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'adminEditOverlay';
      overlay.className = 'ledit-overlay';
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    overlay.innerHTML = `
      <div class="ledit-modal">
        <div class="ledit-modal__header">
          <p class="ledit-modal__title">Manage Admins — ${esc(agency.name)}</p>
          <button class="ledit-modal__close" id="adminEditClose" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="ledit-form">
          <p class="ledit-field" style="margin-bottom:16px;font-size:13px;color:var(--c-stone);">
            ${isFinance ? 'Finance admins have view-only access to licence costs and group spend across all agencies.' : 'Agency admins can view and edit their agency\'s licence data. They see only their own agency.'}
          </p>
          <div class="ledit-field">
            <label>Current admins</label>
            <div id="adminEditRows">${renderRows()}</div>
          </div>
          <div class="ledit-add-holder">
            <p class="ledit-add-holder__label">Add admin</p>
            <div class="ledit-row">
              <div class="ledit-field"><input type="text" id="adminAddName" placeholder="Full name"></div>
              <div class="ledit-field"><input type="email" id="adminAddEmail" placeholder="Email address"></div>
              <button type="button" class="btn-sm btn-sm--primary" id="adminAddBtn">Add</button>
            </div>
          </div>
          <div class="ledit-modal__footer">
            <button type="button" class="btn-sm btn-sm--ghost" id="adminEditCancel">Cancel</button>
            <button type="button" class="btn-sm btn-sm--primary" id="adminEditSave">Save changes</button>
          </div>
        </div>
      </div>`;

    overlay.querySelector('#adminEditRows').addEventListener('click', function(e) {
      const btn = e.target.closest('.ledit-holder-remove');
      if (!btn) return;
      admins.splice(parseInt(btn.dataset.index, 10), 1);
      overlay.querySelector('#adminEditRows').innerHTML = renderRows();
    });

    overlay.querySelector('#adminAddBtn').addEventListener('click', function() {
      const name  = overlay.querySelector('#adminAddName').value.trim();
      const email = overlay.querySelector('#adminAddEmail').value.trim().toLowerCase();
      if (!name || !email) return;
      admins.push({ name, email });
      overlay.querySelector('#adminEditRows').innerHTML = renderRows();
      overlay.querySelector('#adminAddName').value  = '';
      overlay.querySelector('#adminAddEmail').value = '';
    });

    overlay.querySelector('#adminEditClose').addEventListener('click', closeAdminEditModal);
    overlay.querySelector('#adminEditCancel').addEventListener('click', closeAdminEditModal);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeAdminEditModal(); });

    overlay.querySelector('#adminEditSave').addEventListener('click', function() {
      const saveBtn = overlay.querySelector('#adminEditSave');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';

      fsSetAgencyAdmins(agencyKey, admins).then(function() {
        return loadAdminUsers();
      }).then(function(freshAdmins) {
        _adminUsers = freshAdmins;
        closeAdminEditModal();
        renderAgencyContent(agencyKey);
      }).catch(function(err) {
        console.error('Save failed:', err);
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save changes';
        alert('Failed to save. Please try again.');
      });
    });
  }

  function closeAdminEditModal() {
    const overlay = document.getElementById('adminEditOverlay');
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  // ── Activity section ──────────────────────────────────

  function renderActivitySection() {
    const section = document.getElementById('adminSectionActivity');
    if (!section) return;
    // M-3 Part 2: email from Firebase Auth (gated by STORAGE_KEY presence flag).
    const email = getAdminEmail();
    const user  = getUser(email);
    if (!user) return;
    const agencies   = visibleFor(user);
    const agencyKeys = user.access === 'all' ? null : agencies.map(a => a.key);

    section.innerHTML = `
      <p class="admin-view__title">AI Hub Engagement</p>
      <p class="admin-view__sub">Prompt engagement, estimated time saved, and learning progress across the group. Visible to Miroma Group super admins only.</p>
      <div id="activityContent"><p class="admin-loading">Loading activity data…</p></div>`;

    Promise.all([
      fsGetPromptCopies(agencyKeys),
      fsGetUsageLogs(agencyKeys),
      fsGetAllReactions(null),
      fsGetPathwayProgress(agencyKeys),
      fsGetVisitorsThisMonth(agencyKeys),
      fsGetSiteVisitors(agencyKeys),
      fsGetAllSiteVisits(agencyKeys),
    ]).then(function(results) {
      const copies = results[0], usageLogs = results[1], reactions = results[2], pathwayRecords = results[3], visitorsThisMonth = results[4], visitors = results[5], allVisits = results[6];
      const el = document.getElementById('activityContent');
      if (!el) return;
      const D = '<div class="admin-act-divider"></div>';
      const parts = [
        buildROISummary(copies, visitorsThisMonth, allVisits, visitors),
        D,
        buildVisitorsTable(visitors),
        D,
        buildMonthlyTrend(allVisits),
        D,
        buildPromptLeaderboard(copies, usageLogs, reactions),
        D,
        buildActivityFeed(copies, usageLogs),
      ];
      parts.push(D, buildPathwayProgressTable(pathwayRecords));
      el.innerHTML = parts.join('');
      initMiniChart(el);
    });
  }

  // Wire up hover interactions for the mini visits chart (hovered bar
  // darkens, neighbours dim, header value reflects the hovered month).
  function initMiniChart(root) {
    const chart = root.querySelector('.mini-chart');
    if (!chart) return;
    const cols = Array.prototype.slice.call(chart.querySelectorAll('.mini-chart-col'));
    const valEl = chart.querySelector('.mini-chart-value');
    const defaultVal = valEl ? valEl.getAttribute('data-default') : null;

    cols.forEach(function(col, idx) {
      col.addEventListener('mouseenter', function() {
        cols.forEach(function(c, i) {
          const bar = c.querySelector('.mini-chart-bar');
          bar.classList.remove('is-hovered', 'is-neighbor', 'is-faint');
          if (i === idx) bar.classList.add('is-hovered');
          else if (i === idx - 1 || i === idx + 1) bar.classList.add('is-neighbor');
          else bar.classList.add('is-faint');
        });
        if (valEl) { valEl.textContent = col.getAttribute('data-value'); valEl.classList.add('is-active'); }
      });
    });

    chart.addEventListener('mouseleave', function() {
      cols.forEach(function(c) {
        c.querySelector('.mini-chart-bar').classList.remove('is-hovered', 'is-neighbor', 'is-faint');
      });
      if (valEl) { valEl.classList.remove('is-active'); if (defaultVal !== null) valEl.textContent = defaultVal; }
    });
  }

  function buildROISummary(copies, visitorsThisMonth, allVisits, visitors) {
    const totalVisits = (allVisits || []).length;
    const totalUniqueVisitors = (visitors || []).length;
    return `<div class="admin-roi-stats">
        <div class="admin-roi-stat">
          <div class="admin-roi-stat__num">${totalVisits || '—'}</div>
          <div class="admin-roi-stat__label">Total site visits</div>
        </div>
        <div class="admin-roi-stat">
          <div class="admin-roi-stat__num">${copies.length || '—'}</div>
          <div class="admin-roi-stat__label">Prompt copies</div>
        </div>
        <div class="admin-roi-stat">
          <div class="admin-roi-stat__num">${totalUniqueVisitors || '—'}</div>
          <div class="admin-roi-stat__label">Total unique visitors (all time)</div>
        </div>
        <div class="admin-roi-stat">
          <div class="admin-roi-stat__num">${visitorsThisMonth || '—'}</div>
          <div class="admin-roi-stat__label">Unique visitors this month</div>
        </div>
      </div>`;
  }

  function buildVisitorsTable(visitors) {
    const total = visitors.length;
    const countBadge = total ? ` <span class="admin-count-badge">${total}</span>` : '';
    const titleHtml = '<p class="admin-activity__title">Unique AI Hub visitors' + countBadge + '</p>' +
      '<p class="admin-activity__sub">Each team member who has visited the AI Hub, counted once, with the date they last visited.</p>';

    if (!total) {
      return titleHtml + '<p class="admin-no-holders">No visit data recorded yet.</p>';
    }

    // Per-agency visitor breakdown
    const keyToName = {};
    _licenseData.agencies.forEach(function(a) { keyToName[a.key] = a.name; });
    const agencyCounts = {};
    visitors.forEach(function(v) {
      const k = v.agencyKey || 'unknown';
      agencyCounts[k] = (agencyCounts[k] || 0) + 1;
    });
    const agencyRows = Object.keys(agencyCounts)
      .sort(function(a, b) { return agencyCounts[b] - agencyCounts[a]; })
      .map(function(k) {
        return `<tr>
          <td class="admin-act-td admin-act-td--title">${esc(keyToName[k] || k)}</td>
          <td class="admin-act-td admin-act-td--num">${agencyCounts[k]}</td>
        </tr>`;
      }).join('');

    const byAgencyHtml = `
      <p class="admin-activity__sub" style="margin-top:8px;">Visitors by agency</p>
      <div class="admin-act-table-wrap">
        <table class="admin-act-table">
          <thead>
            <tr>
              <th class="admin-act-th">Agency</th>
              <th class="admin-act-th admin-act-th--num">Visitors</th>
            </tr>
          </thead>
          <tbody>${agencyRows}</tbody>
        </table>
      </div>`;

    // Full visitor list — collapsed beyond COLLAPSE_AT rows
    const COLLAPSE_AT = 12;
    const rowsHtml = visitors.map(function(v, i) {
      const lastVisit = v.lastVisit
        ? new Date(v.lastVisit).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : '—';
      const extraClass = i >= COLLAPSE_AT ? ' visitors-row--extra' : '';
      return `<tr class="${extraClass.trim()}">
        <td class="admin-act-td admin-act-td--email">${esc(v.email)}</td>
        <td class="admin-act-td">${esc(keyToName[v.agencyKey] || v.agencyKey)}</td>
        <td class="admin-act-td admin-act-td--date">${lastVisit}</td>
      </tr>`;
    }).join('');

    const toggleHtml = total > COLLAPSE_AT
      ? `<button class="visitors-toggle" type="button">Show all ${total} visitors</button>`
      : '';

    return titleHtml + byAgencyHtml + `
      <p class="admin-activity__sub" style="margin-top:16px;">Individual visitors</p>
      <div class="admin-act-table-wrap">
        <table class="admin-act-table">
          <thead>
            <tr>
              <th class="admin-act-th">Email</th>
              <th class="admin-act-th">Agency</th>
              <th class="admin-act-th">Last visited</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      ${toggleHtml}`;
  }

  function buildMonthlyTrend(allVisits) {
    // Start the chart at the earliest month that actually has a visit, so the
    // bars cover every logged visit and their sum matches the Total site
    // visits figure. Falls back to the current month if there's no data yet.
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    var startKey = null;
    (allVisits || []).forEach(function(r) {
      var k = (r.date || '').substring(0, 7);
      if (k && (startKey === null || k < startKey)) startKey = k;
    });
    var start = startKey
      ? new Date(parseInt(startKey.substring(0, 4), 10), parseInt(startKey.substring(5, 7), 10) - 1, 1)
      : new Date(end);
    if (start > end) start = new Date(end);

    const months = [];
    var d = new Date(start);
    while (d <= end) {
      months.push({
        key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
        label: d.toLocaleDateString('en-GB', { month: 'short' }),
        visits: 0,
      });
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
    const monthMap = {};
    months.forEach(function(m) { monthMap[m.key] = m; });

    // Count site visits per month (one record per person per day).
    (allVisits || []).forEach(function(r) {
      var k = (r.date || '').substring(0, 7);
      if (monthMap[k]) monthMap[k].visits++;
    });

    const maxVal = Math.max.apply(null, months.map(function(m) { return m.visits; }).concat([1]));
    // Shown in the header when no bar is hovered: the all-time total across
    // every month (matches the Total site visits figure). Hovering a bar
    // swaps it for that month's count.
    const total = months.reduce(function(s, m) { return s + m.visits; }, 0);

    const barsHtml = months.map(function(m, i) {
      const heightPx = Math.round((m.visits / maxVal) * 96);
      return `<div class="mini-chart-col" data-index="${i}" data-value="${m.visits}">
        <div class="mini-chart-tooltip">${m.visits} ${m.visits === 1 ? 'visit' : 'visits'}</div>
        <div class="mini-chart-bar" style="height:${heightPx}px"></div>
        <span class="mini-chart-label">${m.label}</span>
      </div>`;
    }).join('');

    return `<p class="admin-activity__title">Activity trend</p>
      <p class="admin-activity__sub">Monthly AI Hub site visits since the first recorded visit. Hover a bar for that month's count.</p>
      <div class="mini-chart">
        <div class="mini-chart-header">
          <div class="mini-chart-status">
            <span class="mini-chart-dot"></span>
            <span class="mini-chart-status-label">Monthly visits</span>
          </div>
          <div class="mini-chart-value" data-default="${total}">${total}</div>
        </div>
        <div class="mini-chart-bars">${barsHtml}</div>
      </div>`;
  }

  function buildPromptLeaderboard(copies, usageLogs, reactions) {
    const titleHtml = '<p class="admin-activity__title">Prompt leaderboard</p>' +
      '<p class="admin-activity__sub">Use cases ranked by total engagement — copies + uses logged + likes.</p>';

    if (!copies.length && !usageLogs.length) {
      return titleHtml + '<p class="admin-no-holders">No engagement recorded yet.</p>';
    }

    const map = {};
    function entry(title, category, tool) {
      if (!map[title]) map[title] = { title: title, category: category, tool: tool, copies: 0, uses: 0, likes: 0, minutesSaved: 0 };
      return map[title];
    }
    copies.forEach(function(r) { if (r.useCaseTitle) entry(r.useCaseTitle, r.category, r.tool).copies++; });
    usageLogs.forEach(function(r) {
      if (!r.useCaseTitle) return;
      var e = entry(r.useCaseTitle, r.category, r.tool);
      e.uses++;
      e.minutesSaved += ((r.timeSavedMinutes || 0) * (r.frequencyPerMonth || 1));
    });
    Object.keys(reactions).forEach(function(slug) {
      var matchKey = Object.keys(map).find(function(t) { return titleToSlug(t) === slug; });
      if (matchKey) map[matchKey].likes = reactions[slug].count || 0;
    });

    const rows = Object.values(map)
      .filter(function(e) { return e.copies + e.uses + e.likes > 0; })
      .sort(function(a, b) { return (b.copies + b.uses + b.likes) - (a.copies + a.uses + a.likes) || b.copies - a.copies; });

    if (!rows.length) return titleHtml + '<p class="admin-no-holders">No engagement recorded yet.</p>';

    const rowsHtml = rows.map(function(r, i) {
      const hrs = r.minutesSaved >= 60 ? '~' + Math.round(r.minutesSaved / 60) + 'h' : r.minutesSaved > 0 ? r.minutesSaved + 'm' : '—';
      return `<tr>
        <td class="admin-act-td admin-act-td--rank">${i + 1}</td>
        <td class="admin-act-td admin-act-td--title">${esc(r.title)}</td>
        <td class="admin-act-td">${esc(r.category)}</td>
        <td class="admin-act-td">${esc(r.tool)}</td>
        <td class="admin-act-td admin-act-td--num">${r.copies || '—'}</td>
        <td class="admin-act-td admin-act-td--num">${r.uses || '—'}</td>
        <td class="admin-act-td admin-act-td--num">${r.likes || '—'}</td>
        <td class="admin-act-td admin-act-td--num">${hrs}</td>
      </tr>`;
    }).join('');

    return titleHtml + `
      <div class="admin-act-table-wrap">
        <table class="admin-act-table">
          <thead>
            <tr>
              <th class="admin-act-th admin-act-th--num">#</th>
              <th class="admin-act-th">Use case</th>
              <th class="admin-act-th">Category</th>
              <th class="admin-act-th">Tool</th>
              <th class="admin-act-th admin-act-th--num">Copies</th>
              <th class="admin-act-th admin-act-th--num">Uses</th>
              <th class="admin-act-th admin-act-th--num">Likes</th>
              <th class="admin-act-th admin-act-th--num">Time saved</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;
  }

  function buildActivityFeed(copies, usageLogs) {
    const titleHtml = '<p class="admin-activity__title">Recent activity</p>' +
      '<p class="admin-activity__sub">Latest 50 individual prompt interactions across your team.</p>';

    const events = [];
    copies.forEach(function(r) {
      if (r.email && r.useCaseTitle) events.push({ email: r.email, action: 'copied', title: r.useCaseTitle, date: r.copiedAt });
    });
    usageLogs.forEach(function(r) {
      if (r.email && r.useCaseTitle) events.push({ email: r.email, action: 'used', title: r.useCaseTitle, date: r.usedAt });
    });
    events.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
    const recent = events.slice(0, 50);

    if (!recent.length) return titleHtml + '<p class="admin-no-holders">No individual activity recorded yet.</p>';

    const feedHtml = recent.map(function(e) {
      const date = e.date
        ? new Date(e.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        : '—';
      const actionTag = e.action === 'copied'
        ? '<span class="admin-feed-action admin-feed-action--copy">Copied</span>'
        : '<span class="admin-feed-action admin-feed-action--use">Used</span>';
      return `<div class="admin-feed-row">
        <span class="admin-feed-email">${esc(e.email)}</span>
        ${actionTag}
        <span class="admin-feed-title">${esc(e.title)}</span>
        <span class="admin-feed-date">${date}</span>
      </div>`;
    }).join('');

    return titleHtml + `<div class="admin-feed">${feedHtml}</div>`;
  }

  function buildPathwayProgressTable(records) {
    const STAGE_NAMES = ['Basics', 'Projects', 'Connectors', 'Put to work', 'Prompt skills', 'Build & automate', 'Claude Code'];
    const titleHtml = '<p class="admin-activity__title">Claude learning pathway</p>' +
      '<p class="admin-activity__sub">Stage completion per team member (7 stages total).</p>';

    if (!records.length) {
      return titleHtml + '<p class="admin-no-holders">No progress recorded yet. Data will appear here once team members start completing stages on the Learning Pathway page.</p>';
    }

    const sorted = records.slice().sort(function(a, b) {
      return (b.stagesCompleted?.length || 0) - (a.stagesCompleted?.length || 0);
    });

    const stageHeaders = STAGE_NAMES.map(function(n, i) {
      return `<th class="admin-act-th admin-act-th--stage" title="${n}">S${i + 1}</th>`;
    }).join('');

    const rowsHtml = sorted.map(function(r) {
      const done    = r.stagesCompleted || [];
      const pct     = Math.round((done.length / 7) * 100);
      const stageCells = [1,2,3,4,5,6,7].map(function(n) {
        const complete = done.includes(n);
        return `<td class="admin-act-td admin-act-td--stage">
          <span class="admin-act-stage${complete ? ' is-done' : ''}">${complete ? '✓' : '–'}</span>
        </td>`;
      }).join('');

      const lastDate = r.lastUpdated
        ? new Date(r.lastUpdated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        : '—';

      return `<tr>
        <td class="admin-act-td admin-act-td--email">${esc(r.email)}</td>
        ${stageCells}
        <td class="admin-act-td admin-act-td--num">
          <span class="admin-act-pct" style="--pct:${pct}">${pct}%</span>
        </td>
        <td class="admin-act-td admin-act-td--date">${lastDate}</td>
      </tr>`;
    }).join('');

    return titleHtml + `
      <div class="admin-act-table-wrap">
        <table class="admin-act-table">
          <thead>
            <tr>
              <th class="admin-act-th">Team member</th>
              ${stageHeaders}
              <th class="admin-act-th admin-act-th--num">Progress</th>
              <th class="admin-act-th">Last active</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;
  }

  // ── Group AI Progress section ─────────────────────────
  // Live, Firestore-backed equivalent of the CEO one-pager. Reads the
  // latest /group_reports/{period} doc (computed offline by
  // scripts/usage/aggregate-group-report.mjs from the SAME per-agency data
  // Usage Reports / Group Spend / AI Hub Engagement already show) and
  // delegates rendering to window.renderGroupReport (js/group-report.js).
  // Gated to access==='all' only at the nav-button level above AND by the
  // /group_reports Firestore rule — deliberately narrower than
  // isFullAccessAdmin() (which also admits 'finance'), matching AI Hub
  // Engagement's visibility rather than Group Spend's.
  function renderGroupProgressSection() {
    const section = document.getElementById('adminSectionGroupProgress');
    if (!section) return;

    section.innerHTML = `
      <p class="admin-view__title">Group AI Progress</p>
      <p class="admin-view__sub">Live cross-agency rollup of Claude, LTX and automation usage. Visible to Miroma Group super admins only.</p>
      <div id="groupProgressContent"><p class="admin-loading">Loading group report…</p></div>`;

    fsGetLatestGroupReport().then(function (data) {
      const el = document.getElementById('groupProgressContent');
      if (!el) return;
      if (typeof window.renderGroupReport !== 'function') {
        el.innerHTML = '<p class="admin-loading">js/group-report.js failed to load.</p>';
        return;
      }
      window.renderGroupReport(el, data);
    });
  }

  // HTML-encode a value for safe interpolation into ANY HTML context
  // (text content OR attribute values). Escapes the five characters that
  // can break out of either context: & < > " '. Text content tolerates
  // entity-encoded quotes without visible change, so a single helper
  // covers both cases — preferable to maintaining separate esc/escAttr
  // pairs and remembering which to call where.
  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
