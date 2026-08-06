import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import {
  onCall,
  HttpsError,
} from 'firebase-functions/v2/https';
import { beforeUserSignedIn } from 'firebase-functions/v2/identity';
import Anthropic from '@anthropic-ai/sdk';
import pdfParse from 'pdf-parse';

const app = initializeApp();
const db = getFirestore(app);
const auth = getAuth(app);

// ── Claude API client (lazy, central key) ───────────────
let _claude = null;
function getClaudeClient() {
  if (_claude) return _claude;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new HttpsError('unavailable', 'Claude API not configured. Set ANTHROPIC_API_KEY.');
  _claude = new Anthropic({ apiKey });
  return _claude;
}

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

// ── Domain → agencyKey map ──────────────────────────────
// Mirrors DOMAIN_TO_AGENCY_KEY in js/requests.js. Any change
// here must be reflected there (and vice versa) until the
// client-side map is deprecated in favour of the claim.
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

function agencyKeyFromEmail(email) {
  if (!email) return null;
  const domain = email.split('@')[1]?.toLowerCase();
  return DOMAIN_TO_AGENCY_KEY[domain] || null;
}

// ── Blocking auth: set agencyKey claim on every sign-in ──
// This runs before the ID token is minted, so the claim is
// available immediately — no token-refresh race.
export const setAgencyClaim = beforeUserSignedIn((event) => {
  const email = event.data?.email;
  const agencyKey = agencyKeyFromEmail(email);
  if (!agencyKey) return {};
  return {
    customClaims: { agencyKey },
  };
});

// ── Helpers ──────────────────────────────────────────────

async function verifyCallerIsAdmin(callerEmail) {
  const doc = await db.collection('admins').doc(callerEmail).get();
  if (!doc.exists) throw new HttpsError('permission-denied', 'Not an admin');
  return doc.data();
}

async function callerCanAccessAgency(callerEmail, agencyKey) {
  const profile = await verifyCallerIsAdmin(callerEmail);
  const access = profile.access || 'agency';
  if (access === 'all' || access === 'finance') return profile;
  if (profile.agency === agencyKey) return profile;
  const overrideDoc = await db.collection('agency_admins').doc(agencyKey).get();
  if (overrideDoc.exists) {
    const admins = overrideDoc.data().admins || [];
    const found = admins.some((a) => {
      const e = typeof a === 'string' ? a : a.email;
      return e?.toLowerCase() === callerEmail;
    });
    if (found) return profile;
  }
  throw new HttpsError('permission-denied', 'No access to this agency');
}

// ── Claude metering ─────────────────────────────────────
// Tracks per-agency token usage for new-biz Claude API calls.
// Increments atomically so concurrent calls don't lose counts.

// Approximate Claude Sonnet 4 list pricing, USD per million tokens. Used only
// to give the pitch-economics dashboard a directional AI-cost figure — not an
// invoice reconciliation, so a fixed rate is fine even as list pricing drifts.
const CLAUDE_INPUT_USD_PER_MTOK = 3;
const CLAUDE_OUTPUT_USD_PER_MTOK = 15;

async function meterUsage(agencyKey, inputTokens, outputTokens, phase, callerEmail, oppId) {
  const costUsd = (inputTokens / 1e6) * CLAUDE_INPUT_USD_PER_MTOK
    + (outputTokens / 1e6) * CLAUDE_OUTPUT_USD_PER_MTOK;

  const ref = db.collection('newbiz_usage').doc(agencyKey);
  await db.runTransaction(async (t) => {
    const doc = await t.get(ref);
    const data = doc.exists ? doc.data() : {};
    t.set(ref, {
      inputTokens: (data.inputTokens || 0) + inputTokens,
      outputTokens: (data.outputTokens || 0) + outputTokens,
      costUsd: (data.costUsd || 0) + costUsd,
      calls: (data.calls || 0) + 1,
      lastCallAt: FieldValue.serverTimestamp(),
      lastPhase: phase,
      lastCaller: callerEmail,
    }, { merge: true });
  });

  // Also roll the same usage up onto the opportunity itself, so the pitch
  // economics dashboard can attribute AI cost per-pitch, not just per-agency.
  if (oppId) {
    const oppRef = db.collection('opportunities').doc(oppId);
    await db.runTransaction(async (t) => {
      const doc = await t.get(oppRef);
      if (!doc.exists) return;
      const data = doc.data().claudeUsage || {};
      t.update(oppRef, {
        claudeUsage: {
          inputTokens: (data.inputTokens || 0) + inputTokens,
          outputTokens: (data.outputTokens || 0) + outputTokens,
          costUsd: (data.costUsd || 0) + costUsd,
          calls: (data.calls || 0) + 1,
        },
      });
    });
  }
}

// ── Newbiz access check (shared by all phase functions) ──

async function verifyNewBizAccess(request) {
  const callerEmail = request.auth?.token?.email?.toLowerCase();
  if (!callerEmail) throw new HttpsError('unauthenticated', 'Sign in required');

  const agencyKey = request.auth.token.agencyKey || agencyKeyFromEmail(callerEmail);
  if (!agencyKey) throw new HttpsError('permission-denied', 'No agency association');

  const hasAccess = request.auth.token.newbizAccess === true;
  if (!hasAccess) {
    const doc = await db.collection('newbiz_users').doc(agencyKey).get();
    const emails = doc.exists ? (doc.data().emails || []) : [];
    if (!emails.includes(callerEmail)) {
      const adminDoc = await db.collection('admins').doc(callerEmail).get();
      const isFullAccess = adminDoc.exists && ['all', 'finance'].includes(adminDoc.data().access);
      if (!isFullAccess) {
        throw new HttpsError('permission-denied', 'New Business access not granted');
      }
    }
  }

  return { callerEmail, agencyKey };
}

