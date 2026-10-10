import type { CanonicalVaultMigrationJournal } from './canonical-vault-migration-journal-core';
import type { RetiredPrimaryCleanupJournal } from './retired-primary-cleanup-journal-core';
import type { VaultActiveSlotRecord } from './vault-active-slot-core';
import type { VaultV3Envelope } from './vault-envelope-v3';
import type { VaultReplacementJournal } from './vault-replacement-journal-core';
import type { WalletIdentityRecord } from './wallet-identity-record-core';
import type { WalletIdentityTransitionJournal } from './wallet-identity-transition-journal-core';

export type CanonicalVaultMigrationSnapshot = {
  activeSlot: VaultActiveSlotRecord | null;
  candidate: VaultV3Envelope | null;
  cleanupJournal: RetiredPrimaryCleanupJournal | null;
  currentIdentity: WalletIdentityRecord | null;
  identityTransitionJournal: WalletIdentityTransitionJournal | null;
  migrationJournal: CanonicalVaultMigrationJournal | null;
  primary: VaultV3Envelope | null;
  replacementJournal: VaultReplacementJournal | null;
};

export type CanonicalVaultMigrationPlan = {
  action:
    | 'record-intent'
    | 'write-primary-copy'
    | 'mark-primary-written'
    | 'activate-primary-pointer'
    | 'mark-primary-authoritative'
    | 'remove-candidate'
    | 'mark-candidate-removed'
    | 'mark-finalized'
    | 'complete'
    | 'fail-closed';
  state:
    | 'eligible'
    | 'intent-recorded'
    | 'primary-copy-present'
    | 'primary-written'
    | 'primary-pointer-active'
    | 'primary-authoritative'
    | 'candidate-absent'
    | 'candidate-removed'
    | 'finalized'
    | 'inconsistent';
};

function identitiesMatch(left: WalletIdentityRecord, right: WalletIdentityRecord): boolean {
  return left.publicAddress.toLowerCase() === right.publicAddress.toLowerCase() &&
    left.vaultCreatedAt === right.vaultCreatedAt && left.derivationPath === right.derivationPath;
}

function vaultsMatch(left: VaultV3Envelope, right: VaultV3Envelope): boolean {
  return left.publicAddress.toLowerCase() === right.publicAddress.toLowerCase() &&
    left.createdAt === right.createdAt &&
    left.payloadCiphertext === right.payloadCiphertext &&
    left.pin.algorithm === right.pin.algorithm &&
    left.pin.saltHex === right.pin.saltHex &&
    left.pin.wrappedVaultKey === right.pin.wrappedVaultKey &&
    left.biometric?.keyId === right.biometric?.keyId &&
    left.biometric?.scheme === right.biometric?.scheme &&
    left.biometric?.wrappedVaultKey === right.biometric?.wrappedVaultKey;
}

function stableAuthorityMatches(snapshot: CanonicalVaultMigrationSnapshot): boolean {
  const { activeSlot, candidate, cleanupJournal, currentIdentity, identityTransitionJournal, replacementJournal } = snapshot;
  return activeSlot?.activeSlot === 'candidate' && !!activeSlot.transactionId &&
    !!candidate && !!cleanupJournal && cleanupJournal.phase === 'finalized' &&
    !!currentIdentity && !!identityTransitionJournal && identityTransitionJournal.phase === 'identity-verified' &&
    !!replacementJournal && replacementJournal.phase === 'cleanup-pending' &&
    activeSlot.transactionId === replacementJournal.transactionId &&
    replacementJournal.transactionId === cleanupJournal.replacementTransactionId &&
    identityTransitionJournal.replacementTransactionId === replacementJournal.transactionId &&
    candidate.publicAddress.toLowerCase() === replacementJournal.candidatePublicAddress.toLowerCase() &&
    candidate.publicAddress.toLowerCase() === cleanupJournal.activeIdentity.publicAddress.toLowerCase() &&
    candidate.createdAt === cleanupJournal.activeIdentity.vaultCreatedAt &&
    identitiesMatch(currentIdentity, cleanupJournal.activeIdentity) &&
    identitiesMatch(identityTransitionJournal.nextIdentity, cleanupJournal.activeIdentity);
}

