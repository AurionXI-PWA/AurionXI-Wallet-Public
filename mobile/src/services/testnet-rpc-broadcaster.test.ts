import { describe, expect, it, vi } from 'vitest';
import { keccak256 } from 'viem';

import { broadcastSignedTestnetTransaction, TestnetRpcBroadcastError } from './testnet-rpc-broadcaster';

const raw = '0x01' as const;

describe('Testnet RPC broadcaster adapter', () => {
  it('accepts only a returned hash that matches the signed raw payload', async () => {
    const sendRawTransaction = vi.fn().mockResolvedValue(keccak256(raw));
    await expect(broadcastSignedTestnetTransaction({ sendRawTransaction }, raw)).resolves.toBe(keccak256(raw));
    expect(sendRawTransaction).toHaveBeenCalledWith({ serializedTransaction: raw });
  });

  it('fails closed for a mismatched hash or rejected RPC request', async () => {
    await expect(broadcastSignedTestnetTransaction({ sendRawTransaction: vi.fn().mockResolvedValue(`0x${'a'.repeat(64)}`) }, raw)).rejects.toBeInstanceOf(TestnetRpcBroadcastError);
    await expect(broadcastSignedTestnetTransaction({ sendRawTransaction: vi.fn().mockRejectedValue(new Error('timeout')) }, raw)).rejects.toThrow('not accepted');
  });
});
