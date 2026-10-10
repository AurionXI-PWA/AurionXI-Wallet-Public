const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { formatUnits } = require("ethers");

const ALCHEMY_BSC_TESTNET_RPC_URL = defineSecret("ALCHEMY_BSC_TESTNET_RPC_URL");
const ANKR_BSC_TESTNET_RPC_URL = defineSecret("ANKR_BSC_TESTNET_RPC_URL");
const PUBLIC_BSC_TESTNET_RPC_URL = "https://bsc-testnet-rpc.publicnode.com";
const BSC_TESTNET_CHAIN_ID = "97";
const MAX_ITEMS_PER_SOURCE = 20;
const MAX_RESPONSE_ITEMS = 30;
// The wallet renders a compact, newest-first mini statement. Continue
// looking through bounded windows until it can fill these five entries.
const MINI_STATEMENT_ITEMS = 5;
const PUBLIC_CACHE_SECONDS = 30;
// Public BSC Testnet RPC limits eth_getLogs ranges. This is roughly a
// fifty-minute diagnostic window and is explicitly disclosed to the app.
const RECENT_LOG_BLOCK_SPAN = 1_000;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// This list is deliberately fixed. The endpoint never discovers tokens from a provider response.
const CURATED_TOKENS = [
  { address: "0x3a3f02f22a6cf16122a7c752b73e65e05df466fa", decimals: 18, symbol: "ARXI" },
  { address: "0x337610d27c682e347c9cd60bd4b3b107c9d34ddd", decimals: 18, symbol: "USDT" },
];

function isPublicAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isNoTransactionsResponse(payload) {
  return payload && payload.status === "0" && /no transactions found/i.test(String(payload.message || payload.result || ""));
}

function formatAmount(value, decimals) {
  const formatted = formatUnits(BigInt(value), decimals);
  const [whole, fractional = ""] = formatted.split(".");
  return fractional ? `${whole}.${fractional.slice(0, 8).replace(/0+$/, "")}`.replace(/\.$/, "") : whole;
}

function directionFor(address, from, to) {
  const normalized = address.toLowerCase();
  if (from.toLowerCase() === normalized && to.toLowerCase() === normalized) return "Self";
  return to.toLowerCase() === normalized ? "Received" : "Sent";
}

function counterpartyFor(direction, from, to) {
  return direction === "Received" ? from : to;
}

function toActivityItem({ address, item, symbol, decimals, source }) {
  if (!item || !/^0x[a-fA-F0-9]{64}$/.test(String(item.hash || ""))) return null;
  if (!isPublicAddress(item.from) || !isPublicAddress(item.to) || !/^\d+$/.test(String(item.value || ""))) return null;
  if (!/^\d+$/.test(String(item.blockNumber || "")) || !/^\d+$/.test(String(item.timeStamp || ""))) return null;
  const timestamp = new Date(Number(item.timeStamp) * 1000);
  if (Number.isNaN(timestamp.getTime())) return null;
  const direction = directionFor(address, item.from, item.to);
  return {
    id: `${source}:${item.hash}:${item.transactionIndex || "0"}`,
    hash: item.hash,
    blockNumber: String(item.blockNumber || ""),
    timestamp: timestamp.toISOString(),
    direction,
    counterparty: counterpartyFor(direction, item.from, item.to),
    amount: formatAmount(item.value, decimals),
    symbol,
    failed: item.isError === "1" || item.txreceipt_status === "0",
  };
}

async function explorerRequest(params, apiKey, { baseUrl, includeChainId }) {
  const url = new URL(baseUrl);
  url.search = new URLSearchParams({
    ...(includeChainId ? { chainid: BSC_TESTNET_CHAIN_ID } : {}),
    module: "account",
    page: "1",
    offset: String(MAX_ITEMS_PER_SOURCE),
    sort: "desc",
    apikey: apiKey,
    ...params,
  }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`History provider returned HTTP ${response.status}.`);
  const payload = await response.json();
  if (isNoTransactionsResponse(payload)) return [];
  if (payload?.status !== "1" || !Array.isArray(payload.result)) {
    throw new Error("History provider returned an invalid response.");
  }
  return payload.result;
}

function etherscanRequest(params, apiKey) {
  return explorerRequest(params, apiKey, { baseUrl: ETHERSCAN_V2_API, includeChainId: true });
}

