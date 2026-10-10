const { onRequest } = require("firebase-functions/v2/https");
const { defineBoolean, defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { validateMainnetRelayRequest } = require("./wallet-mainnet-relay-policy");
const { validateSwapRelayRequest } = require('./wallet-mainnet-swap-policy');
const { readSwapSnapshot, MAINNET_SWAP_ENABLED } = require('./wallet-mainnet-swap-quote');
const { readSwapReceipt } = require('./wallet-mainnet-swap-receipt');
const { enforceMainnetProductionPolicy } = require("./wallet-mainnet-production-policy");
const { POLICY: MAINNET_PRODUCTION_POLICY } = require("./wallet-mainnet-production-policy");

const BSC_MAINNET_RPC_URL = defineSecret("BSC_MAINNET_RPC_URL");
const MAINNET_RELAY_ENABLED = defineBoolean("MAINNET_RELAY_ENABLED", { default: false });
const DIRECT_FIREBASE_APP_ID = "1:408482016151:android:f70176ead2a8491813b2d2";
const CHAIN_ID = 56;
const MAX_SERIALIZED_TRANSACTION_BYTES = 64 * 1024;
const MAX_REQUEST_BODY_BYTES = MAX_SERIALIZED_TRANSACTION_BYTES + 4 * 1024;
const REQUEST_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_SENDER_WINDOW = 3;
const CLAIM_LEASE_MS = 30_000;
const RPC_TIMEOUT_MS = 15_000;
const PUBLIC_SITE_ORIGINS = [
  "https://www.aurionxi.com",
  "https://aurionxi.com",
  "https://aurionxi.web.app",
];

function requestError(code, status) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function relayDocumentId(value) {
  const normalized = String(value || "").toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$|^[0-9a-f]{64}$/.test(normalized)) throw requestError("invalid_relay_identifier", 400);
  return normalized;
}

function rejectOversizedRequest(request) {
  const header = request.get("content-length");
  if (header === undefined || header === null || header === "") return;
  const contentLength = Number(header);
  if (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > MAX_REQUEST_BODY_BYTES) {
    throw requestError("request_too_large", 413);
  }
}

/** Valid App Check is insufficient: accept only the registered Direct Android app. */
async function requireDirectAppCheck(request, appCheck = admin.appCheck()) {
  const token = String(request.get("X-Firebase-AppCheck") || "").trim();
  if (!token) throw requestError("app_check_required", 401);
  let decoded;
  try { decoded = await appCheck.verifyToken(token); } catch { throw requestError("app_check_invalid", 401); }
  if (decoded?.appId !== DIRECT_FIREBASE_APP_ID) throw requestError("app_check_app_not_allowed", 403);
  return { appId: decoded.appId };
}

