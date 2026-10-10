import {
  isWalletIdentityRecord,
  type WalletIdentityRecord,
} from './wallet-identity-record-core';

export type WalletIdentityTransitionJournal = {
  createdAt: string;
  format: 'aurionxi-wallet-identity-transition-v1';
  nextIdentity: WalletIdentityRecord;
  phase: 'intent-recorded' | 'identity-written' | 'identity-verified';
  previousIdentity: WalletIdentityRecord;
  replacementTransactionId: string;
};

export function isWalletIdentityTransitionJournal(
  value: unknown,
): value is WalletIdentityTransitionJournal {
  if (!value || typeof value !== 'object') return false;
  const journal = value as Partial<WalletIdentityTransitionJournal>;
  const keys = Object.keys(journal).sort();
  const expectedKeys = [
    'createdAt',
    'format',
    'nextIdentity',
    'phase',
    'previousIdentity',
    'replacementTransactionId',
  ];
  return keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index]) &&
    journal.format === 'aurionxi-wallet-identity-transition-v1' &&
    typeof journal.createdAt === 'string' &&
    !Number.isNaN(Date.parse(journal.createdAt)) &&
    typeof journal.replacementTransactionId === 'string' &&
    /^[a-f0-9]{32}$/.test(journal.replacementTransactionId) &&
    !!journal.previousIdentity && isWalletIdentityRecord(journal.previousIdentity) &&
    !!journal.nextIdentity && isWalletIdentityRecord(journal.nextIdentity) &&
    (
      journal.previousIdentity.publicAddress.toLowerCase() !==
      journal.nextIdentity.publicAddress.toLowerCase() ||
      journal.previousIdentity.vaultCreatedAt !== journal.nextIdentity.vaultCreatedAt
    ) &&
    (
      journal.phase === 'intent-recorded' ||
      journal.phase === 'identity-written' ||
      journal.phase === 'identity-verified'
    );
}

export function createWalletIdentityTransitionJournal(
  previousIdentity: WalletIdentityRecord,
  nextIdentity: WalletIdentityRecord,
  replacementTransactionId: string,
  createdAt: string,
): WalletIdentityTransitionJournal {
  const journal: WalletIdentityTransitionJournal = {
    createdAt,
    format: 'aurionxi-wallet-identity-transition-v1',
    nextIdentity,
    phase: 'intent-recorded',
    previousIdentity,
    replacementTransactionId,
  };
  if (!isWalletIdentityTransitionJournal(journal)) {
    throw new Error('Wallet identity transition journal is invalid.');
  }
  return journal;
}
