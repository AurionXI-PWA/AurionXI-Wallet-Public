import type { VaultActiveSlotRecord } from './vault-active-slot-core';
import { createCandidateActiveSlotRecord } from './vault-active-slot-core';
import type { VaultReplacementJournal } from './vault-replacement-journal-core';
import {
  planVaultReplacementPromotion,
  type VaultReplacementPromotionPlan,
} from './vault-replacement-promotion-policy';
import type { VaultReplacementResumeState } from './vault-replacement-resume-policy';
import type { VaultV3Envelope } from './vault-envelope-v3';
import type { VaultStatus } from './vault-store';

export type VaultReplacementPromotionExecutorDependencies = {
  getPrimaryStatus: () => Promise<VaultStatus>;
  readActiveSlot: () => Promise<VaultActiveSlotRecord | null>;
  readCandidate: () => Promise<VaultV3Envelope | null>;
  readJournal: () => Promise<VaultReplacementJournal | null>;
  writeActiveSlot: (record: VaultActiveSlotRecord) => Promise<void>;
  writeJournal: (journal: VaultReplacementJournal) => Promise<void>;
};

function journalMatches(left: VaultReplacementJournal, right: VaultReplacementJournal): boolean {
  return left.format === right.format &&
    left.transactionId === right.transactionId &&
    left.createdAt === right.createdAt &&
    left.phase === right.phase &&
    left.targetStatus === right.targetStatus &&
    left.candidatePublicAddress.toLowerCase() === right.candidatePublicAddress.toLowerCase();
}

function activeSlotMatches(left: VaultActiveSlotRecord, right: VaultActiveSlotRecord): boolean {
  return left.format === right.format &&
    left.activeSlot === right.activeSlot &&
    left.transactionId === right.transactionId;
}

async function writeAndVerifyJournal(
  journal: VaultReplacementJournal,
  phase: VaultReplacementJournal['phase'],
  dependencies: VaultReplacementPromotionExecutorDependencies,
): Promise<void> {
  const next = { ...journal, phase };
  await dependencies.writeJournal(next);
  const stored = await dependencies.readJournal();
  if (!stored || !journalMatches(next, stored)) {
    throw new Error('Vault replacement journal failed promotion read-back verification.');
  }
}

export async function executeNextVaultReplacementPromotionStep(
  authorization: VaultReplacementResumeState,
  dependencies: VaultReplacementPromotionExecutorDependencies,
  now = Date.now(),
): Promise<VaultReplacementPromotionPlan> {
  const [primaryStatus, activeSlot, candidate, journal] = await Promise.all([
    dependencies.getPrimaryStatus(),
    dependencies.readActiveSlot(),
    dependencies.readCandidate(),
    dependencies.readJournal(),
  ]);
  if (primaryStatus !== 'present' && primaryStatus !== 'corrupt') {
    throw new Error('Vault replacement promotion requires an existing primary vault state.');
  }
  const plan = planVaultReplacementPromotion({
    activeSlot,
    candidate,
    journal,
    primaryStatus,
  }, authorization, now);
  if (!journal || plan.action === 'fail-closed') {
    throw new Error('Vault replacement promotion state is inconsistent.');
  }

  if (plan.action === 'write-promotion-started') {
    await writeAndVerifyJournal(journal, 'promotion-started', dependencies);
  } else if (plan.action === 'activate-candidate-pointer') {
    const next = createCandidateActiveSlotRecord(journal.transactionId);
    await dependencies.writeActiveSlot(next);
    const stored = await dependencies.readActiveSlot();
    if (!stored || !activeSlotMatches(next, stored)) {
      throw new Error('Vault active-slot pointer failed promotion read-back verification.');
    }
  } else if (plan.action === 'write-candidate-authoritative') {
    await writeAndVerifyJournal(journal, 'candidate-authoritative', dependencies);
  } else if (plan.action === 'write-cleanup-pending') {
    await writeAndVerifyJournal(journal, 'cleanup-pending', dependencies);
  }
  return plan;
}