/** Atomically owns both sender quota and the exact transaction-hash lease. */
async function claimMainnetTransaction(sender, hash, reviewed, database = admin.firestore(), now = Date.now()) {
  const senderRef = database.collection("walletMainnetRelayQuotas").doc(relayDocumentId(sender));
  const hashRef = database.collection("walletMainnetRelayTransactions").doc(relayDocumentId(hash));
  const hasNonceIntent = Number.isSafeInteger(Number(reviewed.nonce)) && Number(reviewed.nonce) >= 0 && reviewed.nonce !== undefined
    && /^0x[0-9a-fA-F]{40}$/.test(String(reviewed.recipientAddress));
  const nonceRef = hasNonceIntent && reviewed.replacementKind !== "cancel"
    ? database.collection("walletMainnetRelayNonceIntents").doc(`${relayDocumentId(sender)}_${reviewed.nonce}`) : null;
  return database.runTransaction(async (transaction) => {
    const [quotaSnapshot, claimSnapshot, nonceSnapshot] = await Promise.all([transaction.get(senderRef), transaction.get(hashRef), nonceRef ? transaction.get(nonceRef) : null]);
    const claim = claimSnapshot.exists ? claimSnapshot.data() : {};
    if (claim.status === "accepted") return "duplicate";
    const claimedAt = Number(claim.claimedAt || 0);
    if (claim.status === "pending" && Number.isSafeInteger(claimedAt) && now - claimedAt < CLAIM_LEASE_MS) return "in-progress";

    const quota = quotaSnapshot.exists ? quotaSnapshot.data() : {};
    const windowStartedAt = Number(quota.windowStartedAt || 0);
    const inWindow = Number.isSafeInteger(windowStartedAt) && now >= windowStartedAt && now - windowStartedAt < REQUEST_WINDOW_MS;
    const count = inWindow ? Number(quota.count || 0) : 0;
    if (!Number.isSafeInteger(count) || count < 0 || count >= MAX_REQUESTS_PER_SENDER_WINDOW) {
      throw requestError("mainnet_broadcast_rate_limited", 429);
    }
    const dailyStartedAt = Number(quota.dailyStartedAt || 0);
    const inDailyWindow = Number.isSafeInteger(dailyStartedAt) && now >= dailyStartedAt
      && now - dailyStartedAt < MAINNET_PRODUCTION_POLICY.rollingWindowMs;
    const dailyCount = inDailyWindow ? Number(quota.dailyCount || 0) : 0;
    const dailyNativeBnbWei = inDailyWindow ? BigInt(String(quota.dailyNativeBnbWei || "0")) : 0n;
    const dailyArxiWei = inDailyWindow ? BigInt(String(quota.dailyArxiWei || "0")) : 0n;
    // Older quotas have no USDT counter; preserve their existing BNB/ARXI usage.
    const dailyUsdtWei = inDailyWindow ? BigInt(String(quota.dailyUsdtWei || "0")) : 0n;
    const cancellation = reviewed.replacementKind === "cancel";
    const nonceIntent = nonceSnapshot?.exists ? nonceSnapshot.data() : null;
    if (nonceIntent && (nonceIntent.recipientAddress !== reviewed.recipientAddress || nonceIntent.asset !== reviewed.asset || nonceIntent.amountWei !== reviewed.amountWei.toString())) throw requestError("mainnet_replacement_intent_mismatch", 422);
    const counted = nonceIntent && inDailyWindow && nonceIntent.dailyStartedAt === dailyStartedAt;
    const quotaAmount = counted ? 0n : reviewed.amountWei;
    const replacement = Boolean(reviewed.replacesTransactionHash);
    const dailyReplacementCount = inDailyWindow ? Number(quota.dailyReplacementCount || 0) : 0;
    if (!Number.isSafeInteger(dailyReplacementCount) || dailyReplacementCount < 0 || (replacement && dailyReplacementCount >= 5)) throw requestError("mainnet_daily_limit_reached", 429);
    const nextUsdtWei = dailyUsdtWei + (reviewed.asset === "usdt" ? quotaAmount : 0n);
    const nextNativeBnbWei = dailyNativeBnbWei + (reviewed.asset === "native-bnb" ? quotaAmount : 0n);
    const nextArxiWei = dailyArxiWei + (reviewed.asset === "arxi" ? quotaAmount : 0n);
    if ((!cancellation && !counted && dailyCount >= MAINNET_PRODUCTION_POLICY.maxTransactionsPerWindow)
      || nextNativeBnbWei > MAINNET_PRODUCTION_POLICY.maxNativeBnbPerWindowWei
      || nextArxiWei > MAINNET_PRODUCTION_POLICY.maxArxiPerWindowWei
      || nextUsdtWei > MAINNET_PRODUCTION_POLICY.maxUsdtPerWindowWei) {
      throw requestError("mainnet_daily_limit_reached", 429);
    }
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(senderRef, {
      windowStartedAt: inWindow ? windowStartedAt : now,
      count: count + 1,
      dailyStartedAt: inDailyWindow ? dailyStartedAt : now,
      dailyCount: dailyCount + (cancellation || counted ? 0 : 1),
      dailyReplacementCount: dailyReplacementCount + (replacement ? 1 : 0),
      dailyNativeBnbWei: nextNativeBnbWei.toString(),
      dailyArxiWei: nextArxiWei.toString(),
      dailyUsdtWei: nextUsdtWei.toString(),
      updatedAt: timestamp,
    }, { merge: true });
    if (nonceRef) transaction.set(nonceRef, { recipientAddress: reviewed.recipientAddress, asset: reviewed.asset, amountWei: reviewed.amountWei.toString(), dailyStartedAt: inDailyWindow ? dailyStartedAt : now, updatedAt: timestamp }, { merge: true });
    transaction.set(hashRef, { status: "pending", claimedAt: now, attempt: Number(claim.attempt || 0) + 1, updatedAt: timestamp }, { merge: true });
    return "claimed";
  });
}