// Gates finance-sensitive endpoints (pitch cost entry, cross-agency
// analytics) to the two full-access admin tiers — AI team ('all') and
// 'finance'. Same tiers isFullAccessAdmin() covers in firestore.rules.
async function verifyFullAccessAdmin(request) {
  const callerEmail = request.auth?.token?.email?.toLowerCase();
  if (!callerEmail) throw new HttpsError('unauthenticated', 'Sign in required');

  const adminDoc = await db.collection('admins').doc(callerEmail).get();
  const access = adminDoc.exists ? adminDoc.data().access : null;
  if (!['all', 'finance'].includes(access)) {
    throw new HttpsError('permission-denied', 'Requires full-access admin (AI team or finance)');
  }
  return { callerEmail };
}

async function verifyOppAccess(request, oppId) {
  const { callerEmail, agencyKey } = await verifyNewBizAccess(request);

  const oppDoc = await db.collection('opportunities').doc(oppId).get();
  if (!oppDoc.exists) throw new HttpsError('not-found', 'Opportunity not found');

  const data = oppDoc.data();
  if (data.agencyKey !== agencyKey) {
    const adminDoc = await db.collection('admins').doc(callerEmail).get();
    const isFullAccess = adminDoc.exists && ['all', 'finance'].includes(adminDoc.data().access);
    if (!isFullAccess) {
      throw new HttpsError('permission-denied', 'No access to this opportunity');
    }
  }

  return { callerEmail, agencyKey, opp: { id: oppId, ...data } };
}

// ── Contribution logger ─────────────────────────────────

async function logContribution(oppId, { author, phase, type, summary }) {
  await db.collection('opportunities').doc(oppId)
    .collection('contributions').add({
      author,
      phase,
      type,
      summary,
      createdAt: FieldValue.serverTimestamp(),
    });
}

// ── New Biz user nomination ─────────────────────────────
// Called by agency admins to add/remove nominated new-biz users.
// Sets the newbizAccess custom claim so Firestore rules can
// check token.newbizAccess without a per-request get().

