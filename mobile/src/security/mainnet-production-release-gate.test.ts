import { describe, expect, it } from 'vitest';
import { keccak256 } from 'viem';

import { createMainnetExplicitBroadcastApproval, evaluateMainnetProductionReleaseGate, getMainnetReviewFingerprint } from './mainnet-production-release-gate';
import type { MainnetReviewEnvelope } from './mainnet-review-envelope';

const review: MainnetReviewEnvelope = { chainId: 56, senderAddress: '0x1111111111111111111111111111111111111111', assetId: 'arxi', assetContract: '0x6fFEC4860325f8bfB3F000354708A7d0caE4b250', recipient: '0xEf7c8E41ba2707c2E92b8837Ff4B5EB55cec27e6', amount: 1n, nonce: 2, gas: 160_000n, gasPrice: 1n, observedAt: 1 };
const payload = '0x0102' as const;

describe('Mainnet production release gate', () => {
  it('binds an explicit approval to one immutable Mainnet review', () => {
    const approval = createMainnetExplicitBroadcastApproval({ review, userConfirmed: true, now: 10 });
    expect(approval).toMatchObject({ reviewFingerprint: getMainnetReviewFingerprint(review), expiresAt: 30_010 });
  });

  it('fails closed even when a caller supplies a valid approval and payload hash', () => {
    const approval = createMainnetExplicitBroadcastApproval({ review, userConfirmed: true, now: 10 });
    expect(evaluateMainnetProductionReleaseGate({ review, approval, signedPayload: payload, expectedHash: keccak256(payload), now: 11 })).toEqual({ ok: false, reason: 'mainnet-production-release-not-approved' });
  });

  it('does not create an approval without a direct user confirmation', () => {
    expect(createMainnetExplicitBroadcastApproval({ review, userConfirmed: false, now: 10 })).toBeUndefined();
  });
});
