import { describe, expect, it } from 'vitest';

import { evaluateMainnetSecureConfirmation } from './mainnet-secure-confirmation';
import type { MainnetReviewEnvelope } from './mainnet-review-envelope';

const review: MainnetReviewEnvelope = {
  chainId: 56,
  senderAddress: '0x1111111111111111111111111111111111111111',
  assetId: 'arxi',
  assetContract: '0x6fFEC4860325f8bfB3F000354708A7d0caE4b250',
  recipient: '0xEf7c8E41ba2707c2E92b8837Ff4B5EB55cec27e6',
  amount: 1n,
  nonce: 1,
  gas: 160_000n,
  gasPrice: 1n,
  observedAt: 100,
};

describe('Mainnet secure confirmation', () => {
  it('fails closed when the dedicated Mainnet vault is absent or locked', () => {
    expect(evaluateMainnetSecureConfirmation({ mainnetVaultPresent: false, vaultUnlocked: false, confirmation: { method: 'pin', verifiedAt: 100 }, review, now: 101 })).toEqual({ ok: false, reason: 'mainnet-wallet-not-created' });
    expect(evaluateMainnetSecureConfirmation({ mainnetVaultPresent: true, vaultUnlocked: false, confirmation: { method: 'pin', verifiedAt: 100 }, review, now: 101 })).toEqual({ ok: false, reason: 'vault-locked' });
  });

  it('requires a fresh confirmation and still does not authorize Mainnet signing', () => {
    expect(evaluateMainnetSecureConfirmation({ mainnetVaultPresent: true, vaultUnlocked: true, confirmation: { method: 'biometric', verifiedAt: 1 }, review, now: 90_001 })).toEqual({ ok: false, reason: 'confirmation-expired' });
    expect(evaluateMainnetSecureConfirmation({ mainnetVaultPresent: true, vaultUnlocked: true, confirmation: { method: 'biometric', verifiedAt: 100 }, review, now: 101 })).toEqual({ ok: false, reason: 'mainnet-signing-not-released', confirmation: { method: 'biometric', expiresAt: 90_100 } });
  });
});
