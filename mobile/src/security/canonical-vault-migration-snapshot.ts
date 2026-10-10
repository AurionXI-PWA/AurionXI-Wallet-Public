import { readCanonicalVaultMigrationJournal } from './canonical-vault-migration-journal-store';
import { readCanonicalVaultMigrationSnapshotWith } from './canonical-vault-migration-snapshot-core';
import { readRetiredPrimaryCleanupJournal } from './retired-primary-cleanup-journal-store';
import { readVaultActiveSlot } from './vault-active-slot-store';
import { readVaultReplacementJournal } from './vault-replacement-journal-store';
import { readVaultV3, readVaultV3Candidate } from './vault-store';
import { readWalletIdentityRecord } from './wallet-identity-record-store';
import { readWalletIdentityTransitionJournal } from './wallet-identity-transition-journal-store';

export async function readStoredCanonicalVaultMigrationSnapshot() {
  return readCanonicalVaultMigrationSnapshotWith({
    readActiveSlot: readVaultActiveSlot,
    readCandidate: readVaultV3Candidate,
    readCleanupJournal: readRetiredPrimaryCleanupJournal,
    readCurrentIdentity: readWalletIdentityRecord,
    readIdentityTransitionJournal: readWalletIdentityTransitionJournal,
    readMigrationJournal: readCanonicalVaultMigrationJournal,
    readPrimary: readVaultV3,
    readReplacementJournal: readVaultReplacementJournal,
  });
}
