import { describe, expect, it } from 'vitest';

import { preflightSyntheticRecoveryImport } from './synthetic-recovery-import-preflight-core';

const validPhrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('synthetic recovery import preflight', () => {
  it('returns only non-secret eligibility metadata for a valid phrase', () => {
    const result = preflightSyntheticRecoveryImport(validPhrase);
    expect(result).toEqual({ eligible: true, wordCount: 12 });
    expect(JSON.stringify(result)).not.toContain('abandon');
    expect(JSON.stringify(result)).not.toContain('about');
  });

  it.each([
    ['abandon '.repeat(13), 'unsupported-word-count'],
    [validPhrase.replace(/about$/, 'abandon'), 'invalid-word-or-checksum'],
    ['a'.repeat(513), 'input-too-long'],
  ] as const)('fails closed for invalid import input', (input, reason) => {
    expect(preflightSyntheticRecoveryImport(input)).toEqual({ eligible: false, reason });
  });
});
