export type RecoveryConfirmationChallenge = Readonly<{
  positions: readonly number[];
  wordCount: number;
}>;

type RecoveryConfirmationDependencies = {
  randomBytes: (length: number) => Promise<Uint8Array>;
};

const CHALLENGE_SIZE = 4;
const RANDOM_BATCH_SIZE = 16;
const MAX_RANDOM_BATCHES = 8;

export async function createRecoveryConfirmationChallenge(
  wordCount: number,
  dependencies: RecoveryConfirmationDependencies,
): Promise<RecoveryConfirmationChallenge> {
  if (![12, 15, 18, 21, 24].includes(wordCount)) {
    throw new Error('Recovery confirmation word count is unsupported.');
  }
  const positions = new Set<number>();
  const unbiasedLimit = Math.floor(256 / wordCount) * wordCount;
  for (let batch = 0; batch < MAX_RANDOM_BATCHES && positions.size < CHALLENGE_SIZE; batch += 1) {
    const bytes = await dependencies.randomBytes(RANDOM_BATCH_SIZE);
    if (bytes.length !== RANDOM_BATCH_SIZE) {
      throw new Error('Secure random source returned an invalid challenge length.');
    }
    for (const value of bytes) {
      if (value >= unbiasedLimit) continue;
      positions.add(value % wordCount);
      if (positions.size === CHALLENGE_SIZE) break;
    }
  }
  if (positions.size !== CHALLENGE_SIZE) {
    throw new Error('Recovery confirmation challenge generation failed closed.');
  }
  return Object.freeze({
    positions: Object.freeze([...positions].sort((left, right) => left - right)),
    wordCount,
  });
}

function normalizeWord(word: string): string {
  return word.normalize('NFKD').trim().toLocaleLowerCase('en-US');
}

export function verifyRecoveryConfirmation(
  phrase: string,
  challenge: RecoveryConfirmationChallenge,
  answers: readonly string[],
): boolean {
  const words = phrase.normalize('NFKD').trim().toLocaleLowerCase('en-US').split(/\s+/u);
  if (words.length !== challenge.wordCount || answers.length !== challenge.positions.length) return false;
  if (new Set(challenge.positions).size !== challenge.positions.length) return false;
  return challenge.positions.every((position, index) => (
    Number.isInteger(position) &&
    position >= 0 &&
    position < words.length &&
    words[position] === normalizeWord(answers[index] ?? '')
  ));
}
