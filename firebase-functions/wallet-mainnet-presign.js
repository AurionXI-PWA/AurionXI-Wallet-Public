const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const BSC_MAINNET_RPC_URL = defineSecret("BSC_MAINNET_RPC_URL");
const BSC_MAINNET_CHAIN_ID = "0x38";
const ARXI_MAINNET_CONTRACT = "0x6fFEC4860325f8bfB3F000354708A7d0caE4b250";
const USDT_MAINNET_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
const UINT256_MAX = (1n << 256n) - 1n;
const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";
const SUPPORTED_ASSETS = new Set(["native-bnb", "arxi", "usdt"]);
const PUBLIC_SITE_ORIGINS = [
  "https://www.aurionxi.com",
  "https://aurionxi.com",
  "https://aurionxi.web.app",
];
const REQUEST_WINDOW_MS = 60_000;
const REQUEST_LIMIT = 12;
const NATIVE_SIGNING_GAS_LIMIT = 21_000n;
const ARXI_SIGNING_GAS_LIMIT = 160_000n;
const buckets = new Map();

function isAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function normalizeAmountWei(value) {
  const text = String(value || "").trim();
  if (!/^[1-9][0-9]{0,77}$/.test(text)) throw new Error("invalid_amount_wei");
  const amount = BigInt(text);
  if (amount > UINT256_MAX) throw new Error("invalid_amount_wei");
  return amount;
}

function toRpcQuantity(value) {
  const number = typeof value === "bigint" ? value : BigInt(value);
  if (number < 0n) throw new Error("invalid_rpc_quantity");
  return `0x${number.toString(16)}`;
}

function erc20TransferData(recipientAddress, amountWei) {
  if (!isAddress(recipientAddress)) throw new Error("invalid_recipient_address");
  const amount = normalizeAmountWei(amountWei);
  return `${ERC20_TRANSFER_SELECTOR}${recipientAddress.slice(2).toLowerCase().padStart(64, "0")}${amount.toString(16).padStart(64, "0")}`;
}

/** This is intentionally the only transaction shape that this endpoint estimates. */
function buildFixedEstimateTransaction(input) {
  const { senderAddress, recipientAddress, asset, amountWei } = input;
  if (!isAddress(senderAddress)) throw new Error("invalid_sender_address");
  if (!isAddress(recipientAddress)) throw new Error("invalid_recipient_address");
  if (!SUPPORTED_ASSETS.has(asset)) throw new Error("unsupported_asset");
  const replacement = input.replacesTransactionHash !== undefined;
  if (!replacement && input.replacementKind !== undefined) throw new Error("invalid_replacement_intent");
  if (replacement) validateReplacementIntent(input);
  const amount = input.replacementKind === "cancel" ? 0n : normalizeAmountWei(amountWei);
  const from = senderAddress.toLowerCase();
  if (asset === "native-bnb") {
    return { from, to: recipientAddress.toLowerCase(), value: toRpcQuantity(amount) };
  }
  const tokenContract = asset === "usdt" ? USDT_MAINNET_CONTRACT : ARXI_MAINNET_CONTRACT;
  return { from, to: tokenContract.toLowerCase(), value: "0x0", data: erc20TransferData(recipientAddress, amount) };
}

function signingGasLimit(asset) {
  if (asset === "native-bnb") return NATIVE_SIGNING_GAS_LIMIT;
  if (asset === "arxi" || asset === "usdt") return ARXI_SIGNING_GAS_LIMIT;
  throw new Error("unsupported_asset");
}

function allowRequest(request, now = Date.now()) {
  const key = String(request.get("x-forwarded-for") || request.ip || "unknown").split(",")[0].trim();
  const previous = buckets.get(key);
  const bucket = !previous || now - previous.startedAt >= REQUEST_WINDOW_MS
    ? { startedAt: now, count: 0 }
    : previous;
  bucket.count += 1;
  buckets.set(key, bucket);
  return bucket.count <= REQUEST_LIMIT;
}

async function rpcRequest(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("mainnet_presign_unavailable");
  const payload = await response.json();
  if (payload?.error || !Object.hasOwn(payload || {}, "result")) throw new Error("mainnet_presign_unavailable");
  return payload.result;
}

