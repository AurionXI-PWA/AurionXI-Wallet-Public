export type VaultActiveSlotRecord = {
  activeSlot: 'primary' | 'candidate';
  format: 'aurionxi-vault-active-slot-v1';
  transactionId?: string;
};

export function isVaultActiveSlotRecord(value: unknown): value is VaultActiveSlotRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<VaultActiveSlotRecord>;
  const keys = Object.keys(record).sort();
  const expectedKeys = record.activeSlot === 'candidate'
    ? ['activeSlot', 'format', 'transactionId']
    : ['activeSlot', 'format'];
  return keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index]) &&
    record.format === 'aurionxi-vault-active-slot-v1' &&
    (
      (record.activeSlot === 'primary' && record.transactionId === undefined) ||
      (record.activeSlot === 'candidate' &&
        typeof record.transactionId === 'string' &&
        /^[a-f0-9]{32}$/.test(record.transactionId))
    );
}

export function createCandidateActiveSlotRecord(transactionId: string): VaultActiveSlotRecord {
  const record: VaultActiveSlotRecord = {
    activeSlot: 'candidate',
    format: 'aurionxi-vault-active-slot-v1',
    transactionId,
  };
  if (!isVaultActiveSlotRecord(record)) throw new Error('Vault active-slot record is invalid.');
  return record;
}
