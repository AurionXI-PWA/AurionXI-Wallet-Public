/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SECURITY_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = dirname(SECURITY_DIRECTORY);
const WRAPPER_SOURCE = readFileSync(
  join(SOURCE_ROOT, 'components/canonical-vault-migration-loaded-start-screen-harness.tsx'),
  'utf8',
);

describe('canonical migration initial freshness lifecycle source guard', () => {
  it('keeps exact-active gating at cold start', () => {
    expect(WRAPPER_SOURCE).toContain('isCanonicalVaultMigrationInitialReadAppActive(AppState.currentState)');
    expect(WRAPPER_SOURCE).toContain('if (!appIsActive) return undefined;');
  });

  it('keeps lifecycle transitions bound to one state coordinator', () => {
    expect(WRAPPER_SOURCE).toContain("AppState.addEventListener('change'");
    expect(WRAPPER_SOURCE).toContain('appStateCoordinator.foreground()');
    expect(WRAPPER_SOURCE).toContain('appStateCoordinator.background()');
    expect(WRAPPER_SOURCE).toContain('subscription.remove()');
  });

  it('invalidates attempts before background pause and foreground replacement reads', () => {
    const invalidationCount = WRAPPER_SOURCE.match(/initialReadAttemptGate\.invalidate\(\)/g)?.length ?? 0;
    expect(invalidationCount).toBeGreaterThanOrEqual(2);
    expect(WRAPPER_SOURCE).toContain('setAppIsActive(false);');
    expect(WRAPPER_SOURCE).toContain('setAppIsActive(true);');
    expect(WRAPPER_SOURCE).toContain('setReadSequence((current) => current + 1);');
  });

  it('keeps unmount cleanup for both lifecycle subscription and pending freshness read', () => {
    expect(WRAPPER_SOURCE).toContain('createCanonicalVaultMigrationInitialReadLifecycleDisposer(');
    expect(WRAPPER_SOURCE).toContain('() => subscription.remove())');
    expect(WRAPPER_SOURCE).toContain('return disposer.dispose;');
    expect(WRAPPER_SOURCE).toContain('const abortController = new AbortController();');
    expect(WRAPPER_SOURCE).toContain('loadEligibleSnapshot(abortController.signal)');
    expect(WRAPPER_SOURCE).toContain('abortController.abort();');
    expect(WRAPPER_SOURCE).toContain('attempt.retire();');
  });

  it('releases the retry request gate only after exact active-state permission', () => {
    const activeGateIndex = WRAPPER_SOURCE.indexOf('if (!appIsActive) return undefined;');
    const releaseIndex = WRAPPER_SOURCE.indexOf('retryRequestGate.release();');
    expect(activeGateIndex).toBeGreaterThanOrEqual(0);
    expect(releaseIndex).toBeGreaterThan(activeGateIndex);
    expect(WRAPPER_SOURCE).toContain('new CanonicalVaultMigrationInitialReadRetryRequestGate()');
    expect(WRAPPER_SOURCE).toContain('if (!retryRequestGate.tryBegin()) return;');
  });
});
