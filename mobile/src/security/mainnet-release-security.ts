/**
 * Single source of truth for Mainnet release posture.
 *
 * This is deliberately source-controlled, not environment-controlled: an
 * RPC URL, a UI route, or a supplied chain id must never release real-fund
 * signing. A future audited production release must change this policy and
 * satisfy the full checklist in a reviewed change set.
 */
export const MAINNET_RELEASE_POSTURE = 'private-preview' as const;

export type MainnetReleaseCapability = 'read' | 'review' | 'secure-confirmation' | 'sign' | 'broadcast';

export function isMainnetCapabilityReleased(capability: MainnetReleaseCapability): boolean {
  return capability === 'read' || capability === 'review' || capability === 'secure-confirmation';
}

export type MainnetRuntimeReleaseStatus = Readonly<{
  posture: typeof MAINNET_RELEASE_POSTURE;
  signingEnabled: false;
  broadcastEnabled: false;
  nextRequiredGate: 'independent-security-audit';
}>;

/** UI-safe release state. It exposes no signing capability and contains no secrets. */
export function getMainnetRuntimeReleaseStatus(): MainnetRuntimeReleaseStatus {
  return {
    posture: MAINNET_RELEASE_POSTURE,
    signingEnabled: false,
    broadcastEnabled: false,
    nextRequiredGate: 'independent-security-audit',
  };
}

export type MainnetReleaseChecklistInput = {
  independentVaultNamespaces: boolean;
  freshPinOrBiometricConfirmation: boolean;
  publicQuoteBoundToReview: boolean;
  deterministicUnsignedTransaction: boolean;
  duplicateBroadcastProtection: boolean;
  receiptAndRevertHandling: boolean;
  recoveryAndSessionLockAudit: boolean;
  externalSecurityReview: boolean;
  productionReleaseApproval: boolean;
};

export type MainnetReleaseChecklist = {
  posture: typeof MAINNET_RELEASE_POSTURE;
  readyForAuditedSigningRelease: false;
  missing: readonly string[];
};

/**
 * Produces an auditable checklist only. It never returns a sign/broadcast
 * authorization, even when every input is true. Live capability requires a
 * separate audited production-release implementation.
 */
export function evaluateMainnetReleaseChecklist(input: MainnetReleaseChecklistInput): MainnetReleaseChecklist {
  const checks: readonly [keyof MainnetReleaseChecklistInput, string][] = [
    ['independentVaultNamespaces', 'Independent Testnet and Mainnet encrypted-vault namespaces'],
    ['freshPinOrBiometricConfirmation', 'Fresh Mainnet PIN or biometric confirmation'],
    ['publicQuoteBoundToReview', 'Public fee and pending-nonce quote bound to review'],
    ['deterministicUnsignedTransaction', 'Deterministic unsigned transaction construction'],
    ['duplicateBroadcastProtection', 'Duplicate broadcast prevention'],
    ['receiptAndRevertHandling', 'Pending, confirmed, reverted, and replacement receipt handling'],
    ['recoveryAndSessionLockAudit', 'Recovery, session lock, lifecycle, and rollback audit'],
    ['externalSecurityReview', 'Independent security review'],
    ['productionReleaseApproval', 'Explicit production release approval'],
  ];
  return {
    posture: MAINNET_RELEASE_POSTURE,
    readyForAuditedSigningRelease: false,
    missing: checks.filter(([key]) => !input[key]).map(([, label]) => label),
  };
}
