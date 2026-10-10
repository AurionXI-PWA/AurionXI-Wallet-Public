/// <reference types="node" />

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const APP_DIRECTORY = join(SOURCE_ROOT, 'app');

function appSourceFiles(directory = APP_DIRECTORY): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return appSourceFiles(fullPath);
    return ['.ts', '.tsx'].includes(extname(entry.name)) ? [fullPath] : [];
  });
}

describe('canonical migration mounted integration gate', () => {
  it('allows the real-PIN loaded migration wrapper only in the approved review route', () => {
    const importers = appSourceFiles()
      .filter((path) => readFileSync(path, 'utf8').includes(
        'CanonicalVaultMigrationRealPinLoadedStartScreenHarness',
      ))
      .map((path) => relative(SOURCE_ROOT, path).replaceAll('\\', '/'));
    expect(importers).toEqual(['app/wallet/canonical-migration-review.tsx']);
  });
});
