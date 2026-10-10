import { auditRetiredPrimaryCleanupPreDeletion } from './retired-primary-cleanup-pre-deletion-audit-core';
import { readStoredRetiredPrimaryCleanupSnapshot } from './retired-primary-cleanup-snapshot';

export async function auditStoredRetiredPrimaryCleanupPreDeletion() {
  return auditRetiredPrimaryCleanupPreDeletion(
    await readStoredRetiredPrimaryCleanupSnapshot(),
  );
}
