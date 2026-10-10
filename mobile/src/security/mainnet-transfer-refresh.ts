import type { Address, Hash } from 'viem';
import type { MainnetSubmissionRecord } from '../storage/mainnet-submission-journal';
import { mergeMainnetTransferHistory } from './mainnet-transfer-history-policy';
import type { MainnetNativeReceiptState } from './mainnet-native-signer';

export const isTerminalMainnetRecord = (record: MainnetSubmissionRecord) => ['confirmed', 'reverted', 'not-submitted', 'replaced-or-dropped', 'cancelled'].includes(record.receiptState);
type Dependencies = {
  loadNative: (address: Address) => Promise<MainnetSubmissionRecord[]>;
  loadCache: (address: Address) => Promise<MainnetSubmissionRecord[]>;
  inspect: (input: { senderAddress: Address; nonce: number; transactionHash: Hash }) => Promise<MainnetNativeReceiptState>;
  save: (record: MainnetSubmissionRecord) => Promise<void>;
  verifiedLegacy: Map<string, MainnetSubmissionRecord>;
  current: () => boolean;
  publish: (records: MainnetSubmissionRecord[], native: MainnetSubmissionRecord[]) => void;
};

/** Fresh native receipt responses may display legacy hashes; cache alone cannot establish success. */
export async function refreshMainnetTransferRecords(address: Address, deps: Dependencies, selectedHash?: Hash) {
  const native = await deps.loadNative(address);
  const cached = await deps.loadCache(address).catch(() => []);
  let records = mergeMainnetTransferHistory(native, cached).map(record => {
    const hasNative = native.some(item => item.transactionHash.toLowerCase() === record.transactionHash.toLowerCase());
    const previous = deps.verifiedLegacy.get(record.transactionHash.toLowerCase());
    return !hasNative && previous && previous.senderAddress.toLowerCase() === address.toLowerCase()
      && previous.nonce === record.nonce && isTerminalMainnetRecord(previous) ? previous : record;
  });
  if (!deps.current()) return;
  deps.publish(records, native);
  const verified = new Map<string, MainnetSubmissionRecord>();
  for (const record of records) {
    if (!deps.current()) return;
    if (selectedHash && record.transactionHash.toLowerCase() !== selectedHash.toLowerCase()) continue;
    const authoritative = native.find(item => item.transactionHash.toLowerCase() === record.transactionHash.toLowerCase());
    if (authoritative && isTerminalMainnetRecord(authoritative)) continue;
    if (!authoritative && deps.verifiedLegacy.has(record.transactionHash.toLowerCase()) && isTerminalMainnetRecord(record)) continue;
    let next: MainnetSubmissionRecord;
    try {
      const state = await deps.inspect({ senderAddress: address, nonce: record.nonce, transactionHash: record.transactionHash });
      next = Object.freeze({ ...record, receiptState: state === 'unknown' ? 'submission-unknown' : state, lastCheckedAt: Date.now() });
      verified.set(record.transactionHash.toLowerCase(), next);
      if (deps.current() && !authoritative && isTerminalMainnetRecord(next)) deps.verifiedLegacy.set(record.transactionHash.toLowerCase(), next);
    } catch { next = Object.freeze({ ...record, receiptState: 'status-unavailable', lastCheckedAt: Date.now() }); }
    if (!deps.current()) return;
    await deps.save(next).catch(() => undefined);
    records = records.map(item => item.transactionHash.toLowerCase() === next.transactionHash.toLowerCase() ? next : item);
    deps.publish(records, native);
  }
  if (!deps.current()) return;
  const settled = await deps.loadNative(address);
  if (!deps.current()) return;
  // Native journal terminal results win. Legacy cache-only hashes require this invocation's receipt evidence.
  const joined = mergeMainnetTransferHistory(settled, records).map(record => {
    const authoritative = settled.find(item => item.transactionHash.toLowerCase() === record.transactionHash.toLowerCase());
    if (authoritative && isTerminalMainnetRecord(authoritative)) return authoritative;
    return verified.get(record.transactionHash.toLowerCase()) ?? (!authoritative ? deps.verifiedLegacy.get(record.transactionHash.toLowerCase()) : undefined) ?? record;
  });
  deps.publish(joined, settled);
}
