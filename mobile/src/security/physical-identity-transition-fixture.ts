import { createCandidateActiveSlotRecord } from './vault-active-slot-core';
import { readVaultActiveSlot, writeVaultActiveSlot } from './vault-active-slot-store';
import { generateArgon2SaltHex } from './secure-random';
import { createVaultV3WithDependencies, unlockVaultV3WithPin } from './vault-envelope-v3-core';
import { createVerifiedCandidateJournal } from './vault-replacement-journal-core';
import {
  deleteVaultReplacementJournal,
  readVaultReplacementJournal,
  writeVaultReplacementJournal,
} from './vault-replacement-journal-store';
import { nativeVaultV3Dependencies } from './vault-v3-workflow';
import {
  deleteVaultV3Candidate,
  getVaultStatus,
  readVaultV3Candidate,
  writeVaultV3Candidate,
} from './vault-store';
import { authenticateEncryptedVaultWithRetry } from './vault-workflow';
import { readWalletIdentityRecord } from './wallet-identity-record-store';
import { readWalletIdentityTransitionJournal } from './wallet-identity-transition-journal-store';

const PUBLIC_TEST_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;
const FIXTURE_PAYLOAD = new TextEncoder().encode('aurionxi-pin-security-preview-v1');

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export async function stagePhysicalIdentityTransitionFixture(pin: string): Promise<void> {
  if (!__DEV__) throw new Error('Physical transition fixtures are disabled outside debug builds.');
  const [status, activeSlot, candidate, replacementJournal, transitionJournal, identity] = await Promise.all([
    getVaultStatus(),
    readVaultActiveSlot(),
    readVaultV3Candidate(),
    readVaultReplacementJournal(),
    readWalletIdentityTransitionJournal(),
    readWalletIdentityRecord(),
  ]);
  if (
    status !== 'present' ||
    (activeSlot !== null && activeSlot.activeSlot !== 'primary') ||
    candidate ||
    replacementJournal ||
    transitionJournal ||
    !identity
  ) {
    throw new Error('Physical transition fixture requires clean primary-only test storage.');
  }

  await authenticateEncryptedVaultWithRetry(pin);
  const publicAddress = PUBLIC_TEST_ADDRESS;
  if (publicAddress.toLowerCase() === identity.publicAddress.toLowerCase()) {
    throw new Error('Physical transition fixture address must differ from current identity.');
  }
  const transactionId = await generateArgon2SaltHex();
  const envelope = await createVaultV3WithDependencies({
    createdAt: new Date().toISOString(),
    payload: FIXTURE_PAYLOAD,
    pin,
    pinConfirmation: pin,
    publicAddress,
  }, nativeVaultV3Dependencies);

  let candidateWritten = false;
  let journalWritten = false;
  try {
    await writeVaultV3Candidate(envelope);
    candidateWritten = true;
    const stored = await readVaultV3Candidate();
    if (!stored) throw new Error('Physical transition candidate read-back failed.');
    const payload = await unlockVaultV3WithPin(stored, pin, nativeVaultV3Dependencies);
    if (!equalBytes(payload, FIXTURE_PAYLOAD)) throw new Error('Physical transition candidate verification failed.');
    const journal = {
      ...createVerifiedCandidateJournal(stored, 'present', transactionId, new Date().toISOString()),
      phase: 'cleanup-pending' as const,
    };
    await writeVaultReplacementJournal(journal);
    journalWritten = true;
    const storedJournal = await readVaultReplacementJournal();
    if (!storedJournal || storedJournal.transactionId !== transactionId || storedJournal.phase !== 'cleanup-pending') {
      throw new Error('Physical transition replacement journal read-back failed.');
    }
    await writeVaultActiveSlot(createCandidateActiveSlotRecord(transactionId));
    const storedPointer = await readVaultActiveSlot();
    if (storedPointer?.activeSlot !== 'candidate' || storedPointer.transactionId !== transactionId) {
      throw new Error('Physical transition active pointer read-back failed.');
    }
  } catch (error) {
    if (journalWritten) await deleteVaultReplacementJournal().catch(() => undefined);
    if (candidateWritten) await deleteVaultV3Candidate().catch(() => undefined);
    throw error;
  }
}
