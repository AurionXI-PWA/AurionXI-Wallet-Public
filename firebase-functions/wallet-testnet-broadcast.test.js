const assert = require("node:assert/strict");
const test = require("node:test");
const { Wallet, Transaction } = require("ethers");

const {
  validateSignedTestnetTransaction,
  consumeSenderRateLimit,
  isRecentlyBroadcast,
  rememberBroadcast,
  relayDocumentId,
  verifyAppCheckToken,
} = require("./wallet-testnet-broadcast");

async function sign(transaction) {
  const serializedTransaction = await Wallet.createRandom().signTransaction(transaction);
  return {
    serializedTransaction,
    hash: Transaction.from(serializedTransaction).hash,
    expectedHash: Transaction.from(serializedTransaction).hash,
  };
}

test("accepts a signed native BSC Testnet transfer with its canonical hash", async () => {
  const signed = await sign({
    chainId: 97,
    nonce: 0,
    to: "0x1111111111111111111111111111111111111111",
    value: 1n,
    gasLimit: 21_000n,
    gasPrice: 1_000_000_000n,
  });

  const result = validateSignedTestnetTransaction({
    serializedTransaction: signed.serializedTransaction,
    expectedHash: signed.hash,
  });
  assert.equal(result.expectedHash, signed.hash.toLowerCase());
});

test("uses non-sensitive deterministic Firestore document IDs for sender and transaction controls", () => {
  assert.equal(
    relayDocumentId("0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa"),
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );
  assert.equal(relayDocumentId(`0x${"AB".repeat(32)}`), "ab".repeat(32));
});

test("does not reject a missing App Check token while staged enforcement is disabled", async () => {
  await assert.doesNotReject(() => verifyAppCheckToken({ get: () => undefined }));
  assert.equal(await verifyAppCheckToken({ get: () => undefined }), "missing");
});

test("rejects Mainnet, hash mismatch, and arbitrary contract calls", async () => {
  const mainnet = await sign({
    chainId: 56,
    nonce: 0,
    to: "0x1111111111111111111111111111111111111111",
    value: 1n,
    gasLimit: 21_000n,
    gasPrice: 1_000_000_000n,
  });
  assert.throws(
    () => validateSignedTestnetTransaction(mainnet),
    { code: "testnet_chain_required" },
  );

  const testnet = await sign({
    chainId: 97,
    nonce: 0,
    to: "0x1111111111111111111111111111111111111111",
    value: 1n,
    gasLimit: 21_000n,
    gasPrice: 1_000_000_000n,
  });
  assert.throws(
    () => validateSignedTestnetTransaction({ ...testnet, expectedHash: `0x${"00".repeat(32)}` }),
    { code: "transaction_hash_mismatch" },
  );

  const arbitraryCall = await sign({
    chainId: 97,
    nonce: 0,
    to: "0x1111111111111111111111111111111111111111",
    value: 0n,
    data: "0x1234",
    gasLimit: 21_000n,
    gasPrice: 1_000_000_000n,
  });
  assert.throws(
    () => validateSignedTestnetTransaction(arbitraryCall),
    { code: "supported_asset_transfer_required" },
  );
});

test("caps relay attempts per signed sender and de-duplicates a transaction hash", () => {
  const sender = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const startedAt = 1_000_000;
  for (let index = 0; index < 5; index += 1) {
    consumeSenderRateLimit(sender, startedAt + index);
  }
  assert.throws(
    () => consumeSenderRateLimit(sender, startedAt + 6),
    { code: "testnet_broadcast_rate_limited" },
  );

  const hash = `0x${"ab".repeat(32)}`;
  assert.equal(isRecentlyBroadcast(hash, startedAt), false);
  rememberBroadcast(hash, startedAt);
  assert.equal(isRecentlyBroadcast(hash, startedAt + 1), true);
  assert.equal(isRecentlyBroadcast(hash, startedAt + 10 * 60_000 + 1), false);
});
