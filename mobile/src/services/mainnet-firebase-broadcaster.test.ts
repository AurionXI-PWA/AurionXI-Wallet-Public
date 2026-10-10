import { keccak256, type Hex } from 'viem';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFirebaseAppCheckToken } from './firebase-app-check';
import { broadcastViaMainnetRelay, getMainnetBroadcastServiceUrl, MainnetAppCheckUnavailableError } from './mainnet-firebase-broadcaster';
import type { MainnetReviewEnvelope } from '@/security/mainnet-review-envelope';

vi.mock('./firebase-app-check', () => ({ getFirebaseAppCheckToken: vi.fn().mockResolvedValue('attestation'), appCheckRequestHeaders: (token?: string) => token ? { 'X-Firebase-AppCheck': token } : {} }));

const raw = '0x01' as Hex;
const hash = keccak256(raw);
const review: MainnetReviewEnvelope = { chainId: 56, senderAddress: '0x1111111111111111111111111111111111111111', assetId: 'arxi', assetContract: '0x6ffec4860325f8bfb3f000354708a7d0cae4b250', recipient: '0x2222222222222222222222222222222222222222', amount: 10n, nonce: 7, gas: 60_000n, gasPrice: 50_000_000n, observedAt: 1 };

afterEach(() => vi.unstubAllGlobals());

describe('Mainnet Firebase broadcaster', () => {
  it('accepts only credential-free HTTPS endpoint configuration', () => {
    expect(getMainnetBroadcastServiceUrl('https://relay.example/path/')).toBe('https://relay.example/path');
    expect(getMainnetBroadcastServiceUrl('http://relay.example')).toBeUndefined();
    expect(getMainnetBroadcastServiceUrl('https://user:pass@relay.example')).toBeUndefined();
  });

  it('requires App Check before making a request', async () => {
    vi.mocked(getFirebaseAppCheckToken).mockResolvedValueOnce(undefined);
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    process.env.EXPO_PUBLIC_MAINNET_BROADCAST_API_URL = 'https://relay.example/v1/bsc-mainnet/broadcast';
    await expect(broadcastViaMainnetRelay({ rawTransaction: raw, expectedHash: hash, review })).rejects.toBeInstanceOf(MainnetAppCheckUnavailableError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('sends the exact reviewed public fields and accepts only the expected hash', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accepted: true, chainId: 56, hash }) });
    vi.stubGlobal('fetch', fetcher); process.env.EXPO_PUBLIC_MAINNET_BROADCAST_API_URL = 'https://relay.example/v1/bsc-mainnet/broadcast';
    await expect(broadcastViaMainnetRelay({ rawTransaction: raw, expectedHash: hash, review })).resolves.toBe(hash);
    expect(fetcher).toHaveBeenCalledWith('https://relay.example/v1/bsc-mainnet/broadcast', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-Firebase-AppCheck': 'attestation' }) }));
    const body = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(body).toEqual(expect.objectContaining({ serializedTransaction: raw, expectedHash: hash, asset: 'arxi', amountWei: '10', nonce: '7', gasLimit: '60000', gasPriceWei: '50000000' }));
  });
});
