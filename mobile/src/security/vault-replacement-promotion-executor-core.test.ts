import { describe, expect, it, vi } from 'vitest';

import type { VaultV3Envelope } from './vault-envelope-v3';
import type { VaultActiveSlotRecord } from './vault-active-slot-core';
import { createCandidateActiveSlotRecord } from './vault-active-slot-core';
import type { VaultReplacementJournal } from './vault-replacement-journal-core';
import { executeNextVaultReplacementPromotionStep } from './vault-replacement-promotion-executor-core';
import type { VaultReplacementResumeState } from './vault-replacement-resume-policy';

const candidate = {
  createdAt: '2026-08-09T00:00:00.000Z',
  format: 'aurionxi-vault-v3',
  payloadCiphertext: 'C'.repeat(40),
  pin: { algorithm: 'argon2id', saltHex: '1'.repeat(32), wrappedVaultKey: 'D'.repeat(40) },
  publicAddress: '0x0000000000000000000000000000000000000002',
} satisfies VaultV3Envelope;
const initialJournal: VaultReplacementJournal = {
  candidatePublicAddress: candidate.publicAddress,
  createdAt: '2026-08-09T01:00:00.000Z',
  format: 'aurionxi-vault-replacement-journal-v1',
  phase: 'candidate-verified',
  targetStatus: 'present',
  transactionId: 'a'.repeat(32),
};
const authorization: VaultReplacementResumeState = {
  authorizationExpiresAt: 1_000,
  requiredAuthentication: 'pin',
  scope: {
    candidatePublicAddress: candidate.publicAddress,
    targetStatus: 'present',
    transactionId: initialJournal.transactionId,
  },
  stage: 'authorized',
};

function dependencies(
  phase: VaultReplacementJournal['phase'] = 'candidate-verified',
  initialSlot: VaultActiveSlotRecord | null = null,
) {
  let journal: VaultReplacementJournal | null = { ...initialJournal, phase };
  let activeSlot = initialSlot;
  return {
    getPrimaryStatus: vi.fn().mockResolvedValue('present' as const),
    readActiveSlot: vi.fn().mockImplementation(async () => activeSlot),
    readCandidate: vi.fn().mockResolvedValue(candidate),
    readJournal: vi.fn().mockImplementation(async () => journal),
    writeActiveSlot: vi.fn().mockImplementation(async (record: VaultActiveSlotRecord) => { activeSlot = record; }),
    writeJournal: vi.fn().mockImplementation(async (record: VaultReplacementJournal) => { journal = record; }),
  };
}

describe('crash-safe vault replacement promotion executor', () => {
  it('records and verifies promotion intent as the first authorized step', async () => {
    const deps = dependencies();
    await expect(executeNextVaultReplacementPromotionStep(authorization, deps, 1)).resolves.toEqual({
      action: 'write-promotion-started',
      state: 'ready',
    });
    expect(deps.writeJournal).toHaveBeenCalledWith(expect.objectContaining({ phase: 'promotion-started' }));
    expect(deps.writeActiveSlot).not.toHaveBeenCalled();
  });

  it('writes and verifies the pointer only after promotion intent', async () => {
    const deps = dependencies('promotion-started');
    await expect(executeNextVaultReplacementPromotionStep(authorization, deps, 1_000)).resolves.toEqual({
      action: 'activate-candidate-pointer',
      state: 'intent-recorded',
    });
    expect(deps.writeActiveSlot).toHaveBeenCalledWith(createCandidateActiveSlotRecord(initialJournal.transactionId));
  });

  it('records candidate authority after a matching pointer is active', async () => {
    const deps = dependencies('promotion-started', createCandidateActiveSlotRecord(initialJournal.transactionId));
    await executeNextVaultReplacementPromotionStep(authorization, deps, 1_000);
    expect(deps.writeJournal).toHaveBeenCalledWith(expect.objectContaining({ phase: 'candidate-authoritative' }));
  });

  it('records cleanup-pending without any vault mutation dependency', async () => {
    const deps = dependencies('candidate-authoritative', createCandidateActiveSlotRecord(initialJournal.transactionId));
    await executeNextVaultReplacementPromotionStep(authorization, deps, 1_000);
    expect(deps.writeJournal).toHaveBeenCalledWith(expect.objectContaining({ phase: 'cleanup-pending' }));
    expect(Object.keys(deps)).not.toContain('writePrimary');
    expect(Object.keys(deps)).not.toContain('deletePrimary');
    expect(Object.keys(deps)).not.toContain('deleteCandidate');
  });

  it('performs no write while awaiting separately authenticated cleanup', async () => {
    const deps = dependencies('cleanup-pending', createCandidateActiveSlotRecord(initialJournal.transactionId));
    await expect(executeNextVaultReplacementPromotionStep(authorization, deps, 1_000)).resolves.toEqual({
      action: 'await-authenticated-cleanup',
      state: 'cleanup-pending',
    });
    expect(deps.writeJournal).not.toHaveBeenCalled();
    expect(deps.writeActiveSlot).not.toHaveBeenCalled();
  });

  it('fails closed when journal read-back does not match the attempted phase', async () => {
    const deps = dependencies();
    deps.writeJournal.mockResolvedValue(undefined);
    await expect(executeNextVaultReplacementPromotionStep(authorization, deps, 1)).rejects.toThrow('read-back');
  });

  it('fails closed when pointer read-back does not match the transaction', async () => {
    const deps = dependencies('promotion-started');
    deps.writeActiveSlot.mockResolvedValue(undefined);
    await expect(executeNextVaultReplacementPromotionStep(authorization, deps, 1_000)).rejects.toThrow('read-back');
  });

  it.each(['empty', 'unsupported'] as const)('rejects %s primary status before writing', async (status) => {
    const deps = dependencies();
    deps.getPrimaryStatus.mockResolvedValue(status);
    await expect(executeNextVaultReplacementPromotionStep(authorization, deps, 1)).rejects.toThrow('primary vault');
    expect(deps.writeJournal).not.toHaveBeenCalled();
    expect(deps.writeActiveSlot).not.toHaveBeenCalled();
  });
});
