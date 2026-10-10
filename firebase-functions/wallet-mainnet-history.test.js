const test = require("node:test");
const assert = require("node:assert/strict");

const { ARXI, USDT, USDC, ETH, BTCB, CURATED_TOKENS, ankrMultichainUrl, ankrNativeActivity, ankrTokenActivity, curatedTokenExplorerActivity, mergeActivitySources } = require("./wallet-mainnet-history");

const ADDRESS = "0xEf7c8E41ba2707c2E92b8837Ff4B5EB55cec27e6";
const HASH = `0x${"a".repeat(64)}`;

test("pins the complete reviewed BSC Mainnet asset set", () => {
  assert.equal(ARXI, "0x6fFEC4860325f8bfB3F000354708A7d0caE4b250");
  assert.equal(USDT, "0x55d398326f99059fF775485246999027B3197955");
  assert.equal(USDC, "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d");
  assert.equal(ETH, "0x2170Ed0880ac9A755fd29B2688956BD959F933F8");
  assert.equal(BTCB, "0x7130d2A12B9BCBfAE4f2634d864A1EE1Ce3Ead9c");
  assert.deepEqual(CURATED_TOKENS.map(({ symbol }) => symbol), ["ARXI", "USDT", "USDC", "ETH", "BTCB"]);
});

test("formats a fixed-contract USDT receipt as curated activity", () => {
  const item = curatedTokenExplorerActivity(ADDRESS, {
    hash: HASH,
    transactionIndex: "0",
    blockNumber: "1",
    timeStamp: "1",
    value: "100000000000000000",
    from: "0x1111111111111111111111111111111111111111",
    to: ADDRESS,
    isError: "0",
    txreceipt_status: "1",
  }, { symbol: "USDT" });
  assert.deepEqual(item && { direction: item.direction, amount: item.amount, symbol: item.symbol }, {
    direction: "Received",
    amount: "0.1",
    symbol: "USDT",
  });
});

test("derives the Ankr indexed endpoint without exposing or accepting arbitrary hosts", () => {
  assert.equal(ankrMultichainUrl("https://rpc.ankr.com/bsc/example_key-1"), "https://rpc.ankr.com/multichain/example_key-1");
  assert.throws(() => ankrMultichainUrl("https://attacker.example/bsc/example_key-1"), /indexer_unavailable/);
  assert.throws(() => ankrMultichainUrl("http://rpc.ankr.com/bsc/example_key-1"), /indexer_unavailable/);
  assert.throws(() => ankrMultichainUrl("https://rpc.ankr.com/bsc/example_key-1?redirect=x"), /indexer_unavailable/);
});

test("normalizes an indexed native BNB transfer and rejects unrelated records", () => {
  const item = { blockchain: "bsc", hash: HASH, blockNumber: "0x10", timestamp: "0x64", transactionIndex: "0x1", from: "0x1111111111111111111111111111111111111111", to: ADDRESS, value: "0xde0b6b3a7640000", status: "0x1" };
  assert.deepEqual(ankrNativeActivity(ADDRESS, item) && { direction: ankrNativeActivity(ADDRESS, item).direction, amount: ankrNativeActivity(ADDRESS, item).amount, blockNumber: ankrNativeActivity(ADDRESS, item).blockNumber }, { direction: "Received", amount: "1", blockNumber: "16" });
  assert.equal(ankrNativeActivity(ADDRESS, { ...item, blockchain: "eth" }), null);
  assert.equal(ankrNativeActivity(ADDRESS, { ...item, value: "0x0" }), null);
});

test("allows only pinned BSC token contracts from indexed history", () => {
  const item = { blockchain: "bsc", contractAddress: USDT, fromAddress: ADDRESS, toAddress: "0x1111111111111111111111111111111111111111", transactionHash: HASH, tokenDecimals: 18, valueRawInteger: "100000000000000000", blockHeight: 25, timestamp: 100, logIndex: 2 };
  assert.deepEqual(ankrTokenActivity(ADDRESS, item) && { direction: ankrTokenActivity(ADDRESS, item).direction, amount: ankrTokenActivity(ADDRESS, item).amount, symbol: ankrTokenActivity(ADDRESS, item).symbol }, { direction: "Sent", amount: "0.1", symbol: "USDT" });
  assert.equal(ankrTokenActivity(ADDRESS, { ...item, contractAddress: "0x2222222222222222222222222222222222222222" }), null);
  assert.equal(ankrTokenActivity(ADDRESS, { ...item, blockchain: "eth" }), null);
});

test("reports total provider failure instead of presenting false empty history", () => {
  const unavailable = { status: "rejected", reason: new Error("unavailable") };
  assert.throws(() => mergeActivitySources(unavailable, unavailable, []), /indexer_unavailable/);
  assert.deepEqual(mergeActivitySources({ status: "fulfilled", value: [] }, { status: "fulfilled", value: [] }, []), []);
});
