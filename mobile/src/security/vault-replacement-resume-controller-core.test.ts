import { describe, expect, it, vi } from 'vitest';

import type { VaultReplacementJournal } from './vault-replacement-journal-core';
import { VaultReplacementResumeController } from './vault-replacement-resume-controller-core';

const resumable = { action: 'resume-candidate', state: 'resumable' } as const;
const presentJournal: VaultReplacementJournal = {
  candidatePublicAddress: '0x0000000000000000000000000000000000000002',
  createdAt: '2026-08-09T01:00:00.000Z',
  format: 'aurionxi-vault-replacement-journal-v1',
  phase: 'candidate-verified',
  targetStatus: 'present',
  transactionId: 'a'.repeat(32),
};

function setup() {
  const dependencies = {
    authenticatePin: vi.fn().mockResolvedValue(undefined),
    authenticateRecoveryOwnership: vi.fn().mockResolvedValue(undefined),
  };
  return { controller: new VaultReplacementResumeController(dependencies), dependencies };
}

describe('authenticated candidate resume controller', () => {
  it('delegates PIN verification and advances only after success', async () => {
    const { controller, dependencies } = setup();
    controller.begin(resumable, presentJournal);
    await expect(controller.authenticatePin('246810', 100)).resolves.toEqual(
      expect.objectContaining({ stage: 'awaiting-confirmation' }),
    );
    expect(dependencies.authenticatePin).toHaveBeenCalledWith('246810');
    expect(JSON.stringify(controller.getState())).not.toContain('246810');
  });

  it('does not advance after failed PIN authentication', async () => {
    const { controller, dependencies } = setup();
    dependencies.authenticatePin.mockRejectedValue(new Error('invalid'));
    controller.begin(resumable, presentJournal);
    await expect(controller.authenticatePin('000000', 100)).rejects.toThrow('invalid');
    expect(controller.getState().stage).toBe('awaiting-authentication');
  });

  it('rejects the wrong authentication method without calling a verifier', async () => {
    const { controller, dependencies } = setup();
    controller.begin(resumable, presentJournal);
    await expect(controller.authenticateRecovery('word '.repeat(12), 100)).rejects.toThrow('not allowed');
    expect(dependencies.authenticateRecoveryOwnership).not.toHaveBeenCalled();
  });

  it('requires recovery ownership verification for a corrupt target', async () => {
    const { controller, dependencies } = setup();
    const corruptJournal = { ...presentJournal, targetStatus: 'corrupt' as const };
    controller.begin(resumable, corruptJournal);
    await controller.authenticateRecovery('synthetic recovery input', 100);
    expect(dependencies.authenticateRecoveryOwnership).toHaveBeenCalledWith(
      'synthetic recovery input',
      expect.objectContaining({ transactionId: corruptJournal.transactionId, targetStatus: 'corrupt' }),
    );
    expect(controller.getState().stage).toBe('awaiting-confirmation');
  });

  it('blocks overlapping authentication attempts', async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const { controller, dependencies } = setup();
    dependencies.authenticatePin.mockReturnValue(pending);
    controller.begin(resumable, presentJournal);
    const first = controller.authenticatePin('246810', 100);
    await expect(controller.authenticatePin('246810', 101)).rejects.toThrow('already active');
    release?.();
    await first;
  });

  it('fails closed when reset occurs during authentication', async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const { controller, dependencies } = setup();
    dependencies.authenticatePin.mockReturnValue(pending);
    controller.begin(resumable, presentJournal);
    const authentication = controller.authenticatePin('246810', 100);
    controller.reset();
    release?.();
    await expect(authentication).rejects.toThrow('changed during authentication');
    expect(controller.getState().stage).toBe('idle');
  });

  it('grants scoped resume permission only after exact confirmation', async () => {
    const { controller } = setup();
    controller.begin(resumable, presentJournal);
    await controller.authenticatePin('246810', 100);
    controller.confirm('resume', 101);
    expect(controller.canResume(presentJournal, 101)).toBe(false);
    controller.confirm('RESUME', 102);
    expect(controller.canResume(presentJournal, 102)).toBe(true);
    expect(controller.canResume({ ...presentJournal, transactionId: 'b'.repeat(32) }, 102)).toBe(false);
  });
});
