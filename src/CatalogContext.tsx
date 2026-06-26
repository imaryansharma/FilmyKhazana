import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { loadCatalog } from './lib/catalog';
import { continueAsItems, subscribeWatchlist, watchlistAsItems } from './lib/watchlist';
import type { CatalogItem, CatalogResponse } from './types';

interface CatalogContextValue {
  items: CatalogItem[];
  source: CatalogResponse['source'] | 'loading';
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function useCatalog() {
  const value = useContext(CatalogContext);
  if (!value) throw new Error('CatalogContext missing');
  return value;
}

export function useWatchlistState() {
  const [items, setItems] = useState(() => watchlistAsItems());
  const [continueItems, setContinueItems] = useState(() => continueAsItems());

  useEffect(() => {
    return subscribeWatchlist(() => {
      setItems(watchlistAsItems());
      setContinueItems(continueAsItems());
    });
  }, []);

  return { watchlist: items, continueWatching: continueItems };
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [source, setSource] = useState<CatalogContextValue['source']>('loading');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(() => {
    const id = ++requestId.current;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSource('loading');
    loadCatalog(controller.signal)
      .then((result) => {
        if (id !== requestId.current) return;
        setItems(result.items);
        setSource(result.source);
        setError(null);
      })
      .catch((err) => {
        if (id !== requestId.current) return;
        setError(err instanceof Error ? err.message : 'Unable to load catalog');
        setItems([]);
        setSource('fallback');
      })
      .finally(() => {
        if (id !== requestId.current) return;
        setLoading(false);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <CatalogContext.Provider value={{ items, source, loading, error, refresh }}>{children}</CatalogContext.Provider>
  );
}
