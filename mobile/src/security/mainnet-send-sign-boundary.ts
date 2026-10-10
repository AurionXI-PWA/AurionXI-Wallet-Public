import { evaluateMainnetReadiness } from './mainnet-readiness-policy';

export type MainnetSendSignBoundary =
  | { allowed: false; stage: 'review'; reason: 'mainnet-wallet-not-created' | 'mainnet-signing-not-released' }
  | { allowed: false; stage: 'sign' | 'broadcast'; reason: 'mainnet-signing-not-released' };

/**
 * A common send/review UI may render Mainnet details in a future release, but
 * this preview cannot sign or broadcast Mainnet transactions. The guard is
 * intentionally independent of UI state, environment variables and RPC data.
 */
export function evaluateMainnetSendSignBoundary(input: {
  stage: 'review' | 'sign' | 'broadcast';
  mainnetVaultPresent: boolean;
}): MainnetSendSignBoundary {
  if (input.stage === 'review' && !input.mainnetVaultPresent) {
    return { allowed: false, stage: 'review', reason: 'mainnet-wallet-not-created' };
  }
  evaluateMainnetReadiness('sign');
  return { allowed: false, stage: input.stage, reason: 'mainnet-signing-not-released' };
}