export const setNewBizUsers = onCall(async (request) => {
  const callerEmail = request.auth?.token?.email?.toLowerCase();
  if (!callerEmail) throw new HttpsError('unauthenticated', 'Sign in required');

  const { agencyKey, emails } = request.data;
  if (!agencyKey || !Array.isArray(emails)) {
    throw new HttpsError('invalid-argument', 'agencyKey and emails[] required');
  }

  await callerCanAccessAgency(callerEmail, agencyKey);

  const normalised = emails
    .filter((e) => typeof e === 'string' && e.includes('@'))
    .map((e) => e.toLowerCase().trim());

  await db.collection('newbiz_users').doc(agencyKey).set({
    emails: normalised,
    updatedBy: callerEmail,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const previousDoc = await db.collection('newbiz_users').doc(agencyKey).get();
  const previousEmails = previousDoc.exists ? (previousDoc.data().emails || []) : [];

  const allEmails = new Set([...normalised, ...previousEmails]);
  const claimUpdates = [];

  for (const email of allEmails) {
    const shouldHaveAccess = normalised.includes(email);
    try {
      const user = await auth.getUserByEmail(email);
      const existing = user.customClaims || {};
      if (existing.newbizAccess !== shouldHaveAccess) {
        claimUpdates.push(
          auth.setCustomUserClaims(user.uid, {
            ...existing,
            newbizAccess: shouldHaveAccess || null,
          })
        );
      }
    } catch (_) {
      // User doesn't exist in Firebase Auth yet — skip.
      // Claim will be set when they first sign in if they're
      // on the nomination list at that point.
    }
  }

  await Promise.all(claimUpdates);

  return { ok: true, count: normalised.length };
});

// ── Get New Biz users for an agency ─────────────────────

export const getNewBizUsers = onCall(async (request) => {
  const callerEmail = request.auth?.token?.email?.toLowerCase();
  if (!callerEmail) throw new HttpsError('unauthenticated', 'Sign in required');

  const { agencyKey } = request.data;
  if (!agencyKey) throw new HttpsError('invalid-argument', 'agencyKey required');

  await callerCanAccessAgency(callerEmail, agencyKey);

  const doc = await db.collection('newbiz_users').doc(agencyKey).get();
  return { emails: doc.exists ? (doc.data().emails || []) : [] };
});

// ── Check own new-biz access ────────────────────────────
// Called by the front end to verify the current user's
// newbizAccess state. Checks both the custom claim AND the
// newbiz_users doc as a fallback (covers the token-refresh
// timing gap).

export const checkNewBizAccess = onCall(async (request) => {
  const callerEmail = request.auth?.token?.email?.toLowerCase();
  if (!callerEmail) throw new HttpsError('unauthenticated', 'Sign in required');

  const agencyKey = agencyKeyFromEmail(callerEmail);
  if (!agencyKey) return { hasAccess: false };

  if (request.auth.token.newbizAccess === true) {
    return { hasAccess: true, agencyKey };
  }

  const doc = await db.collection('newbiz_users').doc(agencyKey).get();
  if (doc.exists && (doc.data().emails || []).includes(callerEmail)) {
    try {
      const user = await auth.getUserByEmail(callerEmail);
      const existing = user.customClaims || {};
      if (!existing.newbizAccess) {
        await auth.setCustomUserClaims(user.uid, {
          ...existing,
          newbizAccess: true,
        });
      }
    } catch (_) {}
    return { hasAccess: true, agencyKey };
  }

  // Full-access admins always have access
  try {
    const adminDoc = await db.collection('admins').doc(callerEmail).get();
    if (adminDoc.exists) {
      const access = adminDoc.data().access;
      if (access === 'all' || access === 'finance') {
        return { hasAccess: true, agencyKey, isAdmin: true };
      }
    }
  } catch (_) {}

  return { hasAccess: false };
});

// ── Opportunity CRUD ────────────────────────────────────

const VALID_PHASES = ['intake', 'agency-brief', 'questions', 'positioning', 'creative', 'ltx-prompts', 'knowledge', 'deck'];

// Pitch pipeline stage, distinct from `phase` (which tracks progress through
// the P0–P7 workflow). Set by the new-biz team from the opportunity list and
// consumed by the New Business Analytics dashboard for the funnel/win rate.
const PITCH_STATUSES = ['due', 'responding', 'pitched', 'procurement', 'won', 'lost'];

export const createOpportunity = onCall(async (request) => {
  const callerEmail = request.auth?.token?.email?.toLowerCase();
  if (!callerEmail) throw new HttpsError('unauthenticated', 'Sign in required');

  const agencyKey = request.auth.token.agencyKey || agencyKeyFromEmail(callerEmail);
  if (!agencyKey) throw new HttpsError('permission-denied', 'No agency association');

  const hasAccess = request.auth.token.newbizAccess === true;
  if (!hasAccess) {
    const doc = await db.collection('newbiz_users').doc(agencyKey).get();
    const emails = doc.exists ? (doc.data().emails || []) : [];
    if (!emails.includes(callerEmail)) {
      // Check admin fallback
      const adminDoc = await db.collection('admins').doc(callerEmail).get();
      const isFullAccess = adminDoc.exists && ['all', 'finance'].includes(adminDoc.data().access);
      if (!isFullAccess) {
        throw new HttpsError('permission-denied', 'New Business access not granted');
      }
    }
  }

  const { title, clientName } = request.data;
  if (!title || typeof title !== 'string') {
    throw new HttpsError('invalid-argument', 'title is required');
  }

  const ref = await db.collection('opportunities').add({
    title: title.slice(0, 200),
    clientName: (clientName || '').slice(0, 200),
    agencyKey,
    phase: 'intake',
    status: 'due',
    statusHistory: [{ status: 'due', at: Timestamp.now(), by: callerEmail }],
    createdBy: callerEmail,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { oppId: ref.id };
});

export const listOpportunities = onCall(async (request) => {
  const callerEmail = request.auth?.token?.email?.toLowerCase();
  if (!callerEmail) throw new HttpsError('unauthenticated', 'Sign in required');

  const agencyKey = request.auth.token.agencyKey || agencyKeyFromEmail(callerEmail);
  if (!agencyKey) throw new HttpsError('permission-denied', 'No agency association');

  // Full-access admins can optionally view another agency
  let targetAgency = agencyKey;
  if (request.data?.agencyKey) {
    const adminDoc = await db.collection('admins').doc(callerEmail).get();
    if (adminDoc.exists && ['all', 'finance'].includes(adminDoc.data().access)) {
      targetAgency = request.data.agencyKey;
    }
  }

  const snap = await db.collection('opportunities')
    .where('agencyKey', '==', targetAgency)
    .orderBy('updatedAt', 'desc')
    .limit(50)
    .get();

  return {
    opportunities: snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() || null,
    })),
  };
});

export const getOpportunity = onCall(async (request) => {
  const callerEmail = request.auth?.token?.email?.toLowerCase();
  if (!callerEmail) throw new HttpsError('unauthenticated', 'Sign in required');

  const { oppId } = request.data;
  if (!oppId) throw new HttpsError('invalid-argument', 'oppId required');

  const doc = await db.collection('opportunities').doc(oppId).get();
  if (!doc.exists) throw new HttpsError('not-found', 'Opportunity not found');

  const data = doc.data();
  const callerAgency = request.auth.token.agencyKey || agencyKeyFromEmail(callerEmail);

  // Agency isolation check
  if (data.agencyKey !== callerAgency) {
    const adminDoc = await db.collection('admins').doc(callerEmail).get();
    const isFullAccess = adminDoc.exists && ['all', 'finance'].includes(adminDoc.data().access);
    if (!isFullAccess) {
      throw new HttpsError('permission-denied', 'No access to this opportunity');
    }
  }

  // Load phase outputs
  const outputsSnap = await db.collection('opportunities').doc(oppId)
    .collection('phase_outputs').get();
  const phaseOutputs = {};
  outputsSnap.docs.forEach((d) => { phaseOutputs[d.id] = d.data(); });

  return {
    id: doc.id,
    ...data,
    createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
    phaseOutputs,
  };
});

export const updateOpportunity = onCall(async (request) => {
  const callerEmail = request.auth?.token?.email?.toLowerCase();
  if (!callerEmail) throw new HttpsError('unauthenticated', 'Sign in required');

  const { oppId, updates } = request.data;
  if (!oppId || !updates) throw new HttpsError('invalid-argument', 'oppId and updates required');

  const doc = await db.collection('opportunities').doc(oppId).get();
  if (!doc.exists) throw new HttpsError('not-found', 'Opportunity not found');

  const data = doc.data();
  const callerAgency = request.auth.token.agencyKey || agencyKeyFromEmail(callerEmail);

  if (data.agencyKey !== callerAgency) {
    const adminDoc = await db.collection('admins').doc(callerEmail).get();
    const isFullAccess = adminDoc.exists && ['all', 'finance'].includes(adminDoc.data().access);
    if (!isFullAccess) {
      throw new HttpsError('permission-denied', 'No access to this opportunity');
    }
  }

  const allowed = {};
  if (updates.title && typeof updates.title === 'string') allowed.title = updates.title.slice(0, 200);
  if (updates.clientName && typeof updates.clientName === 'string') allowed.clientName = updates.clientName.slice(0, 200);
  if (updates.phase && VALID_PHASES.includes(updates.phase)) allowed.phase = updates.phase;
  // Pitch status changes go through setOpportunityStatus (below) — it also
  // appends to statusHistory, which this generic endpoint doesn't do.
  if (updates.rawBrief && typeof updates.rawBrief === 'string') allowed.rawBrief = updates.rawBrief.slice(0, 50000);

  allowed.updatedAt = FieldValue.serverTimestamp();
  allowed.updatedBy = callerEmail;

  await db.collection('opportunities').doc(oppId).update(allowed);

  return { ok: true };
});

// ── Pitch status ────────────────────────────────────────
// The pitch pipeline stage (due → responding → pitched → procurement →
// won/lost), set by the new-biz team from the opportunity list. Distinct
// from `phase`, which tracks P0–P7 workflow progress. Appends to
// statusHistory so the analytics dashboard can compute win rate and
// cycle time (days between creation and won/lost).

export const setOpportunityStatus = onCall(async (request) => {
  const { oppId, status } = request.data;
  if (!oppId || !status) throw new HttpsError('invalid-argument', 'oppId and status required');
  if (!PITCH_STATUSES.includes(status)) throw new HttpsError('invalid-argument', 'Invalid status');

  const { callerEmail, opp } = await verifyOppAccess(request, oppId);

  if (opp.status === status) return { ok: true };

  await db.collection('opportunities').doc(oppId).update({
    status,
    statusHistory: FieldValue.arrayUnion({ status, at: Timestamp.now(), by: callerEmail }),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: callerEmail,
  });

  await logContribution(oppId, {
    author: callerEmail,
    phase: opp.phase,
    type: 'status-change',
    summary: `Status changed to "${status}"`,
  });

  return { ok: true };
});

// ── Pitch economics ─────────────────────────────────────
// Manually entered cost data (team time + hard costs) feeding the burn-rate
// and CAC figures on the New Business Analytics dashboard. Restricted to
// full-access admins (AI team / finance) — this is group financial data,
// not something individual agencies self-report, so it's edited from the
// admin dashboard rather than the opportunity workspace.

export const saveOpportunityEconomics = onCall(async (request) => {
  const { oppId, teamCostGBP, hardCostsGBP } = request.data;
  if (!oppId) throw new HttpsError('invalid-argument', 'oppId required');

  const { callerEmail } = await verifyFullAccessAdmin(request);

  const doc = await db.collection('opportunities').doc(oppId).get();
  if (!doc.exists) throw new HttpsError('not-found', 'Opportunity not found');

  const clean = (n) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0);

  await db.collection('opportunities').doc(oppId).update({
    economics: {
      teamCostGBP: clean(teamCostGBP),
      hardCostsGBP: clean(hardCostsGBP),
      updatedBy: callerEmail,
      updatedAt: FieldValue.serverTimestamp(),
    },
  });

  await logContribution(oppId, {
    author: callerEmail,
    phase: doc.data().phase,
    type: 'manual-edit',
    summary: 'Updated pitch cost estimate',
  });

  return { ok: true };
});

