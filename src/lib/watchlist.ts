import type { CatalogItem } from '../types';

const WATCHLIST_KEY = 'lumen.watchlist.v1';
const CONTINUE_KEY = 'lumen.continue.v1';
const MAX_CONTINUE = 24;

export interface WatchlistEntry {
  id: string;
  addedAt: number;
  snapshot: CatalogItemSnapshot;
}

export interface ContinueEntry {
  id: string;
  updatedAt: number;
  position: number;
  duration: number;
  season?: number;
  episode?: number;
  snapshot: CatalogItemSnapshot;
}

export type CatalogItemSnapshot = Pick<
  CatalogItem,
  'id' | 'title' | 'poster' | 'backdrop' | 'tmdbId' | 'mediaType' | 'tags' | 'year' | 'duration' | 'author' | 'description' | 'popularity'
>;

function snapshot(item: CatalogItem): CatalogItemSnapshot {
  return {
    id: item.id,
    title: item.title,
    poster: item.poster,
    backdrop: item.backdrop,
    tmdbId: item.tmdbId,
    mediaType: item.mediaType,
    tags: item.tags,
    year: item.year,
    duration: item.duration,
    author: item.author,
    description: item.description,
    popularity: item.popularity,
  };
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage may be unavailable
  }
}

export function getWatchlist(): WatchlistEntry[] {
  return readJSON<WatchlistEntry[]>(WATCHLIST_KEY, []);
}

export function isInWatchlist(id: string): boolean {
  return getWatchlist().some((entry) => entry.id === id);
}

export function addToWatchlist(item: CatalogItem): WatchlistEntry[] {
  const list = getWatchlist().filter((entry) => entry.id !== item.id);
  list.unshift({ id: item.id, addedAt: Date.now(), snapshot: snapshot(item) });
  writeJSON(WATCHLIST_KEY, list);
  notify();
  return list;
}

export function removeFromWatchlist(id: string): WatchlistEntry[] {
  const list = getWatchlist().filter((entry) => entry.id !== id);
  writeJSON(WATCHLIST_KEY, list);
  notify();
  return list;
}

export function toggleWatchlist(item: CatalogItem): boolean {
  if (isInWatchlist(item.id)) {
    removeFromWatchlist(item.id);
    return false;
  }
  addToWatchlist(item);
  return true;
}

export function watchlistAsItems(): CatalogItem[] {
  return getWatchlist().map((entry) => entry.snapshot as CatalogItem);
}

export function getContinueWatching(): ContinueEntry[] {
  return readJSON<ContinueEntry[]>(CONTINUE_KEY, []);
}

export function recordProgress(item: CatalogItem, position: number, duration: number, opts: { season?: number; episode?: number } = {}): void {
  if (!Number.isFinite(position) || position <= 5) return;
  if (duration > 0 && position / duration > 0.95) {
    removeFromContinue(item.id);
    return;
  }
  const list = getContinueWatching().filter((entry) => entry.id !== item.id);
  list.unshift({
    id: item.id,
    updatedAt: Date.now(),
    position,
    duration,
    season: opts.season,
    episode: opts.episode,
    snapshot: snapshot(item),
  });
  writeJSON(CONTINUE_KEY, list.slice(0, MAX_CONTINUE));
  notify();
}

export function removeFromContinue(id: string): void {
  const list = getContinueWatching().filter((entry) => entry.id !== id);
  writeJSON(CONTINUE_KEY, list);
  notify();
}

export function continueAsItems(): CatalogItem[] {
  return getContinueWatching().map((entry) => entry.snapshot as CatalogItem);
}

export function continueProgress(id: string): { position: number; duration: number } | null {
  const entry = getContinueWatching().find((e) => e.id === id);
  if (!entry) return null;
  return { position: entry.position, duration: entry.duration };
}

const LISTENERS = new Set<() => void>();

function notify(): void {
  LISTENERS.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore
    }
  });
}

export function subscribeWatchlist(listener: () => void): () => void {
  LISTENERS.add(listener);
  const storage = (event: StorageEvent) => {
    if (event.key === WATCHLIST_KEY || event.key === CONTINUE_KEY) listener();
  };
  window.addEventListener('storage', storage);
  return () => {
    LISTENERS.delete(listener);
    window.removeEventListener('storage', storage);
  };
}
