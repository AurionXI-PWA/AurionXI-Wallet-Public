const test = require("node:test");
const assert = require("node:assert/strict");
const { POLICY, enforceMainnetProductionPolicy } = require("./wallet-mainnet-production-policy");

test("production policy records the owner-approved asset and transaction limits", () => {
  assert.equal(POLICY.releaseApproved, true);
  assert.deepEqual(POLICY.assets, ["native-bnb", "arxi", "usdt"]);
  assert.equal(POLICY.maxNativeBnbAmountWei, 100_000_000_000_000_000n);
  assert.equal(POLICY.maxArxiAmountWei, 5_000_000_000_000_000_000_000n);
  assert.equal(POLICY.maxFeeWei, 100_000_000_000_000n);
  assert.equal(POLICY.maxTransactionsPerWindow, 5);
  assert.doesNotThrow(() => enforceMainnetProductionPolicy({ asset: "arxi", amountWei: 1n, gasLimit: 1n, gasPriceWei: 1n }));
});

test("an approved policy enforces asset amount and total fee caps", () => {
  const approved = { ...POLICY, releaseApproved: true };
  assert.doesNotThrow(() => enforceMainnetProductionPolicy({ asset: "arxi", amountWei: POLICY.maxArxiAmountWei, gasLimit: 160_000n, gasPriceWei: 50_000_000n }, approved));
  assert.doesNotThrow(() => enforceMainnetProductionPolicy({ asset: "native-bnb", amountWei: POLICY.maxNativeBnbAmountWei, gasLimit: 21_000n, gasPriceWei: 50_000_000n }, approved));
  assert.throws(() => enforceMainnetProductionPolicy({ asset: "arxi", amountWei: POLICY.maxArxiAmountWei + 1n, gasLimit: 1n, gasPriceWei: 1n }, approved), /mainnet_production_policy_rejected/);
  assert.throws(() => enforceMainnetProductionPolicy({ asset: "usdc", amountWei: 1n, gasLimit: 1n, gasPriceWei: 1n }, approved), /mainnet_production_policy_rejected/);
  assert.throws(() => enforceMainnetProductionPolicy({ asset: "native-bnb", amountWei: 1n, gasLimit: 500_000n, gasPriceWei: 1_000_000_000n }, approved), /mainnet_production_policy_rejected/);
});

test("USDT has independent positive amount and fee caps and cannot fall through to ARXI limits", () => {
  const valid = { asset: "usdt", amountWei: POLICY.maxUsdtAmountWei, gasLimit: 160_000n, gasPriceWei: 50_000_000n };
  assert.equal(POLICY.maxUsdtAmountWei, 100_000_000_000_000_000_000n);
  assert.equal(POLICY.maxUsdtPerWindowWei, 500_000_000_000_000_000_000n);
  assert.doesNotThrow(() => enforceMainnetProductionPolicy(valid));
  for (const changed of [{ amountWei: POLICY.maxUsdtAmountWei + 1n }, { amountWei: 0n }, { asset: "USDT" }, { gasPriceWei: 1_000_000_000n }]) {
    assert.throws(() => enforceMainnetProductionPolicy({ ...valid, ...changed }), /mainnet_production_policy_rejected/);
  }
  assert.throws(() => enforceMainnetProductionPolicy(valid, { ...POLICY, maxUsdtAmountWei: undefined }), /mainnet_production_policy_rejected/);
  assert.throws(() => enforceMainnetProductionPolicy(valid, { ...POLICY, releaseApproved: false }), /mainnet_production_policy_not_approved/);
});