// ── New Business Analytics ──────────────────────────────
// Cross-agency aggregate view for the admin dashboard: pipeline volume,
// win rate, burn rate per pitch, and CAC. Full-access admins only — this
// reads every agency's opportunities, which no single-agency admin should
// see in aggregate.

// Approximate USD→GBP rate used only to blend AI cost (metered in USD) into
// the GBP totals alongside manually entered team/hard costs. Directional
// estimate, not an FX-accurate conversion.
const USD_TO_GBP = 0.79;

export const getNewBizAnalytics = onCall(async (request) => {
  await verifyFullAccessAdmin(request);

  const snap = await db.collection('opportunities').get();

  const byStatus = {};
  PITCH_STATUSES.forEach((s) => { byStatus[s] = 0; });

  let totalBurnGBP = 0;
  let wonCount = 0;
  let lostCount = 0;
  let wonBurnGBP = 0;
  let cycleDaysSum = 0;
  let cycleDaysCount = 0;
  const pitches = [];

  snap.docs.forEach((d) => {
    const o = d.data();
    const status = PITCH_STATUSES.includes(o.status) ? o.status : 'due';
    byStatus[status] += 1;

    const teamCostGBP = o.economics?.teamCostGBP || 0;
    const hardCostsGBP = o.economics?.hardCostsGBP || 0;
    const aiCostGBP = (o.claudeUsage?.costUsd || 0) * USD_TO_GBP;
    const totalCostGBP = teamCostGBP + hardCostsGBP + aiCostGBP;
    totalBurnGBP += totalCostGBP;

    let cycleDays = null;
    const createdAt = o.createdAt?.toDate?.();
    const closedEntry = (o.statusHistory || []).find((h) => h.status === 'won' || h.status === 'lost');
    const closedAt = closedEntry?.at?.toDate?.();
    if (createdAt && closedAt) {
      cycleDays = Math.max(0, Math.round((closedAt - createdAt) / 86400000));
      cycleDaysSum += cycleDays;
      cycleDaysCount += 1;
    }

    if (status === 'won') {
      wonCount += 1;
      wonBurnGBP += totalCostGBP;
    } else if (status === 'lost') {
      lostCount += 1;
    }

    pitches.push({
      id: d.id,
      title: o.title || '(untitled)',
      clientName: o.clientName || '',
      agencyKey: o.agencyKey || '',
      status,
      teamCostGBP: Math.round(teamCostGBP * 100) / 100,
      hardCostsGBP: Math.round(hardCostsGBP * 100) / 100,
      aiCostGBP: Math.round(aiCostGBP * 100) / 100,
      totalCostGBP: Math.round(totalCostGBP * 100) / 100,
      cycleDays,
    });
  });

  const closedTotal = wonCount + lostCount;

  return {
    totalOpportunities: snap.size,
    byStatus,
    winRate: closedTotal > 0 ? wonCount / closedTotal : null,
    wonCount,
    lostCount,
    cac: wonCount > 0 ? Math.round((wonBurnGBP / wonCount) * 100) / 100 : null,
    avgBurnPerPitchGBP: snap.size > 0 ? Math.round((totalBurnGBP / snap.size) * 100) / 100 : 0,
    totalBurnGBP: Math.round(totalBurnGBP * 100) / 100,
    avgCycleDays: cycleDaysCount > 0 ? Math.round(cycleDaysSum / cycleDaysCount) : null,
    pitches: pitches.sort((a, b) => b.totalCostGBP - a.totalCostGBP),
  };
});

