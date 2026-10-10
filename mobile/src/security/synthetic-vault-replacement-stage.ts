import { getRandomBytesAsync } from 'expo-crypto';

import { WALLET_SECRET_FEATURE } from '@/config/network';

import { deriveActiveTestnetRecoveryAddress } from './recovery-address-derivation';
import { withActiveRecoveryVaultPayloadAsync } from './recovery-vault-payload-session';
import { createVerifiedCandidateJournal } from './vault-replacement-journal-core';
import { writeVaultReplacementJournal } from './vault-replacement-journal-store';
import type { VaultReplacementState } from './vault-replacement-policy';
import { stageVaultReplacementCandidate } from './vault-replacement-stage-core';
import { createVaultV3WithDependencies, unlockVaultV3WithPin } from './vault-envelope-v3-core';
import { nativeVaultV3Dependencies } from './vault-v3-workflow';
import {
  deleteVaultV3Candidate,
  getVaultStatus,
  readVaultV3Candidate,
  writeVaultV3Candidate,
} from './vault-store';

async function generateTransactionId(): Promise<string> {
  const bytes = await getRandomBytesAsync(16);
  if (bytes.length !== 16) throw new Error('Secure random source returned an invalid transaction identifier.');
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

/** Stages only a new candidate. It never promotes, deletes, or overwrites the active vault. */
export async function stageSyntheticTestnetVaultCandidate(
  pin: string,
  pinConfirmation: string,
  authorization: VaultReplacementState,
  now = Date.now(),
) {
  if (!WALLET_SECRET_FEATURE.enabled) throw new Error('Testnet wallet-secret handling is disabled.');
  const publicAddress = deriveActiveTestnetRecoveryAddress();
  return withActiveRecoveryVaultPayloadAsync(async (payload) => stageVaultReplacementCandidate({
    createdAt: new Date().toISOString(),
    payload,
    pin,
    pinConfirmation,
    publicAddress,
  }, authorization, now, {
    buildCandidate: (input) => createVaultV3WithDependencies(input, nativeVaultV3Dependencies),
    deleteCandidate: deleteVaultV3Candidate,
    getCurrentStatus: getVaultStatus,
    readCandidate: readVaultV3Candidate,
    unlockCandidate: (envelope, candidatePin) => unlockVaultV3WithPin(envelope, candidatePin, nativeVaultV3Dependencies),
    writeCandidate: writeVaultV3Candidate,
    writeVerifiedJournal: async (candidate, targetStatus) => {
      const transactionId = await generateTransactionId();
      await writeVaultReplacementJournal(createVerifiedCandidateJournal(candidate, targetStatus, transactionId, new Date().toISOString()));
    },
  }));
}
