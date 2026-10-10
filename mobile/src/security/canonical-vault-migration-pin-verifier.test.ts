import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authenticateCanonicalVaultMigrationPin } from './canonical-vault-migration-pin-verifier';

const mocks = vi.hoisted(() => ({
  authenticateEncryptedVaultWithRetry: vi.fn(),
}));

vi.mock('./vault-workflow', () => ({
  authenticateEncryptedVaultWithRetry: mocks.authenticateEncryptedVaultWithRetry,
}));

describe('canonical migration real PIN verifier read-only binding foundation', () => {
  beforeEach(() => {
    mocks.authenticateEncryptedVaultWithRetry.mockReset();
  });

  it('does not call the wallet verifier for a pre-aborted request', async () => {
    const abortController = new AbortController();
    abortController.abort();
    await expect(authenticateCanonicalVaultMigrationPin('123456', abortController.signal))
      .rejects.toThrow('cancelled');
    expect(mocks.authenticateEncryptedVaultWithRetry).not.toHaveBeenCalled();
  });

  it('delegates only the ephemeral PIN to the existing wallet verifier', async () => {
    mocks.authenticateEncryptedVaultWithRetry.mockResolvedValue(undefined);
    const abortController = new AbortController();
    await expect(authenticateCanonicalVaultMigrationPin('123456', abortController.signal))
      .resolves.toBeUndefined();
    expect(mocks.authenticateEncryptedVaultWithRetry).toHaveBeenCalledWith('123456');
  });

  it('settles cancellation around a mocked never-ending wallet verifier', async () => {
    mocks.authenticateEncryptedVaultWithRetry.mockReturnValue(new Promise<void>(() => undefined));
    const abortController = new AbortController();
    const pending = authenticateCanonicalVaultMigrationPin('123456', abortController.signal);
    abortController.abort();
    await expect(pending).rejects.toThrow('cancelled');
    expect(mocks.authenticateEncryptedVaultWithRetry).toHaveBeenCalledOnce();
  });
});
