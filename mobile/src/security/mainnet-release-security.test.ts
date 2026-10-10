import { describe, expect, it } from 'vitest';

import { evaluateMainnetReleaseChecklist, getMainnetRuntimeReleaseStatus, isMainnetCapabilityReleased, MAINNET_RELEASE_POSTURE } from './mainnet-release-security';

describe('Mainnet release security', () => {
  it('permits only read, review, and secure confirmation in private preview', () => {
    expect(MAINNET_RELEASE_POSTURE).toBe('private-preview');
    expect(isMainnetCapabilityReleased('read')).toBe(true);
    expect(isMainnetCapabilityReleased('review')).toBe(true);
    expect(isMainnetCapabilityReleased('secure-confirmation')).toBe(true);
    expect(isMainnetCapabilityReleased('sign')).toBe(false);
    expect(isMainnetCapabilityReleased('broadcast')).toBe(false);
  });

  it('never turns a checklist into a runtime signing authorization', () => {
    const result = evaluateMainnetReleaseChecklist({
      independentVaultNamespaces: true, freshPinOrBiometricConfirmation: true, publicQuoteBoundToReview: true,
      deterministicUnsignedTransaction: true, duplicateBroadcastProtection: true, receiptAndRevertHandling: true,
      recoveryAndSessionLockAudit: true, externalSecurityReview: true, productionReleaseApproval: true,
    });
    expect(result).toEqual({ posture: 'private-preview', readyForAuditedSigningRelease: false, missing: [] });
  });

  it('makes every missing production requirement visible', () => {
    const result = evaluateMainnetReleaseChecklist({
      independentVaultNamespaces: true, freshPinOrBiometricConfirmation: false, publicQuoteBoundToReview: false,
      deterministicUnsignedTransaction: false, duplicateBroadcastProtection: false, receiptAndRevertHandling: false,
      recoveryAndSessionLockAudit: false, externalSecurityReview: false, productionReleaseApproval: false,
    });
    expect(result.missing).toHaveLength(8);
  });

  it('exposes an audit-pending UI status without releasing funds capability', () => {
    expect(getMainnetRuntimeReleaseStatus()).toEqual({ posture: 'private-preview', signingEnabled: false, broadcastEnabled: false, nextRequiredGate: 'independent-security-audit' });
  });
});
