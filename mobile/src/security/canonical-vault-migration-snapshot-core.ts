import type { CanonicalVaultMigrationJournal } from './canonical-vault-migration-journal-core';
import type { CanonicalVaultMigrationSnapshot } from './canonical-vault-migration-policy';
import type { VaultActiveSlotRecord } from './vault-active-slot-core';

export type CanonicalVaultMigrationSnapshotDependencies = {
  readActiveSlot: () => Promise<CanonicalVaultMigrationSnapshot['activeSlot']>;
  readCandidate: () => Promise<CanonicalVaultMigrationSnapshot['candidate']>;
  readCleanupJournal: () => Promise<CanonicalVaultMigrationSnapshot['cleanupJournal']>;
  readCurrentIdentity: () => Promise<CanonicalVaultMigrationSnapshot['currentIdentity']>;
  readIdentityTransitionJournal: () => Promise<CanonicalVaultMigrationSnapshot['identityTransitionJournal']>;
  readMigrationJournal: () => Promise<CanonicalVaultMigrationSnapshot['migrationJournal']>;
  readPrimary: () => Promise<CanonicalVaultMigrationSnapshot['primary']>;
  readReplacementJournal: () => Promise<CanonicalVaultMigrationSnapshot['replacementJournal']>;
};

function activeSlotsMatch(left: VaultActiveSlotRecord | null, right: VaultActiveSlotRecord | null): boolean {
  return left?.activeSlot === right?.activeSlot && left?.transactionId === right?.transactionId;
}

function migrationJournalsMatch(
  left: CanonicalVaultMigrationJournal | null,
  right: CanonicalVaultMigrationJournal | null,
): boolean {
  if (!left || !right) return left === right;
  return left.format === right.format &&
    left.createdAt === right.createdAt &&
    left.phase === right.phase &&
    left.replacementTransactionId === right.replacementTransactionId &&
    left.candidatePublicAddress.toLowerCase() === right.candidatePublicAddress.toLowerCase() &&
    left.candidateCreatedAt === right.candidateCreatedAt;
}

export async function readCanonicalVaultMigrationSnapshotWith(
  dependencies: CanonicalVaultMigrationSnapshotDependencies,
): Promise<CanonicalVaultMigrationSnapshot> {
  const [activeBefore, migrationBefore] = await Promise.all([
    dependencies.readActiveSlot(),
    dependencies.readMigrationJournal(),
  ]);
  const [candidate, cleanupJournal, currentIdentity, identityTransitionJournal, primary, replacementJournal] = await Promise.all([
    dependencies.readCandidate(),
    dependencies.readCleanupJournal(),
    dependencies.readCurrentIdentity(),
    dependencies.readIdentityTransitionJournal(),
    dependencies.readPrimary(),
    dependencies.readReplacementJournal(),
  ]);
  const [activeAfter, migrationAfter] = await Promise.all([
    dependencies.readActiveSlot(),
    dependencies.readMigrationJournal(),
  ]);
  if (!activeSlotsMatch(activeBefore, activeAfter) || !migrationJournalsMatch(migrationBefore, migrationAfter)) {
    throw new Error('Canonical vault migration state changed during read-only verification.');
  }
  return {
    activeSlot: activeAfter,
    candidate,
    cleanupJournal,
    currentIdentity,
    identityTransitionJournal,
    migrationJournal: migrationAfter,
    primary,
    replacementJournal,
  };
}

