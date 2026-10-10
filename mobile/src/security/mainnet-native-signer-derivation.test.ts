import { describe, expect, it } from 'vitest';

import { deriveNativeMainnetSignerFromEntropy } from './mainnet-native-signer-derivation';

describe('Mainnet native signer derivation', () => {
  it('cannot derive a JavaScript signer in a preview build', () => {
    expect(() => deriveNativeMainnetSignerFromEntropy(new Uint8Array(32).fill(7))).toThrow('Mainnet signing is not released.');
  });
});
