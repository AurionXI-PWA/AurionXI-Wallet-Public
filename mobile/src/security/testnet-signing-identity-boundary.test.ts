import { describe, expect, it, vi } from 'vitest';

import { TestnetSigningIdentityError, verifyPinConfirmedTestnetSigningIdentity } from './testnet-signing-identity-boundary';

const address = '0x1111111111111111111111111111111111111111' as const;
const session = { chainId: 97 as const, assetId: 'arxi' as const, recipient: address, amount: 1n, expiresAt: 100 };

describe('Testnet signing identity boundary', () => {
  it('returns only the matching public identity from scoped payload material', async () => {
    const deriveAddress = vi.fn().mockReturnValue(address);
    const withScopedPayload = async <T>(consumer: (payload: Uint8Array) => Promise<T>) => consumer(new Uint8Array([1, 2, 3]));
    await expect(verifyPinConfirmedTestnetSigningIdentity({ session, now: 99, expectedAddress: address, withScopedPayload, deriveAddress })).resolves.toBe(address);
    expect(deriveAddress).toHaveBeenCalledOnce();
  });

  it('fails closed if the scoped vault identity does not match', async () => {
    const withScopedPayload = async <T>(consumer: (payload: Uint8Array) => Promise<T>) => consumer(new Uint8Array([1]));
    await expect(verifyPinConfirmedTestnetSigningIdentity({
      session,
      now: 99,
      expectedAddress: address,
      withScopedPayload,
      deriveAddress: () => '0x2222222222222222222222222222222222222222',
    })).rejects.toBeInstanceOf(TestnetSigningIdentityError);
  });
});
