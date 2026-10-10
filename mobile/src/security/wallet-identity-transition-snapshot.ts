import { readActiveVaultIdentitySnapshot } from './vault-active-identity-snapshot';
import { readVaultActiveSlot } from './vault-active-slot-store';
import { readVaultReplacementJournal } from './vault-replacement-journal-store';
import { readWalletIdentityTransitionJournal } from './wallet-identity-transition-journal-store';
import {
  planWalletIdentityTransition,
  type WalletIdentityTransitionSnapshot,
} from './wallet-identity-transition-policy';
import { readWalletIdentityRecord } from './wallet-identity-record-store';

export async function readStoredWalletIdentityTransitionSnapshot(): Promise<WalletIdentityTransitionSnapshot> {
  const before = await readVaultActiveSlot();
  const [active, identity, replacementJournal, transitionJournal] = await Promise.all([
    readActiveVaultIdentitySnapshot(),
    readWalletIdentityRecord(),
    readVaultReplacementJournal(),
    readWalletIdentityTransitionJournal(),
  ]);
  const after = await readVaultActiveSlot();
  if (
    before?.activeSlot !== 'candidate' ||
    after?.activeSlot !== 'candidate' ||
    before.transactionId !== after.transactionId ||
    active.slot !== 'candidate'
  ) {
    throw new Error('Active wallet changed during identity transition verification.');
  }
  return {
    activeSlot: after,
    activeVault: active.vault,
    identity,
    replacementJournal,
    transitionJournal,
  };
}

export async function planStoredWalletIdentityTransition() {
  return planWalletIdentityTransition(await readStoredWalletIdentityTransitionSnapshot());
}
