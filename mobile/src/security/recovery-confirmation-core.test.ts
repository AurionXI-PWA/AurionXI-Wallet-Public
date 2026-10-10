import { describe, expect, it, vi } from 'vitest';

import {
  createRecoveryConfirmationChallenge,
  verifyRecoveryConfirmation,
} from './recovery-confirmation-core';

const PHRASE = `${'abandon '.repeat(23)}art`;

describe('recovery backup confirmation foundation', () => {
  it('creates four unique, ordered positions without phrase content', async () => {
    const challenge = await createRecoveryConfirmationChallenge(24, {
      randomBytes: vi.fn().mockResolvedValue(Uint8Array.from([23, 0, 12, 5, 5, 12, 255, 254, 253, 252, 1, 2, 3, 4, 6, 7])),
    });
    expect(challenge).toEqual({ positions: [0, 5, 12, 23], wordCount: 24 });
    expect(JSON.stringify(challenge)).not.toContain('abandon');
    expect(Object.isFrozen(challenge)).toBe(true);
    expect(Object.isFrozen(challenge.positions)).toBe(true);
  });

  it('verifies the requested words with case and whitespace normalization', () => {
    expect(verifyRecoveryConfirmation(
      PHRASE,
      { positions: [0, 5, 12, 23], wordCount: 24 },
      [' ABANDON ', 'abandon', 'Abandon', 'art'],
    )).toBe(true);
  });

  it('fails generically for an incorrect answer', () => {
    expect(verifyRecoveryConfirmation(
      PHRASE,
      { positions: [0, 23], wordCount: 24 },
      ['abandon', 'abandon'],
    )).toBe(false);
  });

  it('rejects malformed or duplicate challenge positions', () => {
    expect(verifyRecoveryConfirmation(PHRASE, { positions: [0, 0], wordCount: 24 }, ['abandon', 'abandon'])).toBe(false);
    expect(verifyRecoveryConfirmation(PHRASE, { positions: [0, 24], wordCount: 24 }, ['abandon', 'art'])).toBe(false);
  });

  it('fails closed for unsupported counts and invalid random output', async () => {
    await expect(createRecoveryConfirmationChallenge(13, {
      randomBytes: vi.fn(),
    })).rejects.toThrow('unsupported');
    await expect(createRecoveryConfirmationChallenge(24, {
      randomBytes: vi.fn().mockResolvedValue(new Uint8Array(3)),
    })).rejects.toThrow('invalid challenge length');
  });
});
