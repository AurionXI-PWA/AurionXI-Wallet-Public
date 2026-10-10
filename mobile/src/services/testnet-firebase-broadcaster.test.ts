import { describe, expect, it, vi } from 'vitest';
import { keccak256, type Hex } from 'viem';

import {
  TestnetBroadcastConfigurationError,
  TestnetBroadcastRelayError,
  broadcastViaTestnetRelay,
  createTestnetRelayBroadcaster,
  getTestnetBroadcastServiceUrl,
} from './testnet-firebase-broadcaster';

const raw = `0x${'11'.repeat(80)}` as Hex;

describe('Testnet Firebase broadcaster', () => {
  it('accepts only a credential-free HTTPS function URL', () => {
    expect(getTestnetBroadcastServiceUrl('https://asia-south1-example.cloudfunctions.net/walletTestnetBroadcast/')).toBe(
      'https://asia-south1-example.cloudfunctions.net/walletTestnetBroadcast',
    );
    expect(getTestnetBroadcastServiceUrl('http://example.test')).toBeUndefined();
    expect(getTestnetBroadcastServiceUrl('https://secret@example.test')).toBeUndefined();
  });

  it('sends the canonical hash with the pre-signed transaction only', async () => {
    const previous = process.env.EXPO_PUBLIC_TESTNET_BROADCAST_API_URL;
    process.env.EXPO_PUBLIC_TESTNET_BROADCAST_API_URL = 'https://example.test/walletTestnetBroadcast';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: true, chainId: 97, hash: keccak256(raw) }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(broadcastViaTestnetRelay(raw)).resolves.toBe(keccak256(raw));
    await expect(createTestnetRelayBroadcaster().sendRawTransaction({ serializedTransaction: raw })).resolves.toBe(keccak256(raw));
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/walletTestnetBroadcast',
      expect.objectContaining({ method: 'POST' }),
    );
    process.env.EXPO_PUBLIC_TESTNET_BROADCAST_API_URL = previous;
    vi.unstubAllGlobals();
  });

  it('fails closed when the relay URL is absent or response hash differs', async () => {
    const previous = process.env.EXPO_PUBLIC_TESTNET_BROADCAST_API_URL;
    process.env.EXPO_PUBLIC_TESTNET_BROADCAST_API_URL = '';
    await expect(broadcastViaTestnetRelay(raw)).rejects.toBeInstanceOf(TestnetBroadcastConfigurationError);
    process.env.EXPO_PUBLIC_TESTNET_BROADCAST_API_URL = 'https://example.test/walletTestnetBroadcast';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: true, chainId: 97, hash: `0x${'00'.repeat(32)}` }),
    }));
    await expect(broadcastViaTestnetRelay(raw)).rejects.toBeInstanceOf(TestnetBroadcastRelayError);
    process.env.EXPO_PUBLIC_TESTNET_BROADCAST_API_URL = previous;
    vi.unstubAllGlobals();
  });
});
