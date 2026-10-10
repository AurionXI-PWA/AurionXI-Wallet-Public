import { formatUnits, type Address, type Hash } from 'viem';
import type { MainnetActivityItem } from '../services/mainnet-activity';
import type { MainnetSubmissionRecord } from '../storage/mainnet-submission-journal';
import { swapSymbol } from './mainnet-swap-policy';
import { isMainnetSubmissionRecord } from './mainnet-transfer-history-policy';
import { presentMainnetSubmission, type MainnetReceiptPresentation } from './mainnet-receipt-presentation';

export type MainnetActivityEntry = Readonly<{
  key: string;
  hash: Hash;
  items: readonly MainnetActivityItem[];
  record?: MainnetSubmissionRecord;
  timestamp: number;
}>;
export type MainnetActivityRow = Readonly<{
  key: string;
  direction: string;
  counterparty: Address;
  counterpartyLabel: 'From' | 'To' | 'Wallet';
  amount: string;
  symbol: MainnetActivityItem['symbol'];
  failed: boolean;
}>;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
type ActivityGroup = { hash: Hash; items: MainnetActivityItem[]; record?: MainnetSubmissionRecord };

/** Public display join only. Hash identity, not amount/date/nonce, binds receipt to activity. */
export function mergeMainnetActivityEntries(items: readonly MainnetActivityItem[], records: readonly MainnetSubmissionRecord[], senderAddress?: Address): MainnetActivityEntry[] {
  if (!senderAddress) return [];
  const groups = new Map<string, ActivityGroup>();
  const eventKeys = new Set<string>();
  for (const item of items) {
    if (!HASH.test(item.hash) || typeof item.id !== 'string' || !ADDRESS.test(item.counterparty)
      || typeof item.amount !== 'string' || item.amount.length > 100 || !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(item.amount)
      || !['BNB', 'ARXI', 'USDT', 'USDC', 'ETH', 'BTCB'].includes(item.symbol)
      || !['Sent', 'Received', 'Self'].includes(item.direction) || typeof item.failed !== 'boolean'
      || !(item.timestamp instanceof Date) || !Number.isFinite(item.timestamp.getTime())) continue;
    const key = item.hash.toLowerCase();
    const eventKey = `${key}:${item.id}`;
    if (eventKeys.has(eventKey)) continue;
    eventKeys.add(eventKey);
    const group: ActivityGroup = groups.get(key) ?? { hash: item.hash, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  for (const record of records) {
    if (!isMainnetSubmissionRecord(record, senderAddress) || !Number.isFinite(new Date(record.submittedAt).getTime())) continue;
    const key = record.transactionHash.toLowerCase();
    const group: ActivityGroup = groups.get(key) ?? { hash: record.transactionHash, items: [] };
    if (!group.record || (record.lastCheckedAt ?? record.submittedAt) > (group.record.lastCheckedAt ?? group.record.submittedAt)) group.record = record;
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => Object.freeze({
    key, hash: group.hash, items: Object.freeze([...group.items]), record: group.record,
    timestamp: group.items.length ? Math.max(...group.items.map((item) => item.timestamp.getTime())) : group.record!.submittedAt,
  })).sort((a, b) => Number(Boolean(b.record && presentMainnetSubmission(b.record).refreshAllowed))
    - Number(Boolean(a.record && presentMainnetSubmission(a.record).refreshAllowed)) || b.timestamp - a.timestamp || a.key.localeCompare(b.key));
}

export function getMainnetActivityRows(entry: MainnetActivityEntry): MainnetActivityRow[] {
  const operation = entry.record?.operation;
  if (operation && entry.record) {
    const record = entry.record; const failed = record.receiptState === 'reverted'; const confirmed = record.receiptState === 'confirmed';
    if (operation.kind !== 'swap') return [{ key:entry.key, direction:failed?'Permission update failed':confirmed?operation.kind==='reset'?'Permission reset':'Spending approved':'Permission update pending', counterparty:record.senderAddress,counterpartyLabel:'Wallet',amount:formatUnits(BigInt(record.amountWei),18),symbol:swapSymbol(operation.inputAsset) as MainnetActivityItem['symbol'],failed }];
    const rows: MainnetActivityRow[] = [{key:entry.key+':input',direction:failed?'Swap failed':confirmed?'Swapped':'Swap pending',counterparty:record.senderAddress,counterpartyLabel:'Wallet',amount:formatUnits(BigInt(operation.intentAmountWei),18),symbol:swapSymbol(operation.inputAsset) as MainnetActivityItem['symbol'],failed}];
    if(confirmed && operation.receivedAmountWei)rows.push({key:entry.key+':output',direction:'Received',counterparty:record.senderAddress,counterpartyLabel:'Wallet',amount:formatUnits(BigInt(operation.receivedAmountWei),18),symbol:swapSymbol(operation.outputAsset) as MainnetActivityItem['symbol'],failed:false});
    return rows;
  }
  if (entry.items.length) return entry.items.map((item) => {
    const failed = item.failed || entry.record?.receiptState === 'reverted';
    const uncertainOutgoing = entry.record && entry.record.receiptState !== 'confirmed' && item.direction !== 'Received';
    const counterpartyLabel: MainnetActivityRow['counterpartyLabel'] = item.direction === 'Received' ? 'From' : item.direction === 'Self' ? 'Wallet' : 'To';
    return { key: item.id, direction: entry.record?.receiptState === 'cancelled' ? 'Replaced' : entry.record?.replacementKind ? (entry.record.receiptState === 'confirmed' ? entry.record.replacementKind === 'cancel' ? 'Cancellation confirmed' : 'Sent · retry confirmed' : failed ? 'Replacement reverted' : entry.record.replacementKind === 'cancel' ? 'Cancel attempt' : 'Retry attempt') : failed ? 'Failed' : uncertainOutgoing
      ? ['submitted', 'pending'].includes(entry.record!.receiptState) ? 'Sending' : 'Send attempt' : item.direction,
      counterparty: item.counterparty, counterpartyLabel, amount: item.amount, symbol: item.symbol, failed };
  });
  const record = entry.record;
  if (!record) return [];
  const direction = record.receiptState === 'cancelled' ? 'Replaced' : record.replacesTransactionHash ? (record.receiptState === 'confirmed' ? record.replacementKind === 'cancel' ? 'Cancellation confirmed' : 'Sent · retry confirmed' : record.receiptState === 'reverted' ? 'Replacement reverted' : record.replacementKind === 'cancel' ? 'Cancel attempt' : 'Retry attempt') : record.receiptState === 'confirmed'
    ? record.senderAddress.toLowerCase() === record.recipientAddress.toLowerCase() ? 'Self' : 'Sent'
    : record.receiptState === 'reverted' ? 'Send failed'
      : ['submitted', 'pending'].includes(record.receiptState) ? 'Sending' : 'Send attempt';
  return [{ key: entry.key, direction, counterparty: record.recipientAddress,
    counterpartyLabel: record.senderAddress.toLowerCase() === record.recipientAddress.toLowerCase() ? 'Wallet' : 'To',
    amount: formatUnits(BigInt(record.amountWei), 18), symbol: record.assetId === 'usdt' ? 'USDT' : record.assetId === 'arxi' ? 'ARXI' : 'BNB', failed: record.receiptState === 'reverted' }];
}

/** Public feed data never upgrades uncertain native submission to confirmed. */
export function presentMainnetActivityEntry(entry: MainnetActivityEntry): MainnetReceiptPresentation {
  if (entry.record) {
    const presentation = presentMainnetSubmission(entry.record);
    if(entry.record.operation && entry.record.receiptState === 'confirmed') return {...presentation,title:entry.record.operation.kind === 'swap' ? 'Swap confirmed' : 'Permission confirmed',detail:'Confirmed on BNB Smart Chain.'};
    if (entry.record.receiptState === 'confirmed' && entry.items.some((item) => item.failed)) {
      return { title: 'Activity details differ', detail: 'The native receipt confirmed this hash, but public activity reports failure. Check this exact transaction on BscScan.', tone: 'warning', refreshAllowed: false };
    }
    return presentation;
  }
  return entry.items.some((item) => item.failed)
    ? { title: 'Failed · public activity', detail: 'Reported by the public activity service. Open this transaction on BscScan for details.', tone: 'warning', refreshAllowed: false }
    : { title: 'On-chain activity', detail: 'Reported by the public activity service; not independently receipt-verified by the native wallet.', tone: 'pending', refreshAllowed: false };
}
