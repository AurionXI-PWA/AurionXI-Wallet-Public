import { keccak256, type Hash, type Hex } from 'viem';

import { isPinConfirmedSigningSessionActive, type PinConfirmedSigningSession } from './pin-confirmed-signing-session';

export const TESTNET_BROADCAST_APPROVAL_TTL_MS = 30_000;

export type ExplicitTestnetBroadcastApproval = {
  approvedAt: number;
  expiresAt: number;
};

export type TestnetBroadcastGateResult =
  | { ok: true; hash: Hash }
  | { ok: false; reason: 'mainnet-blocked' | 'rpc-unavailable' | 'pin-confirmation-expired' | 'explicit-approval-required' | 'signed-payload-mismatch' };

/** Creates a one-time, short-lived approval only after a direct confirmation action. */
export function createExplicitTestnetBroadcastApproval(input: {
  userConfirmed: boolean;
  now: number;
}): ExplicitTestnetBroadcastApproval | undefined {
  if (!input.userConfirmed) return undefined;
  return { approvedAt: input.now, expiresAt: input.now + TESTNET_BROADCAST_APPROVAL_TTL_MS };
}

/**
 * Validates broadcast authority and exposes the serialized transaction only to
 * the supplied immediate callback. No network client or broadcast operation is
 * implemented in this gate.
 */
export async function withAuthorizedTestnetBroadcast<T>(input: {
  chainId: number;
  chainIsTestnet: boolean;
  rpcConfigured: boolean;
  session: PinConfirmedSigningSession;
  approval?: ExplicitTestnetBroadcastApproval;
  expectedHash: Hash;
  serializedTransaction: Hex;
  now: number;
  consume: (serializedTransaction: Hex) => Promise<T>;
}): Promise<{ gate: TestnetBroadcastGateResult; value?: T }> {
  if (!input.chainIsTestnet || input.chainId !== 97) return { gate: { ok: false, reason: 'mainnet-blocked' } };
  if (!input.rpcConfigured) return { gate: { ok: false, reason: 'rpc-unavailable' } };
  if (!isPinConfirmedSigningSessionActive(input.session, input.now)) return { gate: { ok: false, reason: 'pin-confirmation-expired' } };
  if (!input.approval || input.now >= input.approval.expiresAt) return { gate: { ok: false, reason: 'explicit-approval-required' } };
  const hash = keccak256(input.serializedTransaction);
  if (hash !== input.expectedHash) return { gate: { ok: false, reason: 'signed-payload-mismatch' } };
  return { gate: { ok: true, hash }, value: await input.consume(input.serializedTransaction) };
}
