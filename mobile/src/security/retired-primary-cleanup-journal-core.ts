import { isWalletIdentityRecord, type WalletIdentityRecord } from './wallet-identity-record-core';

export type RetiredPrimaryCleanupJournal = {
  activeIdentity: WalletIdentityRecord;
  createdAt: string;
  format: 'aurionxi-retired-primary-cleanup-v1';
  phase: 'intent-recorded' | 'primary-removed' | 'finalized';
  replacementTransactionId: string;
  retiredIdentity: WalletIdentityRecord;
  retiredPrimaryStatus: 'present' | 'corrupt';
};

export function isRetiredPrimaryCleanupJournal(value: unknown): value is RetiredPrimaryCleanupJournal {
  if (!value || typeof value !== 'object') return false;
  const journal = value as Partial<RetiredPrimaryCleanupJournal>;
  const keys = Object.keys(journal).sort();
  const expectedKeys = [
    'activeIdentity',
    'createdAt',
    'format',
    'phase',
    'replacementTransactionId',
    'retiredIdentity',
    'retiredPrimaryStatus',
  ];
  return keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index]) &&
    journal.format === 'aurionxi-retired-primary-cleanup-v1' &&
    typeof journal.createdAt === 'string' && !Number.isNaN(Date.parse(journal.createdAt)) &&
    typeof journal.replacementTransactionId === 'string' &&
    /^[a-f0-9]{32}$/.test(journal.replacementTransactionId) &&
    !!journal.retiredIdentity && isWalletIdentityRecord(journal.retiredIdentity) &&
    !!journal.activeIdentity && isWalletIdentityRecord(journal.activeIdentity) &&
    (
      journal.retiredIdentity.publicAddress.toLowerCase() !== journal.activeIdentity.publicAddress.toLowerCase() ||
      journal.retiredIdentity.vaultCreatedAt !== journal.activeIdentity.vaultCreatedAt
    ) &&
    (journal.retiredPrimaryStatus === 'present' || journal.retiredPrimaryStatus === 'corrupt') &&
    (
      journal.phase === 'intent-recorded' ||
      journal.phase === 'primary-removed' ||
      journal.phase === 'finalized'
    );
}

export function createRetiredPrimaryCleanupJournal(
  retiredIdentity: WalletIdentityRecord,
  activeIdentity: WalletIdentityRecord,
  retiredPrimaryStatus: 'present' | 'corrupt',
  replacementTransactionId: string,
  createdAt: string,
): RetiredPrimaryCleanupJournal {
  const journal: RetiredPrimaryCleanupJournal = {
    activeIdentity,
    createdAt,
    format: 'aurionxi-retired-primary-cleanup-v1',
    phase: 'intent-recorded',
    replacementTransactionId,
    retiredIdentity,
    retiredPrimaryStatus,
  };
  if (!isRetiredPrimaryCleanupJournal(journal)) {
    throw new Error('Retired primary cleanup journal is invalid.');
  }
  return journal;
}
