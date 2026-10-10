/// <reference types="node" />

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function productionSources(directory = SRC_ROOT): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return productionSources(fullPath);
    if (!['.ts', '.tsx'].includes(extname(entry.name)) || entry.name.endsWith('.test.ts')) return [];
    return [fullPath];
  });
}

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('secret leak regression guard', () => {
  const files = productionSources();

  it('forbids production console logging and limits clipboard access to public address or sanitized support exports', () => {
    const violations = files.flatMap((path) => {
      const contents = source(path);
      const relativePath = relative(SRC_ROOT, path).replaceAll('\\', '/');
      return [
        /\bconsole\s*\./.test(contents) ? `${relativePath}: console` : null,
        /(?:expo-clipboard|@react-native-clipboard|\bClipboard\b)/.test(contents) && !['app/wallet/mainnet-readonly.tsx','components/mainnet-support-report-button.tsx'].includes(relativePath)
          ? `${relativePath}: clipboard`
          : null,
      ].filter((value): value is string => value !== null);
    });

    expect(violations).toEqual([]);
  });

  it('keeps local-account and signing APIs out of production until activation approval', () => {
    const violations = files
      .filter((path) => /(?:viem\/accounts|createWalletClient|sendTransaction|writeContract)/.test(source(path)))
      .map((path) => relative(SRC_ROOT, path).replaceAll('\\', '/'))
      .filter((path) => ![
        'security/recovery-address-derivation.ts',
        // Recovery derives only a public address; it is not an authorization
        // or transaction-signing path.
        'security/mainnet-recovery-session.ts',
        'security/synthetic-testnet-signature-foundation.ts',
        'security/testnet-native-signer-derivation.ts',
      ].includes(path));

    expect(violations).toEqual([]);
  });

  it('allows AsyncStorage only in explicit public-data adapters', () => {
    const users = files
      .filter((path) => /(?:AsyncStorage|@react-native-async-storage)/.test(source(path)))
      .map((path) => relative(SRC_ROOT, path).replaceAll('\\', '/'));

    expect(users).toEqual([
      'security/mainnet-support-report.ts',
      'storage/mainnet-public-activity-cache.ts',
      'storage/mainnet-submission-journal.ts',
      'storage/public-activity-cache.ts',
      'storage/public-native-activity-journal.ts',
      'storage/wallet-address-registry-consent.ts',
      'storage/watched-address.ts',
    ]);
  });

  it.each([
    'app/wallet/recovery.tsx',
    'app/wallet/pin.tsx',
    'app/wallet/biometric.tsx',
    'app/wallet/mainnet-recovery-view.tsx',
    'app/wallet/canonical-migration-review.tsx',
    'app/wallet/canonical-migration-review-fixture.tsx',
  ])('keeps screenshot protection on %s', (relativePath) => {
    const contents = source(join(SRC_ROOT, relativePath));
    expect(contents).toContain('useSensitiveScreenProtection();');
  });
});
