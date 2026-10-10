/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SECURITY_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = dirname(SECURITY_DIRECTORY);

function source(relativePath: string): string {
  return readFileSync(join(SOURCE_ROOT, relativePath), 'utf8');
}

describe('canonical migration initial freshness unavailable telemetry guard', () => {
  it('keeps the wrapper free of telemetry, logging, and raw error extraction', () => {
    const wrapper = source('components/canonical-vault-migration-loaded-start-screen-harness.tsx');
    expect(wrapper).not.toMatch(/\b(?:analytics|telemetry|sentry|captureException|track)\b/i);
    expect(wrapper).not.toMatch(/\bconsole\s*\./);
    expect(wrapper).not.toMatch(/\berror\s*\.\s*(?:message|stack|name)\b/);
    expect(wrapper).toContain('getCanonicalVaultMigrationInitialReadUnavailableCopy(error)');
  });

  it('keeps unavailable copy local and derived only from fixed owned boundary messages', () => {
    const copyCore = source('security/canonical-vault-migration-initial-read-unavailable-copy-core.ts');
    expect(copyCore).not.toMatch(/\b(?:analytics|telemetry|sentry|captureException|track)\b/i);
    expect(copyCore).not.toMatch(/\bconsole\s*\./);
    expect(copyCore).not.toMatch(/JSON\.stringify\s*\(\s*error\s*\)/);
    expect(copyCore).toContain('return GENERIC_COPY;');
  });
});
