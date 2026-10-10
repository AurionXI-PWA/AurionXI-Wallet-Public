const test = require("node:test");
const assert = require("node:assert/strict");
const { Wallet, Transaction } = require("ethers");
const { ARXI, USDT, erc20Data, validateMainnetRelayRequest } = require("./wallet-mainnet-relay-policy");

const wallet = new Wallet("0x0123456789012345678901234567890123456789012345678901234567890123");
const recipient = "0xd778c4a7cc7398e20aa73fba5af5021c54d2bb5b";

async function signedNative(overrides = {}) {
  const raw = await wallet.signTransaction({ type: 0, chainId: 56, nonce: 7, gasPrice: 50_000_000n, gasLimit: 21_000n, to: recipient, value: 1n, data: "0x", ...overrides });
  const tx = Transaction.from(raw);
  return { serializedTransaction: raw, expectedHash: tx.hash, senderAddress: wallet.address, recipientAddress: recipient, asset: "native-bnb", amountWei: "1", nonce: "7", gasLimit: "21000", gasPriceWei: "50000000" };
}

test("accepts only the signed reviewed native BNB transfer", async () => {
  const request = await signedNative();
  const result = validateMainnetRelayRequest(request);
  assert.equal(result.senderAddress, wallet.address.toLowerCase());
});

test("rejects altered recipient, amount, nonce, or hash", async () => {
  const request = await signedNative();
  for (const changed of [
    { recipientAddress: wallet.address }, { amountWei: "2" }, { nonce: "8" },
    { expectedHash: "0x" + "00".repeat(32) },
  ]) assert.throws(() => validateMainnetRelayRequest({ ...request, ...changed }));
});

test("rejects arbitrary contract calls", async () => {
  const request = await signedNative({ to: "0x6fFEC4860325f8bfB3F000354708A7d0caE4b250", value: 0n, gasLimit: 60_000n, data: "0x095ea7b3" + "00".repeat(64) });
  assert.throws(() => validateMainnetRelayRequest({ ...request, asset: "arxi", amountWei: "1", gasLimit: "60000" }));
});

test("accepts only the exact signed ARXI transfer", async () => {
  const raw = await wallet.signTransaction({ type: 0, chainId: 56, nonce: 8, gasPrice: 50_000_000n, gasLimit: 60_000n, to: ARXI, value: 0n, data: erc20Data(recipient, 1n) });
  const tx = Transaction.from(raw);
  const request = { serializedTransaction: raw, expectedHash: tx.hash, senderAddress: wallet.address, recipientAddress: recipient, asset: "arxi", amountWei: "1", nonce: String(tx.nonce), gasLimit: "60000", gasPriceWei: "50000000" };
  assert.equal(validateMainnetRelayRequest(request).asset, "arxi");
  for (const changed of [{ recipientAddress: wallet.address }, { amountWei: "2" }, { gasLimit: "60001" }, { gasPriceWei: "50000001" }, { asset: "usdt" }]) {
    assert.throws(() => validateMainnetRelayRequest({ ...request, ...changed }));
  }
});

test("rejects typed transactions contract creation zero address and excessive quantities", async () => {
  const request = await signedNative();
  const typedRaw = await wallet.signTransaction({ type: 1, chainId: 56, nonce: 7, gasPrice: 50_000_000n, gasLimit: 21_000n, to: recipient, value: 1n, data: "0x", accessList: [] });
  const typed = Transaction.from(typedRaw);
  assert.throws(() => validateMainnetRelayRequest({ ...request, serializedTransaction: typedRaw, expectedHash: typed.hash }));
  const creationRaw = await wallet.signTransaction({ type: 0, chainId: 56, nonce: 7, gasPrice: 50_000_000n, gasLimit: 60_000n, value: 0n, data: "0x6000" });
  const creation = Transaction.from(creationRaw);
  assert.throws(() => validateMainnetRelayRequest({ ...request, serializedTransaction: creationRaw, expectedHash: creation.hash, gasLimit: "60000" }));
  assert.throws(() => validateMainnetRelayRequest({ ...request, recipientAddress: `0x${"0".repeat(40)}` }));
  assert.throws(() => validateMainnetRelayRequest({ ...request, amountWei: (1n << 256n).toString() }));
  assert.throws(() => validateMainnetRelayRequest({ ...request, nonce: (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString() }));
  assert.throws(() => validateMainnetRelayRequest({ ...request, gasLimit: "500001" }));
  assert.throws(() => validateMainnetRelayRequest({ ...request, gasPriceWei: "1000000000001" }));
});

test("USDT accepts only its exact signed BSC transfer and cannot be relabelled ARXI", async () => {
  const request = { ...await signedNative({ to: USDT, value: 0n, gasLimit: 160_000n, data: erc20Data(recipient, 1n) }), asset: "usdt", gasLimit: "160000" };
  assert.equal(validateMainnetRelayRequest(request).asset, "usdt");
  for (const changed of [{ asset: "arxi" }, { asset: "usdc" }, { amountWei: "2" }, { recipientAddress: wallet.address }]) {
    assert.throws(() => validateMainnetRelayRequest({ ...request, ...changed }));
  }
  for (const overrides of [
    { to: ARXI }, { to: "0xdac17f958d2ee523a2206206994597c13d831ec7" }, { value: 1n },
    { data: "0x095ea7b3" + "00".repeat(64) }, { data: erc20Data(recipient, 1n) + "00" }, { chainId: 1 },
  ]) {
    const invalid = await signedNative({ to: USDT, value: 0n, gasLimit: 160_000n, data: erc20Data(recipient, 1n), ...overrides });
    assert.throws(() => validateMainnetRelayRequest({ ...invalid, asset: "usdt", gasLimit: "160000" }));
  }
});
