import { describe, expect, it, vi } from 'vitest';
import { keccak256 } from 'viem';

import { executeApprovedTestnetBroadcast } from './testnet-execution-coordinator';

const raw = '0x01' as const;
const hash = keccak256(raw);
const session = { chainId: 97 as const, assetId: 'arxi' as const, recipient: '0x1111111111111111111111111111111111111111' as const, amount: 1n, expiresAt: 100 };

describe('Testnet execution coordinator', () => {
  it('broadcasts only after the gate passes and returns a normalized receipt state', async () => {
    const broadcaster = { sendRawTransaction: vi.fn().mockResolvedValue(hash) };
    const receiptReader = { getTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success' as const, blockNumber: 321n }) };
    await expect(executeApprovedTestnetBroadcast({ chainId: 97, chainIsTestnet: true, rpcConfigured: true, session, approval: { approvedAt: 1, expiresAt: 10 }, expectedHash: hash, serializedTransaction: raw, now: 2, broadcaster, receiptReader })).resolves.toEqual({ state: 'submitted', hash, receipt: { state: 'confirmed', blockNumber: '321' } });
    expect(broadcaster.sendRawTransaction).toHaveBeenCalledOnce();
  });

  it('does not call broadcaster or receipt reader without explicit approval', async () => {
    const broadcaster = { sendRawTransaction: vi.fn() };
    const receiptReader = { getTransactionReceipt: vi.fn() };
    await expect(executeApprovedTestnetBroadcast({ chainId: 97, chainIsTestnet: true, rpcConfigured: true, session, expectedHash: hash, serializedTransaction: raw, now: 2, broadcaster, receiptReader })).resolves.toEqual({ state: 'blocked', gate: { ok: false, reason: 'explicit-approval-required' } });
    expect(broadcaster.sendRawTransaction).not.toHaveBeenCalled();
    expect(receiptReader.getTransactionReceipt).not.toHaveBeenCalled();
  });
});
