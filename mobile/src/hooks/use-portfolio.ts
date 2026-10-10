import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address } from 'viem';

import { fetchPortfolio, type Portfolio } from '@/services/portfolio';
import { getPortfolioErrorMessage } from '@/utils/portfolio-error';

type LoadState = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error';

export function usePortfolio(address?: Address) {
  const [portfolio, setPortfolio] = useState<Portfolio>();
  const [state, setState] = useState<LoadState>('idle');
  const [error, setError] = useState<string>();
  const requestId = useRef(0);

  const load = useCallback(
    async (refreshing = false) => {
      if (!address) {
        requestId.current += 1;
        setPortfolio(undefined);
        setState('idle');
        setError(undefined);
        return;
      }

      const currentRequest = ++requestId.current;
      setState(refreshing ? 'refreshing' : 'loading');
      setError(undefined);

      try {
        const result = await fetchPortfolio(address);
        if (currentRequest === requestId.current) {
          setPortfolio(result);
          setState('ready');
        }
      } catch (loadError) {
        if (currentRequest === requestId.current) {
          // Never leave a previous balance visible after a failed refresh: it could be stale.
          setPortfolio(undefined);
          setState('error');
          setError(getPortfolioErrorMessage(loadError));
        }
      }
    },
    [address],
  );

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      void load();
    }, 0);
    return () => {
      clearTimeout(initialLoad);
      requestId.current += 1;
    };
  }, [load]);

  return { portfolio, state, error, refresh: () => load(true) };
}
