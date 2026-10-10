import { describe, expect, it } from 'vitest';

import { createMainnetAuthorizationRegistry } from './mainnet-one-time-authorization';

const sender = '0x1111111111111111111111111111111111111111' as const;

describe('Mainnet one-time authorization', () => {
  it('binds authorization to sender, review, epoch and one use', () => {
    const registry = createMainnetAuthorizationRegistry();
    const authorization = registry.issue({ id: 'random-id', now: 10, senderAddress: sender, reviewFingerprint: 'review-a', authorizationEpoch: 3, method: 'pin', expiresAt: 20 });
    expect(() => registry.consume({ authorization, senderAddress: sender, reviewFingerprint: 'review-b', authorizationEpoch: 3, now: 11 })).toThrow('invalid, expired, or already consumed');
    expect(registry.consume({ authorization, senderAddress: sender, reviewFingerprint: 'review-a', authorizationEpoch: 3, now: 11 })).toEqual({ method: 'pin' });
    expect(() => registry.consume({ authorization, senderAddress: sender, reviewFingerprint: 'review-a', authorizationEpoch: 3, now: 12 })).toThrow('invalid, expired, or already consumed');
  });

  it('invalidates all outstanding authorizations on lock or background', () => {
    const registry = createMainnetAuthorizationRegistry();
    const authorization = registry.issue({ id: 'random-id', now: 10, senderAddress: sender, reviewFingerprint: 'review-a', authorizationEpoch: 3, method: 'biometric', expiresAt: 20 });
    registry.invalidateAll();
    expect(() => registry.consume({ authorization, senderAddress: sender, reviewFingerprint: 'review-a', authorizationEpoch: 3, now: 11 })).toThrow('invalid, expired, or already consumed');
  });
});
