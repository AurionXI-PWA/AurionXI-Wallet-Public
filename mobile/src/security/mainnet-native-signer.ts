import { type Address, type Hash } from 'viem';
import { NativeModules, Platform } from 'react-native';

import type { MainnetReviewEnvelope } from './mainnet-review-envelope';
import { parseMainnetRecoveryDiagnostics, type MainnetRecoveryDiagnostics } from './mainnet-native-recovery-diagnostics';
import type { MainnetSubmissionRecord } from '@/storage/mainnet-submission-journal';
import { isMainnetSubmissionRecord } from './mainnet-transfer-history-policy';

type NativeSigningResult = Readonly<{
  signed: boolean;
  broadcastHandle: string;
  transactionHash: string;
  senderAddress: string;
}>;

type NativeMainnetSigner = Readonly<{
  available?: boolean;
  signingReleased?: boolean;
  signNativeMainnetTransfer: (review: Readonly<Record<string, unknown>>, authorizationEpoch: number) => Promise<NativeSigningResult>;
  broadcastNativeMainnetTransfer: (broadcastHandle: string, expectedHash: string) => Promise<string>;
  reconcileNativeMainnetReceipt: (senderAddress: string, nonce: number, transactionHash: string) => Promise<string>;
  getNativeMainnetRecoveryDiagnostics?: (review: Readonly<Record<string, unknown>>) => Promise<unknown>;
  getCapabilities?: () => Promise<{ available?: boolean; signingReleased?: boolean }>;
  sendNativeMainnetTransfer?: (review: Readonly<Record<string, unknown>>, authorizationEpoch: number) => Promise<unknown>;
  prepareNativeMainnetReplacement?: (sender: string, nonce: number, originalHash: string, kind: 'cancel' | 'speed-up') => Promise<unknown>;
  getNativeMainnetTransferHistory?: (senderAddress: string) => Promise<unknown>;
}>;

export type SignedMainnetTransaction = Readonly<{
  broadcastHandle: string;
  transactionHash: Hash;
  senderAddress: Address;
}>;

