import type { VaultActiveSlotRecord } from './vault-active-slot-core';
import type { VaultV3Envelope } from './vault-envelope-v3';
import type { VaultReplacementJournal } from './vault-replacement-journal-core';
import type { RetiredPrimaryCleanupJournal } from './retired-primary-cleanup-journal-core';
import type { WalletIdentityRecord } from './wallet-identity-record-core';
import type { WalletIdentityTransitionJournal } from './wallet-identity-transition-journal-core';

export type RetiredPrimaryCleanupScope = {
  activeIdentity: WalletIdentityRecord;
  replacementTransactionId: string;
  retiredIdentity: WalletIdentityRecord;
  retiredPrimaryStatus: 'present' | 'corrupt';
};

export type RetiredPrimaryCleanupPlan =
  | { action: 'require-authenticated-cleanup'; scope: RetiredPrimaryCleanupScope; state: 'eligible' }
  | { action: 'fail-closed'; state: 'inconsistent' };

export type RetiredPrimaryCleanupSnapshot = {
  activeCandidate: VaultV3Envelope | null;
  activeSlot: VaultActiveSlotRecord | null;
  cleanupJournal: RetiredPrimaryCleanupJournal | null;
  currentIdentity: WalletIdentityRecord | null;
  identityTransitionJournal: WalletIdentityTransitionJournal | null;
  replacementJournal: VaultReplacementJournal | null;
  retiredPrimary: VaultV3Envelope | null;
  retiredPrimaryStatus: 'empty' | 'present' | 'corrupt' | 'unsupported';
};

function identityMatchesVault(identity: WalletIdentityRecord, vault: VaultV3Envelope): boolean {
  return identity.publicAddress.toLowerCase() === vault.publicAddress.toLowerCase() &&
    identity.vaultCreatedAt === vault.createdAt;
}

function identitiesMatch(left: WalletIdentityRecord, right: WalletIdentityRecord): boolean {
  return left.publicAddress.toLowerCase() === right.publicAddress.toLowerCase() &&
    left.vaultCreatedAt === right.vaultCreatedAt && left.derivationPath === right.derivationPath;
}

export function retiredPrimaryCleanupJournalMatchesStableScope(
  snapshot: RetiredPrimaryCleanupSnapshot,
  journal: RetiredPrimaryCleanupJournal,
): boolean {
  const { activeCandidate, activeSlot, currentIdentity, identityTransitionJournal, replacementJournal } = snapshot;
  return activeSlot?.activeSlot === 'candidate' &&
    !!activeCandidate && !!currentIdentity && !!identityTransitionJournal && !!replacementJournal &&
    identityTransitionJournal.phase === 'identity-verified' &&
    replacementJournal.phase === 'cleanup-pending' &&
    replacementJournal.targetStatus === journal.retiredPrimaryStatus &&
    activeSlot.transactionId === journal.replacementTransactionId &&
    replacementJournal.transactionId === journal.replacementTransactionId &&
    identityTransitionJournal.replacementTransactionId === journal.replacementTransactionId &&
    activeCandidate.publicAddress.toLowerCase() === journal.activeIdentity.publicAddress.toLowerCase() &&
    activeCandidate.createdAt === journal.activeIdentity.vaultCreatedAt &&
    identitiesMatch(currentIdentity, journal.activeIdentity) &&
    identitiesMatch(identityTransitionJournal.nextIdentity, journal.activeIdentity) &&
    identitiesMatch(identityTransitionJournal.previousIdentity, journal.retiredIdentity);
}

export function planRetiredPrimaryCleanup(
  snapshot: RetiredPrimaryCleanupSnapshot,
): RetiredPrimaryCleanupPlan {
  const {
    activeCandidate,
    activeSlot,
    cleanupJournal,
    currentIdentity,
    identityTransitionJournal,
    replacementJournal,
    retiredPrimary,
    retiredPrimaryStatus,
  } = snapshot;
  if (
    cleanupJournal ||
    activeSlot?.activeSlot !== 'candidate' ||
    !activeCandidate ||
    !currentIdentity ||
    !identityTransitionJournal ||
    identityTransitionJournal.phase !== 'identity-verified' ||
    !replacementJournal ||
    replacementJournal.phase !== 'cleanup-pending' ||
    (retiredPrimaryStatus !== 'present' && retiredPrimaryStatus !== 'corrupt') ||
    replacementJournal.targetStatus !== retiredPrimaryStatus ||
    activeSlot.transactionId !== replacementJournal.transactionId ||
    identityTransitionJournal.replacementTransactionId !== replacementJournal.transactionId ||
    activeCandidate.publicAddress.toLowerCase() !== replacementJournal.candidatePublicAddress.toLowerCase() ||
    !identityMatchesVault(identityTransitionJournal.nextIdentity, activeCandidate) ||
    !identitiesMatch(currentIdentity, identityTransitionJournal.nextIdentity) ||
    (retiredPrimaryStatus === 'present' && (!retiredPrimary || !identityMatchesVault(identityTransitionJournal.previousIdentity, retiredPrimary))) ||
    (retiredPrimaryStatus === 'corrupt' && retiredPrimary !== null)
  ) {
    return { action: 'fail-closed', state: 'inconsistent' };
  }
  return {
    action: 'require-authenticated-cleanup',
    scope: {
      activeIdentity: identityTransitionJournal.nextIdentity,
      replacementTransactionId: replacementJournal.transactionId,
      retiredIdentity: identityTransitionJournal.previousIdentity,
      retiredPrimaryStatus,
    },
    state: 'eligible',
  };
}
