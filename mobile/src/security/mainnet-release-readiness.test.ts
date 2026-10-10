import { describe, expect, it } from 'vitest';

import { evaluateMainnetReleaseReadiness } from './mainnet-release-readiness';

const noEvidence = {
  productionArxiContractVerified: false,
  productionRpcReviewed: false,
  vaultNamespacesSeparated: false,
  readOnlyValidationPassed: false,
  transactionReviewValidated: false,
  releaseOwnerApproved: false,
};

describe('Mainnet release readiness', () => {
  it('fails closed with no evidence', () => {
    expect(evaluateMainnetReleaseReadiness(noEvidence)).toEqual({
      ready: false,
      missing: [
        'productionArxiContractVerified',
        'productionRpcReviewed',
        'vaultNamespacesSeparated',
        'readOnlyValidationPassed',
        'transactionReviewValidated',
        'releaseOwnerApproved',
      ],
    });
  });

  it('requires every independent evidence item', () => {
    const almostReady = { ...noEvidence, productionArxiContractVerified: true, productionRpcReviewed: true, vaultNamespacesSeparated: true, readOnlyValidationPassed: true, transactionReviewValidated: true };
    expect(evaluateMainnetReleaseReadiness(almostReady)).toEqual({ ready: false, missing: ['releaseOwnerApproved'] });
  });

  it('reports ready only after all evidence is supplied', () => {
    expect(evaluateMainnetReleaseReadiness({ ...noEvidence, productionArxiContractVerified: true, productionRpcReviewed: true, vaultNamespacesSeparated: true, readOnlyValidationPassed: true, transactionReviewValidated: true, releaseOwnerApproved: true })).toEqual({ ready: true, missing: [] });
  });
});
