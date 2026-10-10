export type RecoveryWordConfirmationChallenge = {
  positions: readonly number[];
};

export type RecoveryWordConfirmationResponse = {
  position: number;
  word: string;
};

export type RecoveryWordConfirmationResult =
  | { ok: true }
  | { ok: false; reason: 'invalid-challenge' | 'invalid-response' | 'mismatch' };

function normalizedWords(phrase: string): string[] {
  return phrase.normalize('NFKD').trim().toLocaleLowerCase('en-US').split(/\s+/u);
}

function isValidChallenge(challenge: RecoveryWordConfirmationChallenge, wordCount: number): boolean {
  return challenge.positions.length > 0 &&
    new Set(challenge.positions).size === challenge.positions.length &&
    challenge.positions.every((position) => Number.isInteger(position) && position >= 1 && position <= wordCount);
}

/**
 * Confirms selected positions against an in-memory phrase without returning,
 * storing, logging, or otherwise exposing phrase content.
 */
export function verifyRecoveryWordConfirmation(
  phrase: string,
  challenge: RecoveryWordConfirmationChallenge,
  responses: readonly RecoveryWordConfirmationResponse[],
): RecoveryWordConfirmationResult {
  const words = normalizedWords(phrase);
  if (!isValidChallenge(challenge, words.length)) return { ok: false, reason: 'invalid-challenge' };
  if (responses.length !== challenge.positions.length) return { ok: false, reason: 'invalid-response' };

  const byPosition = new Map<number, string>();
  for (const response of responses) {
    if (!Number.isInteger(response.position) || typeof response.word !== 'string' || byPosition.has(response.position)) {
      return { ok: false, reason: 'invalid-response' };
    }
    byPosition.set(response.position, response.word.normalize('NFKD').trim().toLocaleLowerCase('en-US'));
  }

  for (const position of challenge.positions) {
    if (byPosition.get(position) !== words[position - 1]) return { ok: false, reason: 'mismatch' };
  }
  return { ok: true };
}
