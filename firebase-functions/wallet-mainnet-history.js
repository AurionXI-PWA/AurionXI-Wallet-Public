const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const BSC_MAINNET_RPC_URL = defineSecret("BSC_MAINNET_RPC_URL");
const CHAIN_ID = "0x38";
const ARXI = "0x6fFEC4860325f8bfB3F000354708A7d0caE4b250";
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const ETH = "0x2170Ed0880ac9A755fd29B2688956BD959F933F8";
const BTCB = "0x7130d2A12B9BCBfAE4f2634d864A1EE1Ce3Ead9c";
const CURATED_TOKENS = Object.freeze([
  { address: ARXI, symbol: "ARXI" },
  { address: USDT, symbol: "USDT" },
  { address: USDC, symbol: "USDC" },
  { address: ETH, symbol: "ETH" },
  { address: BTCB, symbol: "BTCB" },
]);
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ORIGINS = ["https://www.aurionxi.com", "https://aurionxi.com", "https://aurionxi.web.app"];
const ANKR_BSC_PATH = /^\/bsc\/([A-Za-z0-9_-]+)\/?$/;
// The explorer is the primary history source. The RPC fallback intentionally
// covers a bounded, but practical, recent window when the explorer is delayed
// or temporarily unavailable. Querying this in chunks avoids provider range
// limits while keeping the endpoint read-only and fixed-contract only.
const RECENT_ARXI_LOG_BLOCK_SPAN = 25_000n;
const RPC_LOG_CHUNK_SIZE = 5_000n;

const validAddress = (value) => typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
const addressTopic = (address) => `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;

async function rpc(url, method, params) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error("mainnet_activity_unavailable");
  const body = await response.json();
  if (body?.error || !Object.hasOwn(body || {}, "result")) throw new Error("mainnet_activity_unavailable");
  return body.result;
}

function ankrMultichainUrl(rpcUrl) {
  const parsed = new URL(rpcUrl);
  const match = parsed.protocol === "https:" && parsed.hostname === "rpc.ankr.com" && !parsed.username && !parsed.password && !parsed.search && !parsed.hash
    ? parsed.pathname.match(ANKR_BSC_PATH)
    : null;
  if (!match) throw new Error("mainnet_activity_indexer_unavailable");
  return `https://rpc.ankr.com/multichain/${match[1]}`;
}

async function ankrIndexed(url, method, params) {
  const response = await fetch(ankrMultichainUrl(url), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error("mainnet_activity_indexer_unavailable");
  const body = await response.json();
  if (body?.error || !body?.result) throw new Error("mainnet_activity_indexer_unavailable");
  return body.result;
}

function format18(value) {
  const decimal = BigInt(value).toString().padStart(19, "0");
  const whole = decimal.slice(0, -18);
  const fraction = decimal.slice(-18).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function nativeActivity(address, item) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(String(item?.hash || "")) || !validAddress(item?.from) || !validAddress(item?.to)) return null;
  if (!/^\d+$/.test(String(item?.value || "")) || BigInt(item.value) <= 0n || !/^\d+$/.test(String(item?.blockNumber || "")) || !/^\d+$/.test(String(item?.timeStamp || ""))) return null;
  const lower = address.toLowerCase();
  const from = item.from.toLowerCase();
  const to = item.to.toLowerCase();
  const direction = from === lower && to === lower ? "Self" : to === lower ? "Received" : "Sent";
  return {
    id: `bnb:${item.hash}:${item.transactionIndex || "0"}`,
    hash: item.hash,
    blockNumber: String(item.blockNumber),
    timestamp: new Date(Number(item.timeStamp) * 1000).toISOString(),
    direction,
    counterparty: direction === "Received" ? item.from : item.to,
    amount: format18(BigInt(item.value)),
    symbol: "BNB",
    failed: item.isError === "1" || item.txreceipt_status === "0",
  };
}

function ankrNativeActivity(address, item) {
  if (item?.blockchain !== "bsc" || !/^0x[a-fA-F0-9]{64}$/.test(String(item.hash || "")) || !validAddress(item.from) || !validAddress(item.to)) return null;
  if (!/^0x[0-9a-fA-F]+$/.test(String(item.value || "")) || !/^0x[0-9a-fA-F]+$/.test(String(item.blockNumber || "")) || !/^0x[0-9a-fA-F]+$/.test(String(item.timestamp || ""))) return null;
  const value = BigInt(item.value);
  if (value <= 0n) return null;
  const lower = address.toLowerCase(); const from = item.from.toLowerCase(); const to = item.to.toLowerCase();
  if (from !== lower && to !== lower) return null;
  const direction = from === lower && to === lower ? "Self" : to === lower ? "Received" : "Sent";
  return { id: `bnb:${item.hash}:${item.transactionIndex || "0x0"}`, hash: item.hash, blockNumber: BigInt(item.blockNumber).toString(), timestamp: new Date(Number(BigInt(item.timestamp)) * 1000).toISOString(), direction, counterparty: direction === "Received" ? item.from : item.to, amount: format18(value), symbol: "BNB", failed: item.status === "0x0" };
}

