import { afterEach, describe, expect, it } from 'vitest';

import {
  beginRecoverySecretSession,
  destroyActiveRecoverySecretSession,
  hasActiveRecoverySecretSession,
  withActiveRecoveryPhrase,
} from './recovery-secret-session-manager';

afterEach(() => destroyActiveRecoverySecretSession());

describe('recovery-secret process manager', () => {
  it('owns one active session without exposing it', () => {
    const source = new Uint8Array(32);
    beginRecoverySecretSession(source);
    expect([...source]).toEqual(new Array(32).fill(0));
    expect(hasActiveRecoverySecretSession()).toBe(true);
    expect(withActiveRecoveryPhrase((phrase) => phrase.split(' ').length)).toBe(24);
  });

  it('destroys active authority and blocks subsequent access', () => {
    beginRecoverySecretSession(new Uint8Array(32));
    destroyActiveRecoverySecretSession();
    expect(hasActiveRecoverySecretSession()).toBe(false);
    expect(() => withActiveRecoveryPhrase(() => true)).toThrow('no longer available');
  });

  it('replaces an existing session only after validating the replacement', () => {
    beginRecoverySecretSession(new Uint8Array(32));
    const invalid = new Uint8Array([1, 2, 3]);
    expect(() => beginRecoverySecretSession(invalid)).toThrow('invalid');
    expect([...invalid]).toEqual([0, 0, 0]);
    expect(hasActiveRecoverySecretSession()).toBe(true);

    beginRecoverySecretSession(new Uint8Array(32).fill(1));
    expect(hasActiveRecoverySecretSession()).toBe(true);
  });
});
