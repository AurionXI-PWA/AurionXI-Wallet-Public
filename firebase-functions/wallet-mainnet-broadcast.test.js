const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CLAIM_LEASE_MS,
  DIRECT_FIREBASE_APP_ID,
  MAX_REQUESTS_PER_SENDER_WINDOW,
  claimMainnetTransaction,
  rejectOversizedRequest,
  requireDirectAppCheck,
  readMainnetReceipt,
  submitMainnetRawTransaction,
} = require("./wallet-mainnet-broadcast");

const sender = "0x1111111111111111111111111111111111111111";
const hash = `0x${"22".repeat(32)}`;
const reviewed = { asset: "arxi", amountWei: 1n };

function mockDatabase(records = {}) {
  const ref = (collection, id) => ({ collection, id, set: async (value) => { records[`${collection}/${id}`] = { ...(records[`${collection}/${id}`] || {}), ...value }; } });
  return {
    records,
    collection: (collection) => ({ doc: (id) => ref(collection, id) }),
    runTransaction: async (run) => run({
      get: async (document) => {
        const value = records[`${document.collection}/${document.id}`];
        return { exists: Boolean(value), data: () => value || {} };
      },
      set: (document, value) => { records[`${document.collection}/${document.id}`] = { ...(records[`${document.collection}/${document.id}`] || {}), ...value }; },
    }),
  };
}

test("requires App Check from the exact Direct Firebase Android app", async () => {
  const request = (token) => ({ get: (name) => name === "X-Firebase-AppCheck" ? token : undefined });
  await assert.rejects(requireDirectAppCheck(request(""), { verifyToken: async () => ({ appId: DIRECT_FIREBASE_APP_ID }) }), { code: "app_check_required", status: 401 });
  await assert.rejects(requireDirectAppCheck(request("bad"), { verifyToken: async () => { throw new Error("bad"); } }), { code: "app_check_invalid", status: 401 });
  await assert.rejects(requireDirectAppCheck(request("play"), { verifyToken: async () => ({ appId: "1:408482016151:android:other" }) }), { code: "app_check_app_not_allowed", status: 403 });
  await assert.doesNotReject(requireDirectAppCheck(request("direct"), { verifyToken: async () => ({ appId: DIRECT_FIREBASE_APP_ID }) }));
});

test("atomically blocks concurrent pending claims and returns accepted duplicates", async () => {
  const database = mockDatabase();
  assert.equal(await claimMainnetTransaction(sender, hash, reviewed, database, 1_000), "claimed");
  assert.equal(await claimMainnetTransaction(sender, hash, reviewed, database, 1_001), "in-progress");
  assert.equal(database.records[`walletMainnetRelayQuotas/${sender.slice(2)}`].count, 1);
  database.records[`walletMainnetRelayTransactions/${hash.slice(2)}`].status = "accepted";
  assert.equal(await claimMainnetTransaction(sender, hash, reviewed, database, 1_002), "duplicate");
  assert.equal(database.records[`walletMainnetRelayQuotas/${sender.slice(2)}`].count, 1);
});

test("allows a stale or failed lease retry but durably rate limits the signed sender", async () => {
  const database = mockDatabase();
  for (let index = 0; index < MAX_REQUESTS_PER_SENDER_WINDOW; index += 1) {
    const nextHash = `0x${String(index).padStart(64, "0")}`;
    assert.equal(await claimMainnetTransaction(sender, nextHash, reviewed, database, 1_000), "claimed");
  }
  await assert.rejects(claimMainnetTransaction(sender, `0x${"ff".repeat(32)}`, reviewed, database, 1_001), { code: "mainnet_broadcast_rate_limited", status: 429 });

  const retryDatabase = mockDatabase({
    [`walletMainnetRelayTransactions/${hash.slice(2)}`]: { status: "pending", claimedAt: 1_000 },
  });
  assert.equal(await claimMainnetTransaction(sender, hash, reviewed, retryDatabase, 1_000 + CLAIM_LEASE_MS), "claimed");
});

