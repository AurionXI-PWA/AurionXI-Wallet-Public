import { describe, expect, it } from 'vitest';

import { verifyRecoveryWordConfirmation } from './recovery-word-confirmation-core';

const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const challenge = { positions: [1, 12] } as const;

describe('non-revealing recovery word confirmation', () => {
  it('confirms ordered in-memory responses without returning phrase material', () => {
    const result = verifyRecoveryWordConfirmation(phrase, challenge, [
      { position: 1, word: 'abandon' },
      { position: 12, word: 'about' },
    ]);
    expect(result).toEqual({ ok: true });
    expect(JSON.stringify(result)).not.toContain('abandon');
    expect(JSON.stringify(result)).not.toContain('about');
  });

  it.each([
    [{ positions: [1, 1] }, [{ position: 1, word: 'abandon' }], 'invalid-challenge'],
    [challenge, [{ position: 1, word: 'abandon' }], 'invalid-response'],
    [challenge, [{ position: 1, word: 'about' }, { position: 12, word: 'abandon' }], 'mismatch'],
  ] as const)('fails closed for invalid confirmation state', (candidate, responses, reason) => {
    expect(verifyRecoveryWordConfirmation(phrase, candidate, responses)).toEqual({ ok: false, reason });
  });
});