// BSC Testnet native transaction indexing is separate from a standard RPC.
// Keep this server-side fallback so the app never receives an explorer key.
function bscScanTestnetRequest(params, apiKey) {
  return explorerRequest(params, apiKey, { baseUrl: BSCSCAN_TESTNET_API, includeChainId: false });
}


async function readCuratedActivity(address, apiKey) {
  try {
    return await readCuratedActivityWith(address, apiKey, etherscanRequest);
  } catch {
    return readCuratedActivityWith(address, apiKey, bscScanTestnetRequest);
  }
}

async function readCuratedActivityWith(address, apiKey, request) {
  const [nativeTransfers, ...tokenTransfers] = await Promise.all([
    request({ action: "txlist", address }, apiKey),
    ...CURATED_TOKENS.map((token) => request({
      action: "tokentx", address, contractaddress: token.address,
    }, apiKey)),
  ]);

  const items = [
    ...nativeTransfers
      .filter((item) => /^\d+$/.test(String(item.value || "")) && BigInt(item.value) > 0n)
      .map((item) => toActivityItem({ address, item, symbol: "tBNB", decimals: 18, source: "native" })),
    ...tokenTransfers.flatMap((transfers, index) => transfers.map((item) => toActivityItem({
      address,
      item,
      symbol: CURATED_TOKENS[index].symbol,
      decimals: CURATED_TOKENS[index].decimals,
      source: CURATED_TOKENS[index].symbol.toLowerCase(),
    }))),
  ].filter(Boolean);

  return items
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
    .slice(0, MAX_RESPONSE_ITEMS);
}

function rpcAddressTopic(address) {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function fromRpcQuantity(value) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) throw new Error("Invalid RPC quantity.");
  return BigInt(value);
}

function fromLogAddress(topic) {
  if (typeof topic !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(topic)) throw new Error("Invalid transfer topic.");
  return `0x${topic.slice(-40)}`.toLowerCase();
}

async function rpcRequest(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Testnet RPC returned HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload?.error || !Object.hasOwn(payload || {}, "result")) throw new Error("Testnet RPC returned an invalid response.");
  return payload.result;
}

async function readCuratedTokenTransfersInRange(address, rpcUrl, fromBlock, latest) {
  const addressTopic = rpcAddressTopic(address);
  const requests = CURATED_TOKENS.flatMap((token) => [
    rpcRequest(rpcUrl, "eth_getLogs", [{
      address: token.address,
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${latest.toString(16)}`,
      topics: [TRANSFER_TOPIC, null, addressTopic],
    }]),
    rpcRequest(rpcUrl, "eth_getLogs", [{
      address: token.address,
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${latest.toString(16)}`,
      topics: [TRANSFER_TOPIC, addressTopic, null],
    }]),
  ]);
  const responses = await Promise.all(requests);
  const logs = responses.flatMap((result, index) => result.map((log) => ({
    log,
    token: CURATED_TOKENS[Math.floor(index / 2)],
  })));
  const unique = new Map();
  for (const entry of logs) {
    const key = `${entry.log.transactionHash}:${entry.log.logIndex}`;
    unique.set(key, entry);
  }
  const blockTimestamps = new Map();
  await Promise.all([...unique.values()].map(async ({ log }) => {
    if (blockTimestamps.has(log.blockNumber)) return;
    const block = await rpcRequest(rpcUrl, "eth_getBlockByNumber", [log.blockNumber, false]);
    blockTimestamps.set(log.blockNumber, new Date(Number(fromRpcQuantity(block.timestamp)) * 1000).toISOString());
  }));
  return [...unique.values()].map(({ log, token }) => {
    const from = fromLogAddress(log.topics?.[1]);
    const to = fromLogAddress(log.topics?.[2]);
    const direction = directionFor(address, from, to);
    return {
      id: `${token.symbol.toLowerCase()}:${log.transactionHash}:${log.logIndex}`,
      hash: log.transactionHash,
      blockNumber: fromRpcQuantity(log.blockNumber).toString(),
      timestamp: blockTimestamps.get(log.blockNumber),
      direction,
      counterparty: counterpartyFor(direction, from, to),
      amount: formatAmount(fromRpcQuantity(log.data).toString(), token.decimals),
      symbol: token.symbol,
      failed: false,
    };
  }).filter((item) => typeof item.timestamp === "string")
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
    .slice(0, MAX_RESPONSE_ITEMS);
}

