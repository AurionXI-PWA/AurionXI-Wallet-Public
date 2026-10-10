const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const BSC_MAINNET_RPC_URL = defineSecret("BSC_MAINNET_RPC_URL");
const BSC_MAINNET_CHAIN_ID = "0x38";
const ARXI_MAINNET_CONTRACT = "0x6fFEC4860325f8bfB3F000354708A7d0caE4b250";
const BSC_USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
const BSC_USDC_CONTRACT = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const BSC_ETH_CONTRACT = "0x2170Ed0880ac9A755fd29B2688956BD959F933F8";
const BSC_BTCB_CONTRACT = "0x7130d2A12B9BCBfAE4f2634d864A1EE1Ce3Ead9c";
const PANCAKESWAP_V2_FACTORY = "0xca143ce32fe78f1f7019d7d551a6402fc5350c73";
const BALANCE_OF_SELECTOR = "0x70a08231";
const GET_PAIR_SELECTOR = "0xe6a43905";
const TOKEN_0_SELECTOR = "0x0dfe1681";
const TOKEN_1_SELECTOR = "0xd21220a7";
const GET_RESERVES_SELECTOR = "0x0902f1ac";
const COINGECKO_SIMPLE_PRICE_URL = "https://api.coingecko.com/api/v3/simple/price?ids=binancecoin%2Ctether%2Cusd-coin%2Cethereum%2Cbitcoin&vs_currencies=usd&include_last_updated_at=true";
const PRICE_MAX_AGE_MS = 10 * 60 * 1_000;
const MIN_ARXI_LIQUIDITY_USD = 500;
const PREFERRED_ARXI_LIQUIDITY_USD = 1_000;
const PUBLIC_SITE_ORIGINS = [
  "https://www.aurionxi.com",
  "https://aurionxi.com",
  "https://aurionxi.web.app",
];
const PUBLIC_REQUEST_WINDOW_MS = 60_000;
const PUBLIC_REQUEST_LIMIT = 60;
const PUBLIC_REQUEST_BUCKET_LIMIT = 5_000;
const publicRequestBuckets = new Map();

function isPublicAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function getRequestClientKey(request) {
  const forwarded = String(request.get("x-forwarded-for") || "").split(",")[0].trim();
  return forwarded || String(request.ip || "unknown");
}

/** Best-effort per-instance abuse guard; deployment-level quotas remain required. */
function allowPublicRequest(request, now = Date.now()) {
  const clientKey = getRequestClientKey(request);
  const current = publicRequestBuckets.get(clientKey);
  const bucket = !current || now - current.startedAt >= PUBLIC_REQUEST_WINDOW_MS
    ? { startedAt: now, count: 0 }
    : current;
  bucket.count += 1;
  publicRequestBuckets.set(clientKey, bucket);
  if (publicRequestBuckets.size > PUBLIC_REQUEST_BUCKET_LIMIT) {
    for (const [key, value] of publicRequestBuckets) {
      if (now - value.startedAt >= PUBLIC_REQUEST_WINDOW_MS) publicRequestBuckets.delete(key);
    }
  }
  return bucket.count <= PUBLIC_REQUEST_LIMIT;
}

