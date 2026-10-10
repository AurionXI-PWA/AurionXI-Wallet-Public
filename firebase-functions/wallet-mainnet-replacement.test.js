const test = require("node:test");
const assert = require("node:assert/strict");
const { Wallet, Transaction } = require("ethers");
const { buildFixedEstimateTransaction, readReplacementSnapshot } = require("./wallet-mainnet-presign");
const { validateMainnetRelayRequest, erc20Data, USDT } = require("./wallet-mainnet-relay-policy");
const { enforceMainnetProductionPolicy } = require("./wallet-mainnet-production-policy");
const { claimMainnetTransaction } = require("./wallet-mainnet-broadcast");
// Public, synthetic test key; no real wallet or broadcast is involved.
const wallet = new Wallet("0x0123456789012345678901234567890123456789012345678901234567890123");
const sender = wallet.address.toLowerCase(), recipient = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const hash = "0x" + "aa".repeat(32);
const input = { senderAddress: sender, recipientAddress: sender, asset: "native-bnb", amountWei: "0", replacesTransactionHash: hash, replacementNonce: "6", replacementKind: "cancel" };
function rpc(results = {}) {
  const calls = [];
  return { calls, fetch: async (_url, options) => {
    const r = JSON.parse(options.body); calls.push(r);
    const value = Object.hasOwn(results, r.method) ? results[r.method] : {
      eth_chainId: "0x38", eth_getTransactionCount: "0x6", eth_gasPrice: "0x2faf080",
      eth_getTransactionByHash: null, eth_getTransactionReceipt: null, eth_getBalance: "0x100000000000000", eth_estimateGas: "0x5208",
    }[r.method];
    return { ok: true, json: async () => ({ result: typeof value === "function" ? value(r.params) : value }) };
  }};
}
async function quote(data, results = {}) {
  const prev = global.fetch; const mock = rpc(results); global.fetch = mock.fetch;
  try { return { snapshot: await readReplacementSnapshot(data, "https://rpc.example.invalid"), calls: mock.calls }; }
  finally { global.fetch = prev; }
}
test("cancel quote is read-only, self 0 BNB, exact original nonce, doubled live fee", async () => {
  const { snapshot, calls } = await quote(input);
  assert.equal(snapshot.latestNonce, "6"); assert.equal(snapshot.replacementNonce, "6"); assert.equal(snapshot.gasPriceWei, "100000000");
  assert.equal(snapshot.replacesTransactionHash, hash); assert.equal(snapshot.replacementKind, "cancel");
  assert.deepEqual(calls.find(c => c.method === "eth_estimateGas").params, [{ from: sender, to: sender, value: "0x0", gasPrice: "0x5f5e100" }, "latest"]);
  assert.ok(calls.every(c => !c.method.startsWith("eth_send")));
});
test("zero transfers require an explicit valid Cancel intent", () => {
  assert.throws(() => buildFixedEstimateTransaction({ ...input, replacesTransactionHash: undefined }), /invalid_replacement/);
  for (const change of [{ asset: "usdt" }, { recipientAddress: recipient }, { amountWei: "1" }, { replacementKind: "x" }, { replacementNonce: "9007199254740992" }, { replacesTransactionHash: "0xbad" }]) assert.throws(() => buildFixedEstimateTransaction({ ...input, ...change }));
});
test("consumed nonce or a receipt forbids a replacement regardless of pending quote", async () => {
  await assert.rejects(quote(input, { eth_getTransactionReceipt: { transactionHash: hash } }), /nonce_already_consumed/);
  await assert.rejects(quote(input, { eth_getTransactionCount: params => params[1] === "latest" ? "0x7" : "0x8" }), /nonce_already_consumed/);
  await assert.rejects(quote(input, { eth_getTransactionCount: params => params[1] === "latest" ? "0x6" : "0x5" }), /nonce_already_consumed/);
  assert.equal((await quote(input, { eth_getTransactionCount: params => params[1] === "latest" ? "0x6" : "0x7" })).snapshot.latestNonce, "6");
});
test("replacement bumps visible or durable original fee, within balance and maximum fee", async () => {
  const original = { hash, from: sender, nonce: "0x6", gasPrice: "0xbebc200" };
  assert.equal((await quote(input, { eth_getTransactionByHash: original })).snapshot.gasPriceWei, "250000000");
  assert.equal((await quote({ ...input, minimumGasPriceWei: "200000000" })).snapshot.gasPriceWei, "250000000");
  for (const change of [{ from: recipient }, { nonce: "0x7" }, { hash: "0x" + "bb".repeat(32) }]) await assert.rejects(quote(input, { eth_getTransactionByHash: { ...original, ...change } }), /invalid_replacement/);
  await assert.rejects(quote(input, { eth_getBalance: "0x1" }), /unavailable/);
  await assert.rejects(quote(input, { eth_gasPrice: "0xffffffffff" }), /unavailable/);
  await assert.rejects(quote(input, { eth_estimateGas: "0x5209" }), /unavailable/);
  await assert.rejects(quote(input, { eth_chainId: "0x61" }), /mainnet_chain_required/);
});
test("Speed Up preserves exact native and USDT intent when the original is visible", async () => {
  for (const asset of ["native-bnb", "usdt"]) {
    const data = { ...input, recipientAddress: recipient, asset, amountWei: "1000000000000000001", replacementKind: "speed-up" };
    const shape = buildFixedEstimateTransaction(data);
    const original = { hash, from: sender, nonce: "0x6", gasPrice: "0x2faf080", to: shape.to, value: shape.value, input: shape.data || "0x" };
    const results = { eth_getTransactionByHash: original, eth_estimateGas: asset === "usdt" ? "0xea60" : "0x5208" };
    assert.equal((await quote(data, results)).snapshot.gasLimit, asset === "usdt" ? "160000" : "21000");
    for (const change of [{ to: sender }, { value: "0x2" }, { input: "0x095ea7b3" }]) await assert.rejects(quote(data, { ...results, eth_getTransactionByHash: { ...original, ...change } }), /invalid_replacement/);
  }
});
async function signed(kind, asset = "native-bnb", change = {}) {
  const cancel = kind === "cancel", amount = cancel ? 0n : 1n, to = cancel ? sender : recipient;
  const gas = asset === "usdt" ? 160000n : 21000n;
  const raw = await wallet.signTransaction({ type: 0, chainId: 56, nonce: 6, gasPrice: 100000000n, gasLimit: gas,
    to: asset === "usdt" ? USDT : to, value: asset === "usdt" ? 0n : amount, data: asset === "usdt" ? erc20Data(to, amount) : "0x", ...change });
  return { serializedTransaction: raw, expectedHash: Transaction.from(raw).hash, senderAddress: sender, recipientAddress: to, asset,
    amountWei: amount.toString(), nonce: "6", gasLimit: gas.toString(), gasPriceWei: "100000000", replacesTransactionHash: hash, replacementKind: kind };
}
test("relay and production policy accept only reviewed signed replacement shapes", async () => {
  for (const [kind, asset] of [["cancel", "native-bnb"], ["speed-up", "native-bnb"], ["speed-up", "usdt"]]) {
    const request = await signed(kind, asset);
    const reviewed = validateMainnetRelayRequest(request); assert.equal(reviewed.replacementKind, kind);
    assert.doesNotThrow(() => enforceMainnetProductionPolicy(reviewed));
    for (const change of [{ nonce: "7" }, { recipientAddress: recipient === request.recipientAddress ? sender : recipient }, { amountWei: "2" }, { replacesTransactionHash: request.expectedHash }, { replacementKind: "x" }, { replacesTransactionHash: undefined }]) assert.throws(() => validateMainnetRelayRequest({ ...request, ...change }));
    assert.throws(() => enforceMainnetProductionPolicy({ ...reviewed, gasPriceWei: 1000000000000n }));
  }
});
test("cancel cannot sign a different recipient, nonzero value, arbitrary data or chain", async () => {
  for (const change of [{ to: recipient }, { value: 1n }, { data: "0x00" }, { chainId: 97 }]) { const request = await signed("cancel", "native-bnb", change); assert.throws(() => validateMainnetRelayRequest(request)); }
});
function database(records = {}) {
  return { records, collection: collection => ({ doc: id => ({ collection, id }) }), runTransaction: run => run({
    get: async ref => { const value = records[`${ref.collection}/${ref.id}`]; return { exists: !!value, data: () => value || {} }; },
    set: (ref, value) => { records[`${ref.collection}/${ref.id}`] = { ...records[`${ref.collection}/${ref.id}`], ...value }; },
  })};
}
test("cancellation retains full transfer quotas, uses a bounded recovery quota and duplicates count once", async () => {
  const key = `walletMainnetRelayQuotas/${sender.slice(2)}`;
  const db = database({ [key]: { dailyStartedAt: 1000, dailyCount: 5, dailyNativeBnbWei: "100000000000000000", dailyUsdtWei: "500000000000000000000" } });
  const reviewed = validateMainnetRelayRequest(await signed("cancel"));
  for (let i = 0; i < 5; i++) assert.equal(await claimMainnetTransaction(sender, `0x${String(i).padStart(64,"c")}`, reviewed, db, 1000 + i * 60001), "claimed");
  assert.equal(db.records[key].dailyCount, 5); assert.equal(db.records[key].dailyReplacementCount, 5); assert.equal(db.records[key].dailyUsdtWei, "500000000000000000000");
  await assert.rejects(claimMainnetTransaction(sender, hash, reviewed, db, 1000 + 5 * 60001), /mainnet_daily_limit_reached/);
  const duplicate = `0x${String(0).padStart(64,"c")}`;
  db.records[`walletMainnetRelayTransactions/${duplicate.slice(2)}`].status = "accepted";
  assert.equal(await claimMainnetTransaction(sender, duplicate, reviewed, db, 1000 + 5 * 60001), "duplicate");
  assert.equal(db.records[key].dailyReplacementCount, 5);
  await assert.rejects(claimMainnetTransaction(sender, hash, { ...reviewed, replacementKind: "speed-up", amountWei: 1n }, db, 1000 + 5 * 60001), /mainnet_daily_limit_reached/);
});

test("future same-nonce same-intent Speed Up does not double-count amount or transfer quota", async () => {
  const key = `walletMainnetRelayQuotas/${sender.slice(2)}`;
  const reviewed = validateMainnetRelayRequest(await signed("speed-up", "usdt"));
  const db = database();
  const first = { ...reviewed, replacesTransactionHash: undefined, replacementKind: undefined };
  assert.equal(await claimMainnetTransaction(sender, reviewed.expectedHash, first, db, 1000), "claimed");
  assert.equal(await claimMainnetTransaction(sender, hash, reviewed, db, 61001), "claimed");
  assert.equal(db.records[key].dailyCount, 1); assert.equal(db.records[key].dailyUsdtWei, "1"); assert.equal(db.records[key].dailyReplacementCount, 1);
  await assert.rejects(claimMainnetTransaction(sender, `0x${"dd".repeat(32)}`, { ...reviewed, amountWei: 2n }, db, 121002), /intent_mismatch/);
  await assert.rejects(claimMainnetTransaction(sender, `0x${"ee".repeat(32)}`, { ...reviewed, recipientAddress: sender }, db, 121002), /intent_mismatch/);
});
