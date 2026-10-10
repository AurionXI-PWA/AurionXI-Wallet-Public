const assert = require('node:assert/strict');
const test = require('node:test');
const { CONSENT_VERSION, registryId } = require('./wallet-address-registry');

test('registry id normalizes a valid checksum address without exposing other data', () => {
  assert.equal(registryId('0x5C8B6A179E4584e90675aac12594435BAb86E208'), '5c8b6a179e4584e90675aac12594435bab86e208');
  assert.equal(CONSENT_VERSION, 'wallet-public-address-registry-v1');
});

test('registry id rejects malformed public addresses', () => {
  assert.throws(() => registryId('not-an-address'));
});