async function readAnkrNativeActivity(address, url) {
  const result = await ankrIndexed(url, "ankr_getTransactionsByAddress", { address: [address], blockchain: ["bsc"], descOrder: true, pageSize: 20 });
  if (!Array.isArray(result.transactions)) throw new Error("mainnet_activity_indexer_unavailable");
  return result.transactions.map((item) => ankrNativeActivity(address, item)).filter(Boolean);
}

function ankrTokenActivity(address, item) {
  if (item?.blockchain !== "bsc" || !validAddress(item.contractAddress) || !validAddress(item.fromAddress) || !validAddress(item.toAddress) || !/^0x[a-fA-F0-9]{64}$/.test(String(item.transactionHash || ""))) return null;
  const token = CURATED_TOKENS.find((candidate) => candidate.address.toLowerCase() === item.contractAddress.toLowerCase());
  if (!token || Number(item.tokenDecimals) !== 18 || !/^\d+$/.test(String(item.valueRawInteger || "")) || BigInt(item.valueRawInteger) <= 0n || !Number.isSafeInteger(Number(item.blockHeight)) || Number(item.blockHeight) < 0 || !Number.isSafeInteger(Number(item.timestamp)) || Number(item.timestamp) < 0) return null;
  const lower = address.toLowerCase(); const from = item.fromAddress.toLowerCase(); const to = item.toAddress.toLowerCase();
  if (from !== lower && to !== lower) return null;
  const direction = from === lower && to === lower ? "Self" : to === lower ? "Received" : "Sent";
  return { id: `${token.symbol.toLowerCase()}:${item.transactionHash}:${item.logIndex || "0"}`, hash: item.transactionHash, blockNumber: String(item.blockHeight), timestamp: new Date(Number(item.timestamp) * 1000).toISOString(), direction, counterparty: direction === "Received" ? item.fromAddress : item.toAddress, amount: format18(BigInt(item.valueRawInteger)), symbol: token.symbol, failed: false };
}

async function readAnkrTokenActivity(address, url) {
  const result = await ankrIndexed(url, "ankr_getTokenTransfers", { address: [address], blockchain: ["bsc"], descOrder: true, pageSize: 40 });
  if (!Array.isArray(result.transfers)) throw new Error("mainnet_activity_indexer_unavailable");
  return result.transfers.map((item) => ankrTokenActivity(address, item)).filter(Boolean);
}

function mergeActivitySources(nativeResult, tokenResult, rpcArxiTransfers) {
  if (nativeResult.status === "rejected" && tokenResult.status === "rejected" && rpcArxiTransfers.length === 0) throw new Error("mainnet_activity_indexer_unavailable");
  const nativeTransfers = nativeResult.status === "fulfilled" ? nativeResult.value : [];
  const tokenTransfers = tokenResult.status === "fulfilled" ? tokenResult.value : [];
  const indexedArxi = tokenTransfers.filter((item) => item.symbol === "ARXI");
  const nonArxiTokens = tokenTransfers.filter((item) => item.symbol !== "ARXI");
  const arxiTransfers = indexedArxi.length > 0 ? indexedArxi : rpcArxiTransfers;
  return [...nativeTransfers, ...arxiTransfers, ...nonArxiTokens]
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp)).slice(0, 5);
}

function curatedTokenExplorerActivity(address, item, token) {
  const native = nativeActivity(address, item);
  return native ? { ...native, id: `${token.symbol.toLowerCase()}:${item.hash}:${item.transactionIndex || "0"}`, symbol: token.symbol } : null;
}

function arxiExplorerActivity(address, item) {
  return curatedTokenExplorerActivity(address, item, { symbol: "ARXI" });
}

function normalizeLogs(address, logs, timestamps = new Map()) {
  const lower = address.toLowerCase();
  const records = new Map();
  for (const log of logs) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(String(log.transactionHash || "")) || !Array.isArray(log.topics) || log.topics.length < 3 || !/^0x[0-9a-fA-F]+$/.test(String(log.data || ""))) continue;
    const from = `0x${log.topics[1].slice(-40)}`;
    const to = `0x${log.topics[2].slice(-40)}`;
    const direction = from === lower && to === lower ? "Self" : to === lower ? "Received" : "Sent";
    const counterparty = direction === "Received" ? from : to;
    const blockNumber = BigInt(log.blockNumber).toString();
    records.set(log.transactionHash, { id: `arxi:${log.transactionHash}`, hash: log.transactionHash, blockNumber, timestamp: timestamps.get(blockNumber) || new Date(0).toISOString(), direction, counterparty, amount: format18(BigInt(log.data)), symbol: "ARXI", failed: false });
  }
  return [...records.values()].sort((left, right) => BigInt(right.blockNumber) > BigInt(left.blockNumber) ? 1 : -1).slice(0, 5);
}