async function completeMainnetTransaction(hash, database = admin.firestore()) {
  await database.collection("walletMainnetRelayTransactions").doc(relayDocumentId(hash)).set({
    status: "accepted",
    acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function failMainnetTransaction(hash, code, database = admin.firestore()) {
  await database.collection("walletMainnetRelayTransactions").doc(relayDocumentId(hash)).set({
    status: "failed",
    failureCode: String(code || "mainnet_broadcast_failed").slice(0, 80),
    failedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function submitMainnetRawTransaction(rpcUrl, serializedTransaction, expectedHash, fetchImpl = fetch) {
  if (!/^https:\/\/[^\s]+$/.test(String(rpcUrl || ""))) throw requestError("mainnet_broadcast_unavailable", 503);
  let response;
  try {
    response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "eth_sendRawTransaction", params: [serializedTransaction] }),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
  } catch { throw requestError("mainnet_broadcast_unavailable", 503); }
  if (!response?.ok) throw requestError("mainnet_broadcast_unavailable", 503);
  let payload;
  try { payload = await response.json(); } catch { throw requestError("mainnet_broadcast_unavailable", 503); }
  if (typeof payload?.result === "string" && payload.result.toLowerCase() === expectedHash.toLowerCase()) return expectedHash;
  const providerMessage = String(payload?.error?.message || "").toLowerCase();
  if (/already known|known transaction|already imported/.test(providerMessage)) return expectedHash;
  throw requestError("mainnet_broadcast_rejected", 422);
}

async function readMainnetReceipt(rpcUrl, hash, fetchImpl = fetch) {
  if (!/^https:\/\/[^\s]+$/.test(String(rpcUrl || "")) || !/^0x[0-9a-fA-F]{64}$/.test(String(hash || ""))) throw requestError("mainnet_receipt_unavailable", 503);
  // Use one deadline for all status reads; never treat a missing receipt as proof of pending.
  const signal = AbortSignal.timeout(RPC_TIMEOUT_MS);
  async function read(method, params) {
    try {
      const response = await fetchImpl(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }), signal });
      if (!response?.ok) throw new Error();
      const payload = await response.json();
      if (payload?.error || !Object.hasOwn(payload || {}, "result")) throw new Error();
      return payload.result;
    } catch { throw requestError("mainnet_receipt_unavailable", 503); }
  }
  if (String(await read("eth_chainId", [])).toLowerCase() !== "0x38") throw requestError("mainnet_chain_required", 503);
  const receipt = await read("eth_getTransactionReceipt", [hash]);
  if (receipt === null) {
    const transaction = await read("eth_getTransactionByHash", [hash]);
    if (transaction === null) return { state: "unknown", hash: hash.toLowerCase() };
    if (String(transaction?.hash || "").toLowerCase() !== hash.toLowerCase()) throw requestError("mainnet_receipt_unavailable", 503);
    return { state: "pending", hash: hash.toLowerCase() };
  }
  if (!receipt || String(receipt.transactionHash || "").toLowerCase() !== hash.toLowerCase() || !["0x0", "0x1"].includes(String(receipt.status).toLowerCase())) throw requestError("mainnet_receipt_unavailable", 503);
  return { state: String(receipt.status).toLowerCase() === "0x1" ? "confirmed" : "reverted", hash: hash.toLowerCase() };
}

const walletMainnetBroadcast = onRequest({
  region: "asia-south1",
  cors: PUBLIC_SITE_ORIGINS,
  maxInstances: 2,
  concurrency: 10,
  timeoutSeconds: 30,
  memory: "256MiB",
  secrets: [BSC_MAINNET_RPC_URL],
}, async (request, response) => {
  response.set("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.set("Allow", "POST");
    response.status(405).json({ error: "method_not_allowed" });
    return;
  }
  if (!["/v1/bsc-mainnet/broadcast", "/v1/bsc-mainnet/receipt", "/v1/bsc-mainnet/swap-broadcast", "/v1/bsc-mainnet/swap-receipt"].includes(request.path)) {
    response.status(404).json({ error: "not_found" });
    return;
  }

  let claimedHash;
  let submissionMayHaveOccurred = false;
  try {
    rejectOversizedRequest(request);
    const attestation = await requireDirectAppCheck(request);
    if (request.path === "/v1/bsc-mainnet/swap-receipt") {
      const receipt = await readSwapReceipt(BSC_MAINNET_RPC_URL.value(), String(request.body?.transactionHash || "").toLowerCase(), request.body?.senderAddress, request.body?.swapOperation);
      response.status(200).json(receipt); return;
    }
    if (request.path === "/v1/bsc-mainnet/receipt") {
      const receipt = await readMainnetReceipt(BSC_MAINNET_RPC_URL.value(), String(request.body?.transactionHash || ""));
      response.status(200).json(receipt);
      return;
    }
    // Disabling new submissions must not disable recovery of an earlier transfer.
    if (!MAINNET_RELAY_ENABLED.value()) throw requestError("mainnet_relay_disabled", 503);
    const isSwap = request.path === "/v1/bsc-mainnet/swap-broadcast";
    if (isSwap && !MAINNET_SWAP_ENABLED.value()) throw requestError("mainnet_swap_disabled", 503);
    const transaction = isSwap
      ? enforceMainnetProductionPolicy(validateSwapRelayRequest(request.body))
      : enforceMainnetProductionPolicy(validateMainnetRelayRequest(request.body));
    if (isSwap) { const o=transaction.swapOperation; await readSwapSnapshot({senderAddress:transaction.senderAddress,inputAsset:o.inputAsset,outputAsset:o.outputAsset,amountWei:o.intentAmountWei,reviewedOperation:o,reviewedNonce:String(transaction.nonce),reviewedGas:String(transaction.gasLimit),reviewedGasPrice:String(transaction.gasPriceWei)},BSC_MAINNET_RPC_URL.value()); }
    const claim = await claimMainnetTransaction(transaction.senderAddress, transaction.expectedHash, transaction);
    if (claim === "duplicate") {
      response.status(200).json({ accepted: true, chainId: CHAIN_ID, hash: transaction.expectedHash, duplicate: true });
      return;
    }
    if (claim === "in-progress") { submissionMayHaveOccurred = true; throw requestError("mainnet_transaction_in_progress", 409); }
    claimedHash = transaction.expectedHash;
    submissionMayHaveOccurred = true;
    const hash = await submitMainnetRawTransaction(BSC_MAINNET_RPC_URL.value(), transaction.serializedTransaction, transaction.expectedHash);
    await completeMainnetTransaction(hash);
    claimedHash = undefined;
    console.info("wallet_mainnet_broadcast", { outcome: "accepted", appId: attestation.appId });
    response.status(200).json({ accepted: true, chainId: CHAIN_ID, hash });
  } catch (error) {
    const status = Number(error?.status || 500);
    const code = typeof error?.code === "string" ? error.code : "mainnet_broadcast_failed";
    if (claimedHash) {
      try { await failMainnetTransaction(claimedHash, code); } catch { console.error("wallet_mainnet_broadcast_claim_update_failed", { code: "claim_update_failed" }); }
    }
    console.info("wallet_mainnet_broadcast", { outcome: "blocked_or_failed", code });
    response.status(status).json({ error: code, submissionState: submissionMayHaveOccurred ? "unknown" : "not-submitted" });
  }
});

module.exports = {
  CLAIM_LEASE_MS,
  DIRECT_FIREBASE_APP_ID,
  MAX_REQUESTS_PER_SENDER_WINDOW,
  REQUEST_WINDOW_MS,
  claimMainnetTransaction,
  completeMainnetTransaction,
  failMainnetTransaction,
  rejectOversizedRequest,
  relayDocumentId,
  requireDirectAppCheck,
  readMainnetReceipt,
  submitMainnetRawTransaction,
  walletMainnetBroadcast,
};
