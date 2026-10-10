const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const source = readFileSync(require.resolve("./wallet-mainnet-broadcast"), "utf8");

test("Mainnet relay has a source-controlled deny switch and exact Direct App Check binding", () => {
  assert.match(source, /defineBoolean\("MAINNET_RELAY_ENABLED", \{ default: false \}\)/);
  assert.match(source, /decoded\?\.appId !== DIRECT_FIREBASE_APP_ID/);
  assert.match(source, /"\/v1\/bsc-mainnet\/broadcast", "\/v1\/bsc-mainnet\/receipt"/);
  assert.match(source, /enforceMainnetProductionPolicy\(validateMainnetRelayRequest\(request\.body\)\)/);
});

test("Mainnet relay exposes no generic RPC method and never logs transaction material", () => {
  assert.equal((source.match(/eth_sendRawTransaction/g) || []).length, 1);
  assert.doesNotMatch(source, /request\.body\.method|body\?\.method|console\.(?:log|info|error)\([^\n]*(?:serializedTransaction|senderAddress|expectedHash)/);
  assert.doesNotMatch(source, /privateKey|mnemonic|seedPhrase|recoveryPhrase/i);
});

test("receipt-only recovery remains available when new broadcasts are disabled", () => {
  assert.ok(source.indexOf('if (request.path === "/v1/bsc-mainnet/receipt")') < source.indexOf('if (!MAINNET_RELAY_ENABLED.value())'));
  assert.ok(source.indexOf('await requireDirectAppCheck(request)') < source.indexOf('if (request.path === "/v1/bsc-mainnet/receipt")'));
  assert.match(source, /submissionState: submissionMayHaveOccurred \? "unknown" : "not-submitted"/);
  assert.ok(source.indexOf('submissionMayHaveOccurred = true;\n    const hash = await submitMainnetRawTransaction') > 0);
});
