import {
  isPinConfirmedSigningSessionActive,
  type PinConfirmedSigningSession,
} from './pin-confirmed-signing-session';
import type { PreparedTestnetTransfer } from './testnet-transfer-builder';
import type { ValidatedTransactionIntent } from './transaction-intent-policy';

export type TestnetBroadcastPreflightResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'mainnet-blocked'
        | 'signing-disabled'
        | 'rpc-unavailable'
        | 'pin-confirmation-expired'
        | 'authorization-mismatch';
    };

/**
 * Final pure preflight before a future Testnet broadcaster is allowed to run.
 * It validates only explicit capability flags and the short-lived signing
 * session. No credential, storage, RPC request, signature, or broadcast is
 * performed here.
 */
export function preflightTestnetBroadcast(input: {
  chainId: number;
  chainIsTestnet: boolean;
  signingEnabled: boolean;
  rpcConfigured: boolean;
  session: PinConfirmedSigningSession;
  intent: ValidatedTransactionIntent;
  transfer: PreparedTestnetTransfer;
  now: number;
}): TestnetBroadcastPreflightResult {
  if (!input.chainIsTestnet || input.chainId !== 97) return { ok: false, reason: 'mainnet-blocked' };
  if (!input.signingEnabled) return { ok: false, reason: 'signing-disabled' };
  if (!input.rpcConfigured) return { ok: false, reason: 'rpc-unavailable' };
  if (!isPinConfirmedSigningSessionActive(input.session, input.now)) {
    return { ok: false, reason: 'pin-confirmation-expired' };
  }
  if (
    input.transfer.chainId !== 97
    || input.intent.chainId !== 97
    || input.intent.asset.id !== input.session.assetId
    || input.intent.recipient.toLowerCase() !== input.session.recipient.toLowerCase()
    || input.intent.amount !== input.session.amount
  ) {
    return { ok: false, reason: 'authorization-mismatch' };
  }
  return { ok: true };
}
