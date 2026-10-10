import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Address, Hash } from 'viem';
import type { SwapOperationMetadata } from '@/security/mainnet-swap-policy';

import type { MainnetReceiptState } from '@/security/mainnet-broadcast-receipt-coordinator';
import { isMainnetSubmissionRecord } from '@/security/mainnet-transfer-history-policy';
export { isMainnetSubmissionRecord } from '@/security/mainnet-transfer-history-policy';

const PREFIX = '@aurionxi/wallet-v1/public-mainnet-submissions/v1';
const MAX_RECORDS = 20;

export type MainnetSubmissionRecord = Readonly<{
  version: 1;
  chainId: 56;
  transactionHash: Hash;
  senderAddress: Address;
  recipientAddress: Address;
  assetId: 'native-bnb' | 'arxi' | 'usdt';
  amountWei: string;
  nonce: number;
  submittedAt: number;
  receiptState: MainnetReceiptState['state'];
  blockNumber?: string;
  lastCheckedAt?: number;
  replacesTransactionHash?: Hash;
  replacementKind?: 'cancel' | 'speed-up';
  cancelledByHash?: Hash;
  operation?: SwapOperationMetadata;
}>;

const key = (address: Address) => `${PREFIX}/${address.toLowerCase()}`;
export async function loadMainnetSubmissionJournal(senderAddress: Address): Promise<MainnetSubmissionRecord[]> {
  const raw = await AsyncStorage.getItem(key(senderAddress));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((record) => isMainnetSubmissionRecord(record, senderAddress)).slice(0, MAX_RECORDS);
  } catch { return []; }
}

/** Persists public recovery metadata only. Serialized signed bytes are forbidden. */
export async function saveMainnetSubmissionRecord(record: MainnetSubmissionRecord): Promise<void> {
  if (!isMainnetSubmissionRecord(record, record.senderAddress)) throw new Error('Invalid Mainnet submission record.');
  const existing = await loadMainnetSubmissionJournal(record.senderAddress);
  const records = [record, ...existing.filter((item) => item.transactionHash.toLowerCase() !== record.transactionHash.toLowerCase())]
    .sort((left, right) => right.submittedAt - left.submittedAt)
    .slice(0, MAX_RECORDS);
  await AsyncStorage.setItem(key(record.senderAddress), JSON.stringify(records));
}

export function createSubmittedMainnetRecord(input: Omit<MainnetSubmissionRecord, 'version' | 'chainId' | 'receiptState'>): MainnetSubmissionRecord {
  const record = Object.freeze({ ...input, version: 1 as const, chainId: 56 as const, receiptState: 'submitted' as const });
  if (!isMainnetSubmissionRecord(record, record.senderAddress)) throw new Error('Invalid Mainnet submission metadata.');
  return record;
}

export function applyMainnetReceiptState(record: MainnetSubmissionRecord, state: MainnetReceiptState): MainnetSubmissionRecord {
  if (state.transactionHash.toLowerCase() !== record.transactionHash.toLowerCase()) throw new Error('Receipt hash does not match the persisted Mainnet submission.');
  return Object.freeze({
    ...record,
    receiptState: state.state,
    blockNumber: state.state === 'confirmed' || state.state === 'reverted' ? state.blockNumber.toString() : undefined,
    lastCheckedAt: state.state === 'submitted' ? undefined : state.state === 'pending' ? state.checkedAt : 'checkedAt' in state ? state.checkedAt : 'confirmedAt' in state ? state.confirmedAt : state.detectedAt,
  });
}
