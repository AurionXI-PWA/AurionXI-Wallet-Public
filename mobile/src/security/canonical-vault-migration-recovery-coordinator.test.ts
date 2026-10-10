import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activatePrimaryPointer: vi.fn(),
  audit: vi.fn(),
  markCandidateRemoved: vi.fn(),
  markFinalized: vi.fn(),
  markPrimaryAuthoritative: vi.fn(),
  markPrimaryWritten: vi.fn(),
  recordIntent: vi.fn(),
  removeCandidate: vi.fn(),
  writePrimaryCopy: vi.fn(),
}));

vi.mock('./canonical-vault-migration-audit', () => ({
  auditStoredCanonicalVaultMigration: mocks.audit,
}));
vi.mock('./canonical-vault-candidate-removed-executor', () => ({
  recordStoredCanonicalVaultCandidateRemoved: mocks.markCandidateRemoved,
}));
vi.mock('./canonical-vault-candidate-removal-executor', () => ({
  removeStoredVerifiedCanonicalVaultCandidate: mocks.removeCandidate,
}));
vi.mock('./canonical-vault-finalization-executor', () => ({
  finalizeStoredCanonicalVaultMigration: mocks.markFinalized,
}));
vi.mock('./canonical-vault-migration-intent-executor', () => ({
  recordStoredCanonicalVaultMigrationIntent: mocks.recordIntent,
}));
vi.mock('./canonical-vault-primary-authoritative-executor', () => ({
  recordStoredCanonicalVaultPrimaryAuthoritative: mocks.markPrimaryAuthoritative,
}));
vi.mock('./canonical-vault-primary-copy-executor', () => ({
  writeStoredCanonicalVaultPrimaryCopy: mocks.writePrimaryCopy,
}));
vi.mock('./canonical-vault-primary-pointer-executor', () => ({
  activateStoredCanonicalVaultPrimaryPointer: mocks.activatePrimaryPointer,
}));
vi.mock('./canonical-vault-primary-written-executor', () => ({
  recordStoredCanonicalVaultPrimaryWritten: mocks.markPrimaryWritten,
}));

// The adapter must load only after every physical dependency is mocked.
// eslint-disable-next-line import/first
import { recoverOneStoredCanonicalVaultMigrationStep } from './canonical-vault-migration-recovery-coordinator';

const executorMocks = [
  mocks.activatePrimaryPointer,
  mocks.markCandidateRemoved,
  mocks.markFinalized,
  mocks.markPrimaryAuthoritative,
  mocks.markPrimaryWritten,
  mocks.recordIntent,
  mocks.removeCandidate,
  mocks.writePrimaryCopy,
];

describe('stored canonical migration one-step adapter foundation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const executor of executorMocks) executor.mockResolvedValue(undefined);
  });

  it('binds the supplied timestamp only to an eligible intent step', async () => {
    mocks.audit
      .mockResolvedValueOnce({ action: 'record-intent', state: 'eligible' })
      .mockResolvedValueOnce({ action: 'write-primary-copy', state: 'intent-recorded' });
    await expect(recoverOneStoredCanonicalVaultMigrationStep(
      '2026-08-09T03:00:00.000Z',
    )).resolves.toEqual({ action: 'executed-one-step', step: 'record-intent' });
    expect(mocks.recordIntent).toHaveBeenCalledWith('2026-08-09T03:00:00.000Z');
    expect(executorMocks.reduce((sum, mock) => sum + mock.mock.calls.length, 0)).toBe(1);
  });

  it('routes the irreversible step only to the verified candidate remover', async () => {
    mocks.audit
      .mockResolvedValueOnce({ action: 'remove-candidate', state: 'primary-authoritative' })
      .mockResolvedValueOnce({ action: 'mark-candidate-removed', state: 'candidate-absent' });
    await expect(recoverOneStoredCanonicalVaultMigrationStep(
      '2026-08-09T03:00:00.000Z',
    )).resolves.toEqual({ action: 'executed-one-step', step: 'remove-candidate' });
    expect(mocks.removeCandidate).toHaveBeenCalledTimes(1);
    expect(executorMocks.reduce((sum, mock) => sum + mock.mock.calls.length, 0)).toBe(1);
  });

  it('does not call any executor when stored state is already finalized', async () => {
    mocks.audit.mockResolvedValueOnce({ action: 'complete', state: 'finalized' });
    await expect(recoverOneStoredCanonicalVaultMigrationStep(
      '2026-08-09T03:00:00.000Z',
    )).resolves.toEqual({ action: 'complete', state: 'finalized' });
    for (const executor of executorMocks) expect(executor).not.toHaveBeenCalled();
  });

  it('fails closed without executor dispatch for inconsistent stored state', async () => {
    mocks.audit.mockResolvedValueOnce({ action: 'fail-closed', state: 'inconsistent' });
    await expect(recoverOneStoredCanonicalVaultMigrationStep(
      '2026-08-09T03:00:00.000Z',
    )).rejects.toThrow('failed closed');
    for (const executor of executorMocks) expect(executor).not.toHaveBeenCalled();
  });

  it('rejects when the post-executor stored audit is not the exact successor', async () => {
    mocks.audit
      .mockResolvedValueOnce({ action: 'mark-finalized', state: 'candidate-removed' })
      .mockResolvedValueOnce({ action: 'mark-finalized', state: 'candidate-removed' });
    await expect(recoverOneStoredCanonicalVaultMigrationStep(
      '2026-08-09T03:00:00.000Z',
    )).rejects.toThrow('next-step verification');
    expect(mocks.markFinalized).toHaveBeenCalledTimes(1);
  });
});
