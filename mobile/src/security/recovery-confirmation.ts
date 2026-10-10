import { getRandomBytesAsync } from 'expo-crypto';

import { createRecoveryConfirmationChallenge } from './recovery-confirmation-core';

export function createNativeRecoveryConfirmationChallenge(wordCount: number) {
  return createRecoveryConfirmationChallenge(wordCount, { randomBytes: getRandomBytesAsync });
}
