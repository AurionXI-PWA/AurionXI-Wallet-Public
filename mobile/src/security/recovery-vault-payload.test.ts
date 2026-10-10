import { describe, expect, it } from 'vitest';

import {
  decodeRecoveryVaultPayload,
  encodeRecoveryVaultPayload,
  withEncodedRecoveryVaultPayload,
} from './recovery-vault-payload';
import { zeroizeBytes } from './secret-memory';

describe('versioned binary recovery vault payload', () => {
  it.each([16, 20, 24, 28, 32])('round-trips standard entropy length %i', (length) => {
    const entropy = Uint8Array.from({ length }, (_, index) => index);
    const payload = encodeRecoveryVaultPayload(entropy);
    const decoded = decodeRecoveryVaultPayload(payload);
    expect([...decoded.entropy]).toEqual([...entropy]);
    expect(decoded.formatVersion).toBe(1);
    zeroizeBytes(decoded.entropy);
    zeroizeBytes(payload);
  });

  it('rejects wrong magic, version, length, and derivation metadata', () => {
    const valid = encodeRecoveryVaultPayload(new Uint8Array(32));
    for (const offset of [0, 4, 6, 11]) {
      const tampered = valid.slice();
      tampered[offset] = (tampered[offset] ?? 0) ^ 1;
      expect(() => decodeRecoveryVaultPayload(tampered)).toThrow();
      zeroizeBytes(tampered);
    }
    zeroizeBytes(valid);
  });

  it('overwrites callback-scoped encoded payload after use', () => {
    let observed: Uint8Array | undefined;
    const result = withEncodedRecoveryVaultPayload(new Uint8Array(32).fill(9), (payload) => {
      observed = payload;
      return payload.length;
    });
    expect(result).toBe(59);
    expect(observed).toBeDefined();
    expect([...observed!]).toEqual(new Array(59).fill(0));
  });

  it('rejects non-standard entropy sizes', () => {
    expect(() => encodeRecoveryVaultPayload(new Uint8Array(15))).toThrow('invalid');
    expect(() => encodeRecoveryVaultPayload(new Uint8Array(33))).toThrow('invalid');
  });
});
