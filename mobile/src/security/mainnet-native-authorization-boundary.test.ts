import { describe, expect, it, vi } from 'vitest';

import { revokeNativeMainnetAuthorizations } from './mainnet-native-authorization-revocation-core';

describe('native Mainnet authorization revocation boundary', () => {
  it('only requests native authorization revocation when the module is present', async () => {
    const invalidateAuthorizations = vi.fn();
    await revokeNativeMainnetAuthorizations({ invalidateAuthorizations });
    expect(invalidateAuthorizations).toHaveBeenCalledTimes(1);
    await expect(revokeNativeMainnetAuthorizations(undefined)).resolves.toBeUndefined();
  });
});
