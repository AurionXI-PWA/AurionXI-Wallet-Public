const { onRequest } = require("firebase-functions/v2/https");
const { defineBoolean, defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { Transaction } = require("ethers");

const ANKR_BSC_TESTNET_RPC_URL = defineSecret("ANKR_BSC_TESTNET_RPC_URL");
// Staged rollout: enable only after the Android client is registered in App
// Check and has demonstrated valid token delivery in monitor mode.
const ENFORCE_TESTNET_APP_CHECK = defineBoolean("ENFORCE_TESTNET_APP_CHECK", { default: false });
const BSC_TESTNET_CHAIN_ID = 97n;
const MAX_SERIALIZED_TRANSACTION_BYTES = 64 * 1024;
const MAX_REQUEST_BODY_BYTES = MAX_SERIALIZED_TRANSACTION_BYTES + 2 * 1024;
const MAX_GAS_LIMIT = 500_000n;
const MAX_REQUESTS_PER_SENDER_WINDOW = 5;
const REQUEST_WINDOW_MS = 60_000;
const RECENT_TRANSACTION_TTL_MS = 10 * 60_000;
const RELAY_CLAIM_RETRY_AFTER_MS = 30_000;
const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";
const CURATED_TOKEN_CONTRACTS = new Set([
  "0x3a3f02f22a6cf16122a7c752b73e65e05df466fa", // ARXI Testnet
  "0x337610d27c682e347c9cd60bd4b3b107c9d34ddd", // reviewed USDT Testnet
]);
const PUBLIC_SITE_ORIGINS = [
  "https://www.aurionxi.com",
  "https://aurionxi.com",
  "https://aurionxi.web.app",
];
const senderRequestWindows = new Map();
const recentTransactionHashes = new Map();

function isHash(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function isSerializedTransaction(value) {
  return typeof value === "string"
    && /^0x[0-9a-fA-F]+$/.test(value)
    && value.length % 2 === 0
    && (value.length - 2) / 2 <= MAX_SERIALIZED_TRANSACTION_BYTES;
}

function requestError(code, status) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

async function verifyAppCheckToken(request) {
  const token = String(request.get("X-Firebase-AppCheck") || "").trim();
  if (!token) {
    if (ENFORCE_TESTNET_APP_CHECK.value()) throw requestError("app_check_required", 401);
    return "missing";
  }
  try {
    await admin.appCheck().verifyToken(token);
    return "valid";
  } catch {
    if (ENFORCE_TESTNET_APP_CHECK.value()) throw requestError("app_check_invalid", 401);
    return "invalid";
  }
}

function validateSignedTestnetTransaction(body) {
  const serializedTransaction = String(body?.serializedTransaction || "").trim();
  const expectedHash = String(body?.expectedHash || "").trim().toLowerCase();
  if (!isSerializedTransaction(serializedTransaction)) throw requestError("invalid_serialized_transaction", 400);
  if (!isHash(expectedHash)) throw requestError("invalid_expected_hash", 400);

  let transaction;
  try {
    transaction = Transaction.from(serializedTransaction);
  } catch {
    throw requestError("invalid_serialized_transaction", 400);
  }

  if (!transaction.isSigned() || !transaction.hash) throw requestError("unsigned_transaction", 400);
  if (transaction.chainId !== BSC_TESTNET_CHAIN_ID) throw requestError("testnet_chain_required", 400);
  if (transaction.hash.toLowerCase() !== expectedHash) throw requestError("transaction_hash_mismatch", 400);
  if (!transaction.to) throw requestError("contract_deployment_not_supported", 400);
  if (transaction.gasLimit <= 0n || transaction.gasLimit > MAX_GAS_LIMIT) throw requestError("unsupported_gas_limit", 400);

  const target = transaction.to.toLowerCase();
  const data = transaction.data.toLowerCase();
  if (CURATED_TOKEN_CONTRACTS.has(target)) {
    if (!new RegExp(`^${ERC20_TRANSFER_SELECTOR}[0-9a-f]{128}$`).test(data) || transaction.value !== 0n) {
      throw requestError("unsupported_token_call", 400);
    }
  } else if (data !== "0x" || transaction.value <= 0n) {
    throw requestError("supported_asset_transfer_required", 400);
  }

  return { serializedTransaction, expectedHash, sender: transaction.from.toLowerCase() };
}

function rejectOversizedRequest(request) {
  const contentLength = Number(request.get("content-length") || 0);
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > MAX_REQUEST_BODY_BYTES) {
    throw requestError("request_too_large", 413);
  }
}

function consumeSenderRateLimit(sender, now = Date.now()) {
  const current = senderRequestWindows.get(sender);
  const window = current && now - current.startedAt < REQUEST_WINDOW_MS
    ? current
    : { startedAt: now, count: 0 };
  if (window.count >= MAX_REQUESTS_PER_SENDER_WINDOW) {
    throw requestError("testnet_broadcast_rate_limited", 429);
  }
  window.count += 1;
  senderRequestWindows.set(sender, window);
}

function isRecentlyBroadcast(expectedHash, now = Date.now()) {
  const previous = recentTransactionHashes.get(expectedHash);
  return Boolean(previous && now - previous < RECENT_TRANSACTION_TTL_MS);
}

function rememberBroadcast(expectedHash, now = Date.now()) {
  recentTransactionHashes.set(expectedHash, now);
}

function relayDocumentId(value) {
  return String(value).replace(/^0x/, "").toLowerCase();
}

/**
 * Durable quota: unlike the in-memory fast-path, this transaction survives
 * restarts and is shared by every serving instance.
 */
async function consumeDurableSenderRateLimit(sender, now = Date.now(), database = admin.firestore()) {
  const quotaRef = database.collection("walletTestnetRelayQuotas").doc(relayDocumentId(sender));
  await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(quotaRef);
    const existing = snapshot.exists ? snapshot.data() : {};
    const startedAt = Number(existing.windowStartedAt || 0);
    const inWindow = now - startedAt < REQUEST_WINDOW_MS;
    const count = inWindow ? Number(existing.count || 0) : 0;
    if (count >= MAX_REQUESTS_PER_SENDER_WINDOW) {
      throw requestError("testnet_broadcast_rate_limited", 429);
    }
    transaction.set(quotaRef, {
      windowStartedAt: inWindow ? startedAt : now,
      count: count + 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

async function claimDurableTransaction(expectedHash, now = Date.now(), database = admin.firestore()) {
  const claimRef = database.collection("walletTestnetRelayTransactions").doc(relayDocumentId(expectedHash));
  return database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(claimRef);
    const existing = snapshot.exists ? snapshot.data() : undefined;
    const claimStartedAt = Number(existing?.claimStartedAt || 0);
    if (existing?.status === "accepted") return "accepted";
    if (existing?.status === "pending" && now - claimStartedAt < RELAY_CLAIM_RETRY_AFTER_MS) return "pending";
    transaction.set(claimRef, {
      status: "pending",
      claimStartedAt: now,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return "claimed";
  });
}

async function completeDurableTransaction(expectedHash, database = admin.firestore()) {
  await database.collection("walletTestnetRelayTransactions").doc(relayDocumentId(expectedHash)).set({
    status: "accepted",
    acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function releaseDurableTransaction(expectedHash, database = admin.firestore()) {
  await database.collection("walletTestnetRelayTransactions").doc(relayDocumentId(expectedHash)).set({
    status: "failed",
    failedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function submitRawTransaction(rpcUrl, serializedTransaction, expectedHash) {
  if (!/^https:\/\//.test(String(rpcUrl || ""))) throw requestError("testnet_broadcast_unavailable", 503);
  let response;
  try {
    response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "eth_sendRawTransaction", params: [serializedTransaction] }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw requestError("testnet_broadcast_unavailable", 503);
  }
  if (!response.ok) throw requestError("testnet_broadcast_unavailable", 503);

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw requestError("testnet_broadcast_unavailable", 503);
  }
  if (typeof payload?.result === "string" && payload.result.toLowerCase() === expectedHash) return expectedHash;

  const providerMessage = String(payload?.error?.message || "").toLowerCase();
  if (/already known|known transaction|already imported/.test(providerMessage)) return expectedHash;
  throw requestError("testnet_broadcast_rejected", 422);
}

/**
 * Testnet-only relay for a transaction that was signed exclusively on the
 * device. It does not create, store, inspect, or receive wallet secrets.
 */
const walletTestnetBroadcast = onRequest({
  region: "asia-south1",
  cors: PUBLIC_SITE_ORIGINS,
  maxInstances: 1,
  concurrency: 10,
  secrets: [ANKR_BSC_TESTNET_RPC_URL],
}, async (request, response) => {
  if (request.method !== "POST") {
    response.set("Allow", "POST");
    response.status(405).json({ error: "method_not_allowed" });
    return;
  }

  let claimedHash;
  try {
    rejectOversizedRequest(request);
    const appCheck = await verifyAppCheckToken(request);
    const { serializedTransaction, expectedHash, sender } = validateSignedTestnetTransaction(request.body);
    consumeSenderRateLimit(sender);
    await consumeDurableSenderRateLimit(sender);
    if (isRecentlyBroadcast(expectedHash)) {
      response.set("Cache-Control", "no-store");
      response.status(200).json({ accepted: true, chainId: Number(BSC_TESTNET_CHAIN_ID), hash: expectedHash, duplicate: true });
      return;
    }
    const claimResult = await claimDurableTransaction(expectedHash);
    if (claimResult === "accepted") {
      rememberBroadcast(expectedHash);
      response.set("Cache-Control", "no-store");
      response.status(200).json({ accepted: true, chainId: Number(BSC_TESTNET_CHAIN_ID), hash: expectedHash, duplicate: true });
      return;
    }
    if (claimResult === "pending") throw requestError("testnet_transaction_in_progress", 409);
    claimedHash = expectedHash;
    const hash = await submitRawTransaction(
      ANKR_BSC_TESTNET_RPC_URL.value(),
      serializedTransaction,
      expectedHash,
    );
    rememberBroadcast(expectedHash);
    await completeDurableTransaction(expectedHash);
    claimedHash = undefined;
    response.set("Cache-Control", "no-store");
    console.info("wallet_testnet_broadcast", { outcome: "accepted", appCheck });
    response.status(200).json({ accepted: true, chainId: Number(BSC_TESTNET_CHAIN_ID), hash });
  } catch (error) {
    if (claimedHash) await releaseDurableTransaction(claimedHash);
    const status = Number(error?.status || 500);
    const code = typeof error?.code === "string" ? error.code : "testnet_broadcast_failed";
    // Never log serialized transaction data, wallet material, or secret URLs.
    console.info("wallet_testnet_broadcast", { outcome: "blocked_or_failed", code });
    response.status(status).json({ error: code });
  }
});

module.exports = {
  walletTestnetBroadcast,
  validateSignedTestnetTransaction,
  consumeSenderRateLimit,
  isRecentlyBroadcast,
  rememberBroadcast,
  relayDocumentId,
  consumeDurableSenderRateLimit,
  claimDurableTransaction,
  verifyAppCheckToken,
};
