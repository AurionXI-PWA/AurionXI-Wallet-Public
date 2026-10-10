import { describe, expect, it, vi } from 'vitest';

import { withPinConfirmedTestnetSigningMaterial, TestnetSigningBoundaryError } from './testnet-signing-account-boundary-core';

const session = { chainId: 97 as const, assetId: 'arxi' as const, recipient: '0x1111111111111111111111111111111111111111' as const, amount: 1n, expiresAt: 100 };

describe('Testnet signing account boundary', () => {
  it('allows payload use only within a live PIN-confirmed session callback', async () => {
    const consume = vi.fn().mockResolvedValue('scoped-result');
    const withScopedPayload = async <T>(consumer: (payload: Uint8Array) => Promise<T>) => consumer(new Uint8Array([1, 2, 3]));
    await expect(withPinConfirmedTestnetSigningMaterial({ session, now: 99, withScopedPayload, consume })).resolves.toBe('scoped-result');
    expect(consume).toHaveBeenCalledTimes(1);
  });

  it('fails before a payload reader can run when the signing session is expired', async () => {
    const withScopedPayload = vi.fn();
    await expect(withPinConfirmedTestnetSigningMaterial({ session, now: 100, withScopedPayload, consume: vi.fn() }))
      .rejects.toBeInstanceOf(TestnetSigningBoundaryError);
    expect(withScopedPayload).not.toHaveBeenCalled();
  });
});
