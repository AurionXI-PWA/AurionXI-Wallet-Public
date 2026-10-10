import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MainnetReviewEnvelope } from './mainnet-review-envelope';

const native = vi.hoisted(() => ({ inspect: vi.fn(), reconcile: vi.fn(), sign: vi.fn(), broadcast: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' }, NativeModules: { AurionXIMainnetSecurity: {
  getNativeMainnetRecoveryDiagnostics: native.inspect, reconcileNativeMainnetReceipt: native.reconcile,
  signNativeMainnetTransfer: native.sign, broadcastNativeMainnetTransfer: native.broadcast,
} } }));
import { getMainnetRecoveryDiagnosticsNatively, reconcileMainnetReceiptNatively } from './mainnet-native-signer';

const sender = '0x1111111111111111111111111111111111111111';
const hash = `0x${'a'.repeat(64)}` as const;
const review: MainnetReviewEnvelope = {
  chainId: 56, senderAddress: sender, assetId: 'arxi', assetContract: '0x6ffec4860325f8bfb3f000354708a7d0cae4b250',
  recipient: '0x2222222222222222222222222222222222222222', amount: 5_000_000_000_000_000_000n,
  nonce: 1, gas: 160_000n, gasPrice: 50_000_000n, observedAt: 1,
};

describe('native Mainnet recovery bridge', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(['SIGNED_UNVERIFIED', 'SIGNED', 'SUBMITTED'] as const)('recovers an old %s receipt without signing or broadcasting again', async (state) => {
    native.inspect.mockResolvedValue({ chainId: 56, senderAddress: sender, reviewedNonce: '1', livePendingNonce: '1',
      recordCount: 1, reason: state === 'SUBMITTED' ? 'submitted_receipt_required' : 'nonce_mismatch', records: [{ nonce: '0', state, transactionHash: hash }] });
    native.reconcile.mockResolvedValue('confirmed');
    const diagnostics = await getMainnetRecoveryDiagnosticsNatively(review);
    const record = diagnostics.records[0];
    await expect(reconcileMainnetReceiptNatively({ senderAddress: diagnostics.senderAddress, nonce: Number(record.nonce), transactionHash: record.transactionHash! })).resolves.toBe('confirmed');
    expect(native.inspect).toHaveBeenCalledWith({ chainId: 56, senderAddress: sender, recipient: review.recipient,
      assetId: 'arxi', amount: review.amount.toString(), nonce: '1' });
    expect(native.reconcile).toHaveBeenCalledWith(sender, 0, hash);
    expect(native.sign).not.toHaveBeenCalled();
    expect(native.broadcast).not.toHaveBeenCalled();
  });

  it('returns pending without replacing an old signed record or sending anything', async () => {
    native.reconcile.mockResolvedValue('pending');
    await expect(reconcileMainnetReceiptNatively({ senderAddress: sender, nonce: 0, transactionHash: hash })).resolves.toBe('pending');
    expect(native.sign).not.toHaveBeenCalled();
    expect(native.broadcast).not.toHaveBeenCalled();
  });

  it('preserves unavailable receipt errors without trying another transaction', async () => {
    native.reconcile.mockRejectedValue(new Error('receipt unavailable'));
    await expect(reconcileMainnetReceiptNatively({ senderAddress: sender, nonce: 0, transactionHash: hash })).rejects.toThrow('receipt unavailable');
    expect(native.sign).not.toHaveBeenCalled();
    expect(native.broadcast).not.toHaveBeenCalled();
  });

  it('rejects unsupported reconciliation input before crossing the bridge', async () => {
    await expect(reconcileMainnetReceiptNatively({ senderAddress: sender, nonce: Number.MAX_SAFE_INTEGER + 1, transactionHash: hash })).rejects.toThrow('invalid');
    expect(native.reconcile).not.toHaveBeenCalled();
  });
});