function journalMatches(snapshot: CanonicalVaultMigrationSnapshot, journal: CanonicalVaultMigrationJournal): boolean {
  const candidate = snapshot.candidate ?? snapshot.primary;
  return !!candidate && !!snapshot.replacementJournal && !!snapshot.cleanupJournal &&
    journal.replacementTransactionId === snapshot.replacementJournal.transactionId &&
    journal.replacementTransactionId === snapshot.cleanupJournal.replacementTransactionId &&
    journal.candidatePublicAddress.toLowerCase() === candidate.publicAddress.toLowerCase() &&
    journal.candidateCreatedAt === candidate.createdAt;
}

export function planCanonicalVaultMigration(
  snapshot: CanonicalVaultMigrationSnapshot,
): CanonicalVaultMigrationPlan {
  const { activeSlot, candidate, migrationJournal, primary } = snapshot;

  if (!migrationJournal) {
    return stableAuthorityMatches(snapshot) && primary === null
      ? { action: 'record-intent', state: 'eligible' }
      : { action: 'fail-closed', state: 'inconsistent' };
  }
  if (!journalMatches(snapshot, migrationJournal)) return { action: 'fail-closed', state: 'inconsistent' };

  const primaryMatches = !!primary && !!candidate && vaultsMatch(primary, candidate);
  const primaryMatchesJournal = !!primary &&
    primary.publicAddress.toLowerCase() === migrationJournal.candidatePublicAddress.toLowerCase() &&
    primary.createdAt === migrationJournal.candidateCreatedAt;
  const candidatePointer = activeSlot?.activeSlot === 'candidate' &&
    activeSlot.transactionId === migrationJournal.replacementTransactionId;
  const primaryPointer = activeSlot?.activeSlot === 'primary';

  if (migrationJournal.phase === 'intent-recorded') {
    if (!stableAuthorityMatches(snapshot)) return { action: 'fail-closed', state: 'inconsistent' };
    if (primary === null) return { action: 'write-primary-copy', state: 'intent-recorded' };
    return primaryMatches
      ? { action: 'mark-primary-written', state: 'primary-copy-present' }
      : { action: 'fail-closed', state: 'inconsistent' };
  }
  if (migrationJournal.phase === 'primary-written') {
    if (!primaryMatches) return { action: 'fail-closed', state: 'inconsistent' };
    if (candidatePointer) return { action: 'activate-primary-pointer', state: 'primary-written' };
    if (primaryPointer) return { action: 'mark-primary-authoritative', state: 'primary-pointer-active' };
    return { action: 'fail-closed', state: 'inconsistent' };
  }
  if (migrationJournal.phase === 'primary-authoritative') {
    if (!primaryPointer || !primaryMatchesJournal) return { action: 'fail-closed', state: 'inconsistent' };
    if (candidate) {
      return vaultsMatch(primary!, candidate)
        ? { action: 'remove-candidate', state: 'primary-authoritative' }
        : { action: 'fail-closed', state: 'inconsistent' };
    }
    return { action: 'mark-candidate-removed', state: 'candidate-absent' };
  }
  if (migrationJournal.phase === 'candidate-removed') {
    return primaryPointer && primaryMatchesJournal && candidate === null
      ? { action: 'mark-finalized', state: 'candidate-removed' }
      : { action: 'fail-closed', state: 'inconsistent' };
  }
  if (migrationJournal.phase === 'finalized') {
    return primaryPointer && primaryMatchesJournal && candidate === null
      ? { action: 'complete', state: 'finalized' }
      : { action: 'fail-closed', state: 'inconsistent' };
  }
  return { action: 'fail-closed', state: 'inconsistent' };
}
