import { describe, expect, it } from 'vitest';

import { MAINNET_DEVICE_LOCAL_VAULT_CAPABILITY } from './mainnet-vault-capability';

describe('Mainnet device-local vault capability', () => {
  it('permits only local vault operations while Mainnet remains fail-closed for funds movement', () => {
    expect(MAINNET_DEVICE_LOCAL_VAULT_CAPABILITY).toMatchObject({
      enabled: true,
      releasePosture: 'private-preview',
      signingEnabled: false,
      broadcastEnabled: false,
    });
  });
});
