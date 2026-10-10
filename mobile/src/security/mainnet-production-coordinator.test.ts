import { keccak256, type Hex } from 'viem';
import { describe, expect, it, vi } from 'vitest';

import { MainnetProductionCoordinator } from './mainnet-production-coordinator';
import type { MainnetReviewEnvelope } from './mainnet-review-envelope';

vi.mock('./mainnet-native-signer', () => ({ signMainnetReviewNatively: vi.fn(), broadcastMainnetHandleNatively: vi.fn(), reconcileMainnetReceiptNatively: vi.fn(), sendMainnetReviewNatively: vi.fn() }));
vi.mock('@/storage/mainnet-submission-journal', () => ({
  createSubmittedMainnetRecord: (input: Record<string, unknown>) => ({ ...input, version: 1, chainId: 56, receiptState: 'submitted' }),
  saveMainnetSubmissionRecord: vi.fn(),
}));

const raw = '0x01' as Hex;
const hash = keccak256(raw);
const handle = 'a'.repeat(64);
const review: MainnetReviewEnvelope = {
  chainId: 56, senderAddress: '0x1111111111111111111111111111111111111111', assetId: 'arxi',
  assetContract: '0x6ffec4860325f8bfb3f000354708a7d0cae4b250', recipient: '0x2222222222222222222222222222222222222222',
  amount: 10_000_000_000_000_000_000n, nonce: 7, gas: 60_000n, gasPrice: 50_000_000n, observedAt: 1,
};

