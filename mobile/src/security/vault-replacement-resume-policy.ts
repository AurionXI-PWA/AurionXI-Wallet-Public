import type {
  VaultReplacementJournal,
  VaultReplacementRecoveryAudit,
} from './vault-replacement-journal-core';

export const VAULT_REPLACEMENT_RESUME_CONFIRMATION = 'RESUME';
export const VAULT_REPLACEMENT_RESUME_AUTHORIZATION_MS = 60_000;

type ResumeScope = {
  candidatePublicAddress: `0x${string}`;
  targetStatus: 'present' | 'corrupt';
  transactionId: string;
};

export type VaultReplacementResumeState = {
  authorizationExpiresAt?: number;
  requiredAuthentication?: 'pin' | 'recovery';
  scope?: ResumeScope;
  stage: 'idle' | 'blocked' | 'awaiting-authentication' | 'awaiting-confirmation' | 'authorized';
};

export type VaultReplacementResumeEvent =
  | {
      audit: VaultReplacementRecoveryAudit;
      journal: VaultReplacementJournal | null;
      type: 'BEGIN';
    }
  | { now: number; type: 'PIN_VERIFIED' }
  | { now: number; type: 'RECOVERY_VERIFIED' }
  | { confirmation: string; now: number; type: 'CONFIRM' }
  | { now: number; type: 'CHECK_EXPIRY' }
  | { type: 'RESET' };

export const INITIAL_VAULT_REPLACEMENT_RESUME_STATE: VaultReplacementResumeState = { stage: 'idle' };

function scopeMatchesJournal(scope: ResumeScope, journal: VaultReplacementJournal): boolean {
  return journal.phase === 'candidate-verified' &&
    scope.transactionId === journal.transactionId &&
    scope.targetStatus === journal.targetStatus &&
    scope.candidatePublicAddress.toLowerCase() === journal.candidatePublicAddress.toLowerCase();
}

export function transitionVaultReplacementResume(
  state: VaultReplacementResumeState,
  event: VaultReplacementResumeEvent,
): VaultReplacementResumeState {
  if (event.type === 'RESET') return INITIAL_VAULT_REPLACEMENT_RESUME_STATE;
  if (event.type === 'BEGIN') {
    if (
      event.audit.state !== 'resumable' ||
      event.audit.action !== 'resume-candidate' ||
      !event.journal ||
      event.journal.phase !== 'candidate-verified'
    ) {
      return { stage: 'blocked' };
    }
    return {
      requiredAuthentication: event.journal.targetStatus === 'present' ? 'pin' : 'recovery',
      scope: {
        candidatePublicAddress: event.journal.candidatePublicAddress,
        targetStatus: event.journal.targetStatus,
        transactionId: event.journal.transactionId,
      },
      stage: 'awaiting-authentication',
    };
  }
  if (event.type === 'CHECK_EXPIRY') {
    if (state.authorizationExpiresAt !== undefined && event.now >= state.authorizationExpiresAt) {
      return INITIAL_VAULT_REPLACEMENT_RESUME_STATE;
    }
    return state;
  }
  if (state.stage === 'awaiting-authentication') {
    const correctAuthentication =
      (state.requiredAuthentication === 'pin' && event.type === 'PIN_VERIFIED') ||
      (state.requiredAuthentication === 'recovery' && event.type === 'RECOVERY_VERIFIED');
    if (!correctAuthentication) return state;
    return {
      ...state,
      authorizationExpiresAt: event.now + VAULT_REPLACEMENT_RESUME_AUTHORIZATION_MS,
      stage: 'awaiting-confirmation',
    };
  }
  if (state.stage === 'awaiting-confirmation' && event.type === 'CONFIRM') {
    if (state.authorizationExpiresAt === undefined || event.now >= state.authorizationExpiresAt) {
      return INITIAL_VAULT_REPLACEMENT_RESUME_STATE;
    }
    if (event.confirmation !== VAULT_REPLACEMENT_RESUME_CONFIRMATION) return state;
    return { ...state, stage: 'authorized' };
  }
  return state;
}

export function canResumeVaultReplacementCandidate(
  state: VaultReplacementResumeState,
  journal: VaultReplacementJournal | null,
  now: number,
): boolean {
  return state.stage === 'authorized' &&
    state.authorizationExpiresAt !== undefined &&
    now < state.authorizationExpiresAt &&
    !!state.scope &&
    !!journal &&
    scopeMatchesJournal(state.scope, journal);
}
