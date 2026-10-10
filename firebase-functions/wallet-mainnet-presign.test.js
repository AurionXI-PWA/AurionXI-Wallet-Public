const test = require("node:test");
const assert = require("node:assert/strict");
const { ARXI_MAINNET_CONTRACT, USDT_MAINNET_CONTRACT, readFixedPreSignSnapshot, buildFixedEstimateTransaction, erc20TransferData, normalizeAmountWei, signingGasLimit } = require("./wallet-mainnet-presign");

const SENDER = "0x1234567890abcdef1234567890abcdef12345678";
const RECIPIENT = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

test("constructs the only permitted native BNB estimate transaction", () => {
  assert.deepEqual(buildFixedEstimateTransaction({ senderAddress: SENDER, recipientAddress: RECIPIENT, asset: "native-bnb", amountWei: "100000000000000" }), { from: SENDER, to: RECIPIENT, value: "0x5af3107a4000" });
});

test("constructs the only permitted ARXI ERC-20 transfer estimate transaction", () => {
  const transaction = buildFixedEstimateTransaction({ senderAddress: SENDER, recipientAddress: RECIPIENT, asset: "arxi", amountWei: "1" });
  assert.equal(transaction.from, SENDER);
  assert.equal(transaction.to, ARXI_MAINNET_CONTRACT.toLowerCase());
  assert.equal(transaction.value, "0x0");
  assert.equal(transaction.data, erc20TransferData(RECIPIENT, "1"));
  assert.equal(transaction.data.slice(0, 10), "0xa9059cbb");
});

test("rejects malformed amounts and unsupported transaction shapes", () => {
  assert.throws(() => normalizeAmountWei("0"));
  assert.throws(() => buildFixedEstimateTransaction({ senderAddress: SENDER, recipientAddress: RECIPIENT, asset: "usdc", amountWei: "1" }));
  assert.throws(() => buildFixedEstimateTransaction({ senderAddress: SENDER, recipientAddress: "0x1", asset: "arxi", amountWei: "1" }));
});

test("returns the same conservative signing gas limits reviewed by the Direct app", () => {
  assert.equal(signingGasLimit("native-bnb"), 21_000n);
  assert.equal(signingGasLimit("arxi"), 160_000n);
  assert.equal(signingGasLimit("usdt"), 160_000n);
  assert.throws(() => signingGasLimit("usdc"));
});

test("USDT estimates only its fixed BSC transfer and rejects uint256 overflow", () => {
  const tx = buildFixedEstimateTransaction({ senderAddress: SENDER, recipientAddress: RECIPIENT, asset: "usdt", amountWei: "1000000000000000001", assetContract: ARXI_MAINNET_CONTRACT });
  assert.deepEqual(tx, { from: SENDER, to: USDT_MAINNET_CONTRACT.toLowerCase(), value: "0x0", data: erc20TransferData(RECIPIENT, "1000000000000000001") });
  assert.throws(() => normalizeAmountWei((1n << 256n).toString()), /invalid_amount_wei/);
});

test("USDT pre-sign validates chain 56, pending nonce and token gas headroom using read-only RPC", async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (_url, options) => {
    const request = JSON.parse(options.body); calls.push(request);
    const results = { eth_chainId: "0x38", eth_getTransactionCount: "0x2", eth_gasPrice: "0x2faf080", eth_estimateGas: "0xea60" };
    return { ok: true, json: async () => ({ result: results[request.method] }) };
  };
  try {
    const input = { senderAddress: SENDER, recipientAddress: RECIPIENT, asset: "usdt", amountWei: "1" };
    const snapshot = await readFixedPreSignSnapshot(input, "https://rpc.example.invalid");
    assert.equal(snapshot.chainId, 56); assert.equal(snapshot.pendingNonce, "2"); assert.equal(snapshot.gasLimit, "160000");
    assert.equal(calls.find((c) => c.method === "eth_estimateGas").params[0].to, USDT_MAINNET_CONTRACT.toLowerCase());
    assert.ok(calls.every((c) => !["eth_sendRawTransaction", "eth_sendTransaction"].includes(c.method)));
    global.fetch = async () => ({ ok: true, json: async () => ({ result: "0x61" }) });
    await assert.rejects(readFixedPreSignSnapshot(input, "https://rpc.example.invalid"), /mainnet_chain_required/);
  } finally { global.fetch = originalFetch; }
});
