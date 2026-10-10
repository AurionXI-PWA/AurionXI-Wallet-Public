import { describe, expect, it } from 'vitest';

import {
  RecoverySecretSession,
  RecoverySecretSessionDestroyedError,
} from './recovery-secret-session';

const ZERO_ENTROPY_PHRASE = `${'abandon '.repeat(23)}art`;

describe('ephemeral recovery-secret lifetime controller', () => {
  it('copies entropy into managed ownership and overwrites the source', () => {
    const source = Uint8Array.from({ length: 32 }, (_, index) => index);
    const session = RecoverySecretSession.takeOwnership(source);
    expect([...source]).toEqual(new Array(32).fill(0));
    expect(session.destroyed).toBe(false);
    session.destroy();
  });

  it('provides the phrase only through a synchronous consumer boundary', () => {
    const session = RecoverySecretSession.takeOwnership(new Uint8Array(32));
    expect(session.withPhrase((phrase) => phrase)).toBe(ZERO_ENTROPY_PHRASE);
    session.destroy();
  });

  it('blocks nested or concurrent phrase access', () => {
    const session = RecoverySecretSession.takeOwnership(new Uint8Array(32));
    expect(() => session.withPhrase(() => session.withPhrase(() => true))).toThrow('Concurrent');
    session.destroy();
  });

  it('is idempotently destroyed and blocks all later phrase access', () => {
    const session = RecoverySecretSession.takeOwnership(new Uint8Array(32));
    session.destroy();
    session.destroy();
    expect(session.destroyed).toBe(true);
    expect(() => session.withPhrase(() => true)).toThrow(RecoverySecretSessionDestroyedError);
  });

  it('overwrites invalid source entropy before rejecting it', () => {
    const source = new Uint8Array([1, 2, 3]);
    expect(() => RecoverySecretSession.takeOwnership(source)).toThrow('invalid');
    expect([...source]).toEqual([0, 0, 0]);
  });

  it.each([16, 20, 24, 28, 32])('accepts standard BIP-39 entropy length %i', (length) => {
    const source = new Uint8Array(length);
    const session = RecoverySecretSession.takeOwnership(source);
    expect(session.withPhrase((phrase) => phrase.split(' ').length)).toBe((length * 8 + length * 8 / 32) / 11);
    session.destroy();
  });
});
