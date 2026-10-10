import { describe, expect, it, vi } from 'vitest';

import { stageVaultReplacementCandidate } from './vault-replacement-stage-core';
import type { VaultReplacementState } from './vault-replacement-policy';
import type { VaultV3Envelope } from './vault-envelope-v3';

const payload = new Uint8Array([4, 5, 6]);
const input = {
  createdAt: '2026-08-09T00:00:00.000Z',
  payload,
  pin: '246810',
  pinConfirmation: '246810',
  publicAddress: '0x0000000000000000000000000000000000000002' as const,
};
const candidate = {
  createdAt: input.createdAt,
  format: 'aurionxi-vault-v3',
  payloadCiphertext: 'C'.repeat(40),
  pin: { algorithm: 'argon2id', saltHex: '1'.repeat(32), wrappedVaultKey: 'D'.repeat(40) },
  publicAddress: input.publicAddress,
} satisfies VaultV3Envelope;
const authorization: VaultReplacementState = {
  authorizationExpiresAt: 10_000,
  requiredAuthentication: 'pin',
  stage: 'authorized',
  targetStatus: 'present',
};

function dependencies() {
  return {
    buildCandidate: vi.fn().mockResolvedValue(candidate),
    deleteCandidate: vi.fn().mockResolvedValue(undefined),
    getCurrentStatus: vi.fn().mockResolvedValue('present' as const),
    readCandidate: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(candidate),
    unlockCandidate: vi.fn().mockResolvedValue(Uint8Array.from(payload)),
    writeCandidate: vi.fn().mockResolvedValue(undefined),
    writeVerifiedJournal: vi.fn().mockResolvedValue(undefined),
  };
}

describe('two-record staged vault replacement', () => {
  it('stages and verifies a candidate without an existing-vault mutation dependency', async () => {
    const deps = dependencies();
    await expect(stageVaultReplacementCandidate(input, authorization, 1, deps)).resolves.toBe(candidate);
    expect(deps.writeCandidate).toHaveBeenCalledWith(candidate);
    expect(deps.unlockCandidate).toHaveBeenCalledWith(candidate, input.pin);
    expect(deps.writeVerifiedJournal).toHaveBeenCalledWith(candidate, 'present');
    expect(deps.deleteCandidate).not.toHaveBeenCalled();
    expect(Object.keys(deps)).not.toContain('deleteExisting');
    expect(Object.keys(deps)).not.toContain('writeExisting');
  });

  it('rejects expired authority before reading storage', async () => {
    const deps = dependencies();
    await expect(stageVaultReplacementCandidate(input, authorization, 10_000, deps)).rejects.toThrow('expired');
    expect(deps.getCurrentStatus).not.toHaveBeenCalled();
    expect(deps.writeCandidate).not.toHaveBeenCalled();
  });

  it('rejects a current-status change after authorization', async () => {
    const deps = dependencies();
    deps.getCurrentStatus.mockResolvedValue('corrupt');
    await expect(stageVaultReplacementCandidate(input, authorization, 1, deps)).rejects.toThrow('changed');
    expect(deps.buildCandidate).not.toHaveBeenCalled();
  });

  it('does not overwrite or automatically delete a pre-existing candidate', async () => {
    const deps = dependencies();
    deps.readCandidate.mockReset().mockResolvedValue(candidate);
    await expect(stageVaultReplacementCandidate(input, authorization, 1, deps)).rejects.toThrow('already exists');
    expect(deps.writeCandidate).not.toHaveBeenCalled();
    expect(deps.deleteCandidate).not.toHaveBeenCalled();
  });

  it('rolls back only a newly written candidate on verification mismatch', async () => {
    const deps = dependencies();
    const verified = new Uint8Array([4, 5, 7]);
    deps.unlockCandidate.mockResolvedValue(verified);
    await expect(stageVaultReplacementCandidate(input, authorization, 1, deps)).rejects.toThrow('plaintext');
    expect(deps.deleteCandidate).toHaveBeenCalledOnce();
    expect([...verified]).toEqual([0, 0, 0]);
  });

  it('does not delete a candidate slot when its initial write fails', async () => {
    const deps = dependencies();
    deps.writeCandidate.mockRejectedValue(new Error('candidate write failed'));
    await expect(stageVaultReplacementCandidate(input, authorization, 1, deps)).rejects.toThrow('candidate write failed');
    expect(deps.deleteCandidate).not.toHaveBeenCalled();
  });

  it('rolls back only the candidate when journal commit fails', async () => {
    const deps = dependencies();
    deps.writeVerifiedJournal.mockRejectedValue(new Error('journal write failed'));
    await expect(stageVaultReplacementCandidate(input, authorization, 1, deps)).rejects.toThrow('journal write failed');
    expect(deps.deleteCandidate).toHaveBeenCalledOnce();
  });
});
