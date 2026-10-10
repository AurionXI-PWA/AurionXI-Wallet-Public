import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { Address } from 'viem';

import {
  ActivityConfigurationError,
  fetchRecentActivity,
  mergeRecentActivity,
  type ActivityCoverage,
  type ActivityItem,
} from '@/services/activity';
import { loadPublicActivityCache, savePublicActivityCache } from '@/storage/public-activity-cache';
import { loadPublicNativeActivityJournal } from '@/storage/public-native-activity-journal';

type ActivityState = 'idle' | 'loading' | 'ready' | 'unconfigured' | 'error';

export function useActivity(address?: Address) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [coverage, setCoverage] = useState<ActivityCoverage>();
  const [state, setState] = useState<ActivityState>('idle');
  const [showingSavedHistory, setShowingSavedHistory] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    let active = true;
    const loadActivity = setTimeout(() => {
      if (!address) {
        setItems([]);
        setCoverage(undefined);
        setState('idle');
        return;
      }

      setState('loading');
      void Promise.all([loadPublicActivityCache(address), loadPublicNativeActivityJournal(address)]).then(([cached, nativeItems]) => {
        if (!active || (!cached && nativeItems.length === 0)) return;
        setItems(mergeRecentActivity(cached?.items ?? [], nativeItems));
        setCoverage(cached?.coverage ?? 'recent-curated-token-transfers');
        setShowingSavedHistory(true);
        setState('ready');
      });
      fetchRecentActivity(address)
        .then(async (result) => {
          // A provider can return a deliberately short rolling window. Keep the
          // prior public result for this same address so a new transfer cannot
          // make already-confirmed recent entries disappear from the mini
          // statement. Native sends are merged for the same reason.
          const [cached, nativeItems] = await Promise.all([
            loadPublicActivityCache(address),
            loadPublicNativeActivityJournal(address),
          ]);
          const merged = {
            ...result,
            items: mergeRecentActivity(result.items, cached?.items ?? [], nativeItems),
          };
          if (active) {
            setItems(merged.items);
            setCoverage(merged.coverage);
            setShowingSavedHistory(false);
            setState('ready');
          }
          return savePublicActivityCache(address, merged).catch(() => undefined);
        })
        .catch((error: unknown) => {
          if (!active) return;
          void Promise.all([loadPublicActivityCache(address), loadPublicNativeActivityJournal(address)]).then(([cached, nativeItems]) => {
            if (!active) return;
            if (cached || nativeItems.length > 0) {
              setItems(mergeRecentActivity(cached?.items ?? [], nativeItems));
              setCoverage(cached?.coverage ?? 'recent-curated-token-transfers');
              setShowingSavedHistory(true);
              setState('ready');
              return;
            }
            setItems([]);
            setCoverage(undefined);
            setShowingSavedHistory(false);
            setState(error instanceof ActivityConfigurationError ? 'unconfigured' : 'error');
          });
        });
    }, 0);

    return () => {
      active = false;
      clearTimeout(loadActivity);
    };
  }, [address, requestVersion]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const returnedToForeground = appState.current.match(/inactive|background/) && nextState === 'active';
      appState.current = nextState;
      if (returnedToForeground && address) setRequestVersion((version) => version + 1);
    });
    return () => subscription.remove();
  }, [address]);

  const refresh = useCallback(() => {
    if (address) setRequestVersion((version) => version + 1);
  }, [address]);

  return { coverage, items, state, refresh, showingSavedHistory };
}