async function readRecentCuratedTokenTransfers(address, rpcUrl, blockSpan = RECENT_LOG_BLOCK_SPAN) {
  const latest = fromRpcQuantity(await rpcRequest(rpcUrl, "eth_blockNumber", []));
  const fromBlock = latest > BigInt(blockSpan) ? latest - BigInt(blockSpan) : 0n;
  return readCuratedTokenTransfersInRange(address, rpcUrl, fromBlock, latest);
}

function alchemyTransferToActivityItem(address, transfer) {
  if (!transfer || !/^0x[a-fA-F0-9]{64}$/.test(String(transfer.hash || ""))) return null;
  if (!isPublicAddress(transfer.from) || !isPublicAddress(transfer.to)) return null;
  const contractAddress = String(transfer.rawContract?.address || "").toLowerCase();
  const token = CURATED_TOKENS.find((candidate) => candidate.address === contractAddress);
  const isNative = transfer.category === "external";
  if (!isNative && !token) return null;
  const rawValue = String(transfer.rawContract?.value || "");
  const fallbackValue = transfer.value === null || transfer.value === undefined
    ? null
    : String(Math.round(Number(transfer.value) * (10 ** (token?.decimals || 18))));
  const value = /^0x[0-9a-fA-F]+$/.test(rawValue)
    ? fromRpcQuantity(rawValue).toString()
    : /^\d+$/.test(fallbackValue || "") ? fallbackValue : null;
  const timestamp = new Date(String(transfer.metadata?.blockTimestamp || ""));
  if (!value || Number.isNaN(timestamp.getTime())) return null;
  const asset = token || { symbol: "tBNB", decimals: 18 };
  const direction = directionFor(address, transfer.from, transfer.to);
  return {
    id: `alchemy:${transfer.hash}:${transfer.uniqueId || transfer.logIndex || "0"}`,
    hash: transfer.hash,
    blockNumber: String(Number.parseInt(String(transfer.blockNum || "0x0"), 16)),
    timestamp: timestamp.toISOString(),
    direction,
    counterparty: counterpartyFor(direction, transfer.from, transfer.to),
    amount: formatAmount(value, asset.decimals),
    symbol: asset.symbol,
    failed: false,
  };
}

async function readAlchemyIndexedCuratedActivity(address, rpcUrl) {
  const base = {
    fromBlock: "0x0",
    withMetadata: true,
    excludeZeroValue: true,
    maxCount: "0x1e",
    order: "desc",
  };
  const [nativeIn, nativeOut, tokenIn, tokenOut] = await Promise.all([
    rpcRequest(rpcUrl, "alchemy_getAssetTransfers", [{ ...base, category: ["external"], toAddress: address }]),
    rpcRequest(rpcUrl, "alchemy_getAssetTransfers", [{ ...base, category: ["external"], fromAddress: address }]),
    rpcRequest(rpcUrl, "alchemy_getAssetTransfers", [{ ...base, category: ["erc20"], contractAddresses: CURATED_TOKENS.map((token) => token.address), toAddress: address }]),
    rpcRequest(rpcUrl, "alchemy_getAssetTransfers", [{ ...base, category: ["erc20"], contractAddresses: CURATED_TOKENS.map((token) => token.address), fromAddress: address }]),
  ]);
  const transfers = [nativeIn, nativeOut, tokenIn, tokenOut]
    .flatMap((result) => Array.isArray(result?.transfers) ? result.transfers : []);
  const unique = new Map();
  for (const transfer of transfers) {
    const item = alchemyTransferToActivityItem(address, transfer);
    if (item) unique.set(item.id, item);
  }
  return [...unique.values()]
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
    .slice(0, MAX_RESPONSE_ITEMS);
}

