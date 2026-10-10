/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function source(relativePath: string): string {
  return readFileSync(join(SOURCE_ROOT, relativePath), 'utf8');
}

describe('canonical migration write-free fixture source guard', () => {
  it('keeps fixture dependencies in-memory and free of storage, PIN, executor, and network imports', () => {
    const dependencies = source('security/canonical-vault-migration-write-free-fixture-dependencies.ts');
    expect(dependencies).toContain("'loading' | 'unavailable'");
    expect(dependencies).not.toMatch(/(?:securestore|asyncstorage|vault-store|journal-store|executor|rpc|viem|fetch|transaction)/i);
  });

  it('keeps the fixture route debug-only and distinct from the production review route', () => {
    const route = source('app/wallet/canonical-migration-review-fixture.tsx');
    expect(route).toContain('if (!__DEV__) return <Redirect href="/wallet" />;');
    expect(route).toContain('getCanonicalVaultMigrationWriteFreeFixtureDependencies');
    expect(route).toContain('useSensitiveScreenProtection();');
    expect(route).not.toMatch(/(?:CanonicalVaultMigrationRealPinLoaded|executor|securestore|asyncstorage|router\.)/i);
  });
});