// Save a phase output for an opportunity
export const savePhaseOutput = onCall(async (request) => {
  const callerEmail = request.auth?.token?.email?.toLowerCase();
  if (!callerEmail) throw new HttpsError('unauthenticated', 'Sign in required');

  const { oppId, phase, output } = request.data;
  if (!oppId || !phase || !output) {
    throw new HttpsError('invalid-argument', 'oppId, phase, and output required');
  }
  if (!VALID_PHASES.includes(phase)) {
    throw new HttpsError('invalid-argument', 'Invalid phase');
  }

  const oppDoc = await db.collection('opportunities').doc(oppId).get();
  if (!oppDoc.exists) throw new HttpsError('not-found', 'Opportunity not found');

  const data = oppDoc.data();
  const callerAgency = request.auth.token.agencyKey || agencyKeyFromEmail(callerEmail);

  if (data.agencyKey !== callerAgency) {
    const adminDoc = await db.collection('admins').doc(callerEmail).get();
    const isFullAccess = adminDoc.exists && ['all', 'finance'].includes(adminDoc.data().access);
    if (!isFullAccess) {
      throw new HttpsError('permission-denied', 'No access to this opportunity');
    }
  }

  await db.collection('opportunities').doc(oppId)
    .collection('phase_outputs').doc(phase).set({
      ...output,
      updatedBy: callerEmail,
      updatedAt: FieldValue.serverTimestamp(),
    });

  return { ok: true };
});

// ── Contributions ──────────────────────────────────────

export const listContributions = onCall(async (request) => {
  const { oppId } = request.data;
  if (!oppId) throw new HttpsError('invalid-argument', 'oppId required');

  await verifyOppAccess(request, oppId);

  const snap = await db.collection('opportunities').doc(oppId)
    .collection('contributions')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  return {
    contributions: snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null,
    })),
  };
});

