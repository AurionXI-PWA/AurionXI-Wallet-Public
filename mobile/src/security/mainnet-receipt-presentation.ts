import type { MainnetSubmissionRecord } from '@/storage/mainnet-submission-journal';

export type MainnetReceiptPresentation = Readonly<{
  title: string;
  detail: string;
  tone: 'pending' | 'success' | 'warning';
  refreshAllowed: boolean;
}>;

export function presentMainnetSubmission(record: MainnetSubmissionRecord): MainnetReceiptPresentation {
  switch (record.receiptState) {
    case 'submitted': return { title: record.replacementKind === 'cancel' ? 'Cancellation submitted' : record.replacementKind === 'speed-up' ? 'Retry submitted' : 'Transaction submitted', detail: 'The relay accepted this transaction. Its public receipt has not been checked yet.', tone: 'pending', refreshAllowed: true };
    case 'pending': return { title: record.replacementKind === 'cancel' ? 'Waiting for cancellation confirmation' : 'Waiting for confirmation', detail: 'The transaction is still pending. Refresh checks status only and never sends it again.', tone: 'pending', refreshAllowed: true };
    case 'confirmed': return { title: record.replacementKind === 'cancel' ? 'Cancellation confirmed' : record.replacementKind === 'speed-up' ? 'Retry confirmed on BNB Smart Chain' : 'Confirmed on BNB Smart Chain', detail: record.blockNumber ? `Included in block #${record.blockNumber}.` : 'The exact transaction receipt was verified by the native wallet.', tone: 'success', refreshAllowed: false };
    case 'reverted': return { title: 'Transaction reverted on-chain', detail: 'The transfer did not complete. A network fee may have been charged; review BscScan before creating a new transfer.', tone: 'warning', refreshAllowed: false };
    case 'replaced-or-dropped': return { title: 'Transaction replaced or dropped', detail: 'The account nonce advanced without this hash being found. Review BscScan and current balances before creating another transfer.', tone: 'warning', refreshAllowed: false };
    case 'status-unavailable': return { title: 'Status temporarily unavailable', detail: 'The transaction hash is safely retained. Refresh status or use BscScan; do not submit the same signed transaction again.', tone: 'warning', refreshAllowed: true };
    case 'submission-unknown': return { title: 'Submission status unknown', detail: 'The network result was not conclusive. We will check this exact hash. Do not create another transfer until its status is resolved.', tone: 'warning', refreshAllowed: true };
    case 'cancelled': return { title: 'Replaced on-chain', detail: `Another verified transaction consumed this nonce. This attempt cannot execute.${record.cancelledByHash ? ` Replacement hash: ${record.cancelledByHash}` : ''}`, tone: 'warning', refreshAllowed: false };
    case 'not-submitted': return { title: 'Not submitted', detail: 'This attempt was not submitted. Prepare a fresh review; the native wallet revalidates any old nonce record before another signature.', tone: 'warning', refreshAllowed: false };
  }
}

export function getMainnetTransactionExplorerUrl(hash: `0x${string}`): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('Invalid Mainnet transaction hash.');
  return `https://bscscan.com/tx/${hash}`;
}
