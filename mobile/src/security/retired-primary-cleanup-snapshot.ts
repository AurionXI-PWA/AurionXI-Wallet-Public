import { readActiveVaultIdentitySnapshot } from './vault-active-identity-snapshot';
import { readVaultActiveSlot } from './vault-active-slot-store';
import { readVaultReplacementJournal } from './vault-replacement-journal-store';
import { readRetiredPrimaryCleanupJournal } from './retired-primary-cleanup-journal-store';
import type { RetiredPrimaryCleanupSnapshot } from './retired-primary-cleanup-policy';
import { getVaultV3Status, readVaultV3 } from './vault-store';
import { readWalletIdentityRecord } from './wallet-identity-record-store';
import { readWalletIdentityTransitionJournal } from './wallet-identity-transition-journal-store';

export async function readStoredRetiredPrimaryCleanupSnapshot(): Promise<RetiredPrimaryCleanupSnapshot> {
  const before = await readVaultActiveSlot();
  const [active, cleanupJournal, currentIdentity, identityTransitionJournal, replacementJournal, retiredPrimaryStatus] = await Promise.all([
    readActiveVaultIdentitySnapshot(),
    readRetiredPrimaryCleanupJournal(),
    readWalletIdentityRecord(),
    readWalletIdentityTransitionJournal(),
    readVaultReplacementJournal(),
    getVaultV3Status(),
  ]);
  const retiredPrimary = retiredPrimaryStatus === 'present' ? await readVaultV3() : null;
  const after = await readVaultActiveSlot();
  if (
    before?.activeSlot !== 'candidate' ||
    after?.activeSlot !== 'candidate' ||
    before.transactionId !== after.transactionId ||
    active.slot !== 'candidate'
  ) {
    throw new Error('Active wallet changed during retired primary cleanup verification.');
  }
  return {
    activeCandidate: active.vault,
    activeSlot: after,
    cleanupJournal,
    currentIdentity,
    identityTransitionJournal,
    replacementJournal,
    retiredPrimary,
    retiredPrimaryStatus,
  };
}
