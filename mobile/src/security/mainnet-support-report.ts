import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import type { Address } from 'viem';
import { isMainnetSubmissionRecord, type MainnetSubmissionRecord } from '@/storage/mainnet-submission-journal';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const IDENTIFIER = /^[a-zA-Z][a-zA-Z0-9_.-]{0,95}$/;
const UUID = /^[0-9a-f-]{36}$/;
const DECIMAL = /^(0|[1-9][0-9]{0,77})$/;
const numeric = new Set(['nonce', 'recordNonce', 'pendingNonce', 'latestNonce', 'gas', 'gasPriceWei', 'amountWei', 'minimumOutWei', 'estimatedOutWei', 'receivedAmountWei', 'deviceTime', 'quoteTime', 'elapsedMs', 'attemptCount', 'recordCount']);
const names = new Set(['stage', 'outcome', 'errorType', 'journalState', 'assetId', 'outputAsset', 'kind', 'reason']);
const flags = new Set(['lifecycleCurrent', 'hasTransferDetails', 'requestStarted', 'submissionBarrier']);
const object = (input: unknown): Record<string, unknown> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Support report is invalid.');
  return input as Record<string, unknown>;
};
/** A second whitelist at the native export boundary. Never serialize arbitrary native error objects. */
export function cleanSupportFields(input: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(object(input)).filter(([key, value]) => typeof value === 'string' && (
    (numeric.has(key) && DECIMAL.test(value)) || (names.has(key) && IDENTIFIER.test(value)) ||
    (flags.has(key) && ['true', 'false'].includes(value)) ||
    (key === 'errorCode' && (/^mainnet_[a-z0-9_]{1,80}$/.test(value) || ['replacement_nonce_already_consumed', 'invalid_replacement_intent', 'rate_limited'].includes(value))) ||
    (['sender', 'recipient'].includes(key) && ADDRESS.test(value)) ||
    (['hash', 'originalHash', 'replacementHash'].includes(key) && HASH.test(value)) ||
    (key === 'operationId' && UUID.test(value)) || (key === 'httpStatus' && /^[1-5][0-9]{2}$/.test(value)) ||
    (key === 'clockDeltaMs' && /^-?[0-9]{1,18}$/.test(value))
  ))) as Record<string, string>;
}

export function parseNativeSupportReport(raw: unknown, sender: Address) {
  if (typeof raw !== 'string' || raw.length > 300_000) throw new Error('Support report is unavailable.');
  const value = object(JSON.parse(raw));
  if (value.schemaVersion !== 1 || value.chainId !== 56 || typeof value.sender !== 'string' || value.sender.toLowerCase() !== sender.toLowerCase()
    || !Number.isSafeInteger(value.generatedAt) || Number(value.generatedAt) < 0 || typeof value.reportId !== 'string' || !UUID.test(value.reportId)
    || typeof value.packageName !== 'string' || !/^[a-zA-Z0-9_.]{1,100}$/.test(value.packageName)
    || typeof value.versionName !== 'string' || !/^[a-zA-Z0-9_.-]{1,60}$/.test(value.versionName)
    || typeof value.buildFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.buildFingerprint)
    || ![true, false, null].includes(value.automaticTime as boolean | null)
    || typeof value.historyReset !== 'boolean'
    || !['available', 'write_failed', 'unreadable'].includes(String(value.storageStatus))
    || !['available', 'unavailable'].includes(String(value.nativeJournalStatus))
    || !Array.isArray(value.events) || value.events.length > 128 || !Array.isArray(value.nativeRecords) || value.nativeRecords.length > 52) throw new Error('Support report is invalid.');
  const events = value.events.map(item => {
    const e = object(item); const safe = cleanSupportFields(e);
    if (safe.sender?.toLowerCase() !== sender.toLowerCase() || !safe.operationId || !safe.stage || !safe.outcome || !Number.isSafeInteger(e.at) || Number(e.at) < 0) throw new Error('Support event is invalid.');
    return { ...safe, at: Number(e.at) } as Record<string, string | number>;
  });
  return { schemaVersion: 1, chainId: 56, sender: sender.toLowerCase(), generatedAt: Number(value.generatedAt), reportId: value.reportId,
    packageName: value.packageName, versionName: value.versionName, buildFingerprint: value.buildFingerprint, automaticTime: value.automaticTime,
    storageStatus: value.storageStatus, historyReset: value.historyReset, retentionLimit: 128, nativeJournalStatus: value.nativeJournalStatus,
    nativeRecords: value.nativeRecords.map(cleanSupportFields), events };
}

function publicRecord(r: MainnetSubmissionRecord) {
  return { transactionHash: r.transactionHash, senderAddress: r.senderAddress, recipientAddress: r.recipientAddress, assetId: r.assetId,
    amountWei: r.amountWei, nonce: r.nonce, submittedAt: r.submittedAt, receiptState: r.receiptState,
    ...(r.replacesTransactionHash ? { replacesTransactionHash: r.replacesTransactionHash, replacementKind: r.replacementKind } : {}),
    ...(r.cancelledByHash ? { cancelledByHash: r.cancelledByHash } : {}), ...(r.lastCheckedAt !== undefined ? { lastCheckedAt: r.lastCheckedAt } : {}),
    ...(r.operation ? { operation: { kind: r.operation.kind, inputAsset: r.operation.inputAsset, outputAsset: r.operation.outputAsset,
      intentAmountWei: r.operation.intentAmountWei, minimumOutWei: r.operation.minimumOutWei, estimatedOutWei: r.operation.estimatedOutWei,
      ...(r.operation.receivedAmountWei ? { receivedAmountWei: r.operation.receivedAmountWei } : {}) } } : {}) };
}
export async function createMainnetSupportReport(sender: Address): Promise<string> {
  if (Platform.OS !== 'android' || !ADDRESS.test(sender)) throw new Error('Support report is unavailable.');
  const native = NativeModules.AurionXIMainnetSecurity as { getNativeMainnetSupportReport?: (sender: string) => Promise<unknown> } | undefined;
  if (!native?.getNativeMainnetSupportReport) throw new Error('This app version does not include saved support reports.');
  const report = parseNativeSupportReport(await native.getNativeMainnetSupportReport(sender), sender);
  let cacheStatus = 'available'; let cacheRecords: ReturnType<typeof publicRecord>[] = [];
  try {
    const raw = await AsyncStorage.getItem(`@aurionxi/wallet-v1/public-mainnet-submissions/v1/${sender.toLowerCase()}`);
    const records: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(records)) throw new Error();
    const valid = records.filter(r => isMainnetSubmissionRecord(r, sender)) as MainnetSubmissionRecord[];
    if (valid.length !== records.length) cacheStatus = 'partially_unreadable';
    cacheRecords = valid.slice(0, 20).map(publicRecord);
  } catch { cacheStatus = 'unreadable_or_unavailable'; }
  const text = JSON.stringify({ ...report, cacheStatus, cacheRecords,
    evidenceNotes: ['Receipt events are dated observations; unknown means neither transaction nor receipt was found by the relay at that check.',
      'Unavailable means the check failed; it does not establish pending, failed, dropped or cancelled.',
      'Export performs no network request, signing or journal mutation. Quotes/nonces describe the last captured check, not current authority.',
      'Events before this diagnostic version or outside the bounded retention window cannot be reconstructed.'] }, null, 2);
  await AsyncStorage.setItem(`@aurionxi/mainnet-support-report/v1/${sender.toLowerCase()}`, text);
  return text;
}
