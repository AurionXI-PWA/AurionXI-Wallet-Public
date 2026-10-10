import { describe, expect, it } from 'vitest';

import { createMainnetNonceReservation } from './mainnet-nonce-reservation-core';

describe('Mainnet nonce reservation contract', () => {
  it('creates a chain-56 sender-and-nonce bound durable reservation record', () => {
    expect(createMainnetNonceReservation({ chainId: 56, senderAddress: '0x1111111111111111111111111111111111111111', nonce: 7, reviewFingerprint: 'review', authorizationId: 'authorization' })).toMatchObject({ status: 'reserved', attemptCount: 0, nonce: 7 });
  });

  it('rejects invalid chain, nonce, or missing authorization binding', () => {
    expect(() => createMainnetNonceReservation({ chainId: 97 as 56, senderAddress: '0x1111111111111111111111111111111111111111', nonce: 7, reviewFingerprint: 'review', authorizationId: 'authorization' })).toThrow('Invalid Mainnet nonce reservation');
    expect(() => createMainnetNonceReservation({ chainId: 56, senderAddress: '0x1111111111111111111111111111111111111111', nonce: -1, reviewFingerprint: 'review', authorizationId: 'authorization' })).toThrow('Invalid Mainnet nonce reservation');
  });
});