test("atomically enforces rolling daily count and per-asset totals", async () => {
  const database = mockDatabase();
  const maxArxi = 10_000_000_000_000_000_000_000n;
  assert.equal(await claimMainnetTransaction(sender, hash, { asset: "arxi", amountWei: maxArxi }, database, 1_000), "claimed");
  await assert.rejects(claimMainnetTransaction(sender, `0x${"44".repeat(32)}`, reviewed, database, 1_001), { code: "mainnet_daily_limit_reached", status: 429 });

  const countDatabase = mockDatabase();
  for (let index = 0; index < 5; index += 1) {
    assert.equal(await claimMainnetTransaction(sender, `0x${String(index).padStart(64, "a")}`, reviewed, countDatabase, 1_000 + index * 60_001), "claimed");
  }
  await assert.rejects(claimMainnetTransaction(sender, `0x${"55".repeat(32)}`, reviewed, countDatabase, 1_000 + 5 * 60_001), { code: "mainnet_daily_limit_reached", status: 429 });
});

test("rejects oversized or malformed content lengths", () => {
  assert.throws(() => rejectOversizedRequest({ get: () => "999999" }), { code: "request_too_large", status: 413 });
  assert.throws(() => rejectOversizedRequest({ get: () => "not-a-number" }), { code: "request_too_large", status: 413 });
  assert.doesNotThrow(() => rejectOversizedRequest({ get: () => undefined }));
});

test("submits only eth_sendRawTransaction with timeout and exact returned hash", async () => {
  const raw = "0x0102";
  let request;
  const result = await submitMainnetRawTransaction("https://rpc.example", raw, hash, async (_url, options) => {
    request = options;
    return { ok: true, json: async () => ({ result: hash.toUpperCase().replace("0X", "0x") }) };
  });
  assert.equal(result, hash);
  assert.deepEqual(JSON.parse(request.body), { id: 1, jsonrpc: "2.0", method: "eth_sendRawTransaction", params: [raw] });
  assert.ok(request.signal);
});

test("handles known transaction idempotently and fails closed on RPC ambiguity", async () => {
  const known = async () => ({ ok: true, json: async () => ({ error: { message: "already known" } }) });
  assert.equal(await submitMainnetRawTransaction("https://rpc.example", "0x01", hash, known), hash);
  await assert.rejects(submitMainnetRawTransaction("http://rpc.example", "0x01", hash, known), { code: "mainnet_broadcast_unavailable", status: 503 });
  await assert.rejects(submitMainnetRawTransaction("https://rpc.example", "0x01", hash, async () => ({ ok: true, json: async () => ({ result: `0x${"33".repeat(32)}` }) })), { code: "mainnet_broadcast_rejected", status: 422 });
});

test("reads only the exact public receipt hash and maps terminal status", async () => {
  const methods = [];
  const confirmed = await readMainnetReceipt("https://rpc.example", hash, async (_url, request) => {
    const payload = JSON.parse(request.body);
    methods.push(payload.method);
    assert.ok(request.signal);
    if (payload.method === "eth_chainId") {
      assert.deepEqual(payload.params, []);
      return { ok: true, json: async () => ({ result: "0x38" }) };
    }
    assert.deepEqual(payload, { id: 1, jsonrpc: "2.0", method: "eth_getTransactionReceipt", params: [hash] });
    return { ok: true, json: async () => ({ result: { transactionHash: hash, status: "0x1" } }) };
  });
  assert.deepEqual(confirmed, { state: "confirmed", hash });
  assert.deepEqual(methods, ["eth_chainId", "eth_getTransactionReceipt"]);
  assert.deepEqual(await readMainnetReceipt("https://rpc.example", hash, receiptRpc({ transactionHash: hash, status: "0x0" })), { state: "reverted", hash });
});

