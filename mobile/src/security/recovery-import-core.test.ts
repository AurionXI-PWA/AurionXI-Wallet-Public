import { describe, expect, it, vi } from 'vitest';

import { beginImportedRecoverySession } from './recovery-import-core';

const VALID_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('validated recovery import orchestration', () => {
  it('does not process input while wallet-secret handling is disabled', () => {
    const beginSession = vi.fn();
    expect(() => beginImportedRecoverySession(VALID_PHRASE, {
      beginSession,
      walletSecretFeatureEnabled: false,
    })).toThrow('disabled');
    expect(beginSession).not.toHaveBeenCalled();
  });

  it('validates and transfers the official zero-entropy vector', () => {
    let entropyBeforeTransfer: number[] = [];
    beginImportedRecoverySession(VALID_PHRASE, {
      beginSession: (entropy) => { entropyBeforeTransfer = [...entropy]; },
      walletSecretFeatureEnabled: true,
    });
    expect(entropyBeforeTransfer).toEqual(new Array(16).fill(0));
  });

  it('accepts normalized case and whitespace without changing derivation', () => {
    let entropyBeforeTransfer: number[] = [];
    beginImportedRecoverySession(`  ${VALID_PHRASE.toUpperCase()}\n`, {
      beginSession: (entropy) => { entropyBeforeTransfer = [...entropy]; },
      walletSecretFeatureEnabled: true,
    });
    expect(entropyBeforeTransfer).toEqual(new Array(16).fill(0));
  });

  it('rejects checksum failure before session transfer', () => {
    const beginSession = vi.fn();
    expect(() => beginImportedRecoverySession(VALID_PHRASE.replace(/about$/, 'abandon'), {
      beginSession,
      walletSecretFeatureEnabled: true,
    })).toThrow('validation failed');
    expect(beginSession).not.toHaveBeenCalled();
  });

  it('returns generic errors without phrase content', () => {
    try {
      beginImportedRecoverySession('not a recovery phrase', {
        beginSession: vi.fn(),
        walletSecretFeatureEnabled: true,
      });
      throw new Error('Expected import rejection.');
    } catch (error) {
      expect(String(error)).not.toContain('not a recovery phrase');
    }
  });
});
