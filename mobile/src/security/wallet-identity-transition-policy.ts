import type { VaultActiveSlotRecord } from './vault-active-slot-core';
import type { VaultV3Envelope } from './vault-envelope-v3';
import type { VaultReplacementJournal } from './vault-replacement-journal-core';
import { createWalletIdentityRecord, type WalletIdentityRecord } from './wallet-identity-record-core';
import type { WalletIdentityTransitionJournal } from './wallet-identity-transition-journal-core';

export type WalletIdentityTransitionScope = {
  nextIdentity: WalletIdentityRecord;
  previousIdentity: WalletIdentityRecord;
  replacementTransactionId: string;
};

export type WalletIdentityTransitionPlan =
  | { action: 'require-authenticated-transition'; scope: WalletIdentityTransitionScope; state: 'eligible' }
  | { action: 'none'; state: 'already-bound' }
  | { action: 'fail-closed'; state: 'inconsistent' };

export type WalletIdentityTransitionSnapshot = {
  activeSlot: VaultActiveSlotRecord | null;
  activeVault: VaultV3Envelope | null;
  identity: WalletIdentityRecord | null;
  replacementJournal: VaultReplacementJournal | null;
  transitionJournal: WalletIdentityTransitionJournal | null;
};

function identitiesMatch(left: WalletIdentityRecord, right: WalletIdentityRecord): boolean {
  return left.publicAddress.toLowerCase() === right.publicAddress.toLowerCase() &&
    left.vaultCreatedAt === right.vaultCreatedAt &&
    left.derivationPath === right.derivationPath;
}

export function planWalletIdentityTransition(
  snapshot: WalletIdentityTransitionSnapshot,
): WalletIdentityTransitionPlan {
  const { activeSlot, activeVault, identity, replacementJournal, transitionJournal } = snapshot;
  if (
    transitionJournal ||
    activeSlot?.activeSlot !== 'candidate' ||
    !activeVault ||
    !identity ||
    !replacementJournal ||
    replacementJournal.phase !== 'cleanup-pending' ||
    activeSlot.transactionId !== replacementJournal.transactionId ||
    activeVault.publicAddress.toLowerCase() !== replacementJournal.candidatePublicAddress.toLowerCase()
  ) {
    return { action: 'fail-closed', state: 'inconsistent' };
  }

  const nextIdentity = createWalletIdentityRecord(activeVault.publicAddress, activeVault.createdAt);
  if (identitiesMatch(identity, nextIdentity)) return { action: 'none', state: 'already-bound' };
  return {
    action: 'require-authenticated-transition',
    scope: {
      nextIdentity,
      previousIdentity: identity,
      replacementTransactionId: replacementJournal.transactionId,
    },
    state: 'eligible',
  };
}
