import { describe, expect, it } from 'vitest';

import { validateRecoveryPhrase } from './recovery-phrase-validation';

const ZERO_ENTROPY_VECTOR = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('BIP-39 recovery phrase validation boundary', () => {
  it('accepts the official zero-entropy English checksum vector', () => {
    expect(validateRecoveryPhrase(ZERO_ENTROPY_VECTOR)).toEqual({ ok: true, wordCount: 12 });
  });

  it('normalizes case and whitespace before validation', () => {
    expect(validateRecoveryPhrase(`  ${ZERO_ENTROPY_VECTOR.toUpperCase()}\n`)).toEqual({
      ok: true,
      wordCount: 12,
    });
  });

  it('rejects a valid-word phrase with an invalid checksum', () => {
    const invalidChecksum = ZERO_ENTROPY_VECTOR.replace(/about$/, 'abandon');
    expect(validateRecoveryPhrase(invalidChecksum)).toEqual({
      ok: false,
      reason: 'invalid-word-or-checksum',
    });
  });

  it('rejects unsupported lengths before checksum processing', () => {
    expect(validateRecoveryPhrase('abandon '.repeat(13))).toEqual({
      ok: false,
      reason: 'unsupported-word-count',
    });
  });

  it('bounds attacker-controlled input size', () => {
    expect(validateRecoveryPhrase('a'.repeat(513))).toEqual({
      ok: false,
      reason: 'input-too-long',
    });
  });

  it('returns no phrase content in validation results', () => {
    expect(JSON.stringify(validateRecoveryPhrase(ZERO_ENTROPY_VECTOR))).not.toContain('abandon');
  });
});