export const editPhaseField = onCall(async (request) => {
  const { oppId, phase, field, value } = request.data;
  if (!oppId || !phase || !field) {
    throw new HttpsError('invalid-argument', 'oppId, phase, field required');
  }
  if (!VALID_PHASES.includes(phase)) {
    throw new HttpsError('invalid-argument', 'Invalid phase');
  }

  const { callerEmail } = await verifyOppAccess(request, oppId);

  await db.collection('opportunities').doc(oppId)
    .collection('phase_outputs').doc(phase).set({
      [field]: typeof value === 'string' ? value.slice(0, 50000) : value,
      updatedBy: callerEmail,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

  await logContribution(oppId, {
    author: callerEmail,
    phase,
    type: 'manual-edit',
    summary: `Edited ${field} in ${phase}`,
  });

  return { ok: true };
});

// ── Phase prompts ──────────────────────────────────────

const P1_SYSTEM = `You are a senior agency strategist helping refine a raw client brief into a structured agency brief. You must extract every available detail and fill gaps with informed placeholders marked [TBC].

Return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "clientName": "string",
  "clientIndustry": "string",
  "projectTitle": "string",
  "projectDescription": "string",
  "budget": "string — range or specific, or [TBC]",
  "timings": "string — key dates, deadlines, pitch date",
  "contacts": "string — client contacts with roles, or [TBC]",
  "marketContext": "string — competitive landscape, market position, category dynamics",
  "targetAudience": "string — who the work needs to reach",
  "objectives": "string — what the client wants to achieve",
  "deliverables": ["string array — explicit list of what needs to be produced"],
  "constraints": "string — mandatories, restrictions, brand guidelines",
  "additionalNotes": "string — anything else relevant"
}`;

const P2_SYSTEM = `You are a senior new business strategist. Given a structured agency brief, generate decisive questions that will sharpen the pitch. These should be questions that, if answered, would materially change the pitch strategy.

GAP ANALYSIS — do this first, silently:
Before generating questions, audit the brief for coverage gaps. A complete pitch brief typically covers: business context, competitive landscape, target audience depth, budget breakdown, decision-making process, success metrics, previous agency work, approval chain, pitch format preferences, timings/milestones, legal/regulatory constraints, brand guidelines, and data access. Identify which of these are missing, vague, or assumed rather than stated.

Front-load questions that fill the most critical gaps — information the pitch team literally cannot proceed without. Then add sharpening questions that go beyond what the brief states to uncover the real strategic problem.

Categorise each question as:
- strategic: reveals the client's real problem beyond the brief's framing
- commercial: clarifies budget, scope, decision-making, competitive situation
- creative: unlocks creative latitude or identifies constraints
- technical: specifications, measurements, delivery requirements

Tag gap-filling questions with "gap": true so the UI can distinguish them from sharpening questions.

Return ONLY valid JSON (no markdown fences):
{
  "questions": [
    {
      "text": "string — the question",
      "category": "strategic|commercial|creative|technical",
      "priority": "high|medium|low",
      "reasoning": "string — why this question matters for the pitch",
      "gap": true or false,
      "gapArea": "string — which brief area this fills (only if gap is true, e.g. 'decision criteria', 'success metrics')",
      "answer": ""
    }
  ]
}

Generate 8–12 questions. Front-load high-priority gap-filling questions first, then strategic sharpening questions.`;

const P3_SYSTEM = `You are a world-class brand strategist. Your job is to develop genuinely distinctive positioning territories for a pitch.

ANTI-REGRESSION-TO-THE-MEAN PROTOCOL — follow this exactly:

1. REJECT THE OBVIOUS. Before generating territories, name the category-average answer — the safe, expected, "any agency could pitch this" position. State it explicitly and explain why it's inadequate.

2. DIVERGE, DON'T VARY. Generate territories that are genuinely different from each other in kind, not variations on a theme. Each should come from a different strategic angle.

3. RIVAL TEST. For each territory, ask: "Which competing agency could also pitch this?" If the answer is "most of them", the territory isn't distinctive enough — sharpen or replace it.

4. GROUND IN SPECIFICS. Every territory must be anchored in THIS brand's specific truth and THIS market's specific dynamics. Never rely on generic category truisms like "consumers want authenticity" or "digital-first approach".

Return ONLY valid JSON (no markdown fences):
{
  "rejectedMean": {
    "territory": "string — the obvious, category-average position",
    "reasoning": "string — why this is inadequate and predictable"
  },
  "territories": [
    {
      "name": "string — short, memorable territory name",
      "headline": "string — one-sentence positioning statement",
      "insight": "string — the specific human/market truth this is built on",
      "expression": "string — how this would manifest in the work (tone, approach, key moves)",
      "distinctiveness": "string — what makes this ownable by THIS agency for THIS client",
      "rivalTest": "string — which rivals couldn't pitch this, and why"
    }
  ]
}

Generate exactly 3 territories. Make them genuinely divergent.`;

// ── P0: Parse uploaded client brief ─────────────────────
// Accepts a base64-encoded file (PDF, DOCX, or plain text),
// extracts the text, optionally stores the original in Storage,
// and uses Claude to produce a clean, structured extraction of
// the brief's contents so nothing is lost in copy-paste.

const PARSE_SYSTEM = `You are a document extraction specialist. Given the raw text extracted from a client brief document (PDF or Word), produce a clean, readable version of the brief that preserves ALL information.

Your job:
1. Fix OCR/extraction artefacts (broken line breaks, header/footer noise, page numbers, garbled tables).
2. Preserve every piece of substantive content — do NOT summarise or omit.
3. Organise into clear sections if the original has structure; otherwise present as flowing prose.
4. Flag any sections that appear incomplete or cut off with [INCOMPLETE] markers.
5. At the end, add a section called "BRIEF COVERAGE GAPS" that lists information a pitch team would typically need but that this brief does NOT provide (e.g. budget, timings, decision criteria, competitive context, measurement expectations). Be specific — "budget not stated" is useful; "more detail needed" is not.

Return plain text only (no markdown fences, no JSON).`;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export const parseClientBrief = onCall({ timeoutSeconds: 180 }, async (request) => {
  const { oppId, fileBase64, fileName, mimeType } = request.data;
  if (!oppId) throw new HttpsError('invalid-argument', 'oppId required');
  if (!fileBase64) throw new HttpsError('invalid-argument', 'fileBase64 required');

  const { callerEmail, agencyKey, opp } = await verifyOppAccess(request, oppId);

  const buf = Buffer.from(fileBase64, 'base64');
  if (buf.length > MAX_UPLOAD_BYTES) {
    throw new HttpsError('invalid-argument', 'File too large (max 10 MB)');
  }

  // Extract raw text based on file type
  let rawText = '';
  const mime = (mimeType || '').toLowerCase();
  const name = (fileName || '').toLowerCase();

  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    try {
      const parsed = await pdfParse(buf);
      rawText = parsed.text || '';
    } catch (err) {
      throw new HttpsError('invalid-argument', 'Could not parse PDF: ' + (err.message || ''));
    }
  } else if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    // DOCX: extract text from word/document.xml inside the zip
    try {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(buf);
      const docXml = await zip.file('word/document.xml')?.async('string');
      if (docXml) {
        rawText = docXml
          .replace(/<\/w:p>/g, '\n')
          .replace(/<\/w:r>/g, ' ')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/ +/g, ' ')
          .trim();
      }
    } catch (err) {
      throw new HttpsError('invalid-argument', 'Could not parse DOCX: ' + (err.message || ''));
    }
  } else if (mime === 'text/plain' || name.endsWith('.txt')) {
    rawText = buf.toString('utf-8');
  } else {
    throw new HttpsError('invalid-argument', 'Unsupported file type. Upload a PDF, DOCX, or TXT file.');
  }

  if (!rawText.trim()) {
    throw new HttpsError('invalid-argument', 'No text could be extracted from the file.');
  }

  // Store original file in Storage for audit trail
  try {
    const bucket = getStorage().bucket();
    const storagePath = `opportunities/${agencyKey}/${oppId}/uploads/${fileName || 'client-brief'}`;
    const file = bucket.file(storagePath);
    await file.save(buf, { contentType: mimeType || 'application/octet-stream' });
  } catch (err) {
    // Non-fatal — the extraction still works even if storage fails
    console.warn('Failed to store uploaded file:', err.message);
  }

  // Use Claude to clean up and structure the extracted text + identify gaps
  const claude = getClaudeClient();

  const msg = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8192,
    system: PARSE_SYSTEM,
    messages: [{
      role: 'user',
      content: `Here is the raw text extracted from the client brief document "${fileName || 'unknown'}":\n\n${rawText.slice(0, 50000)}`,
    }],
  });

  const cleanedText = msg.content[0]?.text || rawText;

  await meterUsage(agencyKey, msg.usage.input_tokens, msg.usage.output_tokens, 'intake-parse', callerEmail, oppId);

  await logContribution(oppId, {
    author: callerEmail,
    phase: 'intake',
    type: 'file-upload',
    summary: `Uploaded and parsed client brief: ${fileName || 'document'}`,
  });

  return { ok: true, extractedText: cleanedText, fileName: fileName || 'document' };
});

