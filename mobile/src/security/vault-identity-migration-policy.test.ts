import { describe, expect, it } from 'vitest';

import type { VaultV3Envelope } from './vault-envelope-v3';
import {
  canWriteMigratedWalletIdentity,
  INITIAL_VAULT_IDENTITY_MIGRATION_STATE,
  transitionVaultIdentityMigration,
  VAULT_IDENTITY_MIGRATION_AUTHORIZATION_MS,
  type VaultIdentityMigrationEvent,
} from './vault-identity-migration-policy';

const vault = {
  createdAt: '2026-08-09T00:00:00.000Z',
  format: 'aurionxi-vault-v3',
  payloadCiphertext: 'C'.repeat(40),
  pin: { algorithm: 'argon2id', saltHex: '1'.repeat(32), wrappedVaultKey: 'D'.repeat(40) },
  publicAddress: '0x0000000000000000000000000000000000000001',
} satisfies VaultV3Envelope;
const missingIdentity = { action: 'require-pin-migration', state: 'missing-identity' } as const;

function run(events: VaultIdentityMigrationEvent[]) {
  return events.reduce(transitionVaultIdentityMigration, INITIAL_VAULT_IDENTITY_MIGRATION_STATE);
}

describe('PIN-authenticated wallet identity migration policy', () => {
  it('requires PIN verification followed by exact confirmation', () => {
    const awaiting = run([{ audit: missingIdentity, type: 'BEGIN', vault }]);
    expect(awaiting.stage).toBe('awaiting-pin');
    const authorized = run([
      { audit: missingIdentity, type: 'BEGIN', vault },
      { now: 100, type: 'PIN_VERIFIED' },
      { confirmation: 'MIGRATE', now: 101, type: 'CONFIRM' },
    ]);
    expect(canWriteMigratedWalletIdentity(authorized, missingIdentity, vault, 101)).toBe(true);
  });

  it.each([
    { action: 'none', state: 'clean-empty' } as const,
    { action: 'none', state: 'clean-bound' } as const,
    { action: 'fail-closed', state: 'orphaned-identity' } as const,
    { action: 'fail-closed', state: 'identity-mismatch' } as const,
    { action: 'preserve-identity', state: 'corrupt-vault-with-identity' } as const,
    { action: 'block-recovery', state: 'corrupt-vault-without-identity' } as const,
    { action: 'fail-closed', state: 'unsupported' } as const,
  ])('blocks every integrity state except missing identity', (audit) => {
    expect(run([{ audit, type: 'BEGIN', vault }])).toEqual({ stage: 'blocked' });
  });

  it('blocks missing identity when the authoritative vault is unreadable', () => {
    expect(run([{ audit: missingIdentity, type: 'BEGIN', vault: null }])).toEqual({ stage: 'blocked' });
  });

  it('requires exact case-sensitive MIGRATE confirmation', () => {
    const state = run([
      { audit: missingIdentity, type: 'BEGIN', vault },
      { now: 100, type: 'PIN_VERIFIED' },
      { confirmation: 'migrate', now: 101, type: 'CONFIRM' },
    ]);
    expect(state.stage).toBe('awaiting-confirmation');
    expect(canWriteMigratedWalletIdentity(state, missingIdentity, vault, 101)).toBe(false);
  });

  it('expires at the exact boundary and reset removes authority', () => {
    const state = run([
      { audit: missingIdentity, type: 'BEGIN', vault },
      { now: 100, type: 'PIN_VERIFIED' },
      { confirmation: 'MIGRATE', now: 101, type: 'CONFIRM' },
    ]);
    expect(canWriteMigratedWalletIdentity(state, missingIdentity, vault, 100 + VAULT_IDENTITY_MIGRATION_AUTHORIZATION_MS - 1)).toBe(true);
    expect(canWriteMigratedWalletIdentity(state, missingIdentity, vault, 100 + VAULT_IDENTITY_MIGRATION_AUTHORIZATION_MS)).toBe(false);
    expect(transitionVaultIdentityMigration(state, { now: 100 + VAULT_IDENTITY_MIGRATION_AUTHORIZATION_MS, type: 'CHECK_EXPIRY' })).toEqual(INITIAL_VAULT_IDENTITY_MIGRATION_STATE);
    expect(transitionVaultIdentityMigration(state, { type: 'RESET' })).toEqual(INITIAL_VAULT_IDENTITY_MIGRATION_STATE);
  });

  it('binds authority to the exact vault address and creation timestamp', () => {
    const state = run([
      { audit: missingIdentity, type: 'BEGIN', vault },
      { now: 100, type: 'PIN_VERIFIED' },
      { confirmation: 'MIGRATE', now: 101, type: 'CONFIRM' },
    ]);
    expect(canWriteMigratedWalletIdentity(state, missingIdentity, {
      ...vault,
      publicAddress: '0x0000000000000000000000000000000000000002',
    }, 101)).toBe(false);
    expect(canWriteMigratedWalletIdentity(state, missingIdentity, {
      ...vault,
      createdAt: '2026-08-09T00:00:01.000Z',
    }, 101)).toBe(false);
  });

  it('stores no PIN, vault ciphertext, or secret payload', () => {
    const state = run([
      { audit: missingIdentity, type: 'BEGIN', vault },
      { now: 100, type: 'PIN_VERIFIED' },
    ]);
    expect(JSON.stringify(state)).not.toMatch(/pin|ciphertext|payload|phrase|private/i);
  });
});
