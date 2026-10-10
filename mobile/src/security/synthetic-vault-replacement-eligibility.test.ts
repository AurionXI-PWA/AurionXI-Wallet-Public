import { describe, expect, it } from 'vitest';

import { assessSyntheticVaultReplacementEligibility } from './synthetic-vault-replacement-eligibility';

describe('synthetic vault replacement eligibility', () => {
  it('allows only the exact legacy synthetic preview payload and zeroizes it', () => {
    const payload = new TextEncoder().encode('aurionxi-pin-security-preview-v1');
    expect(assessSyntheticVaultReplacementEligibility(payload)).toEqual({ eligible: true });
    expect([...payload]).toEqual(new Array(payload.length).fill(0));
  });

  it('blocks non-synthetic payloads without exposing their contents', () => {
    const payload = new Uint8Array([1, 2, 3]);
    expect(assessSyntheticVaultReplacementEligibility(payload)).toEqual({ eligible: false, reason: 'payload-mismatch' });
    expect([...payload]).toEqual([0, 0, 0]);
  });
});