function recentLogRanges(latestBlock) {
  const latest = BigInt(latestBlock);
  const earliest = latest > RECENT_ARXI_LOG_BLOCK_SPAN ? latest - RECENT_ARXI_LOG_BLOCK_SPAN : 0n;
  const ranges = [];
  for (let to = latest; to >= earliest;) {
    const from = to > RPC_LOG_CHUNK_SIZE ? (to - RPC_LOG_CHUNK_SIZE + 1n > earliest ? to - RPC_LOG_CHUNK_SIZE + 1n : earliest) : 0n;
    ranges.push({ fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` });
    if (from === 0n || from === earliest) break;
    to = from - 1n;
  }
  return ranges;
}

/** Fixed-contract public BNB, ARXI, USDT, USDC, ETH and BTCB transfer history only. No wallet secrets, signing,
 * arbitrary RPC, native-transaction tracing, or broadcast capability exists. */
const walletMainnetActivity = onRequest({ region: "asia-south1", cors: ORIGINS, secrets: [BSC_MAINNET_RPC_URL] }, async (request, response) => {
  if (request.method !== "GET") { response.set("Allow", "GET"); response.status(405).json({ error: "method_not_allowed" }); return; }
  if (request.path !== "/v1/bsc-mainnet/activity") { response.status(404).json({ error: "not_found" }); return; }
  const address = String(request.query.address || "").trim();
  if (!validAddress(address)) { response.status(400).json({ error: "invalid_public_address" }); return; }
  try {
    const url = BSC_MAINNET_RPC_URL.value();
    const [nativeResult, tokenResult] = await Promise.allSettled([readAnkrNativeActivity(address, url), readAnkrTokenActivity(address, url)]);
    let rpcArxiTransfers = [];
    try {
      const [chainId, latestBlock] = await Promise.all([rpc(url, "eth_chainId", []), rpc(url, "eth_blockNumber", [])]);
      if (String(chainId).toLowerCase() !== CHAIN_ID || !/^0x[0-9a-fA-F]+$/.test(String(latestBlock))) throw new Error("mainnet_activity_unavailable");
      const ranges = recentLogRanges(latestBlock);
      const logsByRange = await Promise.all(ranges.map(({ fromBlock, toBlock }) => Promise.all([
        rpc(url, "eth_getLogs", [{ address: ARXI, topics: [TRANSFER_TOPIC, null, addressTopic(address)], fromBlock, toBlock }]),
        rpc(url, "eth_getLogs", [{ address: ARXI, topics: [TRANSFER_TOPIC, addressTopic(address), null], fromBlock, toBlock }]),
      ])));
      const [incoming, outgoing] = logsByRange.reduce(([allIncoming, allOutgoing], [rangeIncoming, rangeOutgoing]) => [allIncoming.concat(rangeIncoming), allOutgoing.concat(rangeOutgoing)], [[], []]);
      const entries = normalizeLogs(address, [...incoming, ...outgoing]);
      const timestamps = new Map(await Promise.all(entries.map(async (item) => {
        const block = await rpc(url, "eth_getBlockByNumber", [`0x${BigInt(item.blockNumber).toString(16)}`, false]);
        const timestamp = /^0x[0-9a-fA-F]+$/.test(String(block?.timestamp || "")) ? new Date(Number(BigInt(block.timestamp)) * 1000).toISOString() : new Date(0).toISOString();
        return [item.blockNumber, timestamp];
      })));
      rpcArxiTransfers = normalizeLogs(address, [...incoming, ...outgoing], timestamps);
    } catch (error) {
      console.warn("wallet_mainnet_activity_rpc_fallback", { message: error instanceof Error ? error.message : "unknown" });
    }
    const items = mergeActivitySources(nativeResult, tokenResult, rpcArxiTransfers);
    response.set("Cache-Control", "public, max-age=30");
    response.status(200).json({
      cached: false,
      coverage: "recent-curated-transfers",
      items,
      sourceHealth: {
        ankrNative: nativeResult.status === "fulfilled" ? "available" : "unavailable",
        ankrTokens: tokenResult.status === "fulfilled" ? "available" : "unavailable",
        rpcArxi: rpcArxiTransfers.length > 0 ? "available" : "empty",
      },
    });
  } catch (error) {
    console.error("wallet_mainnet_activity_failed", { message: error instanceof Error ? error.message : "unknown" });
    response.status(503).json({ error: "mainnet_activity_unavailable" });
  }
});

module.exports = { ARXI, USDT, USDC, ETH, BTCB, CURATED_TOKENS, addressTopic, ankrMultichainUrl, ankrNativeActivity, ankrTokenActivity, arxiExplorerActivity, curatedTokenExplorerActivity, format18, mergeActivitySources, nativeActivity, normalizeLogs, recentLogRanges, walletMainnetActivity };
