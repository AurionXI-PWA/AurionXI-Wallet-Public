import type { SyntheticTestnetBroadcastAuthorization } from './synthetic-testnet-broadcast-authorization';
import { isSyntheticTestnetBroadcastAuthorizationActive } from './synthetic-testnet-broadcast-authorization';
import type { SyntheticTestnetSignature } from './synthetic-testnet-signature-foundation';
import type { PreparedSyntheticTestnetTransfer } from './synthetic-testnet-transfer-builder';

export type SyntheticTestnetBroadcastReceipt = {
  hash: `0x${string}`;
  status: 'accepted' | 'rejected';
};

export type SyntheticTestnetExecutionDependencies = {
  verifyPayloadSignature: (
    payload: PreparedSyntheticTestnetTransfer,
    signature: SyntheticTestnetSignature,
  ) => Promise<boolean>;
  broadcaster: {
    broadcast: (payload: PreparedSyntheticTestnetTransfer) => Promise<SyntheticTestnetBroadcastReceipt>;
  };
};

export type SyntheticTestnetExecutionResult =
  | { ok: true; receipt: SyntheticTestnetBroadcastReceipt }
  | { ok: false; reason: 'authorization-expired' | 'signature-invalid' | 'broadcast-failed' };

/**
 * Injectable execution harness for tests only. It owns no transport and includes
 * no real broadcaster; callers must supply a mock dependency explicitly.
 */
export async function executeSyntheticTestnetHarness(input: {
  authorization: SyntheticTestnetBroadcastAuthorization;
  payload: PreparedSyntheticTestnetTransfer;
  signature: SyntheticTestnetSignature;
  now: number;
  dependencies: SyntheticTestnetExecutionDependencies;
}): Promise<SyntheticTestnetExecutionResult> {
  if (!isSyntheticTestnetBroadcastAuthorizationActive(input.authorization, input.now)) {
    return { ok: false, reason: 'authorization-expired' };
  }
  if (!await input.dependencies.verifyPayloadSignature(input.payload, input.signature)) {
    return { ok: false, reason: 'signature-invalid' };
  }
  try {
    return { ok: true, receipt: await input.dependencies.broadcaster.broadcast(input.payload) };
  } catch {
    return { ok: false, reason: 'broadcast-failed' };
  }
}
