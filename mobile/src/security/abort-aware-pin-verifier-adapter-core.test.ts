import { describe, expect, it, vi } from 'vitest';

import {
  ABORT_AWARE_PIN_VERIFIER_CANCELLED_MESSAGE,
  createAbortAwarePinVerifier,
} from './abort-aware-pin-verifier-adapter-core';

describe('abort-aware PIN verifier adapter foundation', () => {
  it('does not invoke the provider when already aborted', async () => {
    const provider = vi.fn();
    const verifier = createAbortAwarePinVerifier(provider);
    const abortController = new AbortController();
    abortController.abort();
    await expect(verifier('123456', abortController.signal))
      .rejects.toThrow(ABORT_AWARE_PIN_VERIFIER_CANCELLED_MESSAGE);
    expect(provider).not.toHaveBeenCalled();
  });

  it('forwards the signal and resolves provider success', async () => {
    const provider = vi.fn().mockResolvedValue(undefined);
    const verifier = createAbortAwarePinVerifier(provider);
    const abortController = new AbortController();
    await expect(verifier('123456', abortController.signal)).resolves.toBeUndefined();
    expect(provider).toHaveBeenCalledWith('123456', abortController.signal);
  });

  it('settles cancellation even when the provider never settles', async () => {
    const provider = vi.fn(() => new Promise<void>(() => undefined));
    const verifier = createAbortAwarePinVerifier(provider);
    const abortController = new AbortController();
    const pending = verifier('123456', abortController.signal);
    abortController.abort();
    await expect(pending).rejects.toThrow(ABORT_AWARE_PIN_VERIFIER_CANCELLED_MESSAGE);
  });

  it('ignores late provider completion after cancellation', async () => {
    let resolveProvider: (() => void) | undefined;
    const verifier = createAbortAwarePinVerifier(() => new Promise<void>((resolve) => {
      resolveProvider = resolve;
    }));
    const abortController = new AbortController();
    const pending = verifier('123456', abortController.signal);
    abortController.abort();
    resolveProvider?.();
    await expect(pending).rejects.toThrow(ABORT_AWARE_PIN_VERIFIER_CANCELLED_MESSAGE);
  });

  it('preserves provider rejection without adding the submitted PIN', async () => {
    const verifier = createAbortAwarePinVerifier(
      vi.fn().mockRejectedValue(new Error('verification failed')),
    );
    const abortController = new AbortController();
    await expect(verifier('123456', abortController.signal)).rejects.toThrow('verification failed');
    try {
      await verifier('123456', new AbortController().signal);
    } catch (error) {
      expect(String(error)).not.toContain('123456');
    }
  });
});
