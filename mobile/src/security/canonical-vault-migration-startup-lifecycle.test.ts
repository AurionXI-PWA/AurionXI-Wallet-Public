import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activatePrimaryPointer: vi.fn(),
  audit: vi.fn(),
  markCandidateRemoved: vi.fn(),
  markFinalized: vi.fn(),
  markPrimaryAuthoritative: vi.fn(),
  markPrimaryWritten: vi.fn(),
  writePrimaryCopy: vi.fn(),
}));

vi.mock('./canonical-vault-migration-audit', () => ({
  auditStoredCanonicalVaultMigration: mocks.audit,
}));
vi.mock('./canonical-vault-candidate-removed-executor', () => ({
  recordStoredCanonicalVaultCandidateRemoved: mocks.markCandidateRemoved,
}));
vi.mock('./canonical-vault-finalization-executor', () => ({
  finalizeStoredCanonicalVaultMigration: mocks.markFinalized,
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
import { runStoredCanonicalVaultMigrationStartupLifecycle } from './canonical-vault-migration-startup-lifecycle';

const safeExecutors = [
  mocks.activatePrimaryPointer,
  mocks.markCandidateRemoved,
  mocks.markFinalized,
  mocks.markPrimaryAuthoritative,
  mocks.markPrimaryWritten,
  mocks.writePrimaryCopy,
];

describe('stored canonical startup lifecycle adapter foundation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const executor of safeExecutors) executor.mockResolvedValue(undefined);
  });

  it.each([
    [
      { action: 'write-primary-copy', state: 'intent-recorded' },
      { action: 'mark-primary-written', state: 'primary-copy-present' },
      mocks.writePrimaryCopy,
    ],
    [
      { action: 'mark-primary-written', state: 'primary-copy-present' },
      { action: 'activate-primary-pointer', state: 'primary-written' },
      mocks.markPrimaryWritten,
    ],
    [
      { action: 'activate-primary-pointer', state: 'primary-written' },
      { action: 'mark-primary-authoritative', state: 'primary-pointer-active' },
      mocks.activatePrimaryPointer,
    ],
    [
      { action: 'mark-primary-authoritative', state: 'primary-pointer-active' },
      { action: 'remove-candidate', state: 'primary-authoritative' },
      mocks.markPrimaryAuthoritative,
    ],
    [
      { action: 'mark-candidate-removed', state: 'candidate-absent' },
      { action: 'mark-finalized', state: 'candidate-removed' },
      mocks.markCandidateRemoved,
    ],
    [
      { action: 'mark-finalized', state: 'candidate-removed' },
      { action: 'complete', state: 'finalized' },
      mocks.markFinalized,
    ],
  ] as const)('routes one safe stored action from %s', async (current, next, expectedExecutor) => {
    mocks.audit.mockResolvedValueOnce(current).mockResolvedValueOnce(next);
    await expect(runStoredCanonicalVaultMigrationStartupLifecycle()).resolves.toEqual(
      expect.objectContaining({ action: 'recovered-one-safe-step', step: current.action }),
    );
    expect(expectedExecutor).toHaveBeenCalledTimes(1);
    expect(safeExecutors.reduce((sum, mock) => sum + mock.mock.calls.length, 0)).toBe(1);
  });

  it.each([
    { action: 'record-intent', state: 'eligible' },
    { action: 'remove-candidate', state: 'primary-authoritative' },
    { action: 'complete', state: 'finalized' },
    { action: 'fail-closed', state: 'inconsistent' },
  ] as const)('does not dispatch a stored executor for boundary action $action', async (plan) => {
    mocks.audit.mockResolvedValueOnce(plan);
    await expect(runStoredCanonicalVaultMigrationStartupLifecycle()).resolves.toEqual(expect.any(Object));
    for (const executor of safeExecutors) expect(executor).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });

  it('contains no intent or candidate-removal executor export or mock', async () => {
    const adapter = await import('./canonical-vault-migration-startup-lifecycle');
    expect(Object.keys(adapter)).toEqual(['runStoredCanonicalVaultMigrationStartupLifecycle']);
    expect(mocks).not.toHaveProperty('recordIntent');
    expect(mocks).not.toHaveProperty('removeCandidate');
  });
});
