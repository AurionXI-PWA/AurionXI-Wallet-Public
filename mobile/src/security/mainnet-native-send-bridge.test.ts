import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MainnetReviewEnvelope } from './mainnet-review-envelope';

const native = vi.hoisted(() => ({ send: vi.fn(), history: vi.fn(), sign: vi.fn(), broadcast: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' }, NativeModules: { AurionXIMainnetSecurity: {
  sendNativeMainnetTransfer: native.send, getNativeMainnetTransferHistory: native.history,
  signNativeMainnetTransfer: native.sign, broadcastNativeMainnetTransfer: native.broadcast,
} } }));
import { loadMainnetTransfersNatively, sendMainnetReviewNatively } from './mainnet-native-signer';

const hash = `0x${'a'.repeat(64)}` as const;
const review: MainnetReviewEnvelope = { chainId: 56, senderAddress: '0x1111111111111111111111111111111111111111',
  assetId: 'arxi', assetContract: '0x6ffec4860325f8bfb3f000354708a7d0cae4b250', recipient: '0x2222222222222222222222222222222222222222',
  amount: 5_000_000_000_000_000_000n, nonce: 1, gas: 160_000n, gasPrice: 50_000_000n, observedAt: 1 };
describe('single-consent native Mainnet Send bridge', () => {
  beforeEach(() => vi.resetAllMocks());
  it.each(['submitted', 'submission-unknown', 'not-submitted'] as const)('returns only public %s outcome and never exposes the handle', async (state) => {
    native.send.mockResolvedValue({ state, transactionHash: hash, broadcastHandle: 'forbidden', rawTransaction: 'forbidden' });
    await expect(sendMainnetReviewNatively(review, 3)).resolves.toEqual({ state, transactionHash: hash });
    expect(native.send).toHaveBeenCalledWith(expect.objectContaining({ amount: review.amount.toString(), nonce: '1', senderAddress: review.senderAddress }), 3);
    expect(native.sign).not.toHaveBeenCalled(); expect(native.broadcast).not.toHaveBeenCalled();
  });
  it('sends pinned USDT public fields and restores USDT metadata without exposing custody', async () => {
    const usdtReview = { ...review, assetId: 'usdt', assetContract: '0x55d398326f99059ff775485246999027b3197955' as const };
    native.send.mockResolvedValue({ state: 'submitted', transactionHash: hash, rawTransaction: 'forbidden' });
    await expect(sendMainnetReviewNatively(usdtReview, 3)).resolves.toEqual({ state: 'submitted', transactionHash: hash });
    expect(native.send).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'usdt', assetContract: usdtReview.assetContract }), 3);
    const record = { version: 1, chainId: 56, transactionHash: hash, senderAddress: review.senderAddress,
      recipientAddress: review.recipient, assetId: 'usdt', amountWei: '1', nonce: 1, submittedAt: 100, receiptState: 'pending' };
    native.history.mockResolvedValue([{ ...record, rawTransaction: 'forbidden', broadcastHandle: 'forbidden' }]);
    await expect(loadMainnetTransfersNatively(review.senderAddress)).resolves.toEqual([record]);
    expect(native.sign).not.toHaveBeenCalled(); expect(native.broadcast).not.toHaveBeenCalled();
  });
  it('rejects malformed results and invalid epochs without a fallback broadcast', async () => {
    await expect(sendMainnetReviewNatively(review, -1)).rejects.toThrow();
    expect(native.send).not.toHaveBeenCalled();
    native.send.mockResolvedValue({ state: 'confirmed', transactionHash: hash });
    await expect(sendMainnetReviewNatively(review, 3)).rejects.toThrow('check Activity');
    expect(native.broadcast).not.toHaveBeenCalled();
  });
  it('restores only sender-bound public metadata from the durable native journal', async () => {
    const record = { version: 1, chainId: 56, transactionHash: hash, senderAddress: review.senderAddress,
      recipientAddress: review.recipient, assetId: 'arxi', amountWei: review.amount.toString(), nonce: 1, submittedAt: 100, receiptState: 'confirmed' };
    native.history.mockResolvedValue([{ ...record, broadcastHandle: 'forbidden' }]);
    await expect(loadMainnetTransfersNatively(review.senderAddress)).resolves.toEqual([record]);
    native.history.mockResolvedValue([{ ...record, senderAddress: review.recipient }]);
    await expect(loadMainnetTransfersNatively(review.senderAddress)).rejects.toThrow('Invalid');
  });
});