// ── P1: Agency Brief ────────────────────────────────────

export const runAgencyBrief = onCall({ timeoutSeconds: 120 }, async (request) => {
  const { oppId } = request.data;
  if (!oppId) throw new HttpsError('invalid-argument', 'oppId required');

  const { callerEmail, agencyKey, opp } = await verifyOppAccess(request, oppId);

  if (!opp.rawBrief) {
    throw new HttpsError('failed-precondition', 'No raw brief found. Complete P0 Intake first.');
  }

  const claude = getClaudeClient();

  const msg = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    system: P1_SYSTEM,
    messages: [{
      role: 'user',
      content: `Here is the raw client brief to structure:\n\n${opp.rawBrief}`,
    }],
  });

  const text = msg.content[0]?.text || '';
  let structured;
  try {
    structured = JSON.parse(text);
  } catch {
    throw new HttpsError('internal', 'Failed to parse Claude response as JSON');
  }

  await meterUsage(agencyKey, msg.usage.input_tokens, msg.usage.output_tokens, 'agency-brief', callerEmail, oppId);

  await db.collection('opportunities').doc(oppId)
    .collection('phase_outputs').doc('agency-brief').set({
      ...structured,
      generatedBy: callerEmail,
      updatedBy: callerEmail,
      updatedAt: FieldValue.serverTimestamp(),
    });

  await logContribution(oppId, {
    author: callerEmail,
    phase: 'agency-brief',
    type: 'claude-generation',
    summary: 'Generated structured agency brief from raw brief',
  });

  return { ok: true, brief: structured };
});

// ── P2: Questions ───────────────────────────────────────

export const runQuestions = onCall({ timeoutSeconds: 120 }, async (request) => {
  const { oppId } = request.data;
  if (!oppId) throw new HttpsError('invalid-argument', 'oppId required');

  const { callerEmail, agencyKey, opp } = await verifyOppAccess(request, oppId);

  const briefDoc = await db.collection('opportunities').doc(oppId)
    .collection('phase_outputs').doc('agency-brief').get();
  if (!briefDoc.exists) {
    throw new HttpsError('failed-precondition', 'No structured brief found. Complete P1 first.');
  }

  const brief = briefDoc.data();
  const briefText = [
    `Client: ${brief.clientName || '[TBC]'}`,
    `Industry: ${brief.clientIndustry || '[TBC]'}`,
    `Project: ${brief.projectTitle || '[TBC]'}`,
    `Description: ${brief.projectDescription || '[TBC]'}`,
    `Budget: ${brief.budget || '[TBC]'}`,
    `Timings: ${brief.timings || '[TBC]'}`,
    `Market context: ${brief.marketContext || '[TBC]'}`,
    `Target audience: ${brief.targetAudience || '[TBC]'}`,
    `Objectives: ${brief.objectives || '[TBC]'}`,
    `Deliverables: ${Array.isArray(brief.deliverables) ? brief.deliverables.join(', ') : (brief.deliverables || '[TBC]')}`,
    `Constraints: ${brief.constraints || '[TBC]'}`,
  ].join('\n');

  const claude = getClaudeClient();

  const msg = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    system: P2_SYSTEM,
    messages: [{
      role: 'user',
      content: `Here is the structured agency brief:\n\n${briefText}`,
    }],
  });

  const text = msg.content[0]?.text || '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpsError('internal', 'Failed to parse Claude response as JSON');
  }

  await meterUsage(agencyKey, msg.usage.input_tokens, msg.usage.output_tokens, 'questions', callerEmail, oppId);

  await db.collection('opportunities').doc(oppId)
    .collection('phase_outputs').doc('questions').set({
      questions: parsed.questions || [],
      generatedBy: callerEmail,
      updatedBy: callerEmail,
      updatedAt: FieldValue.serverTimestamp(),
    });

  await logContribution(oppId, {
    author: callerEmail,
    phase: 'questions',
    type: 'claude-generation',
    summary: `Generated ${(parsed.questions || []).length} decisive questions`,
  });

  return { ok: true, questions: parsed.questions || [] };
});

// ── P3: Strategic Positioning ───────────────────────────

