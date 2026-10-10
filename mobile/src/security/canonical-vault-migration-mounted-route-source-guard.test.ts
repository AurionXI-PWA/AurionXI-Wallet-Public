/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function source(relativePath: string): string {
  return readFileSync(join(SOURCE_ROOT, relativePath), 'utf8');
}

describe('canonical migration mounted read-only route source guard', () => {
  const route = source('app/wallet/canonical-migration-review.tsx');
  const layout = source('app/wallet/_layout.tsx');
  const card = source('components/canonical-vault-migration-status-card.tsx');

  it('keeps the route protected and limited to the loaded read-only harness', () => {
    expect(route).toContain('useSensitiveScreenProtection();');
    expect(route).toContain('CanonicalVaultMigrationRealPinLoadedStartScreenHarness');
    expect(route).not.toMatch(/(?:executor|finaliz|write[A-Z]|sendTransaction|privateKey|mnemonic|seed)/i);
  });

  it('keeps the route declared in the wallet stack without automatic navigation', () => {
    expect(layout).toContain('name="canonical-migration-review"');
    expect(layout).toContain('title: \'Storage Optimization Review\'');
    expect(route).not.toMatch(/(?:router\.|Redirect|useEffect\s*\()/);
  });

  it('keeps the only user entry conditional on the status-card eligibility model', () => {
    expect(card).toContain('model.canReviewOptimization');
    expect(card).toContain("router.push('/wallet/canonical-migration-review')");
    expect(card).toContain('Review storage optimization');
    expect(card).not.toMatch(/(?:useEffect\s*\(|router\.replace|router\.navigate)/);
  });
});
