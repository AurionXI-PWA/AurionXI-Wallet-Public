import {
  validateMainnetConfigurationIntake,
  type MainnetConfigurationInput,
} from '@/config/mainnet-configuration-intake';
import { NETWORK_TARGETS } from '@/config/network-targets';
import {
  evaluateMainnetReleaseReadiness,
  type MainnetReleaseEvidence,
} from './mainnet-release-readiness';
import { areVaultNamespacesSeparated } from './vault-network-namespace';

export type MainnetReadOnlyActivationPlan = {
  state: 'locked';
  target: typeof NETWORK_TARGETS.mainnet;
  prerequisites: {
    configurationAccepted: boolean;
    vaultNamespacesSeparated: boolean;
    releaseEvidenceComplete: boolean;
  };
  nextSteps: readonly string[];
};

/**
 * Creates a transparent readiness report only. It cannot create an RPC client
 * or unlock Mainnet; that requires a later, separately reviewed release.
 */
export function createMainnetReadOnlyActivationPlan(input: {
  configuration: MainnetConfigurationInput;
  evidence: MainnetReleaseEvidence;
}): MainnetReadOnlyActivationPlan {
  const configuration = validateMainnetConfigurationIntake(input.configuration);
  const release = evaluateMainnetReleaseReadiness(input.evidence);
  const namespacesSeparated = areVaultNamespacesSeparated('bsc-testnet', 'bsc-mainnet');
  const nextSteps = [
    ...(configuration.accepted ? [] : ['Provide reviewed HTTPS RPC and verified production ARXI contract metadata.']),
    ...(namespacesSeparated ? [] : ['Establish separate Testnet and Mainnet encrypted-vault namespaces.']),
    ...(release.ready ? [] : ['Complete the independent Mainnet release checklist.']),
    'Run controlled Mainnet read-only validation before any signing capability is considered.',
  ];

  return {
    state: 'locked',
    target: NETWORK_TARGETS.mainnet,
    prerequisites: {
      configurationAccepted: configuration.accepted,
      vaultNamespacesSeparated: namespacesSeparated,
      releaseEvidenceComplete: release.ready,
    },
    nextSteps,
  };
}

