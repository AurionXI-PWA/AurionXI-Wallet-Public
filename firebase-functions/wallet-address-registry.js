const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { ethers } = require('ethers');

const DIRECT_FIREBASE_APP_ID = '1:408482016151:android:f70176ead2a8491813b2d2';
const COLLECTION = 'walletPublicAddressRegistry';
const CONSENT_VERSION = 'wallet-public-address-registry-v1';

function registryId(address) {
  return ethers.getAddress(String(address || '').trim()).slice(2).toLowerCase();
}

async function requireDirectAppCheck(request) {
  const token = String(request.get('X-Firebase-AppCheck') || '').trim();
  if (!token) throw Object.assign(new Error('app_check_required'), { status: 401 });
  let decoded;
  try { decoded = await admin.appCheck().verifyToken(token); } catch { throw Object.assign(new Error('app_check_invalid'), { status: 401 }); }
  if (decoded?.appId !== DIRECT_FIREBASE_APP_ID) throw Object.assign(new Error('app_check_app_not_allowed'), { status: 403 });
  return decoded.appId;
}

const walletAddressRegistry = onRequest({ region: 'asia-south1', cors: false }, async (request, response) => {
  try {
    if (request.method !== 'POST') return response.status(405).json({ error: 'method_not_allowed' });
    const appId = await requireDirectAppCheck(request);
    const action = String(request.body?.action || '');
    const publicAddress = ethers.getAddress(String(request.body?.publicAddress || '').trim());
    const origin = String(request.body?.origin || 'existing');
    if (!['create', 'import', 'existing'].includes(origin)) return response.status(400).json({ error: 'invalid_origin' });
    if (request.body?.consentVersion !== CONSENT_VERSION) return response.status(400).json({ error: 'invalid_consent' });
    const ref = admin.firestore().collection(COLLECTION).doc(registryId(publicAddress));
    if (action === 'withdraw') {
      await ref.delete();
      return response.status(200).json({ registered: false });
    }
    if (action !== 'register') return response.status(400).json({ error: 'invalid_action' });
    const existing = await ref.get();
    const now = admin.firestore.FieldValue.serverTimestamp();
    await ref.set({
      publicAddress,
      chainId: 56,
      origin: existing.exists ? (existing.data()?.origin || origin) : origin,
      consentVersion: CONSENT_VERSION,
      registeredAppId: appId,
      firstRegisteredAt: existing.exists ? existing.data()?.firstRegisteredAt || now : now,
      lastRegisteredAt: now,
    }, { merge: true });
    return response.status(200).json({ registered: true, publicAddress });
  } catch (error) {
    const status = Number(error?.status || (error?.code === 'INVALID_ARGUMENT' ? 400 : 500));
    return response.status(status).json({ error: status === 500 ? 'registry_failed' : String(error.message || 'invalid_request') });
  }
});

const getWalletAddressRegistry = onCall({ region: 'asia-south1' }, async (request) => {
  if (!request.auth || !['founder', 'admin'].includes(request.auth.token.role)) {
    throw new HttpsError('permission-denied', 'Founder or Admin access is required.');
  }
  const collection = admin.firestore().collection(COLLECTION);
  const cursor = String(request.data?.cursor || '').toLowerCase();
  if (cursor && !/^[0-9a-f]{40}$/.test(cursor)) throw new HttpsError('invalid-argument', 'Invalid page cursor.');
  const basePage = collection.orderBy(admin.firestore.FieldPath.documentId());
  const pageQuery = cursor ? basePage.startAfter(cursor).limit(101) : basePage.limit(101);
  const [all, created, imported, page] = await Promise.all([
    collection.count().get(),
    collection.where('origin', '==', 'create').count().get(),
    collection.where('origin', '==', 'import').count().get(),
    pageQuery.get(),
  ]);
  const iso = (value) => value?.toDate?.().toISOString?.() || null;
  const docs = page.docs.slice(0, 100);
  return {
    counts: { total: all.data().count, created: created.data().count, imported: imported.data().count },
    addresses: docs.map((doc) => ({
      publicAddress: doc.data().publicAddress,
      origin: doc.data().origin,
      firstRegisteredAt: iso(doc.data().firstRegisteredAt),
      lastRegisteredAt: iso(doc.data().lastRegisteredAt),
    })),
    nextCursor: page.docs.length > 100 ? docs[docs.length - 1].id : null,
  };
});

module.exports = { CONSENT_VERSION, getWalletAddressRegistry, registryId, walletAddressRegistry };
