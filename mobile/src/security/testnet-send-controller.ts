import { createPinConfirmedSigningSession, type PinConfirmedSigningSession } from './pin-confirmed-signing-session';
import { preflightTestnetBroadcast } from './testnet-broadcast-preflight';
import { evaluateTestnetFeeReadiness } from './testnet-fee-readiness';
import { authorizeTestnetSend, type TestnetSendAuthorization } from './testnet-send-authorization';
import { prepareTestnetTransfer, type PreparedTestnetTransfer } from './testnet-transfer-builder';
import { validateTestnetTransactionIntent, type TransactionIntentInput, type ValidatedTransactionIntent } from './transaction-intent-policy';

export type TestnetSendControllerReady = {
  ok: true;
  intent: ValidatedTransactionIntent;
  authorization: TestnetSendAuthorization;
  session: PinConfirmedSigningSession;
  transfer: PreparedTestnetTransfer;
};

export type TestnetSendControllerResult =
  | TestnetSendControllerReady
  | { ok: false; stage: 'review' | 'fee' | 'authorization' | 'pin' | 'preflight'; reason: string };

/**
 * Orchestrates Testnet send safety checks up to (but never including) signing
 * or broadcast. Every successful result remains an in-memory, short-lived
 * request that a separately reviewed executor must consume.
 */
export function prepareTestnetSendController(input: {
  review: TransactionIntentInput;
  vaultUnlocked: boolean;
  walletSecretsEnabled: boolean;
  reviewConfirmed: boolean;
  nativeBalanceWei?: bigint;
  gasPriceWei?: bigint;
  pinVerifiedAt: number;
  rpcConfigured: boolean;
  now: number;
}): TestnetSendControllerResult {
  const reviewed = validateTestnetTransactionIntent(input.review);
  if (!reviewed.ok) return { ok: false, stage: 'review', reason: reviewed.reason };

  const fee = evaluateTestnetFeeReadiness({
    intent: reviewed.intent,
    nativeBalanceWei: input.nativeBalanceWei,
    gasPriceWei: input.gasPriceWei,
  });
  if (fee.state !== 'ready') return { ok: false, stage: 'fee', reason: fee.state };

  const authorized = authorizeTestnetSend({
    vaultUnlocked: input.vaultUnlocked,
    walletSecretsEnabled: input.walletSecretsEnabled,
    signingEnabled: input.review.signingEnabled,
    reviewConfirmed: input.reviewConfirmed,
    now: input.now,
    intent: reviewed.intent,
  });
  if (!authorized.ok) return { ok: false, stage: 'authorization', reason: authorized.reason };

  const signing = createPinConfirmedSigningSession({
    vaultUnlocked: input.vaultUnlocked,
    sendAuthorization: authorized.authorization,
    pinVerifiedAt: input.pinVerifiedAt,
    now: input.now,
  });
  if (!signing.ok) return { ok: false, stage: 'pin', reason: signing.reason };

  let transfer: PreparedTestnetTransfer;
  try {
    transfer = prepareTestnetTransfer({ authorization: authorized.authorization, intent: reviewed.intent, now: input.now });
  } catch {
    return { ok: false, stage: 'authorization', reason: 'payload-preparation-failed' };
  }
  const preflight = preflightTestnetBroadcast({
    chainId: input.review.chainId,
    chainIsTestnet: input.review.chainIsTestnet,
    signingEnabled: input.review.signingEnabled,
    rpcConfigured: input.rpcConfigured,
    session: signing.session,
    intent: reviewed.intent,
    transfer,
    now: input.now,
  });
  if (!preflight.ok) return { ok: false, stage: 'preflight', reason: preflight.reason };

  return { ok: true, intent: reviewed.intent, authorization: authorized.authorization, session: signing.session, transfer };
}
