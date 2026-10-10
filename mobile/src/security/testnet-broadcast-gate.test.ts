import { describe, expect, it, vi } from 'vitest';
import { keccak256 } from 'viem';

import { createExplicitTestnetBroadcastApproval, withAuthorizedTestnetBroadcast } from './testnet-broadcast-gate';

const raw = '0x01' as const;
const hash = keccak256(raw);
const session = { chainId: 97 as const, assetId: 'arxi' as const, recipient: '0x1111111111111111111111111111111111111111' as const, amount: 1n, expiresAt: 100 };

describe('Testnet broadcast gate', () => {
  it('passes an exact signed payload to an immediate callback only with a fresh explicit approval', async () => {
    const consume = vi.fn().mockResolvedValue('mocked-broadcast-result');
    const approval = createExplicitTestnetBroadcastApproval({ userConfirmed: true, now: 1 });
    const result = await withAuthorizedTestnetBroadcast({ chainId: 97, chainIsTestnet: true, rpcConfigured: true, session, approval, expectedHash: hash, serializedTransaction: raw, now: 2, consume });
    expect(result).toEqual({ gate: { ok: true, hash }, value: 'mocked-broadcast-result' });
    expect(consume).toHaveBeenCalledWith(raw);
  });

  it('fails closed for missing approval, expiry, Mainnet, or a payload mismatch', async () => {
    const consume = vi.fn();
    const base = { chainId: 97, chainIsTestnet: true, rpcConfigured: true, session, expectedHash: hash, serializedTransaction: raw, now: 2, consume };
    await expect(withAuthorizedTestnetBroadcast(base)).resolves.toEqual({ gate: { ok: false, reason: 'explicit-approval-required' } });
    await expect(withAuthorizedTestnetBroadcast({ ...base, chainId: 56, chainIsTestnet: false, approval: { approvedAt: 1, expiresAt: 3 } })).resolves.toEqual({ gate: { ok: false, reason: 'mainnet-blocked' } });
    await expect(withAuthorizedTestnetBroadcast({ ...base, approval: { approvedAt: 1, expiresAt: 2 } })).resolves.toEqual({ gate: { ok: false, reason: 'explicit-approval-required' } });
    await expect(withAuthorizedTestnetBroadcast({ ...base, approval: { approvedAt: 1, expiresAt: 3 }, expectedHash: `0x${'a'.repeat(64)}` })).resolves.toEqual({ gate: { ok: false, reason: 'signed-payload-mismatch' } });
    expect(consume).not.toHaveBeenCalled();
  });

  it('blocks an expired PIN session before it can reach the broadcaster', async () => {
    const consume = vi.fn();
    const approval = createExplicitTestnetBroadcastApproval({ userConfirmed: true, now: 100 });
    await expect(withAuthorizedTestnetBroadcast({
      chainId: 97,
      chainIsTestnet: true,
      rpcConfigured: true,
      session: { ...session, expiresAt: 100 },
      approval,
      expectedHash: hash,
      serializedTransaction: raw,
      now: 100,
      consume,
    })).resolves.toEqual({ gate: { ok: false, reason: 'pin-confirmation-expired' } });
    expect(consume).not.toHaveBeenCalled();
  });
});
