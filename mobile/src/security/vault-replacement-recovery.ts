import { auditVaultReplacementRecovery } from './vault-replacement-journal-core';
import { readVaultReplacementJournal } from './vault-replacement-journal-store';
import { readVaultV3Candidate } from './vault-store';

export async function auditStoredVaultReplacementRecovery() {
  const [candidate, journal] = await Promise.all([
    readVaultV3Candidate(),
    readVaultReplacementJournal(),
  ]);
  return auditVaultReplacementRecovery(candidate, journal);
}
