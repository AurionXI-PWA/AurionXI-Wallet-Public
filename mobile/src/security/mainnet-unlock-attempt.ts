/** Unlock-only UI lifetime. It never issues a signing authorization. */
export const MAINNET_UNLOCK_ATTEMPT_TIMEOUT_MS = 60_000;
export type MainnetUnlockAttempt = Readonly<{ generation: number; expiresAt: number }>;

/** Offer once after presentation is foreground/focused; cancellation never loops. */
export class MainnetUnlockAutoPromptGate {
  private offered = false;
  suppress(): void { this.offered = true; }
  offer(foregroundAndFocused: boolean, busy: boolean): boolean {
    if (!foregroundAndFocused || busy || this.offered) return false;
    this.offered = true;
    return true;
  }
}

export class MainnetUnlockAttemptGate {
  private generation = 0;
  private current?: MainnetUnlockAttempt;

  begin(foregroundAndFocused: boolean, now = Date.now()): MainnetUnlockAttempt | undefined {
    if (!foregroundAndFocused || this.current) return undefined;
    this.current = Object.freeze({ generation: ++this.generation, expiresAt: now + MAINNET_UNLOCK_ATTEMPT_TIMEOUT_MS });
    return this.current;
  }

  isCurrent(attempt: MainnetUnlockAttempt, now = Date.now()): boolean {
    return this.current === attempt && now < attempt.expiresAt;
  }

  retire(attempt?: MainnetUnlockAttempt): boolean {
    if (!this.current || (attempt && this.current !== attempt)) return false;
    this.current = undefined;
    return true;
  }
}
