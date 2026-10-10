import { describe, expect, it } from 'vitest';

import { ARGON2_POLICY, isDerivedPinKey } from './argon2-policy';

describe('Argon2id policy boundary', () => {
  it('pins the reviewed OWASP mobile-friendly parameter set', () => {
    expect(ARGON2_POLICY).toEqual({
      algorithm: 'argon2id',
      hashLengthBytes: 32,
      iterations: 2,
      memoryKiB: 19_456,
      parallelism: 1,
      saltBytes: 16,
    });
  });

  it('accepts only a lowercase 256-bit derived key encoding', () => {
    expect(isDerivedPinKey('a'.repeat(64))).toBe(true);
    expect(isDerivedPinKey('A'.repeat(64))).toBe(false);
    expect(isDerivedPinKey('a'.repeat(63))).toBe(false);
  });
});
