/* =============================================
   MIROMA AI HUB — Firestore request helpers
   ============================================= */

const AGENCY_NAME_TO_KEY = {
  'Spot Co':                'spotco',
  'Multiple':               'multiple',
  'MX US':                  'mxus',
  'Dewynters':              'dewynters',
  'Maker Lab':              'makerlab',
  'Fold7':                  'fold7',
  'Miroma Group (central)': 'miroma-group',
};

function agencyNameToKey(name) {
  return AGENCY_NAME_TO_KEY[name] || null;
}

const DOMAIN_TO_AGENCY_KEY = {
  'miroma.com':            'miroma-group',
  'spotnyc.com':           'spotco',
  'themultipleagency.com': 'multiple',
  'wearemakerlab.com':     'makerlab',
  'dewynters.com':         'dewynters',
  'mxlocation.co':         'mxus',
  'fold7.com':             'fold7',
  'buzz16.uk':             'buzz16',
  'miromafounders.com':    'mfn',
  'soldout.co.uk':         'soldout',
  'twelveam.com':          'twelveam',
  'attentive.media':       'attentive',
  'storyhousepr.co.uk':    'storyhouse',
  'weareravenagency.com':  'raven',
  'wearehyperactive.com':  'hyperactive',
};

function emailToAgencyKey(email) {
  if (!email) return null;
  const domain = email.split('@')[1]?.toLowerCase();
  return DOMAIN_TO_AGENCY_KEY[domain] || null;
}

function fsDb() {
  try {
    if (typeof firebase !== 'undefined' && firebase.apps.length) {
      return firebase.firestore();
    }
  } catch (_) {}
  return null;
}

// Returns the current authenticated user's lowercased email, or null if
// no session. Used to stamp every Firestore write with a server-verifiable
// caller identity (see firestore.rules — each create rule checks
// request.resource.data.submittedBy == request.auth.token.email.lower()).
function fsCallerEmail() {
  try {
    const u = firebase.auth().currentUser;
    return u && u.email ? u.email.toLowerCase() : null;
  } catch (_) { return null; }
}

