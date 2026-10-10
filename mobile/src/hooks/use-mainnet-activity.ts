import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address } from 'viem';

import { fetchRecentMainnetActivity, MainnetActivityConfigurationError, type MainnetActivityItem } from '@/services/mainnet-activity';
import { loadMainnetPublicActivityCache, saveMainnetPublicActivityCache } from '@/storage/mainnet-public-activity-cache';

export function useMainnetActivity(address?: Address, enabled = false) {
  const [items, setItems] = useState<MainnetActivityItem[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'unconfigured' | 'error'>('idle');
  const [saved, setSaved] = useState(false);
  const [itemsAddress, setItemsAddress] = useState<Address>();
  const request = useRef(0);
  const load = useCallback(async () => {
    if (!address || !enabled) { setItems([]); setItemsAddress(undefined); setState('idle'); setSaved(false); return; }
    const id = ++request.current; setItems([]); setItemsAddress(address); setSaved(false); setState('loading');
    const cached = await loadMainnetPublicActivityCache(address);
    if (cached && id === request.current) { setItems(cached.items); setState('ready'); setSaved(true); }
    try {
      const result = await fetchRecentMainnetActivity(address);
      if (id === request.current) { setItems(result.items); setState('ready'); setSaved(false); }
      void saveMainnetPublicActivityCache(address, result).catch(() => undefined);
    } catch (error) {
      if (id !== request.current) return;
      if (cached) { setItems(cached.items); setState('ready'); setSaved(true); return; }
      setItems([]); setSaved(false); setState(error instanceof MainnetActivityConfigurationError ? 'unconfigured' : 'error');
    }
  }, [address, enabled]);
  // Hydration starts an external cache/provider read and invalidates it on cleanup.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); return () => { request.current += 1; }; }, [load]);
  // Do not render the preceding wallet's public items while a new address loads.
  const belongsToAddress = Boolean(address && itemsAddress && address.toLowerCase() === itemsAddress.toLowerCase());
  return { items: belongsToAddress && enabled ? items : [], state: !enabled ? 'idle' as const : belongsToAddress ? state : 'loading' as const,
    showingSavedHistory: belongsToAddress && enabled && saved, refresh: () => void load() };
}
