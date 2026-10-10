import { describe, expect, it, vi } from 'vitest';

import { RecoverySessionStartGate } from './recovery-session-start-core';

describe('native recovery-session start orchestration', () => {
  it('requests no entropy when wallet-secret handling is disabled', async () => {
    const randomBytes = vi.fn();
    await expect(new RecoverySessionStartGate().run({
      beginSession: vi.fn(),
      randomBytes,
      walletSecretFeatureEnabled: false,
    })).rejects.toThrow('disabled');
    expect(randomBytes).not.toHaveBeenCalled();
  });

  it('transfers exactly 256-bit entropy and overwrites the source', async () => {
    const entropy = new Uint8Array(32).fill(7);
    const beginSession = vi.fn();
    await new RecoverySessionStartGate().run({
      beginSession,
      randomBytes: vi.fn().mockResolvedValue(entropy),
      walletSecretFeatureEnabled: true,
    });
    expect(beginSession).toHaveBeenCalledOnce();
    expect([...entropy]).toEqual(new Array(32).fill(0));
  });

  it('overwrites entropy if ownership transfer throws', async () => {
    const entropy = new Uint8Array(32).fill(9);
    await expect(new RecoverySessionStartGate().run({
      beginSession: vi.fn(() => { throw new Error('transfer failed'); }),
      randomBytes: vi.fn().mockResolvedValue(entropy),
      walletSecretFeatureEnabled: true,
    })).rejects.toThrow('transfer failed');
    expect([...entropy]).toEqual(new Array(32).fill(0));
  });

  it('rejects concurrent starts and releases the gate after completion', async () => {
    let resolveEntropy: ((value: Uint8Array) => void) | undefined;
    const firstEntropy = new Promise<Uint8Array>((resolve) => { resolveEntropy = resolve; });
    const gate = new RecoverySessionStartGate();
    const dependencies = {
      beginSession: vi.fn(),
      randomBytes: vi.fn().mockReturnValueOnce(firstEntropy).mockResolvedValue(new Uint8Array(32)),
      walletSecretFeatureEnabled: true,
    };
    const first = gate.run(dependencies);
    await expect(gate.run(dependencies)).rejects.toThrow('already active');
    resolveEntropy?.(new Uint8Array(32));
    await first;
    await expect(gate.run(dependencies)).resolves.toBeUndefined();
  });
});