async function fsSaveRequest(data) {
  const db = fsDb();
  if (!db) throw new Error('Firestore not available');
  const caller = fsCallerEmail();
  if (!caller) throw new Error('Not signed in');
  const ref = await db.collection('onboarding_requests').add({
    ...data,
    submittedBy: caller,
    submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}

async function fsGetRequests(agencyKeys) {
  const db = fsDb();
  if (!db) return [];
  try {
    const snap = await db.collection('onboarding_requests')
      .orderBy('submittedAt', 'desc')
      .get();
    const all = snap.docs.map(d => {
      const raw = d.data();
      return {
        id:          d.id,
        ...raw,
        submittedAt: raw.submittedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      };
    });
    if (!agencyKeys) return all;
    return all.filter(r => agencyKeys.includes(r.agencyKey));
  } catch (err) {
    console.warn('fsGetRequests error:', err);
    return [];
  }
}

async function fsUpdateRequest(id, updates) {
  const db = fsDb();
  if (!db) return;
  await db.collection('onboarding_requests').doc(id).update({
    ...updates,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

// ── Prompt copy tracking ──────────────────────────────

async function fsLogPromptCopy(email, useCaseTitle, category, tool) {
  const db = fsDb();
  const caller = fsCallerEmail();
  if (!db || !caller) return;
  await db.collection('prompt_copies').add({
    email:        caller,
    agencyKey:    emailToAgencyKey(caller) || 'unknown',
    useCaseTitle: useCaseTitle || '',
    category:     category || '',
    tool:         tool || '',
    submittedBy:  caller,
    copiedAt:     firebase.firestore.FieldValue.serverTimestamp(),
  });
}

async function fsGetPromptCopies(agencyKeys) {
  const db = fsDb();
  if (!db) return [];
  try {
    const snap = await db.collection('prompt_copies').orderBy('copiedAt', 'desc').get();
    const all  = snap.docs.map(d => ({ id: d.id, ...d.data(), copiedAt: d.data().copiedAt?.toDate?.()?.toISOString() || null }));
    if (!agencyKeys) return all;
    return all.filter(r => agencyKeys.includes(r.agencyKey));
  } catch (err) {
    console.warn('fsGetPromptCopies error:', err);
    return [];
  }
}

// ── Pathway progress tracking ─────────────────────────

async function fsSyncPathwayProgress(email, stagesCompleted) {
  // KNOWN_ISSUES S-3 fix: docId is now the caller's Firebase Auth uid
  // rather than an email-derived string. The matching firestore.rules
  // requires docId == request.auth.uid, so each user can only write
  // their own pathway record — closes the pre-fix vulnerability where
  // any signed-in user could write any other user's progress.
  //
  // Email is still stored in the doc body (for admin-side queries that
  // filter by agencyKey or sort by email) — it just isn't the key.
  const db = fsDb();
  if (!db || !email || email === 'guest') return;
  const uid = (typeof firebase !== 'undefined' && firebase.auth().currentUser)
    ? firebase.auth().currentUser.uid
    : null;
  if (!uid) return;
  await db.collection('pathway_progress').doc(uid).set({
    uid:             uid,
    email:           email.toLowerCase(),
    agencyKey:       emailToAgencyKey(email) || 'unknown',
    stagesCompleted: Array.from(stagesCompleted),
    totalStages:     7,
    lastUpdated:     firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function fsGetPathwayProgress(agencyKeys) {
  const db = fsDb();
  if (!db) return [];
  try {
    const snap = await db.collection('pathway_progress').get();
    const all  = snap.docs.map(d => ({ ...d.data(), lastUpdated: d.data().lastUpdated?.toDate?.()?.toISOString() || null }));
    if (!agencyKeys) return all;
    return all.filter(r => agencyKeys.includes(r.agencyKey));
  } catch (err) {
    console.warn('fsGetPathwayProgress error:', err);
    return [];
  }
}

// ── Engagement helpers (reactions, usage, copy counts) ──

function titleToSlug(title) {
  return (title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// KNOWN_ISSUES S-4 fix: two-doc model rather than a single doc with a
// `users` array. The aggregate doc /uc_reactions/{slug} tracks the count;
// the per-user doc /uc_reaction_users/{slug}__{uid} records who reacted.
// The rule scoping means regular users can't see WHO else reacted (only
// the count), closing the pre-fix privacy leak.
//
// Returns { count, userReacted }. The pre-S-4 shape also returned `users`
// — that's been deliberately removed for privacy. Callers that used to
// render named likers ("Vix and Ben liked this") now get only count and
// own-state; the UI degrades to "You and N others liked this".
// `slugOverride` (optional): Firestore-authored use cases carry an immutable
// stored slug (content_use_cases docId). Pass it so reactions stay keyed to
// the original slug even after an admin retitles the use case — otherwise
// the slug is derived from the title as before.
async function fsToggleReaction(email, title, slugOverride) {
  const db = fsDb();
  if (!db || !email || email === 'guest') return { count: 0, userReacted: false };
  const uid = (typeof firebase !== 'undefined' && firebase.auth().currentUser)
    ? firebase.auth().currentUser.uid
    : null;
  if (!uid) return { count: 0, userReacted: false };

  const slug = slugOverride || titleToSlug(title);
  const aggRef  = db.collection('uc_reactions').doc(slug);
  const userRef = db.collection('uc_reaction_users').doc(slug + '__' + uid);

  let result = { count: 0, userReacted: false };
  try {
    await db.runTransaction(async (tx) => {
      const [aggSnap, userSnap] = await Promise.all([tx.get(aggRef), tx.get(userRef)]);
      const currentCount = aggSnap.exists ? (aggSnap.data().count || 0) : 0;
      if (userSnap.exists) {
        // Remove reaction
        tx.delete(userRef);
        const newCount = Math.max(0, currentCount - 1);
        if (aggSnap.exists) {
          tx.update(aggRef, { count: newCount, title: title });
        }
        result = { count: newCount, userReacted: false };
      } else {
        // Add reaction
        tx.set(userRef, {
          slug:      slug,
          uid:       uid,
          email:     email.toLowerCase(),
          reactedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        const newCount = currentCount + 1;
        if (aggSnap.exists) {
          tx.update(aggRef, { count: newCount, title: title });
        } else {
          tx.set(aggRef, { slug: slug, title: title, count: 1 });
        }
        result = { count: newCount, userReacted: true };
      }
    });
  } catch (e) {
    console.error('fsToggleReaction error:', e);
    throw e;
  }
  return result;
}

// Returns the reaction state for every use case, in the shape
// { [slug]: { count, userReacted } }. As with fsToggleReaction the
// `users` array is intentionally absent post-S-4.
async function fsGetAllReactions(_userEmail) {
  const db = fsDb();
  if (!db) return {};
  const uid = (typeof firebase !== 'undefined' && firebase.auth().currentUser)
    ? firebase.auth().currentUser.uid
    : null;

  const result = {};

  // 1) Aggregate counts — anyone allowlisted can read these.
  try {
    const snap = await db.collection('uc_reactions').get();
    snap.docs.forEach(function(d) {
      const data = d.data();
      result[d.id] = { count: data.count || 0, userReacted: false };
    });
  } catch (e) {
    console.warn('fsGetAllReactions aggregate read failed:', e);
  }

  // 2) The caller's own reactions — match by uid via filtered LIST query
  // (the rule's "resource.data.uid == request.auth.uid" check approves it
  // because every returned doc satisfies the predicate).
  if (uid) {
    try {
      const userSnap = await db.collection('uc_reaction_users')
        .where('uid', '==', uid)
        .get();
      userSnap.docs.forEach(function(d) {
        const slug = d.data().slug;
        if (!slug) return;
        if (result[slug]) {
          result[slug].userReacted = true;
        } else {
          // The user reacted to a slug whose aggregate doc doesn't exist —
          // shouldn't happen in normal flow but handle defensively.
          result[slug] = { count: 1, userReacted: true };
        }
      });
    } catch (e) {
      console.warn('fsGetAllReactions own-reactions read failed:', e);
    }
  }

  return result;
}

async function fsLogUsage(email, title, category, tool, timeSavedMinutes, frequencyPerMonth) {
  const db = fsDb();
  const caller = fsCallerEmail();
  if (!db || !caller) return;
  // Clamp client-supplied numbers to defensible ranges; the rule also caps these.
  const mins = Math.max(0, Math.min(1440, Number(timeSavedMinutes) || 0));
  const freq = Math.max(0, Math.min(60,   Number(frequencyPerMonth) || 1));
  try {
    await db.collection('uc_usage').add({
      email:              caller,
      agencyKey:          emailToAgencyKey(caller) || 'unknown',
      useCaseTitle:       String(title    || '').slice(0, 200),
      category:           String(category || '').slice(0, 100),
      tool:               String(tool     || '').slice(0, 100),
      timeSavedMinutes:   mins,
      frequencyPerMonth:  freq,
      submittedBy:        caller,
      usedAt:             firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('fsLogUsage error:', e);
  }
}

async function fsGetUsageSummary() {
  const db = fsDb();
  if (!db) return {};
  try {
    const snap = await db.collection('uc_usage').get();
    const result = {};
    snap.docs.forEach(d => {
      const data = d.data();
      const key = data.useCaseTitle || '';
      if (!key) return;
      if (!result[key]) result[key] = { count: 0, totalMinutes: 0 };
      result[key].count++;
      result[key].totalMinutes += (data.timeSavedMinutes || 0);
    });
    return result;
  } catch (e) {
    console.warn('fsGetUsageSummary error:', e);
    return {};
  }
}

async function fsGetCopyCountSummary() {
  const db = fsDb();
  if (!db) return {};
  try {
    const snap = await db.collection('prompt_copies').get();
    const result = {};
    snap.docs.forEach(d => {
      const title = d.data().useCaseTitle || '';
      if (!title) return;
      result[title] = (result[title] || 0) + 1;
    });
    return result;
  } catch (e) {
    console.warn('fsGetCopyCountSummary error:', e);
    return {};
  }
}

async function fsGetTotalHoursSaved(agencyKeys) {
  const db = fsDb();
  if (!db) return 0;
  try {
    const snap = await db.collection('uc_usage').get();
    let total = 0;
    snap.docs.forEach(d => {
      if (agencyKeys && !agencyKeys.includes(d.data().agencyKey)) return;
      total += (d.data().timeSavedMinutes || 0);
    });
    return Math.round(total / 60);
  } catch (e) {
    return 0;
  }
}

async function fsGetTotalPromptCopies(agencyKeys) {
  const db = fsDb();
  if (!db) return 0;
  try {
    const snap = await db.collection('prompt_copies').get();
    if (!agencyKeys) return snap.size;
    return snap.docs.filter(d => agencyKeys.includes(d.data().agencyKey)).length;
  } catch (e) {
    return 0;
  }
}

// ── Site visit tracking ───────────────────────────────

async function fsLogVisit(email) {
  const db = fsDb();
  const caller = fsCallerEmail();
  if (!db || !caller) return;
  const today = new Date().toISOString().substring(0, 10);
  // M-3 Part 2: scope the daily-visit dedupe guard by uid, not email — keeps the
  // user's address out of localStorage keys (which any same-origin XSS could
  // enumerate). Fall back to 'anon' rather than the email if uid is unavailable;
  // we'd rather double-write a visit than leak PII into storage.
  const uid = (typeof window !== 'undefined' && typeof window.hubGetUid === 'function')
    ? (window.hubGetUid() || 'anon')
    : 'anon';
  const storageKey = 'miroma_visit_' + today + '_' + uid;
  if (localStorage.getItem(storageKey)) return;
  try {
    await db.collection('site_visits').add({
      email:       caller,
      agencyKey:   emailToAgencyKey(caller) || 'unknown',
      date:        today,
      submittedBy: caller,
      visitedAt:   firebase.firestore.FieldValue.serverTimestamp(),
    });
    localStorage.setItem(storageKey, '1');
  } catch (e) {
    console.warn('fsLogVisit error:', e);
  }
}

async function fsGetVisitorsThisMonth(agencyKeys) {
  const db = fsDb();
  if (!db) return 0;
  try {
    const now = new Date();
    const thisMonthStart = now.toISOString().substring(0, 7) + '-01';
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().substring(0, 10);
    const snap = await db.collection('site_visits')
      .where('date', '>=', thisMonthStart)
      .where('date', '<', nextMonthStart)
      .get();
    const emails = new Set();
    snap.docs.forEach(d => {
      const data = d.data();
      if (agencyKeys && !agencyKeys.includes(data.agencyKey)) return;
      if (data.email) emails.add(data.email);
    });
    return emails.size;
  } catch (e) {
    console.warn('fsGetVisitorsThisMonth error:', e);
    return 0;
  }
}

async function fsGetSiteVisitors(agencyKeys) {
  const db = fsDb();
  if (!db) return [];
  try {
    // Plain .get() (no orderBy) so documents without visitedAt are not excluded
    const snap = await db.collection('site_visits').get();
    const map = {};
    snap.docs.forEach(d => {
      const data = d.data();
      if (agencyKeys && !agencyKeys.includes(data.agencyKey)) return;
      if (!data.email) return;
      const key       = data.email.toLowerCase();
      const thisVisit = data.visitedAt?.toDate?.()?.toISOString() || data.date || null;
      // Keep the most recent visit per email
      if (!map[key] || (thisVisit && thisVisit > (map[key].lastVisit || ''))) {
        map[key] = {
          email:     key,
          agencyKey: data.agencyKey || 'unknown',
          lastVisit: thisVisit,
        };
      }
    });
    return Object.values(map).sort(function(a, b) {
      return (b.lastVisit || '').localeCompare(a.lastVisit || '');
    });
  } catch (e) {
    console.warn('fsGetSiteVisitors error:', e);
    return [];
  }
}

// ── ROI story submissions ─────────────────────────────

async function fsSubmitROIStory(data) {
  const db = fsDb();
  if (!db) throw new Error('Firestore not available');
  const caller = fsCallerEmail();
  if (!caller) throw new Error('Not signed in');
  await db.collection('roi_stories').add({
    ...data,
    submittedBy: caller,
    status:      'active',
    submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

async function fsGetROIStories(agencyKeys) {
  const db = fsDb();
  if (!db) return [];
  try {
    const snap = await db.collection('roi_stories').orderBy('submittedAt', 'desc').get();
    const all  = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      submittedAt: d.data().submittedAt?.toDate?.()?.toISOString() || null,
    }));
    if (!agencyKeys) return all;
    return all.filter(r => agencyKeys.includes(r.agencyKey));
  } catch (err) {
    console.warn('fsGetROIStories error:', err);
    return [];
  }
}

async function fsUpdateROIStoryStatus(id, status) {
  const db = fsDb();
  if (!db) return;
  await db.collection('roi_stories').doc(id).update({ status });
}

async function fsUpdateROIStory(id, data) {
  const db = fsDb();
  if (!db) throw new Error('Firestore not available');
  await db.collection('roi_stories').doc(id).update({
    ...data,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

// ── Agency admin overrides ────────────────────────────

async function fsGetAgencyAdminOverrides() {
  const db = fsDb();
  if (!db) return {};
  try {
    const snap = await db.collection('agency_admins').get();
    const result = {};
    snap.docs.forEach(d => { result[d.id] = d.data().admins || []; });
    return result;
  } catch (e) {
    console.warn('fsGetAgencyAdminOverrides error:', e);
    return {};
  }
}

// Fetches the override admin list for a single agency by ID. Used by
// agency-scoped admins, for whom the LIST query above is denied by
// the per-agency-isolation rule. Returns { [agencyKey]: [adminEntries] }
// to keep the same shape as fsGetAgencyAdminOverrides, so callers can
// merge results.
async function fsGetAgencyAdminsForAgency(agencyKey) {
  const db = fsDb();
  if (!db || !agencyKey) return {};
  try {
    const snap = await db.collection('agency_admins').doc(agencyKey).get();
    if (!snap.exists) return {};
    return { [agencyKey]: snap.data().admins || [] };
  } catch (e) {
    console.warn('fsGetAgencyAdminsForAgency error:', e);
    return {};
  }
}

async function fsSetAgencyAdmins(agencyKey, admins) {
  const db = fsDb();
  if (!db) throw new Error('Firestore not available');
  await db.collection('agency_admins').doc(agencyKey).set({
    admins,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

// ── License overrides (super-admin edits) ────────────

async function fsGetLicenseOverrides() {
  const db = fsDb();
  if (!db) return {};
  try {
    const snap = await db.collection('license_overrides').get();
    const result = {};
    snap.docs.forEach(d => { result[d.id] = d.data(); });
    return result;
  } catch (e) {
    console.warn('fsGetLicenseOverrides error:', e);
    return {};
  }
}

// Constrained-by-agency variant. Used by agency-scoped admins whose
// rule rejects the unconstrained LIST above but accepts a query filtered
// on `agencyKey == <their-own-agency>`. The matching rule is below in
// firestore.rules (allow list with resource.data.agencyKey check).
async function fsGetLicenseOverridesForAgency(agencyKey) {
  const db = fsDb();
  if (!db || !agencyKey) return {};
  try {
    const snap = await db.collection('license_overrides')
      .where('agencyKey', '==', agencyKey)
      .get();
    const result = {};
    snap.docs.forEach(d => { result[d.id] = d.data(); });
    return result;
  } catch (e) {
    console.warn('fsGetLicenseOverridesForAgency error:', e);
    return {};
  }
}

async function fsSetLicenseOverride(agencyKey, toolName, toolData) {
  const db = fsDb();
  if (!db) throw new Error('Firestore not available');
  const docId = agencyKey + '_' + toolName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  await db.collection('license_overrides').doc(docId).set({
    agencyKey,
    toolName,
    ...toolData,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

async function fsWriteAuditLog(entry) {
  const db = fsDb();
  if (!db) return;
  try {
    await db.collection('audit_log').add({
      ...entry,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('Audit log write failed (non-blocking):', e);
  }
}

async function fsGetAuditLog(agencyKey, toolName) {
  const db = fsDb();
  if (!db) return [];
  try {
    const snap = await db.collection('audit_log')
      .where('agencyKey', '==', agencyKey)
      .where('toolName', '==', toolName)
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get();
    return snap.docs.map(function(d) { return { id: d.id, ...d.data() }; });
  } catch (e) {
    console.warn('fsGetAuditLog error:', e);
    return [];
  }
}

async function fsGetUsageLogs(agencyKeys) {
  const db = fsDb();
  if (!db) return [];
  try {
    const snap = await db.collection('uc_usage').orderBy('usedAt', 'desc').get();
    const all = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      usedAt: d.data().usedAt?.toDate?.()?.toISOString() || null,
    }));
    if (!agencyKeys) return all;
    return all.filter(r => agencyKeys.includes(r.agencyKey));
  } catch (err) {
    console.warn('fsGetUsageLogs error:', err);
    return [];
  }
}

async function fsGetAllSiteVisits(agencyKeys) {
  const db = fsDb();
  if (!db) return [];
  try {
    const snap = await db.collection('site_visits').get();
    const all  = snap.docs.map(d => d.data());
    if (!agencyKeys) return all;
    return all.filter(r => agencyKeys.includes(r.agencyKey));
  } catch (e) {
    console.warn('fsGetAllSiteVisits error:', e);
    return [];
  }
}

// ── Group AI Progress (group_reports) ──────────────────
// Monthly cross-agency rollup, written offline by
// scripts/usage/aggregate-group-report.mjs (Admin SDK — client writes are
// rule-denied). Reads are gated to access==='all' in firestore.rules, same
// tier as the "AI Hub Engagement" tab. Returns the latest period's doc, or
// null if none has been published yet.
async function fsGetLatestGroupReport() {
  const db = fsDb();
  if (!db) return null;
  try {
    const snap = await db.collection('group_reports').orderBy('period', 'desc').limit(1).get();
    return snap.empty ? null : snap.docs[0].data();
  } catch (e) {
    console.warn('fsGetLatestGroupReport error:', e);
    return null;
  }
}

// ── Editable news content (content_news) ──────────────
// Admin-editable replacement for the hardcoded NEWS array in
// news-data.js. Public renderers fall back to the static array
// when this collection is empty or unreachable.

async function fsGetNews() {
  const db = fsDb();
  if (!db) return [];
  const snap = await db.collection('content_news').orderBy('date', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Saves a news item. Pass docId to update an existing item, omit to create.
// `item` must match the content_news rule shape (title/body/date/type, plus
// optional tool/links/video). updatedBy is stamped here and verified by the
// rules against the caller's token.
async function fsSaveNewsItem(item, docId) {
  const db = fsDb();
  if (!db) throw new Error('Firestore not available');
  const caller = fsCallerEmail();
  if (!caller) throw new Error('Not signed in');
  const data = {
    ...item,
    updatedBy: caller,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  if (docId) {
    await db.collection('content_news').doc(docId).set(data);
    return docId;
  }
  const ref = await db.collection('content_news').add(data);
  return ref.id;
}

async function fsDeleteNewsItem(docId) {
  const db = fsDb();
  if (!db) throw new Error('Firestore not available');
  await db.collection('content_news').doc(docId).delete();
}

// ── Editable use-case library (content_use_cases) ──────
// Admin-editable replacement for the hardcoded USE_CASES array in
// use-cases-data.js. The public page falls back to the static grid
// when this collection is empty or unreachable.
//
// Documents are keyed by slug (immutable — production uc_reactions
// data is keyed by the same slugs). Ordered by the `order` field,
// which preserves the use-cases page's pre-migration card order.
// NOTE: Firestore orderBy() excludes documents missing the field,
// so every save path below must always write `order`.

async function fsGetUseCases() {
  const db = fsDb();
  if (!db) return [];
  const snap = await db.collection('content_use_cases').orderBy('order').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Saves a use case at /content_use_cases/{slug}. `item` must match the
// rule shape (slug/title/category/tool/description/type/order plus
// optional fields). updatedBy is stamped here and verified by the rules
// against the caller's token. The slug doubles as the docId, so saving
// an existing slug overwrites that document — callers creating NEW items
// must check for an existing doc first (see admin-use-cases.js).
async function fsSaveUseCase(item) {
  const db = fsDb();
  if (!db) throw new Error('Firestore not available');
  const caller = fsCallerEmail();
  if (!caller) throw new Error('Not signed in');
  if (!item || !item.slug) throw new Error('Use case is missing its slug');
  const data = {
    ...item,
    updatedBy: caller,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection('content_use_cases').doc(item.slug).set(data);
  return item.slug;
}

async function fsUseCaseExists(slug) {
  const db = fsDb();
  if (!db) throw new Error('Firestore not available');
  const snap = await db.collection('content_use_cases').doc(slug).get();
  return snap.exists;
}

async function fsDeleteUseCase(slug) {
  const db = fsDb();
  if (!db) throw new Error('Firestore not available');
  await db.collection('content_use_cases').doc(slug).delete();
}

// Batch-writes `items` (already normalised to the rule shape, each with
// its slug) in a single Firestore batch. Firestore batches cap at 500
// writes — the library is ~108 items, so one batch is fine. Caller is
// responsible for filtering out slugs that already exist.
async function fsImportUseCases(items) {
  const db = fsDb();
  if (!db) throw new Error('Firestore not available');
  const caller = fsCallerEmail();
  if (!caller) throw new Error('Not signed in');
  const batch = db.batch();
  items.forEach(item => {
    batch.set(db.collection('content_use_cases').doc(item.slug), {
      ...item,
      updatedBy: caller,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
  return items.length;
}

// ── Agency meeting log ────────────────────────────────
// Entries stored at /agencyMeetings/{agencyKey}/entries/{YYYY-MM}.
// Readable by the agency's own admins; writable by super admins only
// (enforced in Firestore rules via canAccessAgency + isAdmin checks).

async function fsGetMeetingLog(agencyKey) {
  const db = fsDb();
  if (!db || !agencyKey) return [];
  try {
    const snap = await db.collection('agencyMeetings').doc(agencyKey)
      .collection('entries').orderBy('period', 'desc').get();
    return snap.docs.map(function(d) { return Object.assign({ _id: d.id }, d.data()); });
  } catch (e) {
    console.warn('fsGetMeetingLog failed for', agencyKey, e);
    return [];
  }
}

async function fsSetMeetingEntry(agencyKey, period, data) {
  const db = fsDb();
  if (!db) throw new Error('Firestore not available');
  const caller = fsCallerEmail();
  await db.collection('agencyMeetings').doc(agencyKey)
    .collection('entries').doc(period).set({
      agencyKey,
      period,
      meetingDate:     data.meetingDate     || '',
      goingWell:       data.goingWell       || '',
      needsAttention:  data.needsAttention  || '',
      actionsAgreed:   data.actionsAgreed   || '',
      updatedBy:  caller,
      updatedAt:  firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
}

// ── Global visit tracking (fires on every page) ───────
// Runs once per authenticated session per day, regardless of which page the user lands on.
document.addEventListener('mirAuthReady', function(e) {
  // M-3: prefer the event-detail email (authoritative from Firebase Auth);
  // fall back to firebase.auth().currentUser via hubGetEmail rather than
  // localStorage (which is a boolean now, not an email).
  const email = (e.detail && e.detail.email) || (typeof hubGetEmail === 'function' ? hubGetEmail() : '');
  if (email && email !== 'guest') fsLogVisit(email);
});
