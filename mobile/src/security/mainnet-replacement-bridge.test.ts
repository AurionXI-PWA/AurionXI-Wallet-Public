import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ prepare: vi.fn(), send: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' }, NativeModules: { AurionXIMainnetSecurity: { prepareNativeMainnetReplacement: mock.prepare, sendNativeMainnetTransfer: mock.send } } }));
import { prepareMainnetReplacementNatively, sendMainnetReviewNatively } from './mainnet-native-signer';
const sender = '0x1111111111111111111111111111111111111111';
const hash = `0x${'a'.repeat(64)}` as const;
const quote = () => ({ chainId: 56, senderAddress: sender, recipient: sender, assetId: 'native-bnb', assetContract: null, amount: '0', nonce: '6', gas: '21000', gasPrice: '100000000', observedAt: String(Date.now()), replacesTransactionHash: hash, replacementKind: 'cancel' });
describe('native replacement bridge', () => {
  beforeEach(() => { mock.prepare.mockReset(); mock.send.mockReset(); });
  it('passes only an original public pointer and choice to Android, then preserves the bound intent for native consent', async () => {
    mock.prepare.mockResolvedValue({ ...quote(), authorizationId: 'omit-me', rawTransaction: 'omit-me' });
    const review = await prepareMainnetReplacementNatively(sender, 6, hash, 'cancel');
    expect(mock.prepare).toHaveBeenCalledWith(sender, 6, hash, 'cancel');
    expect(Object.isFrozen(review)).toBe(true); expect(review.amount).toBe(0n);
    expect(Object.keys(review)).not.toContain('rawTransaction');
    mock.send.mockResolvedValue({ state: 'submitted', transactionHash: `0x${'b'.repeat(64)}` });
    await sendMainnetReviewNatively(review, 1);
    expect(mock.send.mock.calls[0][0]).toMatchObject({ replacementKind: 'cancel', replacesTransactionHash: hash, amount: '0', nonce: '6' });
  });
  it('rejects another nonce, hash, chain, recipient, nonzero cancellation and unsafe fee/time', async () => {
    for (const change of [{ chainId: 97 }, { nonce: '7' }, { replacesTransactionHash: `0x${'b'.repeat(64)}` }, { recipient: `0x${'2'.repeat(40)}` }, { amount: '1' }, { gasPrice: '1000000000000' }, { replacementKind: 'speed-up' }, { observedAt: '1' }, { observedAt: String(Date.now() + 100000) }]) {
      mock.prepare.mockResolvedValue({ ...quote(), ...change });
      await expect(prepareMainnetReplacementNatively(sender, 6, hash, 'cancel')).rejects.toThrow();
    }
  });
  it('keeps native-returned original USDT intent for Speed Up and rejects a different contract', async () => {
    const value = { ...quote(), replacementKind: 'speed-up', recipient: `0x${'2'.repeat(40)}`, assetId: 'usdt', assetContract: '0x55d398326f99059fF775485246999027B3197955', amount: '1000000000000000001', gas: '160000' };
    mock.prepare.mockResolvedValue(value);
    const review = await prepareMainnetReplacementNatively(sender, 6, hash, 'speed-up');
    expect(review.amount).toBe(1000000000000000001n); expect(review.recipient).toBe(value.recipient);
    mock.prepare.mockResolvedValue({ ...value, assetContract: sender });
    await expect(prepareMainnetReplacementNatively(sender, 6, hash, 'speed-up')).rejects.toThrow();
  });
});
