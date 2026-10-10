import { describe, expect, it } from 'vitest';

import { preflightTestnetBroadcast } from './testnet-broadcast-preflight';
import type { PinConfirmedSigningSession } from './pin-confirmed-signing-session';
import type { PreparedTestnetTransfer } from './testnet-transfer-builder';
import type { ValidatedTransactionIntent } from './transaction-intent-policy';

const recipient = '0x1111111111111111111111111111111111111111' as const;
const session: PinConfirmedSigningSession = { chainId: 97, assetId: 'arxi', recipient, amount: 10n, expiresAt: 100 };
const intent: ValidatedTransactionIntent = {
  chainId: 97,
  recipient,
  amount: 10n,
  asset: { id: 'arxi', kind: 'bep20', name: 'AurionXI', symbol: 'ARXI', decimals: 18, address: '0x3A3f02F22a6Cf16122A7C752B73E65E05Df466fA', accent: '#7cf6bd' },
};
const transfer: PreparedTestnetTransfer = {
  chainId: 97,
  to: '0x3A3f02F22a6Cf16122A7C752B73E65E05Df466fA',
  data: '0xa9059cbb',
  value: 0n,
};

describe('Testnet broadcast preflight', () => {
  it('permits only a matching Testnet transfer with an active PIN session', () => {
    expect(preflightTestnetBroadcast({ chainId: 97, chainIsTestnet: true, signingEnabled: true, rpcConfigured: true, session, intent, transfer, now: 1 })).toEqual({ ok: true });
  });

  it('fails closed for Mainnet, a disabled signer, unavailable RPC, expiry, or a changed recipient', () => {
    expect(preflightTestnetBroadcast({ chainId: 56, chainIsTestnet: false, signingEnabled: true, rpcConfigured: true, session, intent, transfer, now: 1 })).toEqual({ ok: false, reason: 'mainnet-blocked' });
    expect(preflightTestnetBroadcast({ chainId: 97, chainIsTestnet: true, signingEnabled: false, rpcConfigured: true, session, intent, transfer, now: 1 })).toEqual({ ok: false, reason: 'signing-disabled' });
    expect(preflightTestnetBroadcast({ chainId: 97, chainIsTestnet: true, signingEnabled: true, rpcConfigured: false, session, intent, transfer, now: 1 })).toEqual({ ok: false, reason: 'rpc-unavailable' });
    expect(preflightTestnetBroadcast({ chainId: 97, chainIsTestnet: true, signingEnabled: true, rpcConfigured: true, session, intent, transfer, now: 100 })).toEqual({ ok: false, reason: 'pin-confirmation-expired' });
    expect(preflightTestnetBroadcast({ chainId: 97, chainIsTestnet: true, signingEnabled: true, rpcConfigured: true, session, intent: { ...intent, recipient: '0x2222222222222222222222222222222222222222' }, transfer, now: 1 })).toEqual({ ok: false, reason: 'authorization-mismatch' });
  });
});
