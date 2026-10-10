import { describe, expect, it } from 'vitest';

import { createCandidateActiveSlotRecord, isVaultActiveSlotRecord } from './vault-active-slot-core';

describe('vault active-slot pointer metadata', () => {
  it('creates a strict transaction-bound candidate pointer', () => {
    const record = createCandidateActiveSlotRecord('a'.repeat(32));
    expect(isVaultActiveSlotRecord(record)).toBe(true);
    expect(record).toEqual({
      activeSlot: 'candidate',
      format: 'aurionxi-vault-active-slot-v1',
      transactionId: 'a'.repeat(32),
    });
  });

  it.each([
    { activeSlot: 'candidate', format: 'aurionxi-vault-active-slot-v1' },
    { activeSlot: 'candidate', format: 'aurionxi-vault-active-slot-v1', transactionId: 'bad' },
    { activeSlot: 'primary', format: 'aurionxi-vault-active-slot-v1', transactionId: 'a'.repeat(32) },
    { activeSlot: 'primary', format: 'aurionxi-vault-active-slot-v1', extra: true },
  ])('rejects malformed or expanded pointer metadata', (value) => {
    expect(isVaultActiveSlotRecord(value)).toBe(false);
  });
});