function receiptRpc(receipt = null, transaction = null, chain = "0x38") {
  return async (_url, request) => {
    const payload = JSON.parse(request.body);
    assert.ok(["eth_chainId", "eth_getTransactionReceipt", "eth_getTransactionByHash"].includes(payload.method));
    assert.deepEqual(payload.params, payload.method === "eth_chainId" ? [] : [hash]);
    return { ok: true, json: async () => ({ result: payload.method === "eth_chainId" ? chain : payload.method === "eth_getTransactionReceipt" ? receipt : transaction }) };
  };
}

test("missing receipt is unknown unless the exact transaction is visible", async () => {
  assert.deepEqual(await readMainnetReceipt("https://rpc.example", hash, receiptRpc()), { state: "unknown", hash });
  assert.deepEqual(await readMainnetReceipt("https://rpc.example", hash, receiptRpc(null, { hash })), { state: "pending", hash });
  await assert.rejects(readMainnetReceipt("https://rpc.example", hash, receiptRpc(null, { hash: `0x${"33".repeat(32)}` })), { code: "mainnet_receipt_unavailable" });
});

test("wrong-chain, wrong-hash and unavailable receipt evidence never becomes confirmation", async () => {
  await assert.rejects(readMainnetReceipt("https://rpc.example", hash, receiptRpc(null, null, "0x61")), { code: "mainnet_chain_required" });
  await assert.rejects(readMainnetReceipt("https://rpc.example", hash, receiptRpc({ transactionHash: `0x${"33".repeat(32)}`, status: "0x1" })), { code: "mainnet_receipt_unavailable" });
  await assert.rejects(readMainnetReceipt("https://rpc.example", hash, async () => { throw new Error("timeout"); }), { code: "mainnet_receipt_unavailable" });
});

test("USDT quotas preserve legacy BNB and ARXI totals and accepted duplicates do not count twice", async () => {
  const quotaKey = `walletMainnetRelayQuotas/${sender.slice(2)}`;
  const database = mockDatabase({ [quotaKey]: { dailyStartedAt: 1000, dailyCount: 2, dailyNativeBnbWei: "123", dailyArxiWei: "456" } });
  const usdt = { asset: "usdt", amountWei: 100_000_000_000_000_000_000n };
  assert.equal(await claimMainnetTransaction(sender, hash, usdt, database, 2000), "claimed");
  assert.equal(database.records[quotaKey].dailyUsdtWei, usdt.amountWei.toString());
  assert.equal(database.records[quotaKey].dailyNativeBnbWei, "123");
  assert.equal(database.records[quotaKey].dailyArxiWei, "456");
  assert.equal(database.records[quotaKey].dailyCount, 3);
  database.records[`walletMainnetRelayTransactions/${hash.slice(2)}`].status = "accepted";
  assert.equal(await claimMainnetTransaction(sender, hash, usdt, database, 2001), "duplicate");
  assert.equal(database.records[quotaKey].dailyCount, 3);
  assert.equal(database.records[quotaKey].dailyUsdtWei, usdt.amountWei.toString());
});

test("USDT daily cap and global five-transfer cap apply across all three assets and reset only with the quota window", async () => {
  const quotaKey = `walletMainnetRelayQuotas/${sender.slice(2)}`;
  const database = mockDatabase({ [quotaKey]: { dailyStartedAt: 1000, dailyCount: 1, dailyUsdtWei: "500000000000000000000" } });
  await assert.rejects(claimMainnetTransaction(sender, hash, { asset: "usdt", amountWei: 1n }, database, 2000), { code: "mainnet_daily_limit_reached" });
  assert.equal(await claimMainnetTransaction(sender, hash, { asset: "usdt", amountWei: 1n }, database, 1000 + 86400000), "claimed");
  assert.equal(database.records[quotaKey].dailyUsdtWei, "1");
  const countDatabase = mockDatabase({ [quotaKey]: { dailyStartedAt: 1000, dailyCount: 5, dailyUsdtWei: "1" } });
  for (const asset of ["native-bnb", "arxi", "usdt"]) {
    await assert.rejects(claimMainnetTransaction(sender, hash, { asset, amountWei: 1n }, countDatabase, 2000), { code: "mainnet_daily_limit_reached" });
  }
});
