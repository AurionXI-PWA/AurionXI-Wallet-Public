import { describe, expect, it } from 'vitest';

import {
  confirmPreparedMainnetExecution,
  prepareMainnetExecution,
} from './mainnet-execution-coordinator';

const recipient = '0xEf7c8E41ba2707c2E92b8837Ff4B5EB55cec27e6';

describe('Mainnet execution coordinator', () => {
  const readyInput = {
    senderAddress: '0x1111111111111111111111111111111111111111' as const,
    transaction: { assetId: 'arxi' as const, recipient, amount: '1' },
    snapshot: {
      chainId: 56 as const,
      nonce: 2n,
      gasPriceWei: 1_000_000_000n,
      nativeBalanceWei: 10n ** 18n,
      assetBalanceWei: 2n * 10n ** 18n,
      observedAt: 1_000,
    },
  };

  it('creates one immutable Mainnet review state from public values only', () => {
    const result = prepareMainnetExecution(readyInput);
    expect(result.state).toBe('review-ready');
    if (result.state !== 'review-ready') return;
    expect(result.review).toMatchObject({ chainId: 56, senderAddress: readyInput.senderAddress, assetId: 'arxi', recipient, nonce: 2 });
  });

  it('keeps invalid and insufficient states out of confirmation', () => {
    const invalid = prepareMainnetExecution({ ...readyInput, transaction: { ...readyInput.transaction, amount: '0' } });
    expect(invalid).toMatchObject({ state: 'invalid-details', reason: 'invalid-amount' });
    expect(confirmPreparedMainnetExecution({ preparation: invalid, mainnetVaultPresent: true, vaultUnlocked: true, confirmation: { method: 'pin', verifiedAt: 1_000 }, now: 1_001 })).toEqual({ state: 'review-not-ready' });

    const insufficient = prepareMainnetExecution({ ...readyInput, snapshot: { ...readyInput.snapshot, nativeBalanceWei: 0n } });
    expect(insufficient.state).toBe('insufficient-native-balance');
  });

  it('preserves the final Mainnet release block after local confirmation', () => {
    const prepared = prepareMainnetExecution(readyInput);
    const result = confirmPreparedMainnetExecution({ preparation: prepared, mainnetVaultPresent: true, vaultUnlocked: true, confirmation: { method: 'biometric', verifiedAt: 1_000 }, now: 1_001 });
    expect(result).toEqual({ state: 'confirmation-result', result: { ok: false, reason: 'mainnet-signing-not-released', confirmation: { method: 'biometric', expiresAt: 91_000 } } });
  });
});