export async function getNativeMainnetSigningCapabilities(): Promise<{ available: boolean; signingReleased: boolean }> {
  if (Platform.OS !== 'android') return { available: false, signingReleased: false };
  const module = NativeModules.AurionXIMainnetSecurity as NativeMainnetSigner | undefined;
  if (!module) return { available: false, signingReleased: false };
  if (typeof module.available === 'boolean' && typeof module.signingReleased === 'boolean') {
    return { available: module.available, signingReleased: module.signingReleased };
  }
  if (!module.getCapabilities) return { available: false, signingReleased: false };
  try {
    const result = await Promise.race([
      module.getCapabilities(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Native capability lookup timed out.')), 2_000)),
    ]);
    return { available: result.available === true, signingReleased: result.signingReleased === true };
  } catch { return { available: false, signingReleased: false }; }
}

/**
 * Sends public reviewed fields to Android. Private key, entropy, seed,
 * credentials, and the one-use native authorization never enter JavaScript.
 */
export async function signMainnetReviewNatively(review: MainnetReviewEnvelope, authorizationEpoch: number): Promise<SignedMainnetTransaction> {
  if (Platform.OS !== 'android') throw new Error('Native Mainnet signing is available only on Android.');
  if (!Number.isSafeInteger(authorizationEpoch) || authorizationEpoch < 0) throw new Error('The Mainnet authorization epoch is invalid.');
  if (!Number.isSafeInteger(review.nonce) || review.nonce < 0 || !Number.isSafeInteger(review.observedAt) || review.observedAt < 0) throw new Error('The Mainnet review is invalid.');
  const module = NativeModules.AurionXIMainnetSecurity as NativeMainnetSigner | undefined;
  if (!module?.signNativeMainnetTransfer) throw new Error('Native Mainnet signing is unavailable in this build.');
  const result = await module.signNativeMainnetTransfer({
    chainId: review.chainId,
    senderAddress: review.senderAddress,
    assetId: review.assetId,
    assetContract: review.assetContract,
    recipient: review.recipient,
    amount: review.amount.toString(),
    nonce: review.nonce.toString(),
    gas: review.gas.toString(),
    gasPrice: review.gasPrice.toString(),
    observedAt: review.observedAt.toString(),
    ...(review.replacesTransactionHash ? { replacesTransactionHash: review.replacesTransactionHash, replacementKind: review.replacementKind } : {}),
  }, authorizationEpoch);
  if (!result.signed || !HANDLE.test(result.broadcastHandle) || !HASH.test(result.transactionHash) || !ADDRESS.test(result.senderAddress)) {
    throw new Error('Native Mainnet signing returned an invalid result.');
  }
  if (result.senderAddress.toLowerCase() !== review.senderAddress.toLowerCase()) {
    throw new Error('Native Mainnet signing result does not match the reviewed sender or transaction hash.');
  }
  return { broadcastHandle: result.broadcastHandle, transactionHash: result.transactionHash as Hash, senderAddress: result.senderAddress as Address };
}

export async function broadcastMainnetHandleNatively(input: { broadcastHandle: string; expectedHash: Hash }): Promise<Hash> {
  if (Platform.OS !== 'android' || !HANDLE.test(input.broadcastHandle) || !HASH.test(input.expectedHash)) throw new Error('Native Mainnet broadcast input is invalid.');
  const module = NativeModules.AurionXIMainnetSecurity as NativeMainnetSigner | undefined;
  if (!module?.broadcastNativeMainnetTransfer) throw new Error('Native Mainnet broadcast is unavailable in this build.');
  const result = await module.broadcastNativeMainnetTransfer(input.broadcastHandle, input.expectedHash);
  if (!HASH.test(result) || result.toLowerCase() !== input.expectedHash.toLowerCase()) throw new Error('Native Mainnet broadcast returned an invalid hash.');
  return result as Hash;
}

export type MainnetNativeReceiptState = 'pending' | 'confirmed' | 'reverted' | 'unknown' | 'not-submitted' | 'cancelled';

export async function reconcileMainnetReceiptNatively(input: { senderAddress: Address; nonce: number; transactionHash: Hash }): Promise<MainnetNativeReceiptState> {
  if (Platform.OS !== 'android' || !ADDRESS.test(input.senderAddress) || !Number.isSafeInteger(input.nonce) || input.nonce < 0 || !HASH.test(input.transactionHash)) throw new Error('Native Mainnet reconciliation input is invalid.');
  const module = NativeModules.AurionXIMainnetSecurity as NativeMainnetSigner | undefined;
  if (!module?.reconcileNativeMainnetReceipt) throw new Error('Native Mainnet reconciliation is unavailable.');
  const result = await module.reconcileNativeMainnetReceipt(input.senderAddress, input.nonce, input.transactionHash);
  if (!['pending', 'confirmed', 'reverted', 'unknown', 'not-submitted', 'cancelled'].includes(result)) throw new Error('Native Mainnet reconciliation returned an invalid state.');
  return result as MainnetNativeReceiptState;
}

export type MainnetNativeSendOutcome = Readonly<{
  state: 'submitted' | 'submission-unknown' | 'not-submitted';
  transactionHash: Hash;
  errorCode?: string;
}>;

/** Entire consent/biometric/sign/submit journey is native; no handle or signed bytes leave it. */
export async function sendMainnetReviewNatively(review: MainnetReviewEnvelope, authorizationEpoch: number): Promise<MainnetNativeSendOutcome> {
  if (Platform.OS !== 'android' || !Number.isSafeInteger(authorizationEpoch) || authorizationEpoch < 0
    || !Number.isSafeInteger(review.nonce) || review.nonce < 0 || !Number.isSafeInteger(review.observedAt) || review.observedAt < 0) throw new Error('Invalid native Mainnet Send input.');
  const module = NativeModules.AurionXIMainnetSecurity as NativeMainnetSigner | undefined;
  if (!module?.sendNativeMainnetTransfer) throw new Error('This APK does not support the normal Mainnet Send journey.');
  const value = await module.sendNativeMainnetTransfer({ chainId: review.chainId, senderAddress: review.senderAddress,
    assetId: review.assetId, assetContract: review.assetContract, recipient: review.recipient, amount: review.amount.toString(),
    nonce: review.nonce.toString(), gas: review.gas.toString(), gasPrice: review.gasPrice.toString(), observedAt: review.observedAt.toString(), ...(review.replacesTransactionHash ? { replacesTransactionHash: review.replacesTransactionHash, replacementKind: review.replacementKind } : {}) }, authorizationEpoch);
  if (!value || typeof value !== 'object') throw new Error('Invalid native Send result; check Activity before retrying.');
  const result = value as Record<string, unknown>;
  if (!['submitted', 'submission-unknown', 'not-submitted'].includes(String(result.state)) || typeof result.transactionHash !== 'string' || !HASH.test(result.transactionHash)) throw new Error('Invalid native Send result; check Activity before retrying.');
  return Object.freeze({ state: result.state as MainnetNativeSendOutcome['state'], transactionHash: result.transactionHash as Hash,
    ...(typeof result.errorCode === 'string' ? { errorCode: result.errorCode } : {}) });
}

export async function loadMainnetTransfersNatively(senderAddress: Address): Promise<MainnetSubmissionRecord[]> {
  if (Platform.OS !== 'android' || !ADDRESS.test(senderAddress)) throw new Error('Native Mainnet history is unavailable.');
  const module = NativeModules.AurionXIMainnetSecurity as NativeMainnetSigner | undefined;
  if (!module?.getNativeMainnetTransferHistory) throw new Error('Native Mainnet history is unavailable in this APK.');
  const records = await module.getNativeMainnetTransferHistory(senderAddress);
  if (!Array.isArray(records) || records.length > 20 || records.some((record) => !isMainnetSubmissionRecord(record, senderAddress))) throw new Error('Invalid native Mainnet history.');
  return records.map((value) => {
    const record = value as MainnetSubmissionRecord;
    // Return only the public schema, even if an unexpected bridge property appears.
    return Object.freeze({ version: 1 as const, chainId: 56 as const, transactionHash: record.transactionHash,
      senderAddress: record.senderAddress, recipientAddress: record.recipientAddress, assetId: record.assetId,
      amountWei: record.amountWei, nonce: record.nonce, submittedAt: record.submittedAt, receiptState: record.receiptState,
      ...(record.replacesTransactionHash ? { replacesTransactionHash: record.replacesTransactionHash, replacementKind: record.replacementKind } : {}),
      ...(record.cancelledByHash ? { cancelledByHash: record.cancelledByHash } : {}),
      ...(record.operation ? { operation: Object.freeze({ kind: record.operation.kind, inputAsset: record.operation.inputAsset, outputAsset: record.operation.outputAsset,
        intentAmountWei: record.operation.intentAmountWei, estimatedOutWei: record.operation.estimatedOutWei, minimumOutWei: record.operation.minimumOutWei,
        ...(record.operation.receivedAmountWei ? { receivedAmountWei: record.operation.receivedAmountWei } : {}) }) } : {}),
      ...(record.blockNumber !== undefined ? { blockNumber: record.blockNumber } : {}),
      ...(record.lastCheckedAt !== undefined ? { lastCheckedAt: record.lastCheckedAt } : {}) });
  });
}

/** Public pointer only: Android resolves the original encrypted record and obtains the fee quote. */
export async function prepareMainnetReplacementNatively(sender: Address, nonce: number, originalHash: Hash, kind: 'cancel' | 'speed-up'): Promise<MainnetReviewEnvelope> {
  if (Platform.OS !== 'android' || !ADDRESS.test(sender) || !HASH.test(originalHash) || !Number.isSafeInteger(nonce) || nonce < 0) throw new Error('Invalid cancellation pointer.');
  const module = NativeModules.AurionXIMainnetSecurity as NativeMainnetSigner | undefined;
  if (!module?.prepareNativeMainnetReplacement) throw new Error('This APK does not support cancellation recovery.');
  const value = await module.prepareNativeMainnetReplacement(sender, nonce, originalHash, kind);
  if (!value || typeof value !== 'object') throw new Error('Invalid cancellation review.');
  const r = value as Record<string, unknown>;
  const contract = r.assetId === 'usdt' ? '0x55d398326f99059ff775485246999027b3197955' : r.assetId === 'arxi' ? '0x6ffec4860325f8bfb3f000354708a7d0cae4b250' : null;
  if (r.chainId !== 56 || String(r.senderAddress).toLowerCase() !== sender.toLowerCase() || !ADDRESS.test(String(r.recipient))
    || !['native-bnb', 'arxi', 'usdt'].includes(String(r.assetId)) || (contract ? String(r.assetContract).toLowerCase() !== contract : r.assetContract !== null)
    || r.replacementKind !== kind || r.nonce !== String(nonce) || String(r.replacesTransactionHash).toLowerCase() !== originalHash.toLowerCase()
    || r.gas !== (r.assetId === 'native-bnb' ? '21000' : '160000')
    || (kind === 'cancel' ? r.assetId !== 'native-bnb' || r.amount !== '0' || String(r.recipient).toLowerCase() !== sender.toLowerCase() : !/^[1-9][0-9]{0,77}$/.test(String(r.amount)))
    || !/^[1-9][0-9]{0,77}$/.test(String(r.gasPrice)) || !/^[0-9]+$/.test(String(r.observedAt))
    || !Number.isSafeInteger(Number(r.observedAt)) || Number(r.observedAt) > Date.now() || Date.now() - Number(r.observedAt) >= 90_000
    || BigInt(String(r.gasPrice)) * BigInt(String(r.gas)) > 100_000_000_000_000n) throw new Error('Invalid replacement review.');
  return Object.freeze({ chainId: 56, senderAddress: sender, recipient: r.recipient as Address, assetId: String(r.assetId), assetContract: contract,
    amount: BigInt(String(r.amount)), nonce, gas: BigInt(String(r.gas)), gasPrice: BigInt(String(r.gasPrice)), observedAt: Number(r.observedAt), replacesTransactionHash: originalHash, replacementKind: kind });
}

/** Status-only path; supplies public review fields and receives public metadata. */
export async function getMainnetRecoveryDiagnosticsNatively(review: MainnetReviewEnvelope): Promise<MainnetRecoveryDiagnostics> {
  if (Platform.OS !== 'android' || !Number.isSafeInteger(review.nonce) || review.nonce < 0) throw new Error('Native Mainnet recovery is unavailable.');
  const module = NativeModules.AurionXIMainnetSecurity as NativeMainnetSigner | undefined;
  if (!module?.getNativeMainnetRecoveryDiagnostics) throw new Error('This build does not expose native recovery diagnostics.');
  const result = await module.getNativeMainnetRecoveryDiagnostics({ chainId: review.chainId, senderAddress: review.senderAddress,
    recipient: review.recipient, assetId: review.assetId, amount: review.amount.toString(), nonce: review.nonce.toString() });
  return parseMainnetRecoveryDiagnostics(result, review.senderAddress, review.nonce);
}

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const HASH = /^0x[a-fA-F0-9]{64}$/;
const HANDLE = /^[0-9a-f]{64}$/;
