import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address, Hash } from 'viem';
import { loadMainnetTransfersNatively, reconcileMainnetReceiptNatively } from '@/security/mainnet-native-signer';
import { loadMainnetSubmissionJournal, saveMainnetSubmissionRecord, type MainnetSubmissionRecord } from '@/storage/mainnet-submission-journal';
import { refreshMainnetTransferRecords } from '@/security/mainnet-transfer-refresh';

/** Load on entry, then refresh only at the user's request. No periodic native operation competes with recovery. */
export function useMainnetTransfers(address?: Address, enabled = false) {
  const [records, setRecords] = useState<MainnetSubmissionRecord[]>([]);
  const [nativeRecords, setNativeRecords] = useState<MainnetSubmissionRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const generation = useRef(0);
  const verifiedLegacy = useRef(new Map<string, MainnetSubmissionRecord>());
  const running = useRef<Promise<void> | undefined>(undefined);
  const refresh = useCallback(async (selectedHash?: Hash) => {
    if (!address || !enabled || running.current) return;
    const request = generation.current;
    const current = () => request === generation.current;
    setRefreshing(true);
    const work = (async () => {
      try {
        await refreshMainnetTransferRecords(address, {
          loadNative: loadMainnetTransfersNatively, loadCache: loadMainnetSubmissionJournal,
          inspect: reconcileMainnetReceiptNatively, save: saveMainnetSubmissionRecord, verifiedLegacy: verifiedLegacy.current, current,
          publish: (next, native) => { if (current()) { setRecords(next); setNativeRecords(native); } },
        }, selectedHash);
        if (current()) setUnavailable(false);
      } catch { if (current()) setUnavailable(true); }
      finally { if (current()) setRefreshing(false); }
    })();
    running.current = work;
    try { await work; } finally { if (running.current === work) running.current = undefined; }
  }, [address, enabled]);
  useEffect(() => {
    generation.current += 1;
    verifiedLegacy.current = new Map();
    setRecords([]); setNativeRecords([]); setUnavailable(false); setRefreshing(false);
    // Wait for an obsolete request to release the native gate before loading this screen/address.
    let active = true;
    const previous = running.current;
    void (async () => { if (previous) await previous; if (active) await refresh(); })();
    return () => { active = false; generation.current += 1; };
  }, [refresh]);
  return { records: enabled ? records : [], nativeRecords: enabled ? nativeRecords : [], refreshing, unavailable,
    refresh: () => { void refresh(); }, refreshHash: (hash: Hash) => { void refresh(hash); } };
}
