import { describe, expect, it } from 'vitest';

import type { VaultV3Envelope } from './vault-envelope-v3';
import { auditVaultIdentityIntegrity } from './vault-identity-integrity-core';
import { createWalletIdentityRecord } from './wallet-identity-record-core';

const vault = {
  createdAt: '2026-08-09T00:00:00.000Z',
  format: 'aurionxi-vault-v3',
  payloadCiphertext: 'C'.repeat(40),
  pin: { algorithm: 'argon2id', saltHex: '1'.repeat(32), wrappedVaultKey: 'D'.repeat(40) },
  publicAddress: '0x0000000000000000000000000000000000000001',
} satisfies VaultV3Envelope;
const identity = createWalletIdentityRecord(vault.publicAddress, vault.createdAt);

describe('startup vault-identity integrity audit', () => {
  it('recognizes clean empty and clean bound storage', () => {
    expect(auditVaultIdentityIntegrity('empty', null, null)).toEqual({ action: 'none', state: 'clean-empty' });
    expect(auditVaultIdentityIntegrity('present', vault, identity)).toEqual({ action: 'none', state: 'clean-bound' });
  });

  it('requires a future PIN migration when a valid vault has no identity', () => {
    expect(auditVaultIdentityIntegrity('present', vault, null)).toEqual({
      action: 'require-pin-migration',
      state: 'missing-identity',
    });
  });

  it('fails closed for orphaned and mismatched identity metadata', () => {
    expect(auditVaultIdentityIntegrity('empty', null, identity)).toEqual({
      action: 'fail-closed',
      state: 'orphaned-identity',
    });
    expect(auditVaultIdentityIntegrity('present', vault, {
      ...identity,
      publicAddress: '0x0000000000000000000000000000000000000002',
    })).toEqual({ action: 'fail-closed', state: 'identity-mismatch' });
    expect(auditVaultIdentityIntegrity('present', vault, {
      ...identity,
      vaultCreatedAt: '2026-08-09T00:00:01.000Z',
    })).toEqual({ action: 'fail-closed', state: 'identity-mismatch' });
  });

  it('preserves independent identity for a corrupt vault and blocks recovery without it', () => {
    expect(auditVaultIdentityIntegrity('corrupt', null, identity)).toEqual({
      action: 'preserve-identity',
      state: 'corrupt-vault-with-identity',
    });
    expect(auditVaultIdentityIntegrity('corrupt', null, null)).toEqual({
      action: 'block-recovery',
      state: 'corrupt-vault-without-identity',
    });
  });

  it('fails closed for unsupported storage or an impossible present-without-vault read', () => {
    expect(auditVaultIdentityIntegrity('unsupported', null, null)).toEqual({ action: 'fail-closed', state: 'unsupported' });
    expect(auditVaultIdentityIntegrity('present', null, identity)).toEqual({ action: 'fail-closed', state: 'identity-mismatch' });
  });
});