function validateReplacementIntent(input) {
  if (!SUPPORTED_ASSETS.has(input.asset) || !isAddress(input.senderAddress) || !isAddress(input.recipientAddress)
    || !/^0x[0-9a-fA-F]{64}$/.test(String(input.replacesTransactionHash || ""))
    || !/^(0|[1-9][0-9]{0,15})$/.test(String(input.replacementNonce)) || BigInt(input.replacementNonce) > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("invalid_replacement_intent");
  if (input.replacementKind === "cancel") {
    if (input.asset !== "native-bnb" || input.senderAddress.toLowerCase() !== input.recipientAddress.toLowerCase() || input.amountWei !== "0") throw new Error("invalid_replacement_intent");
  } else if (input.replacementKind === "speed-up") normalizeAmountWei(input.amountWei);
  else throw new Error("invalid_replacement_intent");
}

async function readReplacementSnapshot(input, rpcUrl) {
  validateReplacementIntent(input);
  const sender = input.senderAddress.toLowerCase();
  const hash = input.replacesTransactionHash.toLowerCase();
  const nonce = BigInt(input.replacementNonce);
  if (input.minimumGasPriceWei !== undefined) normalizeAmountWei(input.minimumGasPriceWei);
  const [chain, latest, pending, price, original, receipt, balance] = await Promise.all([
    rpcRequest(rpcUrl, "eth_chainId", []), rpcRequest(rpcUrl, "eth_getTransactionCount", [sender, "latest"]),
    rpcRequest(rpcUrl, "eth_getTransactionCount", [sender, "pending"]), rpcRequest(rpcUrl, "eth_gasPrice", []),
    rpcRequest(rpcUrl, "eth_getTransactionByHash", [hash]), rpcRequest(rpcUrl, "eth_getTransactionReceipt", [hash]),
    rpcRequest(rpcUrl, "eth_getBalance", [sender, "latest"]),
  ]);
  if (String(chain).toLowerCase() !== BSC_MAINNET_CHAIN_ID) throw new Error("mainnet_chain_required");
  if (![latest, pending, price, balance].every(value => /^0x[0-9a-fA-F]+$/.test(String(value))) || BigInt(price) <= 0n) throw new Error("mainnet_presign_unavailable");
  if (receipt !== null || BigInt(latest) !== nonce || BigInt(pending) < nonce) throw new Error("replacement_nonce_already_consumed");
  const gasLimit = signingGasLimit(input.asset);
  let gasPrice = BigInt(price) * 2n;
  if (input.minimumGasPriceWei !== undefined) {
    const minimum = (BigInt(input.minimumGasPriceWei) * 125n + 99n) / 100n;
    if (minimum > gasPrice) gasPrice = minimum;
  }
  if (original !== null) {
    if (String(original.hash).toLowerCase() !== hash || String(original.from).toLowerCase() !== sender
      || !/^0x[0-9a-fA-F]+$/.test(String(original.nonce)) || BigInt(original.nonce) !== nonce
      || !/^0x[0-9a-fA-F]+$/.test(String(original.gasPrice))) throw new Error("invalid_replacement_intent");
    if (input.replacementKind === "speed-up") {
      const intent = buildFixedEstimateTransaction(input);
      if (String(original.to).toLowerCase() !== intent.to || BigInt(original.value) !== BigInt(intent.value)
        || String(original.input || "0x").toLowerCase() !== (intent.data || "0x")) throw new Error("invalid_replacement_intent");
    }
    const bumped = (BigInt(original.gasPrice) * 125n + 99n) / 100n;
    if (bumped > gasPrice) gasPrice = bumped;
  }
  if (gasPrice * gasLimit > 100_000_000_000_000n || BigInt(balance) < gasPrice * gasLimit) throw new Error("mainnet_presign_unavailable");
  const estimated = await rpcRequest(rpcUrl, "eth_estimateGas", [{ ...buildFixedEstimateTransaction(input), gasPrice: toRpcQuantity(gasPrice) }, "latest"]);
  if (!/^0x[0-9a-fA-F]+$/.test(String(estimated)) || BigInt(estimated) <= 0n || BigInt(estimated) > gasLimit) throw new Error("mainnet_presign_unavailable");
  return {chainId: 56, senderAddress: sender, latestNonce: nonce.toString(), pendingNonce: BigInt(pending).toString(),
    replacementNonce: nonce.toString(), replacesTransactionHash: hash, replacementKind: input.replacementKind, gasLimit: gasLimit.toString(),
    gasPriceWei: gasPrice.toString(), observedAt: new Date().toISOString()};
}

async function readFixedPreSignSnapshot(input, rpcUrl) {
  if (input.replacesTransactionHash !== undefined) return readReplacementSnapshot(input, rpcUrl);
  const estimateTransaction = buildFixedEstimateTransaction(input);
  const senderAddress = input.senderAddress.toLowerCase();
  const [chainId, pendingNonce, gasPriceWei, estimatedGas] = await Promise.all([
    rpcRequest(rpcUrl, "eth_chainId", []),
    rpcRequest(rpcUrl, "eth_getTransactionCount", [senderAddress, "pending"]),
    rpcRequest(rpcUrl, "eth_gasPrice", []),
    rpcRequest(rpcUrl, "eth_estimateGas", [estimateTransaction, "pending"]),
  ]);
  if (String(chainId).toLowerCase() !== BSC_MAINNET_CHAIN_ID) throw new Error("mainnet_chain_required");
  if (![pendingNonce, gasPriceWei, estimatedGas].every((value) => /^0x[0-9a-fA-F]+$/.test(String(value)))) {
    throw new Error("mainnet_presign_unavailable");
  }
  const gasLimit = signingGasLimit(input.asset);
  if (BigInt(estimatedGas) <= 0n || BigInt(estimatedGas) > gasLimit || BigInt(gasPriceWei) <= 0n) throw new Error("mainnet_presign_unavailable");
  return {
    chainId: 56,
    senderAddress,
    pendingNonce: BigInt(pendingNonce).toString(),
    gasLimit: gasLimit.toString(),
    gasPriceWei: BigInt(gasPriceWei).toString(),
    observedAt: new Date().toISOString(),
  };
}

/** Fixed read-only pre-sign service; no keys, signing, relay, or broadcast. */
const walletMainnetPreSignSnapshot = onRequest({
  cors: PUBLIC_SITE_ORIGINS,
  region: "asia-south1",
  secrets: [BSC_MAINNET_RPC_URL],
}, async (request, response) => {
  if (request.method !== "POST") {
    response.set("Allow", "POST");
    response.status(405).json({ error: "method_not_allowed" });
    return;
  }
  if (request.path !== "/v1/bsc-mainnet/pre-sign-snapshot") {
    response.status(404).json({ error: "not_found" });
    return;
  }
  if (!allowRequest(request)) {
    response.set("Retry-After", String(Math.ceil(REQUEST_WINDOW_MS / 1_000)));
    response.status(429).json({ error: "rate_limited" });
    return;
  }
  const input = {
    senderAddress: String(request.body?.senderAddress || "").trim(),
    recipientAddress: String(request.body?.recipientAddress || "").trim(),
    asset: String(request.body?.asset || ""),
    amountWei: String(request.body?.amountWei || "").trim(),
    ...(request.body?.replacesTransactionHash !== undefined ? { replacesTransactionHash: request.body.replacesTransactionHash, replacementNonce: request.body.replacementNonce, replacementKind: request.body.replacementKind, ...(request.body.minimumGasPriceWei !== undefined ? { minimumGasPriceWei: request.body.minimumGasPriceWei } : {}) } : {}),
  };
  try {
    const snapshot = await readFixedPreSignSnapshot(input, BSC_MAINNET_RPC_URL.value());
    response.set("Cache-Control", "no-store");
    response.status(200).json(snapshot);
  } catch (error) {
    const code = error instanceof Error && ["invalid_sender_address", "invalid_recipient_address", "invalid_amount_wei", "unsupported_asset", "invalid_replacement_intent", "replacement_nonce_already_consumed"].includes(error.message)
      ? error.message
      : error instanceof Error && error.message === "mainnet_chain_required"
        ? "mainnet_chain_required"
        : "mainnet_presign_unavailable";
    console.error("wallet_mainnet_presign_snapshot_failed", { code });
    response.status(code === "replacement_nonce_already_consumed" ? 409 : code.startsWith("invalid_") || code === "unsupported_asset" ? 400 : 503).json({ error: code });
  }
});

module.exports = {
  ARXI_MAINNET_CONTRACT,
  USDT_MAINNET_CONTRACT,
  ERC20_TRANSFER_SELECTOR,
  buildFixedEstimateTransaction,
  erc20TransferData,
  normalizeAmountWei,
  validateReplacementIntent,
  readReplacementSnapshot,
  readFixedPreSignSnapshot,
  signingGasLimit,
  toRpcQuantity,
  walletMainnetPreSignSnapshot,
};
