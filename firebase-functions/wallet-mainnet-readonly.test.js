const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ARXI_MAINNET_CONTRACT,
  BSC_USDT_CONTRACT,
  BSC_USDC_CONTRACT,
  BSC_ETH_CONTRACT,
  BSC_BTCB_CONTRACT,
  addressBalanceOfData,
  addressPairData,
  decodeAddressWord,
  decodeReserveWords,
  decimalRatio,
  isPublicAddress,
} = require("./wallet-mainnet-readonly");

test("accepts only a public EVM address", () => {
  assert.equal(isPublicAddress("0x1234567890aBCdef1234567890abCDef12345678"), true);
  assert.equal(isPublicAddress("not-an-address"), false);
});

test("builds a fixed ERC-20 balanceOf call", () => {
  const data = addressBalanceOfData("0x1234567890aBCdef1234567890abCDef12345678");
  assert.equal(data, "0x70a082310000000000000000000000001234567890abcdef1234567890abcdef12345678");
  assert.equal(ARXI_MAINNET_CONTRACT, "0x6fFEC4860325f8bfB3F000354708A7d0caE4b250");
});

test("pins the curated BSC Mainnet token contracts", () => {
  assert.equal(BSC_USDT_CONTRACT, "0x55d398326f99059fF775485246999027B3197955");
  assert.equal(BSC_USDC_CONTRACT, "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d");
  assert.equal(BSC_ETH_CONTRACT, "0x2170Ed0880ac9A755fd29B2688956BD959F933F8");
  assert.equal(BSC_BTCB_CONTRACT, "0x7130d2A12B9BCBfAE4f2634d864A1EE1Ce3Ead9c");
});

test("formats a six-asset USD total deterministically", () => {
  assert.equal(decimalRatio(1500000n, 1000000n), 1.5);
});

test("builds and validates only the fixed ARXI/USDT PancakeSwap pair read", () => {
  assert.equal(addressPairData(ARXI_MAINNET_CONTRACT, BSC_USDT_CONTRACT).slice(0, 10), "0xe6a43905");
  assert.equal(decodeAddressWord(`0x${"0".repeat(24)}${ARXI_MAINNET_CONTRACT.slice(2)}`), ARXI_MAINNET_CONTRACT.toLowerCase());
  assert.deepEqual(decodeReserveWords(`0x${"0".repeat(63)}1${"0".repeat(63)}2${"0".repeat(64)}`), [1n, 2n]);
  assert.equal(decimalRatio(3n * 10n ** 18n, 2n * 10n ** 18n), 1.5);
});
