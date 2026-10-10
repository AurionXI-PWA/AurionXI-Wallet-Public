import { describe, expect, it } from 'vitest';

import { createWalletIdentityRecord, isWalletIdentityRecord } from './wallet-identity-record-core';

describe('authoritative wallet identity record', () => {
  const record = createWalletIdentityRecord(
    '0x0000000000000000000000000000000000000001',
    '2026-08-09T00:00:00.000Z',
  );

  it('creates strict public-only identity metadata', () => {
    expect(isWalletIdentityRecord(record)).toBe(true);
    expect(JSON.stringify(record)).not.toMatch(/phrase|private|ciphertext|payload|pin/i);
  });

  it.each([
    { ...record, publicAddress: '0x1234' },
    { ...record, vaultCreatedAt: 'not-a-date' },
    { ...record, derivationPath: "m/44'/60'/1'/0/0" },
    { ...record, extra: 'blocked' },
  ])('rejects malformed or expanded metadata', (value) => {
    expect(isWalletIdentityRecord(value)).toBe(false);
  });
});
