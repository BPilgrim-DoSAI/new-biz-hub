import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  onCall,
  HttpsError,
} from 'firebase-functions/v2/https';
import { beforeUserSignedIn } from 'firebase-functions/v2/identity';

const app = initializeApp();
const db = getFirestore(app);
const auth = getAuth(app);

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
    status: 'active',
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
  if (updates.status && ['active', 'won', 'lost', 'archived'].includes(updates.status)) allowed.status = updates.status;
  if (updates.rawBrief && typeof updates.rawBrief === 'string') allowed.rawBrief = updates.rawBrief.slice(0, 50000);

  allowed.updatedAt = FieldValue.serverTimestamp();
  allowed.updatedBy = callerEmail;

  await db.collection('opportunities').doc(oppId).update(allowed);

  return { ok: true };
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
