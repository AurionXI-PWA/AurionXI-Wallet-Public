import { describe, expect, it } from 'vitest';

import { validateMainnetConfigurationIntake } from './mainnet-configuration-intake';

const verifiedContract = '0x1234567890aBCdef1234567890abCDef12345678';

describe('Mainnet configuration intake', () => {
  it('fails closed for empty or unverified configuration', () => {
    expect(validateMainnetConfigurationIntake({ contractVerifiedByReleaseOwner: false })).toEqual({
      accepted: false,
      reasons: ['missing-rpc-url', 'missing-arxi-contract', 'contract-not-release-verified'],
    });
  });

  it('rejects non-HTTPS RPC URLs and malformed contracts', () => {
    expect(validateMainnetConfigurationIntake({
      rpcUrl: 'http://example.invalid', arxiContract: 'not-an-address', contractVerifiedByReleaseOwner: true,
    })).toEqual({ accepted: false, reasons: ['rpc-must-use-https', 'invalid-arxi-contract'] });
  });

  it('accepts only reviewed, syntactically valid configuration', () => {
    expect(validateMainnetConfigurationIntake({
      rpcUrl: 'https://rpc.example.invalid', arxiContract: verifiedContract, contractVerifiedByReleaseOwner: true,
    })).toEqual({ accepted: true, rpcUrl: 'https://rpc.example.invalid', arxiContract: verifiedContract });
  });
});
