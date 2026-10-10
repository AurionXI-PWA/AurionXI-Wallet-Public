import { describe, expect, it } from 'vitest';

import { getMainnetRecoveryWordsFromPayload } from './mainnet-recovery-view-core';
import { encodeRecoveryVaultPayload } from './recovery-vault-payload';

describe('getMainnetRecoveryWordsFromPayload', () => {
  it('derives the expected 24 display words from a valid Mainnet vault payload', () => {
    const payload = encodeRecoveryVaultPayload(new Uint8Array(32));

    expect(getMainnetRecoveryWordsFromPayload(payload)).toHaveLength(24);
    expect(payload.some((value) => value !== 0)).toBe(true);
  });

  it('rejects invalid payloads without producing display words', () => {
    expect(() => getMainnetRecoveryWordsFromPayload(new Uint8Array())).toThrow('Recovery vault payload is invalid.');
  });
});
