import { NETWORK_TARGETS } from '@/config/network-targets';
import { evaluateMainnetReadiness } from '@/security/mainnet-readiness-policy';

export type MainnetReadOnlyState =
  | { state: 'locked'; reason: 'not-released' }
  | { state: 'ready-for-configuration'; reason: 'missing-rpc-or-assets' }
  | { state: 'read-only-enabled' };

/**
 * The read-only boundary intentionally creates no public client. A Mainnet
 * client can be introduced only after both release readiness and reviewed
 * runtime configuration are supplied in a later release.
 */
export function getMainnetReadOnlyState(input: {
  rpcUrlConfigured: boolean;
  arxiContractConfigured: boolean;
}): MainnetReadOnlyState {
  const release = evaluateMainnetReadiness('read');
  if (!release.allowed) return { state: 'locked', reason: release.reason };

  if (!input.rpcUrlConfigured || !input.arxiContractConfigured) {
    return { state: 'ready-for-configuration', reason: 'missing-rpc-or-assets' };
  }

  return { state: 'read-only-enabled' };
}

export function getLockedMainnetTarget() {
  return NETWORK_TARGETS.mainnet;
}
