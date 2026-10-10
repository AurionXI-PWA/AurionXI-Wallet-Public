import type { Hash } from 'viem';
import { isMainnetSendAssetId } from './mainnet-direct-production-policy';

import { createSubmittedMainnetRecord, saveMainnetSubmissionRecord, type MainnetSubmissionRecord } from '@/storage/mainnet-submission-journal';
import { broadcastMainnetHandleNatively, reconcileMainnetReceiptNatively, signMainnetReviewNatively, sendMainnetReviewNatively, type SignedMainnetTransaction, type MainnetNativeSendOutcome, type MainnetNativeReceiptState } from './mainnet-native-signer';
import { getMainnetBoundReviewFingerprint, type MainnetReviewEnvelope } from './mainnet-review-envelope';

type Signer = typeof signMainnetReviewNatively;
type Broadcaster = typeof broadcastMainnetHandleNatively;
type Persist = typeof saveMainnetSubmissionRecord;
type Reconciler = typeof reconcileMainnetReceiptNatively;

export type MainnetPreparedSignature = Readonly<{ transactionHash: Hash; senderAddress: `0x${string}` }>;
export type MainnetProductionSubmission = Readonly<{ transactionHash: Hash; record: MainnetSubmissionRecord; savedLocally?: boolean }>;
export type MainnetSendSubmission = MainnetProductionSubmission & Readonly<{ state: MainnetNativeSendOutcome['state']; errorCode?: string }>;

/**
 * JavaScript coordinates public metadata only. Raw signed bytes remain in a
 * short-lived native handle and native code owns the trusted broadcast action.
 */
export class MainnetProductionCoordinator {
  private signed?: Readonly<{ reviewFingerprint: Hash; authorizationEpoch: number; transaction: SignedMainnetTransaction }>;
  private inFlight = false;
  private generation = 0;

  constructor(
    private readonly signer: Signer = signMainnetReviewNatively,
    private readonly broadcaster: Broadcaster = broadcastMainnetHandleNatively,
    private readonly persist: Persist = saveMainnetSubmissionRecord,
    private readonly reconciler: Reconciler = reconcileMainnetReceiptNatively,
    private readonly sender: typeof sendMainnetReviewNatively = sendMainnetReviewNatively,
  ) {}

  invalidate(): void { this.signed = undefined; this.generation += 1; }

  /** Native owns one Send consent. A metadata-save error cannot undo a network outcome. */
  async send(input: { review: MainnetReviewEnvelope; authorizationEpoch: number; userConfirmed: boolean; now: number }): Promise<MainnetSendSubmission> {
    if (!input.userConfirmed) throw new Error('Explicit Mainnet Send approval is required.');
    if (this.inFlight) throw new Error('A Mainnet transfer is already completing.');
    if (!isMainnetSendAssetId(input.review.assetId)) throw new Error('Unsupported Mainnet asset.');
    this.inFlight = true;
    this.signed = undefined;
    try {
      const result = await this.sender(input.review, input.authorizationEpoch);
      const record: MainnetSubmissionRecord = Object.freeze({ ...createSubmittedMainnetRecord({
        transactionHash: result.transactionHash, senderAddress: input.review.senderAddress, recipientAddress: input.review.recipient,
        assetId: input.review.assetId, amountWei: input.review.amount.toString(), nonce: input.review.nonce, submittedAt: input.now,
      }), receiptState: result.state === 'submitted' ? 'submitted' : result.state });
      let savedLocally = true;
      try { await this.persist(record); } catch { savedLocally = false; }
      return Object.freeze({ ...result, record, savedLocally });
    } finally { this.inFlight = false; }
  }

  async signAfterBiometric(input: { review: MainnetReviewEnvelope; authorizationEpoch: number }): Promise<MainnetPreparedSignature> {
    if (this.inFlight) throw new Error('A Mainnet transfer is already completing.');
    if (!isMainnetSendAssetId(input.review.assetId)) throw new Error('Unsupported Mainnet asset.');
    this.invalidate();
    const generation = this.generation;
    const transaction = await this.signer(input.review, input.authorizationEpoch);
    if (generation !== this.generation) throw new Error('The Mainnet review was cancelled.');
    this.signed = Object.freeze({ reviewFingerprint: getMainnetBoundReviewFingerprint(input.review), authorizationEpoch: input.authorizationEpoch, transaction });
    return Object.freeze({ transactionHash: transaction.transactionHash, senderAddress: transaction.senderAddress });
  }

  async broadcastAfterExplicitApproval(input: {
    review: MainnetReviewEnvelope;
    authorizationEpoch: number;
    userConfirmed: boolean;
    now: number;
  }): Promise<MainnetProductionSubmission> {
    const pending = this.signed;
    // Remove the opaque handle before the first await and regardless of outcome.
    this.signed = undefined;
    if (!pending || pending.reviewFingerprint !== getMainnetBoundReviewFingerprint(input.review)
      || pending.authorizationEpoch !== input.authorizationEpoch) throw new Error('No matching Mainnet signature is pending.');

    if (!input.userConfirmed) throw new Error('Explicit Mainnet broadcast approval is required.');
    if (!isMainnetSendAssetId(input.review.assetId)) throw new Error('Unsupported Mainnet asset.');
    const transactionHash = await this.broadcaster({ broadcastHandle: pending.transaction.broadcastHandle, expectedHash: pending.transaction.transactionHash });

    const record = createSubmittedMainnetRecord({
      transactionHash,
      senderAddress: input.review.senderAddress,
      recipientAddress: input.review.recipient,
      assetId: input.review.assetId,
      amountWei: input.review.amount.toString(),
      nonce: input.review.nonce,
      submittedAt: input.now,
    });
    let savedLocally = true;
    try { await this.persist(record); } catch { savedLocally = false; }
    return Object.freeze({ transactionHash, record, savedLocally });
  }

  /** Status-only native reconciliation; it has no signing or submission input. */
  async reconcileReceipt(record: MainnetSubmissionRecord): Promise<MainnetNativeReceiptState> {
    return this.reconciler({ senderAddress: record.senderAddress, nonce: record.nonce, transactionHash: record.transactionHash });
  }
}