// Alchemy permits standard BSC Testnet log reads. Query bounded ten-thousand
// block windows so a single provider limit cannot make the public endpoint
// claim that there is no history. The seven-day diagnostic window covers
// normal delayed Testnet validation without treating an empty short window as
// an authoritative history result.
async function readExtendedRecentCuratedTokenTransfers(address, rpcUrl) {
  const latest = fromRpcQuantity(await rpcRequest(rpcUrl, "eth_blockNumber", []));
  const windowSize = 10_000n;
  const maximumSpan = 200_000n;
  const earliest = latest > maximumSpan ? latest - maximumSpan : 0n;
  let windowEnd = latest;
  const results = [];
  while (windowEnd >= earliest && results.length < MAX_RESPONSE_ITEMS) {
    const windowStart = windowEnd > windowSize ? windowEnd - windowSize : 0n;
    const items = await readCuratedTokenTransfersInRange(address, rpcUrl, windowStart, windowEnd);
    results.push(...items);
    if (results.length >= MINI_STATEMENT_ITEMS) break;
    if (windowStart === 0n || windowStart <= earliest) break;
    windowEnd = windowStart - 1n;
  }
  return results.sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
    .slice(0, MAX_RESPONSE_ITEMS);
}

async function readFallbackCuratedActivity(address) {
  const providers = [
    {
      name: "alchemy",
      url: ALCHEMY_BSC_TESTNET_RPC_URL.value(),
      read: async (rpcUrl) => {
        const indexed = await readAlchemyIndexedCuratedActivity(address, rpcUrl);
        return indexed.length > 0 ? indexed : readExtendedRecentCuratedTokenTransfers(address, rpcUrl);
        },
    },
    // Keep Ankr as a resilient standard-RPC fallback. It can return curated
    // token logs, but it cannot index ordinary native tBNB transfers by
    // address; therefore it must not mask Alchemy's indexed tBNB activity.
    {
      name: "ankr",
      url: ANKR_BSC_TESTNET_RPC_URL.value(),
      read: (rpcUrl) => readRecentCuratedTokenTransfers(address, rpcUrl),
    },
    {
      name: "public-bsc-testnet",
      url: PUBLIC_BSC_TESTNET_RPC_URL,
      read: (rpcUrl) => readExtendedRecentCuratedTokenTransfers(address, rpcUrl),
    },
  ];
  let bestItems = [];
  for (const provider of providers) {
    if (!provider.url || !/^https:\/\//.test(provider.url)) continue;
    try {
      const items = await provider.read(provider.url);
      console.info("wallet_testnet_history_provider", {
        provider: provider.name,
        outcome: items.length > 0 ? "items" : "empty",
      });
      // Standard RPC providers can expose only a short rolling block range.
      // Do not let one recent transfer hide an older curated transfer that a
      // subsequent indexed or extended-range provider can still return.
      if (items.length > bestItems.length) bestItems = items;
      if (items.length >= MINI_STATEMENT_ITEMS) return items;
    } catch (error) {
      console.info("wallet_testnet_history_provider", {
        provider: provider.name,
        outcome: "failed",
        message: error instanceof Error ? error.message : "unknown",
      });
      // Try the next public-read provider. Secrets are never returned or logged.
    }
  }
  return bestItems;
}

/**
 * Public, read-only endpoint. It accepts only a public BSC address and returns
 * normalized history for the hard-coded Testnet asset allowlist.
 */
const walletTestnetActivity = onRequest({
  cors: true,
  region: "asia-south1",
  secrets: [ALCHEMY_BSC_TESTNET_RPC_URL, ANKR_BSC_TESTNET_RPC_URL],
}, async (request, response) => {
  if (request.method !== "GET") {
    response.set("Allow", "GET");
    response.status(405).json({ error: "method_not_allowed" });
    return;
  }
  if (request.path !== "/v1/bsc-testnet/activity") {
    response.status(404).json({ error: "not_found" });
    return;
  }
  const address = String(request.query.address || "").trim();
  if (!isPublicAddress(address)) {
    response.status(400).json({ error: "invalid_public_address" });
    return;
  }
  try {
    const items = await readFallbackCuratedActivity(address);
    const coverage = "recent-curated-token-transfers";
    // An empty result is valid for a newly-created address or for an address
    // whose last curated transfer is outside the deliberately bounded public
    // provider window. It must not be surfaced to the wallet as a provider
    // outage. The mobile client retains the last verified public response for
    // the same address if a later provider request genuinely fails.
    response.set("Cache-Control", `public, max-age=${PUBLIC_CACHE_SECONDS}`);
    response.status(200).json({ cached: false, coverage, items });
  } catch (error) {
    console.error("wallet_testnet_history_failed", { message: error instanceof Error ? error.message : "unknown" });
    response.status(503).json({ error: "history_unavailable" });
  }
});

module.exports = { walletTestnetActivity };
