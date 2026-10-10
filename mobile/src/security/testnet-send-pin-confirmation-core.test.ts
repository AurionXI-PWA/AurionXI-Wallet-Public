import { describe, expect, it, vi } from 'vitest';

import { confirmTestnetSendPinWithDependencies } from './testnet-send-pin-confirmation-core';

describe('Testnet send PIN confirmation core', () => {
  it('returns only a fresh timestamp after delegated authentication succeeds', async () => {
    const authenticatePin = vi.fn().mockResolvedValue(undefined);
    await expect(confirmTestnetSendPinWithDependencies({ vaultUnlocked: true, now: 50, authenticatePin })).resolves.toEqual({ ok: true, verifiedAt: 50 });
    expect(authenticatePin).toHaveBeenCalledOnce();
  });

  it('fails closed while locked or when delegated authentication fails', async () => {
    const blocked = await confirmTestnetSendPinWithDependencies({ vaultUnlocked: false, now: 50, authenticatePin: vi.fn() });
    expect(blocked).toEqual({ ok: false, reason: 'vault-locked' });
    const failed = await confirmTestnetSendPinWithDependencies({ vaultUnlocked: true, now: 50, authenticatePin: vi.fn().mockRejectedValue(new Error('wrong PIN')) });
    expect(failed).toEqual({ ok: false, reason: 'pin-verification-failed' });
  });
});
