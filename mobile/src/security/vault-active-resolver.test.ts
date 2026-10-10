import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VaultReplacementJournal } from './vault-replacement-journal-core';
import type { VaultV3Envelope } from './vault-envelope-v3';
import { readActiveVaultV3OrNull } from './vault-active-resolver';

const {
  readVaultActiveSlot,
  readVaultReplacementJournal,
  readVaultV3,
  readVaultV3Candidate,
} = vi.hoisted(() => ({
  readVaultActiveSlot: vi.fn(),
  readVaultReplacementJournal: vi.fn(),
  readVaultV3: vi.fn(),
  readVaultV3Candidate: vi.fn(),
}));

vi.mock('./vault-active-slot-store', () => ({ readVaultActiveSlot }));
vi.mock('./vault-replacement-journal-store', () => ({ readVaultReplacementJournal }));
vi.mock('./vault-store', () => ({ readVaultV3, readVaultV3Candidate }));

const candidate = {
  publicAddress: '0x0000000000000000000000000000000000000001',
} as unknown as VaultV3Envelope;
const journal: VaultReplacementJournal = {
  candidatePublicAddress: candidate.publicAddress,
  createdAt: '2026-08-09T00:00:00.000Z',
  format: 'aurionxi-vault-replacement-journal-v1',
  phase: 'promotion-started',
  targetStatus: 'present',
  transactionId: '0123456789abcdef0123456789abcdef',
};

describe('stored active vault resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readVaultActiveSlot.mockResolvedValue(null);
    readVaultReplacementJournal.mockResolvedValue(journal);
    readVaultV3.mockResolvedValue(null);
    readVaultV3Candidate.mockResolvedValue(candidate);
  });

  it('preserves an empty legacy-primary result for onboarding and v2 migration', async () => {
    await expect(readActiveVaultV3OrNull()).resolves.toBeNull();
    expect(readVaultV3Candidate).not.toHaveBeenCalled();
  });

  it('returns the physical primary when no candidate pointer is active', async () => {
    readVaultV3.mockResolvedValue(candidate);
    await expect(readActiveVaultV3OrNull()).resolves.toEqual({ slot: 'primary', vault: candidate });
    expect(readVaultV3Candidate).not.toHaveBeenCalled();
  });

  it('selects the transaction-bound candidate without reading the old primary', async () => {
    readVaultActiveSlot.mockResolvedValue({
      activeSlot: 'candidate',
      format: 'aurionxi-vault-active-slot-v1',
      transactionId: journal.transactionId,
    });
    await expect(readActiveVaultV3OrNull()).resolves.toEqual({ slot: 'candidate', vault: candidate });
    expect(readVaultV3).not.toHaveBeenCalled();
  });

  it('fails closed when candidate pointer and journal transaction differ', async () => {
    readVaultActiveSlot.mockResolvedValue({
      activeSlot: 'candidate',
      format: 'aurionxi-vault-active-slot-v1',
      transactionId: 'abcdef0123456789abcdef0123456789',
    });
    await expect(readActiveVaultV3OrNull()).rejects.toThrow(
      'The active encrypted wallet could not be resolved safely.',
    );
  });
});