function addressBalanceOfData(address) {
  if (!isPublicAddress(address)) throw new Error("invalid_public_address");
  return `${BALANCE_OF_SELECTOR}${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function addressPairData(left, right) {
  if (!isPublicAddress(left) || !isPublicAddress(right)) throw new Error("invalid_public_address");
  return `${GET_PAIR_SELECTOR}${left.slice(2).toLowerCase().padStart(64, "0")}${right.slice(2).toLowerCase().padStart(64, "0")}`;
}

function decodeAddressWord(value) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(value))) throw new Error("mainnet_price_unavailable");
  const address = `0x${value.slice(-40)}`.toLowerCase();
  if (address === "0x0000000000000000000000000000000000000000") throw new Error("mainnet_price_unavailable");
  return address;
}

function decodeReserveWords(value) {
  if (!/^0x[0-9a-fA-F]{192}$/.test(String(value))) throw new Error("mainnet_price_unavailable");
  return [BigInt(`0x${value.slice(2, 66)}`), BigInt(`0x${value.slice(66, 130)}`)];
}

function decimalRatio(numerator, denominator) {
  if (denominator <= 0n) throw new Error("mainnet_price_unavailable");
  const scaled = (numerator * 10n ** 18n) / denominator;
  const value = Number(scaled) / 1e18;
  if (!Number.isFinite(value) || value < 0) throw new Error("mainnet_price_unavailable");
  return value;
}

function formatUsd(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error("mainnet_price_unavailable");
  return value.toFixed(2);
}

function formatUsdPrice(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error("mainnet_price_unavailable");
  return value.toFixed(6);
}

async function rpcRequest(rpcUrl, method, params) {
  if (!/^https:\/\//.test(String(rpcUrl || ""))) throw new Error("mainnet_readonly_unavailable");
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("mainnet_readonly_unavailable");
  const payload = await response.json();
  if (payload?.error || !Object.hasOwn(payload || {}, "result")) {
    throw new Error("mainnet_readonly_unavailable");
  }
  return payload.result;
}

async function readReferenceUsdPrices() {
  const response = await fetch(COINGECKO_SIMPLE_PRICE_URL, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error("mainnet_price_unavailable");
  const payload = await response.json();
  const bnbUsd = Number(payload?.binancecoin?.usd);
  const usdtUsd = Number(payload?.tether?.usd);
  const usdcUsd = Number(payload?.["usd-coin"]?.usd);
  const ethUsd = Number(payload?.ethereum?.usd);
  const btcbUsd = Number(payload?.bitcoin?.usd);
  const updatedAt = Math.min(
    Number(payload?.binancecoin?.last_updated_at), Number(payload?.tether?.last_updated_at),
    Number(payload?.["usd-coin"]?.last_updated_at), Number(payload?.ethereum?.last_updated_at),
    Number(payload?.bitcoin?.last_updated_at),
  );
  if (![bnbUsd, usdtUsd, usdcUsd, ethUsd, btcbUsd, updatedAt].every(Number.isFinite)
    || bnbUsd <= 0 || usdtUsd <= 0 || usdcUsd <= 0 || ethUsd <= 0 || btcbUsd <= 0) {
    throw new Error("mainnet_price_unavailable");
  }
  if ((Date.now() - updatedAt * 1_000) > PRICE_MAX_AGE_MS) throw new Error("mainnet_price_unavailable");
  return { bnbUsd, usdtUsd, usdcUsd, ethUsd, btcbUsd, observedAt: new Date(updatedAt * 1_000).toISOString() };
}

async function readArxiUsdPrice(rpcUrl, usdtUsd) {
  const pair = decodeAddressWord(await rpcRequest(rpcUrl, "eth_call", [{
    to: PANCAKESWAP_V2_FACTORY,
    data: addressPairData(ARXI_MAINNET_CONTRACT, BSC_USDT_CONTRACT),
  }, "latest"]));
  const [token0, token1, reserves] = await Promise.all([
    rpcRequest(rpcUrl, "eth_call", [{ to: pair, data: TOKEN_0_SELECTOR }, "latest"]),
    rpcRequest(rpcUrl, "eth_call", [{ to: pair, data: TOKEN_1_SELECTOR }, "latest"]),
    rpcRequest(rpcUrl, "eth_call", [{ to: pair, data: GET_RESERVES_SELECTOR }, "latest"]),
  ]);
  const firstToken = decodeAddressWord(token0);
  const secondToken = decodeAddressWord(token1);
  const arxi = ARXI_MAINNET_CONTRACT.toLowerCase();
  const usdt = BSC_USDT_CONTRACT.toLowerCase();
  if (!((firstToken === arxi && secondToken === usdt) || (firstToken === usdt && secondToken === arxi))) throw new Error("mainnet_price_unavailable");
  const [reserve0, reserve1] = decodeReserveWords(reserves);
  const arxiReserve = firstToken === arxi ? reserve0 : reserve1;
  const usdtReserve = firstToken === usdt ? reserve0 : reserve1;
  const liquidityUsd = decimalRatio(usdtReserve, 10n ** 18n) * usdtUsd;
  if (liquidityUsd < MIN_ARXI_LIQUIDITY_USD) throw new Error("mainnet_price_unavailable");
  const arxiUsd = decimalRatio(usdtReserve, arxiReserve) * usdtUsd;
  if (!Number.isFinite(arxiUsd) || arxiUsd <= 0) throw new Error("mainnet_price_unavailable");
  return {
    arxiUsd,
    pair,
    liquidityUsd,
    liquidityStatus: liquidityUsd >= PREFERRED_ARXI_LIQUIDITY_USD ? "verified" : "low",
  };
}

async function readDisplayValuation(rpcUrl, balances) {
  try {
    const reference = await readReferenceUsdPrices();
    const arxi = await readArxiUsdPrice(rpcUrl, reference.usdtUsd);
    const bnbAmount = decimalRatio(BigInt(balances.bnbWei), 10n ** 18n);
    const arxiAmount = decimalRatio(BigInt(balances.arxiWei), 10n ** 18n);
    const usdtAmount = decimalRatio(BigInt(balances.usdtWei), 10n ** 18n);
    const usdcAmount = decimalRatio(BigInt(balances.usdcWei), 10n ** 18n);
    const ethAmount = decimalRatio(BigInt(balances.ethWei), 10n ** 18n);
    const btcbAmount = decimalRatio(BigInt(balances.btcbWei), 10n ** 18n);
    const assetValues = {
      bnb: { priceUsd: formatUsdPrice(reference.bnbUsd), valueUsd: formatUsd(bnbAmount * reference.bnbUsd) },
      arxi: { priceUsd: formatUsdPrice(arxi.arxiUsd), valueUsd: formatUsd(arxiAmount * arxi.arxiUsd) },
      usdt: { priceUsd: formatUsdPrice(reference.usdtUsd), valueUsd: formatUsd(usdtAmount * reference.usdtUsd) },
      usdc: { priceUsd: formatUsdPrice(reference.usdcUsd), valueUsd: formatUsd(usdcAmount * reference.usdcUsd) },
      eth: { priceUsd: formatUsdPrice(reference.ethUsd), valueUsd: formatUsd(ethAmount * reference.ethUsd) },
      btcb: { priceUsd: formatUsdPrice(reference.btcbUsd), valueUsd: formatUsd(btcbAmount * reference.btcbUsd) },
    };
    return {
      status: "available",
      totalUsd: formatUsd(
        bnbAmount * reference.bnbUsd + arxiAmount * arxi.arxiUsd + usdtAmount * reference.usdtUsd
        + usdcAmount * reference.usdcUsd + ethAmount * reference.ethUsd + btcbAmount * reference.btcbUsd,
      ),
      observedAt: reference.observedAt,
      sources: { bnb: "coingecko", usdt: "coingecko", usdc: "coingecko", eth: "coingecko", btcb: "coingecko", arxi: "pancakeswap-v2-arxi-usdt" },
      arxiPair: arxi.pair,
      arxiLiquidityUsd: formatUsd(arxi.liquidityUsd),
      arxiLiquidityStatus: arxi.liquidityStatus,
      assets: assetValues,
    };
  } catch {
    return { status: "unavailable" };
  }
}

async function readMainnetPortfolio(address, rpcUrl) {
  const [chainId, blockNumber, bnbBalance, arxiBalance, usdtBalance, usdcBalance, ethBalance, btcbBalance, pendingNonce, gasPrice] = await Promise.all([
    rpcRequest(rpcUrl, "eth_chainId", []),
    rpcRequest(rpcUrl, "eth_blockNumber", []),
    rpcRequest(rpcUrl, "eth_getBalance", [address, "latest"]),
    rpcRequest(rpcUrl, "eth_call", [{
      to: ARXI_MAINNET_CONTRACT,
      data: addressBalanceOfData(address),
    }, "latest"]),
    rpcRequest(rpcUrl, "eth_call", [{ to: BSC_USDT_CONTRACT, data: addressBalanceOfData(address) }, "latest"]),
    rpcRequest(rpcUrl, "eth_call", [{ to: BSC_USDC_CONTRACT, data: addressBalanceOfData(address) }, "latest"]),
    rpcRequest(rpcUrl, "eth_call", [{ to: BSC_ETH_CONTRACT, data: addressBalanceOfData(address) }, "latest"]),
    rpcRequest(rpcUrl, "eth_call", [{ to: BSC_BTCB_CONTRACT, data: addressBalanceOfData(address) }, "latest"]),
    rpcRequest(rpcUrl, "eth_getTransactionCount", [address, "pending"]),
    rpcRequest(rpcUrl, "eth_gasPrice", []),
  ]);
  if (String(chainId).toLowerCase() !== BSC_MAINNET_CHAIN_ID) {
    throw new Error("mainnet_chain_required");
  }
  if (![blockNumber, bnbBalance, arxiBalance, usdtBalance, usdcBalance, ethBalance, btcbBalance, pendingNonce, gasPrice].every((value) => /^0x[0-9a-fA-F]+$/.test(String(value)))) {
    throw new Error("mainnet_readonly_unavailable");
  }
  const balances = {
    bnbWei: BigInt(bnbBalance).toString(), arxiWei: BigInt(arxiBalance).toString(),
    usdtWei: BigInt(usdtBalance).toString(), usdcWei: BigInt(usdcBalance).toString(),
    ethWei: BigInt(ethBalance).toString(), btcbWei: BigInt(btcbBalance).toString(),
  };
  const valuation = await readDisplayValuation(rpcUrl, balances);
  return {
    chainId: 56,
    blockNumber: BigInt(blockNumber).toString(),
    assets: {
      ...balances,
    },
    quote: {
      pendingNonce: BigInt(pendingNonce).toString(),
      gasPriceWei: BigInt(gasPrice).toString(),
      observedAt: new Date().toISOString(),
    },
    valuation,
  };
}

/**
 * Mainnet read-only foundation. The function accepts only a public address and
 * invokes a fixed allowlist of JSON-RPC read methods against a server secret.
 * It contains no signing, send, transaction relay, or arbitrary RPC path.
 */
const walletMainnetPortfolio = onRequest({
  cors: PUBLIC_SITE_ORIGINS,
  region: "asia-south1",
  secrets: [BSC_MAINNET_RPC_URL],
}, async (request, response) => {
  if (request.method !== "GET") {
    response.set("Allow", "GET");
    response.status(405).json({ error: "method_not_allowed" });
    return;
  }
  if (!allowPublicRequest(request)) {
    response.set("Retry-After", String(Math.ceil(PUBLIC_REQUEST_WINDOW_MS / 1_000)));
    response.status(429).json({ error: "rate_limited" });
    return;
  }
  if (request.path !== "/v1/bsc-mainnet/portfolio") {
    response.status(404).json({ error: "not_found" });
    return;
  }
  const address = String(request.query.address || "").trim();
  if (!isPublicAddress(address)) {
    response.status(400).json({ error: "invalid_public_address" });
    return;
  }
  try {
    const portfolio = await readMainnetPortfolio(address, BSC_MAINNET_RPC_URL.value());
    response.set("Cache-Control", "public, max-age=20");
    response.status(200).json(portfolio);
  } catch (error) {
    const code = error instanceof Error && error.message === "mainnet_chain_required"
      ? "mainnet_chain_required"
      : "mainnet_readonly_unavailable";
    console.error("wallet_mainnet_portfolio_failed", { code });
    response.status(503).json({ error: code });
  }
});

module.exports = {
  ARXI_MAINNET_CONTRACT,
  BSC_USDT_CONTRACT,
  BSC_USDC_CONTRACT,
  BSC_ETH_CONTRACT,
  BSC_BTCB_CONTRACT,
  PANCAKESWAP_V2_FACTORY,
  addressBalanceOfData,
  addressPairData,
  decodeAddressWord,
  decodeReserveWords,
  decimalRatio,
  formatUsd,
  formatUsdPrice,
  isPublicAddress,
  allowPublicRequest,
  getRequestClientKey,
  readMainnetPortfolio,
  walletMainnetPortfolio,
};