export const runPositioning = onCall({ timeoutSeconds: 120 }, async (request) => {
  const { oppId } = request.data;
  if (!oppId) throw new HttpsError('invalid-argument', 'oppId required');

  const { callerEmail, agencyKey, opp } = await verifyOppAccess(request, oppId);

  const [briefDoc, questionsDoc] = await Promise.all([
    db.collection('opportunities').doc(oppId)
      .collection('phase_outputs').doc('agency-brief').get(),
    db.collection('opportunities').doc(oppId)
      .collection('phase_outputs').doc('questions').get(),
  ]);

  if (!briefDoc.exists) {
    throw new HttpsError('failed-precondition', 'No structured brief found. Complete P1 first.');
  }

  const brief = briefDoc.data();
  const questions = questionsDoc.exists ? (questionsDoc.data().questions || []) : [];

  const answeredQs = questions
    .filter((q) => q.answer && q.answer.trim())
    .map((q) => `Q: ${q.text}\nA: ${q.answer}`)
    .join('\n\n');

  const context = [
    `CLIENT: ${brief.clientName || '[TBC]'}`,
    `INDUSTRY: ${brief.clientIndustry || '[TBC]'}`,
    `PROJECT: ${brief.projectTitle || '[TBC]'}`,
    `DESCRIPTION: ${brief.projectDescription || '[TBC]'}`,
    `MARKET CONTEXT: ${brief.marketContext || '[TBC]'}`,
    `TARGET AUDIENCE: ${brief.targetAudience || '[TBC]'}`,
    `OBJECTIVES: ${brief.objectives || '[TBC]'}`,
    `DELIVERABLES: ${Array.isArray(brief.deliverables) ? brief.deliverables.join(', ') : (brief.deliverables || '[TBC]')}`,
    answeredQs ? `\nKEY INTELLIGENCE (answered questions):\n${answeredQs}` : '',
  ].join('\n');

  const claude = getClaudeClient();

  const msg = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 6144,
    system: P3_SYSTEM,
    messages: [{
      role: 'user',
      content: `Develop positioning territories for this pitch:\n\n${context}`,
    }],
  });

  const text = msg.content[0]?.text || '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpsError('internal', 'Failed to parse Claude response as JSON');
  }

  await meterUsage(agencyKey, msg.usage.input_tokens, msg.usage.output_tokens, 'positioning', callerEmail, oppId);

  await db.collection('opportunities').doc(oppId)
    .collection('phase_outputs').doc('positioning').set({
      rejectedMean: parsed.rejectedMean || null,
      territories: parsed.territories || [],
      selectedTerritory: null,
      selectionRationale: null,
      generatedBy: callerEmail,
      updatedBy: callerEmail,
      updatedAt: FieldValue.serverTimestamp(),
    });

  await logContribution(oppId, {
    author: callerEmail,
    phase: 'positioning',
    type: 'claude-generation',
    summary: `Generated ${(parsed.territories || []).length} positioning territories (anti-mean applied)`,
  });

  return { ok: true, positioning: parsed };
});

// ── Select positioning territory ────────────────────────

export const selectTerritory = onCall(async (request) => {
  const { oppId, territoryIndex, rationale } = request.data;
  if (!oppId || territoryIndex === undefined) {
    throw new HttpsError('invalid-argument', 'oppId and territoryIndex required');
  }

  const { callerEmail } = await verifyOppAccess(request, oppId);

  const posDoc = await db.collection('opportunities').doc(oppId)
    .collection('phase_outputs').doc('positioning').get();
  if (!posDoc.exists) {
    throw new HttpsError('failed-precondition', 'No positioning output. Run P3 first.');
  }

  const territories = posDoc.data().territories || [];
  if (territoryIndex < 0 || territoryIndex >= territories.length) {
    throw new HttpsError('invalid-argument', 'Invalid territory index');
  }

  await db.collection('opportunities').doc(oppId)
    .collection('phase_outputs').doc('positioning').update({
      selectedTerritory: territoryIndex,
      selectionRationale: (rationale || '').slice(0, 5000),
      selectedBy: callerEmail,
      updatedBy: callerEmail,
      updatedAt: FieldValue.serverTimestamp(),
    });

  await logContribution(oppId, {
    author: callerEmail,
    phase: 'positioning',
    type: 'territory-selection',
    summary: `Selected territory: ${territories[territoryIndex]?.name || territoryIndex}`,
  });

  return { ok: true };
});

// ── Save question answer ────────────────────────────────

export const saveQuestionAnswer = onCall(async (request) => {
  const { oppId, questionIndex, answer } = request.data;
  if (!oppId || questionIndex === undefined) {
    throw new HttpsError('invalid-argument', 'oppId and questionIndex required');
  }

  const { callerEmail } = await verifyOppAccess(request, oppId);

  const qDoc = await db.collection('opportunities').doc(oppId)
    .collection('phase_outputs').doc('questions').get();
  if (!qDoc.exists) {
    throw new HttpsError('failed-precondition', 'No questions output. Run P2 first.');
  }

  const questions = qDoc.data().questions || [];
  if (questionIndex < 0 || questionIndex >= questions.length) {
    throw new HttpsError('invalid-argument', 'Invalid question index');
  }

  questions[questionIndex].answer = (answer || '').slice(0, 5000);
  questions[questionIndex].answeredBy = callerEmail;

  await db.collection('opportunities').doc(oppId)
    .collection('phase_outputs').doc('questions').update({
      questions,
      updatedBy: callerEmail,
      updatedAt: FieldValue.serverTimestamp(),
    });

  await logContribution(oppId, {
    author: callerEmail,
    phase: 'questions',
    type: 'answer',
    summary: `Answered question ${questionIndex + 1}`,
  });

  return { ok: true };
});