describe('Mainnet production coordinator', () => {
  it('uses one native Send consent and preserves an accepted result when the display cache fails', async () => {
    const send = vi.fn().mockResolvedValue({ state: 'submitted', transactionHash: hash });
    const legacyBroadcast = vi.fn();
    const coordinator = new MainnetProductionCoordinator(vi.fn(), legacyBroadcast, vi.fn().mockRejectedValue(new Error('disk full')), vi.fn(), send);
    await expect(coordinator.send({ review, authorizationEpoch: 3, userConfirmed: true, now: 10 })).resolves.toMatchObject({ state: 'submitted', transactionHash: hash, savedLocally: false });
    expect(send).toHaveBeenCalledOnce();
    expect(legacyBroadcast).not.toHaveBeenCalled();
  });

  it('accepts USDT metadata in the normal native Send path but rejects unsupported assets', async () => {
    const send = vi.fn().mockResolvedValue({ state: 'submitted', transactionHash: hash });
    const persist = vi.fn().mockResolvedValue(undefined);
    const coordinator = new MainnetProductionCoordinator(vi.fn(), vi.fn(), persist, vi.fn(), send);
    const usdtReview = { ...review, assetId: 'usdt', assetContract: '0x55d398326f99059ff775485246999027b3197955' as const };
    await expect(coordinator.send({ review: usdtReview, authorizationEpoch: 3, userConfirmed: true, now: 10 }))
      .resolves.toMatchObject({ record: { assetId: 'usdt', amountWei: review.amount.toString() } });
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'usdt' }));
    await expect(coordinator.send({ review: { ...review, assetId: 'usdc' }, authorizationEpoch: 3, userConfirmed: true, now: 10 })).rejects.toThrow('Unsupported');
    expect(send).toHaveBeenCalledOnce();
  });

  it('blocks duplicate taps while native submission is completing, even after invalidation', async () => {
    let finish!: (value: { state: 'submission-unknown'; transactionHash: typeof hash }) => void;
    const send = vi.fn(() => new Promise<{ state: 'submission-unknown'; transactionHash: typeof hash }>((resolve) => { finish = resolve; }));
    const coordinator = new MainnetProductionCoordinator(vi.fn(), vi.fn(), vi.fn(), vi.fn(), send);
    const first = coordinator.send({ review, authorizationEpoch: 3, userConfirmed: true, now: 10 });
    coordinator.invalidate();
    await expect(coordinator.send({ review, authorizationEpoch: 3, userConfirmed: true, now: 11 })).rejects.toThrow('already completing');
    finish({ state: 'submission-unknown', transactionHash: hash });
    await expect(first).resolves.toMatchObject({ state: 'submission-unknown', record: { receiptState: 'submission-unknown' } });
    expect(send).toHaveBeenCalledOnce();
  });

  it('never sends without explicit consent or automatically retries an unknown outcome', async () => {
    const send = vi.fn().mockResolvedValue({ state: 'submission-unknown', transactionHash: hash });
    const reconcile = vi.fn().mockResolvedValue('unknown');
    const coordinator = new MainnetProductionCoordinator(vi.fn(), vi.fn(), vi.fn(), reconcile, send);
    await expect(coordinator.send({ review, authorizationEpoch: 3, userConfirmed: false, now: 10 })).rejects.toThrow('Explicit');
    expect(send).not.toHaveBeenCalled();
    const result = await coordinator.send({ review, authorizationEpoch: 3, userConfirmed: true, now: 10 });
    await expect(coordinator.reconcileReceipt(result.record)).resolves.toBe('unknown');
    expect(send).toHaveBeenCalledOnce();
  });

  it('does not revive a legacy payload handle when signing completes after cancellation', async () => {
    let finish!: (value: { broadcastHandle: string; transactionHash: typeof hash; senderAddress: typeof review.senderAddress }) => void;
    const signer = vi.fn(() => new Promise<{ broadcastHandle: string; transactionHash: typeof hash; senderAddress: typeof review.senderAddress }>((resolve) => { finish = resolve; }));
    const broadcast = vi.fn();
    const coordinator = new MainnetProductionCoordinator(signer, broadcast, vi.fn());
    const pending = coordinator.signAfterBiometric({ review, authorizationEpoch: 3 });
    coordinator.invalidate(); finish({ broadcastHandle: handle, transactionHash: hash, senderAddress: review.senderAddress });
    await expect(pending).rejects.toThrow('cancelled');
    await expect(coordinator.broadcastAfterExplicitApproval({ review, authorizationEpoch: 3, userConfirmed: true, now: 10 })).rejects.toThrow('No matching');
    expect(broadcast).not.toHaveBeenCalled();
  });
  it('requires two actions, clears signed bytes, broadcasts once and persists only public metadata', async () => {
    const signer = vi.fn().mockResolvedValue({ broadcastHandle: handle, transactionHash: hash, senderAddress: review.senderAddress });
    const broadcaster = vi.fn().mockResolvedValue(hash);
    const persist = vi.fn().mockResolvedValue(undefined);
    const coordinator = new MainnetProductionCoordinator(signer, broadcaster, persist);
    await expect(coordinator.signAfterBiometric({ review, authorizationEpoch: 3 })).resolves.toEqual({ transactionHash: hash, senderAddress: review.senderAddress });
    const submitted = await coordinator.broadcastAfterExplicitApproval({ review, authorizationEpoch: 3, userConfirmed: true, now: 10 });
    expect(submitted.transactionHash).toBe(hash);
    expect(broadcaster).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ transactionHash: hash, amountWei: review.amount.toString(), receiptState: 'submitted' }));
    expect(JSON.stringify(persist.mock.calls)).not.toContain(raw);
    expect(broadcaster).toHaveBeenCalledWith({ broadcastHandle: handle, expectedHash: hash });
    await expect(coordinator.broadcastAfterExplicitApproval({ review, authorizationEpoch: 3, userConfirmed: true, now: 11 })).rejects.toThrow('No matching');
  });

  it('does not broadcast without a separate explicit approval and consumes the pending signature', async () => {
    const broadcaster = vi.fn();
    const coordinator = new MainnetProductionCoordinator(vi.fn().mockResolvedValue({ broadcastHandle: handle, transactionHash: hash, senderAddress: review.senderAddress }), broadcaster, vi.fn());
    await coordinator.signAfterBiometric({ review, authorizationEpoch: 4 });
    await expect(coordinator.broadcastAfterExplicitApproval({ review, authorizationEpoch: 4, userConfirmed: false, now: 10 })).rejects.toThrow('Explicit');
    expect(broadcaster).not.toHaveBeenCalled();
    await expect(coordinator.broadcastAfterExplicitApproval({ review, authorizationEpoch: 4, userConfirmed: true, now: 11 })).rejects.toThrow('No matching');
  });

  it('invalidates a pending signature on review or authorization mismatch', async () => {
    const broadcaster = vi.fn();
    const coordinator = new MainnetProductionCoordinator(vi.fn().mockResolvedValue({ broadcastHandle: handle, transactionHash: hash, senderAddress: review.senderAddress }), broadcaster, vi.fn());
    await coordinator.signAfterBiometric({ review, authorizationEpoch: 5 });
    await expect(coordinator.broadcastAfterExplicitApproval({ review: { ...review, nonce: 8 }, authorizationEpoch: 5, userConfirmed: true, now: 10 })).rejects.toThrow('No matching');
    expect(broadcaster).not.toHaveBeenCalled();
  });

  it('reconciles a submitted nonce through the status-only native path', async () => {
    const reconcile = vi.fn().mockResolvedValue('confirmed');
    const coordinator = new MainnetProductionCoordinator(vi.fn(), vi.fn(), vi.fn(), reconcile);
    const record = { version: 1, chainId: 56, transactionHash: hash, senderAddress: review.senderAddress, recipientAddress: review.recipient, assetId: 'arxi', amountWei: review.amount.toString(), nonce: review.nonce, submittedAt: 10, receiptState: 'submitted' } as const;
    await expect(coordinator.reconcileReceipt(record)).resolves.toBe('confirmed');
    expect(reconcile).toHaveBeenCalledWith({ senderAddress: review.senderAddress, nonce: review.nonce, transactionHash: hash });
  });
});
