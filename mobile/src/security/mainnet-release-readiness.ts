/**
 * Mainnet release is a deliberate product decision, never an automatic result
 * of Testnet success or an environment variable. This policy has no RPC or
 * wallet access; it only evaluates the documented release evidence.
 */
export type MainnetReleaseEvidence = {
  productionArxiContractVerified: boolean;
  productionRpcReviewed: boolean;
  vaultNamespacesSeparated: boolean;
  readOnlyValidationPassed: boolean;
  transactionReviewValidated: boolean;
  releaseOwnerApproved: boolean;
};

export type MainnetReleaseReadiness = {
  ready: boolean;
  missing: readonly (keyof MainnetReleaseEvidence)[];
};

const REQUIRED_EVIDENCE = [
  'productionArxiContractVerified',
  'productionRpcReviewed',
  'vaultNamespacesSeparated',
  'readOnlyValidationPassed',
  'transactionReviewValidated',
  'releaseOwnerApproved',
] as const satisfies readonly (keyof MainnetReleaseEvidence)[];

export function evaluateMainnetReleaseReadiness(
  evidence: MainnetReleaseEvidence,
): MainnetReleaseReadiness {
  const missing = REQUIRED_EVIDENCE.filter((item) => !evidence[item]);
  return { ready: missing.length === 0, missing };
}

