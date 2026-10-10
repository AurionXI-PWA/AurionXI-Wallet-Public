import { describe, expect, it } from 'vitest';

import { createSyntheticTestnetSignerAdapter } from './synthetic-testnet-signer-adapter';

describe('synthetic Testnet signer adapter boundary', () => {
  it('is unavailable outside debug builds', () => {
    const adapter = createSyntheticTestnetSignerAdapter({
      debugBuild: false, walletSecretsEnabled: true, signingEnabled: true,
    });
    expect(adapter.getStatus()).toEqual({ available: false, reason: 'debug-build-required' });
  });

  it('remains fail-closed when either security feature is disabled', () => {
    expect(createSyntheticTestnetSignerAdapter({
      debugBuild: true, walletSecretsEnabled: false, signingEnabled: true,
    }).getStatus()).toEqual({ available: false, reason: 'wallet-secrets-disabled' });
    expect(createSyntheticTestnetSignerAdapter({
      debugBuild: true, walletSecretsEnabled: true, signingEnabled: false,
    }).getStatus()).toEqual({ available: false, reason: 'signing-disabled' });
  });

  it('cannot sign even when all future feature prerequisites are supplied', async () => {
    const adapter = createSyntheticTestnetSignerAdapter({
      debugBuild: true, walletSecretsEnabled: true, signingEnabled: true,
    });
    await expect(adapter.sign({} as never)).rejects.toThrow('not enabled');
  });
});
