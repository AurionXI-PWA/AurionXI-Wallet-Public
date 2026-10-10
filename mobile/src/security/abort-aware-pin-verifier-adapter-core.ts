export const ABORT_AWARE_PIN_VERIFIER_CANCELLED_MESSAGE = 'PIN verification was cancelled.';

export type AbortAwarePinVerifierProvider = (
  pin: string,
  signal: AbortSignal,
) => Promise<void> | void;

export type AbortAwarePinVerifier = (pin: string, signal: AbortSignal) => Promise<void>;

export function createAbortAwarePinVerifier(
  provider: AbortAwarePinVerifierProvider,
): AbortAwarePinVerifier {
  return (pin, signal) => new Promise((resolve, reject) => {
    let settled = false;
    const settle = (next: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', cancel);
      next();
    };
    const cancel = () => settle(() => reject(new Error(ABORT_AWARE_PIN_VERIFIER_CANCELLED_MESSAGE)));

    if (signal.aborted) {
      cancel();
      return;
    }
    signal.addEventListener('abort', cancel, { once: true });
    let authentication: Promise<void>;
    try {
      authentication = Promise.resolve(provider(pin, signal));
    } catch (error) {
      settle(() => reject(error));
      return;
    }
    authentication.then(
      () => settle(resolve),
      (error) => settle(() => reject(error)),
    );
  });
}
