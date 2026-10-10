import { describe, expect, it } from 'vitest';

import { createMainnetReadOnlyActivationPlan } from './mainnet-readonly-activation-plan';

const emptyEvidence = {
  productionArxiContractVerified: false,
  productionRpcReviewed: false,
  vaultNamespacesSeparated: false,
  readOnlyValidationPassed: false,
  transactionReviewValidated: false,
  releaseOwnerApproved: false,
};

describe('Mainnet read-only activation plan', () => {
  it('fails closed while clearly listing missing prerequisites', () => {
    const plan = createMainnetReadOnlyActivationPlan({
      configuration: { contractVerifiedByReleaseOwner: false },
      evidence: emptyEvidence,
    });
    expect(plan.state).toBe('locked');
    expect(plan.target.chainId).toBe(56);
    expect(plan.prerequisites).toEqual({
      configurationAccepted: false,
      vaultNamespacesSeparated: true,
      releaseEvidenceComplete: false,
    });
    expect(plan.nextSteps).toHaveLength(3);
  });

  it('stays locked even when all declarative evidence is present', () => {
    const plan = createMainnetReadOnlyActivationPlan({
      configuration: {
        rpcUrl: 'https://rpc.example.invalid',
        arxiContract: '0x1234567890aBCdef1234567890abCDef12345678',
        contractVerifiedByReleaseOwner: true,
      },
      evidence: { ...emptyEvidence, productionArxiContractVerified: true, productionRpcReviewed: true, vaultNamespacesSeparated: true, readOnlyValidationPassed: true, transactionReviewValidated: true, releaseOwnerApproved: true },
    });
    expect(plan).toMatchObject({
      state: 'locked',
      prerequisites: { configurationAccepted: true, vaultNamespacesSeparated: true, releaseEvidenceComplete: true },
    });
  });
});
