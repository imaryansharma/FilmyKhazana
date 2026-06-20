import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  CardSkeletonGrid,
  EmptyState,
  ErrorState,
  MediaCard,
  PosterImage,
  QualitySelector,
  SearchInput,
  SectionHeader,
  Select,
  ServerSelector,
  TabBar,
  ThemeToggle,
  cn,
} from './components';
import {
  fetchExternalIds,
  fetchSimilar,
  fetchTmdbItem,
  fetchTvSeasonEpisodes,
  fetchTvSeasons,
  filterByCategory,
  formatRuntime,
  getCatalogBuckets,
  loadCatalog,
  matchCatalogSearch,
  searchTmdb,
  sortCatalog,
  type EpisodeSummary,
  type SeasonSummary,
} from './lib/catalog';
import {
  buildEmbedServerOptions,
  buildQualityListFromLevels,
  buildServerOptions,
  downloadFilename,
  formatTime,
  isServerKind,
  loadDash,
  loadHls,
  loadResumeState,
  safeDownloadUrl,
  saveResumeState,
  type ResumeState,
} from './lib/playback';
import { useBodyScrollLock, useDebouncedValue, useFocusTrap } from './lib/hooks';
import { Faqs, PrivacyPolicy, SiteFooter } from './StaticPages';
import {
  continueAsItems,
  continueProgress,
  isInWatchlist,
  recordProgress,
  removeFromContinue,
  subscribeWatchlist,
  toggleWatchlist,
  watchlistAsItems,
} from './lib/watchlist';
import type { CatalogItem, CatalogResponse, ServerOption, StreamKind, QualityOption } from './types';

interface CatalogContextValue {
  items: CatalogItem[];
  source: CatalogResponse['source'] | 'loading';
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

function useCatalog() {
  const value = useContext(CatalogContext);
  if (!value) throw new Error('CatalogContext missing');
  return value;
}

function useWatchlistState() {
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

export default function App() {
  return (
    <CatalogProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<ExploreRoute />} />
        <Route path="/home/:id" element={<ExploreRoute detail />} />
        <Route path="/explore" element={<Navigate to="/home" replace />} />
        <Route path="/explore/:id" element={<RedirectExploreToHome />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/faqs" element={<Faqs />} />
      </Routes>
    </CatalogProvider>
  );
}

function RedirectExploreToHome() {
  const { id } = useParams();
  const location = useLocation();
  return <Navigate to={`/home/${id ?? ''}${location.search}`} replace />;
}

function CatalogProvider({ children }: { children: React.ReactNode }) {
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

function ExploreRoute({ detail = false }: { detail?: boolean }) {
  const { items, loading, error, refresh } = useCatalog();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { watchlist, continueWatching } = useWatchlistState();

  const queryFromUrl = searchParams.get('q') ?? '';
  const categoryFromUrl = searchParams.get('category') ?? 'All';
  const sortFromUrl = searchParams.get('sort') ?? 'trending';

  const [searchInput, setSearchInput] = useState(queryFromUrl);
  const [searchOpen, setSearchOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(searchInput, 250);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => setSearchInput(queryFromUrl), [queryFromUrl]);

  useEffect(() => {
    setIsTyping(true);
    const next = new URLSearchParams(searchParams);
    if (debouncedQuery.trim()) next.set('q', debouncedQuery.trim());
    else next.delete('q');
    setSearchParams(next, { replace: true });
    const timeout = window.setTimeout(() => setIsTyping(false), 120);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, setSearchParams]);

  const tabs = useMemo(() => getCatalogBuckets(items), [items]);

  const [searchResults, setSearchResults] = useState<CatalogItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    const q = queryFromUrl.trim();
    if (!q) {
      setSearchResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    setSearchError(null);
    searchTmdb(q, controller.signal)
      .then((results) => {
        if (controller.signal.aborted) return;
        setSearchResults(results);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setSearchResults([]);
        setSearchError(err instanceof Error ? err.message : 'Search failed');
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setSearching(false);
      });
    return () => controller.abort();
  }, [queryFromUrl]);

  const filtered = useMemo(() => {
    const source = queryFromUrl.trim()
      ? searchResults
      : items.filter((item) => matchCatalogSearch(item, queryFromUrl));
    const afterCategory = filterByCategory(source, categoryFromUrl);
    return sortCatalog(afterCategory, sortFromUrl);
  }, [categoryFromUrl, items, queryFromUrl, searchResults, sortFromUrl]);

  const heroItems = useMemo(() => {
    const sorted = sortCatalog(items, 'trending');
    const withBackdrop = sorted.filter((item) => item.backdrop);
    return (withBackdrop.length >= 5 ? withBackdrop : sorted).slice(0, 7);
  }, [items]);

  const trending = useMemo(() => sortCatalog(items, 'trending').slice(0, 18), [items]);
  const newReleases = useMemo(() => sortCatalog(items, 'recent').slice(0, 18), [items]);
  const topRated = useMemo(() => sortCatalog(items.filter((item) => item.tags.includes('Top Rated')), 'trending').slice(0, 18), [items]);
  const tvShows = useMemo(() => sortCatalog(items.filter((item) => item.mediaType === 'tv'), 'trending').slice(0, 18), [items]);
  const movies = useMemo(() => sortCatalog(items.filter((item) => item.mediaType === 'movie'), 'trending').slice(0, 18), [items]);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const searchResultsRef = useRef(searchResults);
  searchResultsRef.current = searchResults;

  const [activeItem, setActiveItem] = useState<CatalogItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!params.id) {
      setActiveItem(null);
      setDetailLoading(false);
      return;
    }
    const cached = itemsRef.current.find((i) => i.id === params.id) ?? searchResultsRef.current.find((i) => i.id === params.id);
    if (cached) {
      setActiveItem(cached);
      setDetailLoading(false);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    setActiveItem(null);
    fetchTmdbItem(params.id, controller.signal)
      .then((item) => {
        if (controller.signal.aborted) return;
        setActiveItem(item);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setActiveItem(null);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setDetailLoading(false);
      });
    return () => controller.abort();
  }, [params.id]);

  const openDetail = (id: string) => {
    navigate(`/home/${id}${location.search}`, { state: { backgroundLocation: location } });
  };

  const openPlayer = (id: string) => {
    navigate(`/home/${id}${location.search}`, { state: { backgroundLocation: location, openPlayer: true } });
  };

  const clearSearch = () => {
    setSearchInput('');
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    setSearchParams(next, { replace: true });
  };

  const buildCardProps = (item: CatalogItem) => {
    const progress = continueProgress(item.id);
    const pct = progress && progress.duration > 0 ? Math.round((progress.position / progress.duration) * 100) : null;
    return {
      onToggleWatchlist: () => toggleWatchlist(item),
      inWatchlist: isInWatchlist(item.id),
      progress: pct,
    };
  };

  const showShelves = !queryFromUrl && categoryFromUrl === 'All';

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand-wrap" onClick={() => navigate('/home')} role="button" tabIndex={0} aria-label="FilmyKhazana home" onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate('/home')}>
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="FilmyKhazana"
              className="brand-logo"
              width={160}
              height={160}
              draggable={false}
            />
          </div>
        </div>

        <div className="topbar-search">
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            variant="topbar"
            placeholder="Search movies, TV shows…"
            onClear={clearSearch}
          />
        </div>

        <div className="topbar-tools">
          <button
            type="button"
            className="topbar-icon-btn topbar-search-toggle"
            aria-label={searchOpen ? 'Close search' : 'Open search'}
            onClick={() => setSearchOpen((value) => !value)}
          >
            {searchOpen ? '✕' : '⌕'}
          </button>
          <ThemeToggle />
          {watchlist.length > 0 ? (
            <Badge tone="accent" aria-label={`${watchlist.length} saved titles`}>{watchlist.length} saved</Badge>
          ) : null}
        </div>
      </header>

      {searchOpen ? (
        <div className="topbar-search-mobile">
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            variant="topbar"
            placeholder="Search movies, TV shows…"
            onClear={clearSearch}
          />
        </div>
      ) : null}

      <main id="main-content" className="main-layout">
        {showShelves && heroItems.length > 0 ? (
          <HeroCarousel items={heroItems} onOpen={openDetail} onPlay={openPlayer} />
        ) : null}

        {showShelves && continueWatching.length > 0 ? (
          <DiscoveryShelf
            title="Continue watching"
            subtitle="Pick up where you left off"
            items={continueWatching}
            onOpen={openDetail}
            onPlay={openPlayer}
            onRemove={(id) => removeFromContinue(id)}
            buildCardProps={buildCardProps}
          />
        ) : null}

        {showShelves && watchlist.length > 0 ? (
          <DiscoveryShelf
            title="Your watchlist"
            subtitle="Saved for later"
            items={watchlist}
            onOpen={openDetail}
            onPlay={openPlayer}
            buildCardProps={buildCardProps}
          />
        ) : null}

        <section className="toolbar-panel">
          <TabBar
            value={categoryFromUrl}
            onChange={(value) => {
              const next = new URLSearchParams(searchParams);
              if (value === 'All') next.delete('category');
              else next.set('category', value);
              setSearchParams(next, { replace: true });
            }}
            tabs={tabs}
          />
          <div className="toolbar-selects">
            <Select
              label="Sort"
              value={sortFromUrl}
              onChange={(value) => {
                const next = new URLSearchParams(searchParams);
                next.set('sort', value);
                setSearchParams(next, { replace: true });
              }}
              options={[
                { value: 'trending', label: 'Trending' },
                { value: 'recent', label: 'Newest' },
                { value: 'runtime-desc', label: 'Longest (approx.)' },
                { value: 'runtime-asc', label: 'Shortest (approx.)' },
                { value: 'title', label: 'Title' },
              ]}
            />
          </div>
        </section>

        {loading ? <CardSkeletonGrid count={12} /> : null}
        {!loading && error ? <ErrorState title="Could not load catalog" description={error} onRetry={refresh} /> : null}

        {!loading && !error ? (
          <>
            {queryFromUrl ? (
              <div className="results-meta">
                <p>
                  {searching ? 'Searching…' : `${filtered.length} result${filtered.length === 1 ? '' : 's'} for `}
                  {searching ? null : <strong>{queryFromUrl}</strong>}
                  {!searching && isTyping ? ' · updating…' : ''}
                </p>
                {searchError ? <p className="muted">Search error: {searchError}</p> : null}
              </div>
            ) : null}

            {queryFromUrl && searching ? <CardSkeletonGrid count={10} /> : null}

            {searching ? null : filtered.length === 0 ? (
              <EmptyState
                title={queryFromUrl ? `No results for "${queryFromUrl}"` : 'Nothing matched that filter'}
                description="Try a broader term, switch categories, or clear the filters."
                action={
                  <Button onClick={() => {
                    setSearchInput('');
                    const next = new URLSearchParams(searchParams);
                    next.delete('q');
                    next.delete('category');
                    next.set('sort', 'trending');
                    setSearchParams(next, { replace: true });
                  }}>
                    Reset
                  </Button>
                }
              />
            ) : (
              <>
                {showShelves ? (
                  <>
                    <DiscoveryShelf title="Trending now" subtitle="What everyone is watching today" items={trending} onOpen={openDetail} onPlay={openPlayer} buildCardProps={buildCardProps} />
                    <DiscoveryShelf title="Popular TV shows" subtitle="Series with the biggest audiences" items={tvShows} onOpen={openDetail} onPlay={openPlayer} buildCardProps={buildCardProps} />
                    <DiscoveryShelf title="Top rated" subtitle="Highest-scoring titles in the catalog" items={topRated} onOpen={openDetail} onPlay={openPlayer} buildCardProps={buildCardProps} />
                    <DiscoveryShelf title="Movies" subtitle="Feature-length releases" items={movies} onOpen={openDetail} onPlay={openPlayer} buildCardProps={buildCardProps} />
                    <DiscoveryShelf title="New releases" subtitle="Freshly added titles" items={newReleases} onOpen={openDetail} onPlay={openPlayer} buildCardProps={buildCardProps} />
                  </>
                ) : null}

                <SectionHeader
                  title={queryFromUrl ? 'Search results' : categoryFromUrl !== 'All' ? `${categoryFromUrl}` : 'All titles'}
                  subtitle={queryFromUrl ? `Live results for "${queryFromUrl}"` : 'Browse the full catalog'}
                  action={<span className="subtle-note">{filtered.length} items</span>}
                />
                <div className="grid card-grid">
                  {filtered.map((item) => {
                    const cardProps = buildCardProps(item);
                    return (
                      <MediaCard
                        key={item.id}
                        item={item}
                        onOpen={() => openDetail(item.id)}
                        onPlay={() => openPlayer(item.id)}
                        {...cardProps}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </>
        ) : null}

        <SiteFooter />
      </main>

      {detail && activeItem ? <DetailOverlay item={activeItem} onClose={() => navigate('/home' + location.search)} onPlay={() => openPlayer(activeItem.id)} /> : null}
      {detail && !activeItem && detailLoading ? <DetailLoading onClose={() => navigate('/home' + location.search)} /> : null}
      {detail && !activeItem && !detailLoading && !loading ? <DetailNotFound onClose={() => navigate('/home')} /> : null}
    </div>
  );
}

function HeroCarousel({ items, onOpen, onPlay }: { items: CatalogItem[]; onOpen: (id: string) => void; onPlay: (id: string) => void }) {
  const [index, setIndex] = useState(0);
  const length = items.length;
  const timer = useRef<number | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || length < 2) return;
    timer.current = window.setInterval(() => {
      setIndex((current) => (current + 1) % length);
    }, 7500);
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    };
  }, [length, paused]);

  if (length === 0) return null;
  const active = items[Math.min(index, length - 1)];
  const inList = isInWatchlist(active.id);

  return (
    <section
      className="hero-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Featured titles"
    >
      <div
        className="hero-panel"
        style={active.backdrop ? { backgroundImage: `linear-gradient(180deg, rgba(6,8,20,0.2) 0%, rgba(6,8,20,0.5) 55%, rgba(6,8,20,0.96) 100%), url(${active.backdrop})` } : undefined}
      >
        <div className="hero-copy">
          <p className="eyebrow">{active.mediaType === 'tv' ? 'TV Series' : active.tags[0] ?? 'Featured'}</p>
          <h1>{active.title}</h1>
          <p className="hero-meta">
            {active.year ? <span>{active.year}</span> : null}
            {active.year ? <span aria-hidden="true">·</span> : null}
            <span>{active.mediaType === 'tv' ? 'Series' : formatRuntime(active.duration)}</span>
            {active.tags[1] ? <span aria-hidden="true">·</span> : null}
            {active.tags[1] ? <span>{active.tags[1]}</span> : null}
          </p>
          <p className="hero-description">{active.description}</p>
          <div className="hero-actions">
            <Button size="lg" onClick={() => onPlay(active.id)}>▶ Play</Button>
            <Button size="lg" variant="secondary" onClick={() => onOpen(active.id)}>More info</Button>
            <Button
              size="lg"
              variant="ghost"
              onClick={() => {
                toggleWatchlist(active);
              }}
              aria-pressed={inList}
            >
              {inList ? '✓ In watchlist' : '+ Watchlist'}
            </Button>
          </div>
        </div>
      </div>

      {length > 1 ? (
        <>
          <button
            type="button"
            className="hero-arrow hero-arrow-prev"
            onClick={() => setIndex((current) => (current - 1 + length) % length)}
            aria-label="Previous featured title"
          >
            ‹
          </button>
          <button
            type="button"
            className="hero-arrow hero-arrow-next"
            onClick={() => setIndex((current) => (current + 1) % length)}
            aria-label="Next featured title"
          >
            ›
          </button>
          <div className="hero-dots" role="tablist" aria-label="Featured title selector">
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Show ${item.title}`}
                className={cn('hero-dot', i === index && 'hero-dot-active')}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function DiscoveryShelf({ title, subtitle, items, onOpen, onPlay, buildCardProps, onRemove }: {
  title: string;
  subtitle: string;
  items: CatalogItem[];
  onOpen: (id: string) => void;
  onPlay: (id: string) => void;
  buildCardProps?: (item: CatalogItem) => { onToggleWatchlist?: () => void; inWatchlist?: boolean; progress?: number | null };
  onRemove?: (id: string) => void;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);

  if (items.length === 0) return null;

  const scrollBy = (direction: number) => {
    const row = rowRef.current;
    if (!row) return;
    const amount = row.clientWidth * 0.85 * direction;
    row.scrollBy({ left: amount, behavior: 'smooth' });
  };

  return (
    <section className="shelf-section">
      <SectionHeader
        title={title}
        subtitle={subtitle}
        action={
          <div className="shelf-controls">
            <button type="button" className="shelf-arrow" onClick={() => scrollBy(-1)} aria-label={`Scroll ${title} left`}>‹</button>
            <button type="button" className="shelf-arrow" onClick={() => scrollBy(1)} aria-label={`Scroll ${title} right`}>›</button>
          </div>
        }
      />
      <div className="shelf-row shelf-row-cards" ref={rowRef} aria-label={title}>
        {items.map((item) => {
          const extra = buildCardProps?.(item);
          return (
            <div className="shelf-card-wrap" key={item.id}>
              <MediaCard
                item={item}
                onOpen={() => onOpen(item.id)}
                onPlay={() => onPlay(item.id)}
                onToggleWatchlist={extra?.onToggleWatchlist}
                inWatchlist={extra?.inWatchlist}
                progress={extra?.progress}
              />
              {onRemove ? (
                <button type="button" className="shelf-card-remove" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.title} from continue watching`}>
                  ✕
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DetailOverlay({ item, onClose, onPlay }: { item: CatalogItem; onClose: () => void; onPlay: () => void }) {
  const trapRef = useFocusTrap<HTMLDivElement>(true, onClose);
  useBodyScrollLock(true);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={`${item.title} details`} ref={trapRef}>
      <div className="overlay-backdrop" onClick={onClose} />
      <div className="overlay-panel">
        <DetailContent item={item} compact onClose={onClose} onPlay={onPlay} />
      </div>
    </div>
  );
}

function DetailNotFound({ onClose }: { onClose: () => void }) {
  const trapRef = useFocusTrap<HTMLDivElement>(true, onClose);
  useBodyScrollLock(true);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Title not found" ref={trapRef}>
      <div className="overlay-backdrop" onClick={onClose} />
      <div className="overlay-panel">
        <ErrorState title="Title not found" description="The selected title is unavailable or was removed from the catalog." onRetry={onClose} />
      </div>
    </div>
  );
}

function DetailLoading({ onClose }: { onClose: () => void }) {
  const trapRef = useFocusTrap<HTMLDivElement>(true, onClose);
  useBodyScrollLock(true);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Loading title" ref={trapRef}>
      <div className="overlay-backdrop" onClick={onClose} />
      <div className="overlay-panel detail-loading-panel">
        <CardSkeletonGrid count={1} />
      </div>
    </div>
  );
}

function DetailContent({ item, compact = false, onClose }: { item: CatalogItem; compact?: boolean; onClose?: () => void; onPlay: () => void }) {
  const location = useLocation();
  const routeState = (location.state as { openPlayer?: boolean } | null) ?? null;
  const openPlayerRequested = Boolean(routeState?.openPlayer);
  const [playerOpen, setPlayerOpen] = useState(openPlayerRequested);
  const [related, setRelated] = useState<CatalogItem[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [inList, setInList] = useState(() => isInWatchlist(item.id));

  useEffect(() => {
    setInList(isInWatchlist(item.id));
    return subscribeWatchlist(() => setInList(isInWatchlist(item.id)));
  }, [item.id]);

  useEffect(() => {
    if (openPlayerRequested) setPlayerOpen(true);
  }, [openPlayerRequested]);

  useEffect(() => {
    if (!item.tmdbId || !item.mediaType) {
      setRelated([]);
      return;
    }
    const controller = new AbortController();
    setRelatedLoading(true);
    fetchSimilar(item.tmdbId, item.mediaType, controller.signal)
      .then((list) => {
        if (controller.signal.aborted) return;
        setRelated(list);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setRelated([]);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setRelatedLoading(false);
      });
    return () => controller.abort();
  }, [item.tmdbId, item.mediaType]);

  return (
    <div className={cn('detail-view', compact && 'detail-view-compact')}>
      <div className="detail-topbar">
        <Button variant="ghost" onClick={onClose} aria-label="Close detail view">
          Close
        </Button>
        <div className="detail-topbar-actions">
          <Button
            variant="secondary"
            onClick={() => {
              toggleWatchlist(item);
              setInList((v) => !v);
            }}
            aria-pressed={inList}
          >
            {inList ? '✓ Saved' : '+ Watchlist'}
          </Button>
          <Button onClick={() => setPlayerOpen(true)}>Play</Button>
        </div>
      </div>

      <div className="detail-hero">
        <PosterImage item={item} className="detail-poster" />
        <div className="detail-copy">
          <div className="detail-badges">
            {item.tags.slice(0, 5).map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
          <h1>{item.title}</h1>
          <p className="detail-meta">
            <span>{item.year ?? 'Year unavailable'}</span>
            <span>•</span>
            <span>{item.mediaType === 'tv' ? 'TV Series' : formatRuntime(item.duration)}</span>
            <span>•</span>
            <span>{item.author}</span>
          </p>
          <p className="detail-description">{item.description}</p>
          <div className="detail-actions">
            <Button size="lg" onClick={() => setPlayerOpen(true)}>▶ Play now</Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => {
                toggleWatchlist(item);
                setInList((v) => !v);
              }}
            >
              {inList ? '✓ In watchlist' : '+ Add to watchlist'}
            </Button>
          </div>
        </div>
      </div>

      <section className="detail-sections">
        {item.credits && item.credits.length > 0 ? (
          <Card className="detail-card">
            <SectionHeader title="Cast & crew" subtitle="Source data from TMDB" />
            <div className="credit-list">
              {item.credits.map((credit) => (
                <div key={`${credit.role}-${credit.name}`} className="credit-row">
                  <strong>{credit.role}</strong>
                  <span>{credit.name}</span>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        <Card className="detail-card">
          <SectionHeader title="More like this" subtitle={item.tmdbId ? 'From TMDB recommendations' : 'Suggestions unavailable'} />
          {relatedLoading ? (
            <CardSkeletonGrid count={3} />
          ) : related.length === 0 ? (
            <p className="muted">No related titles available.</p>
          ) : (
            <div className="related-grid">
              {related.map((rel) => (
                <RelatedCard key={rel.id} item={rel} />
              ))}
            </div>
          )}
        </Card>
      </section>

      {playerOpen ? <PlayerModal item={item} onClose={() => setPlayerOpen(false)} /> : null}
    </div>
  );
}

function RelatedCard({ item }: { item: CatalogItem }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <Card className="related-card" tabIndex={0} role="button" onClick={() => navigate(`/home/${item.id}${location.search}`, { state: { backgroundLocation: location } })} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(`/home/${item.id}${location.search}`, { state: { backgroundLocation: location } })}>
      <PosterImage item={item} className="related-poster" />
      <div>
        <strong>{item.title}</strong>
        <p>{item.mediaType === 'tv' ? 'TV Series' : formatRuntime(item.duration)}</p>
      </div>
    </Card>
  );
}

function PlayerModal({ item, onClose }: { item: CatalogItem; onClose: () => void }) {
  if (item.tmdbId && item.mediaType) {
    return <EmbedPlayer item={item} onClose={onClose} />;
  }
  return <StreamPlayer item={item} onClose={onClose} />;
}

function StreamPlayer({ item, onClose }: { item: CatalogItem; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);
  const dashRef = useRef<any>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(true, onClose);
  useBodyScrollLock(true);

  const [serverOptions] = useState<ServerOption[]>(() => buildServerOptions(item));
  const resumeServer = loadResumeState(item.id)?.serverId;
  const initialServer: StreamKind = (resumeServer && isServerKind(resumeServer) ? resumeServer : (serverOptions[0]?.id as StreamKind) ?? 'hls');
  const [activeServer, setActiveServer] = useState<StreamKind>(initialServer);
  const onServerSelect = (value: string) => {
    if (isServerKind(value)) setActiveServer(value);
  };
  const [serverStates, setServerStates] = useState<Record<string, 'idle' | 'loading' | 'ready' | 'failed'>>(() =>
    Object.fromEntries(serverOptions.map((option) => [option.id, option.id === activeServer ? 'loading' : 'idle'])) as Record<string, 'idle' | 'loading' | 'ready' | 'failed'>,
  );
  const [qualityOptions, setQualityOptions] = useState<QualityOption[]>([]);
  const [selectedQuality, setSelectedQuality] = useState('auto');
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(loadResumeState(item.id)?.muted ?? false);
  const [volume, setVolume] = useState(loadResumeState(item.id)?.volume ?? 0.9);
  const [message, setMessage] = useState<string>('Loading stream…');
  const [error, setError] = useState<string | null>(null);
  const resume = useRef<ResumeState | null>(loadResumeState(item.id));

  const activeSource = useMemo(() => serverOptions.find((option) => option.id === activeServer) ?? serverOptions[0], [activeServer, serverOptions]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    setError(null);
    setMessage(`Connecting to ${activeSource.label}…`);
    setServerStates((prev) => ({ ...prev, [activeServer]: 'loading' }));
    setQualityOptions([]);
    setSelectedQuality('auto');

    const destroyPlayers = () => {
      try { hlsRef.current?.destroy(); } catch { /* ignore */ }
      hlsRef.current = null;
      try { dashRef.current?.reset(); } catch { /* ignore */ }
      dashRef.current = null;
      video.removeAttribute('src');
      video.load();
    };

    destroyPlayers();

    const markFailed = () => {
      if (cancelled) return;
      setServerStates((prev) => ({ ...prev, [activeServer]: 'failed' }));
      const nextIndex = serverOptions.findIndex((option) => option.id === activeServer) + 1;
      const next = serverOptions.slice(nextIndex).find((option) => option.supported);
      if (next && isServerKind(next.id)) {
        setMessage(`Falling back from ${activeSource.label} to ${next.label}…`);
        setActiveServer(next.id);
        return;
      }
      setError('All servers failed to load this title.');
      setMessage('Playback unavailable.');
    };

    const applyResume = () => {
      const saved = resume.current;
      if (!saved) return;
      if (saved.volume !== undefined) setVolume(saved.volume);
      if (saved.muted !== undefined) setMuted(saved.muted);
      if (saved.time && saved.time > 5) {
        try { video.currentTime = saved.time; } catch { /* ignore */ }
      }
    };

    const finalizeReady = () => {
      if (cancelled) return;
      setServerStates((prev) => ({ ...prev, [activeServer]: 'ready' }));
      setMessage(`${activeSource.label} ready`);
      applyResume();
    };

    const setNativeSource = () => {
      video.src = activeSource.url;
      video.load();
      video.onloadedmetadata = () => {
        if (cancelled) return;
        setDuration(video.duration || 0);
        finalizeReady();
      };
      video.oncanplay = () => {
        if (cancelled) return;
        if (video.paused) setPlaying(false);
      };
      video.onerror = () => markFailed();
    };

    if (activeServer === 'progressive') {
      setNativeSource();
    } else if (activeServer === 'hls' || activeServer === 'hls_ts') {
      loadHls()
        .then((mod) => {
          if (cancelled) return;
          const Hls = mod.default ?? (mod as any);
          if (Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 90 });
            hlsRef.current = hls;
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              if (cancelled) return;
              setQualityOptions(buildQualityListFromLevels(hls.levels));
              setDuration(video.duration || 0);
              finalizeReady();
              void video.play().catch(() => undefined);
            });
            hls.on(Hls.Events.ERROR, (_event: unknown, data: any) => {
              if (data?.fatal) markFailed();
            });
            hls.loadSource(activeSource.url);
            hls.attachMedia(video);
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            setNativeSource();
          } else {
            markFailed();
          }
        })
        .catch(() => markFailed());
    } else if (activeServer === 'dash') {
      loadDash()
        .then((mod) => {
          if (cancelled) return;
          const dashjs = (mod.default ?? (mod as any));
          const player = dashjs.MediaPlayer().create();
          dashRef.current = player;
          player.initialize(video, activeSource.url, false);
          player.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
            if (cancelled) return;
            const levels = player.getBitrateInfoListFor('video') ?? [];
            setQualityOptions(buildQualityListFromLevels(levels));
            setDuration(video.duration || 0);
            finalizeReady();
            void video.play().catch(() => undefined);
          });
          player.on(dashjs.MediaPlayer.events.ERROR, () => markFailed());
        })
        .catch(() => markFailed());
    }

    video.volume = volume;
    video.muted = muted;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime || 0);
      const snapshot: ResumeState = {
        time: video.currentTime || 0,
        serverId: activeServer,
        muted: video.muted,
        volume: video.volume,
      };
      saveResumeState(item.id, snapshot);
      if (video.duration > 0) {
        recordProgress(item, video.currentTime, video.duration);
      }
    };

    const onVolumeChange = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onLoaded = () => setDuration(video.duration || 0);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('volumechange', onVolumeChange);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('loadedmetadata', onLoaded);

    return () => {
      cancelled = true;
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('volumechange', onVolumeChange);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('loadedmetadata', onLoaded);
      destroyPlayers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeServer, activeSource.label, activeSource.url, item.id, serverOptions]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
  }, [muted, volume]);

  useEffect(() => {
    if (!qualityOptions.length) return;
    const video = videoRef.current;
    const hls = hlsRef.current;
    if (!video || !hls) return;
    if (selectedQuality === 'auto') {
      hls.currentLevel = -1;
      return;
    }
    const levelIndex = Number(selectedQuality);
    if (Number.isFinite(levelIndex)) {
      hls.currentLevel = levelIndex;
    }
  }, [qualityOptions.length, selectedQuality]);

  const download = safeDownloadUrl(activeSource);

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      await video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  const seek = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = value;
    setCurrentTime(value);
  };

  const changeVolume = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = value;
    if (value > 0) video.muted = false;
    setVolume(value);
    setMuted(video.muted);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const toggleFullscreen = async () => {
    const container = document.querySelector('.player-shell') as HTMLElement | null;
    if (!container) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await container.requestFullscreen().catch(() => undefined);
    }
  };

  return (
    <div className="player-overlay" role="dialog" aria-modal="true" aria-label={`${item.title} player`} ref={trapRef}>
      <div className="player-backdrop" onClick={onClose} />
      <div className="player-shell">
        <div className="player-header">
          <div>
            <p className="eyebrow">Player</p>
            <h2>{item.title}</h2>
            <p className="muted">{message}</p>
          </div>
          <div className="player-header-actions">
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <a className="btn btn-secondary btn-md" href={download.url} download={downloadFilename(item, activeServer)} target="_blank" rel="noreferrer" aria-label={`Download ${item.title}`}>
              Download
            </a>
          </div>
        </div>

        <div className="player-stage">
          <video ref={videoRef} className="player-video" playsInline preload="metadata" />
          <div className="player-controls">
            <div className="player-top-controls">
              <ServerSelector options={serverOptions} activeId={activeServer} states={serverStates} onSelect={onServerSelect} />
              <QualitySelector value={selectedQuality} options={qualityOptions} onChange={setSelectedQuality} />
            </div>

            <div className="timeline-row">
              <span>{formatTime(currentTime)}</span>
              <input type="range" min={0} max={Math.max(duration, 0)} value={Math.min(currentTime, duration || currentTime)} onChange={(e) => seek(Number(e.target.value))} aria-label="Seek" />
              <span>{duration ? formatTime(duration) : '0:00'}</span>
            </div>

            <div className="control-row">
              <Button onClick={togglePlay}>{playing ? 'Pause' : 'Play'}</Button>
              <Button variant="secondary" onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</Button>
              <label className="volume-control">
                <span>Volume</span>
                <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} onChange={(e) => changeVolume(Number(e.target.value))} aria-label="Volume" />
              </label>
              <Button variant="ghost" onClick={toggleFullscreen}>Fullscreen</Button>
              <span className={cn('server-status', error ? 'server-failed' : 'server-ready')}>{error ? error : activeSource.label}</span>
            </div>
          </div>
        </div>

        <div className="download-note">{download.note}</div>
      </div>
    </div>
  );
}

function EmbedPlayer({ item, onClose }: { item: CatalogItem; onClose: () => void }) {
  const tmdbId = item.tmdbId!;
  const mediaType = item.mediaType!;
  const isTv = mediaType === 'tv';
  const trapRef = useFocusTrap<HTMLDivElement>(true, onClose);
  useBodyScrollLock(true);

  const resume = loadResumeState(item.id);
  const [season, setSeason] = useState(resume?.season ?? 1);
  const [episode, setEpisode] = useState(resume?.episode ?? 1);
  const [imdbId, setImdbId] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchExternalIds(tmdbId, mediaType)
      .then((data) => {
        if (!cancelled) setImdbId(data?.imdb_id || null);
      })
      .catch(() => {
        if (!cancelled) setImdbId(null);
      });
    return () => { cancelled = true; };
  }, [tmdbId, mediaType]);

  useEffect(() => {
    if (!isTv) return;
    const controller = new AbortController();
    fetchTvSeasons(tmdbId, controller.signal)
      .then((list) => {
        if (controller.signal.aborted) return;
        setSeasons(list);
        if (list.length > 0 && !list.some((s) => s.season_number === season)) {
          setSeason(list[0].season_number);
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setSeasons([]);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbId, isTv]);

  useEffect(() => {
    if (!isTv) return;
    const controller = new AbortController();
    setEpisodesLoading(true);
    fetchTvSeasonEpisodes(tmdbId, season, controller.signal)
      .then((list) => {
        if (controller.signal.aborted) return;
        setEpisodes(list);
        if (list.length > 0 && !list.some((e) => e.episode_number === episode)) {
          setEpisode(list[0].episode_number);
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setEpisodes([]);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setEpisodesLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbId, isTv, season]);

  const serverOptions = useMemo(
    () => buildEmbedServerOptions(tmdbId, mediaType, { imdbId, season, episode }),
    [tmdbId, mediaType, imdbId, season, episode],
  );

  const firstSupported = serverOptions.find((o) => o.supported) ?? serverOptions[0];
  const initialServer = resume?.serverId && serverOptions.some((o) => o.id === resume.serverId && o.supported)
    ? resume.serverId
    : firstSupported.id;
  const [activeServer, setActiveServer] = useState<string>(initialServer);

  const [serverStates, setServerStates] = useState<Record<string, 'idle' | 'loading' | 'ready' | 'failed'>>(() =>
    Object.fromEntries(serverOptions.map((o) => [o.id, o.id === initialServer ? 'loading' : 'idle'])),
  );

  const activeSource = useMemo(
    () => serverOptions.find((o) => o.id === activeServer) ?? serverOptions[0],
    [activeServer, serverOptions],
  );

  useEffect(() => {
    setServerStates((prev) => ({ ...prev, [activeServer]: 'loading' }));
    saveResumeState(item.id, { time: 0, serverId: activeServer, season, episode });
    if (item.tmdbId) {
      recordProgress(item, 30, isTv ? 0 : item.duration, { season: isTv ? season : undefined, episode: isTv ? episode : undefined });
    }
  }, [activeServer, item, isTv, season, episode]);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }
    const iframe = iframeRef.current as (HTMLIFrameElement & {
      webkitRequestFullscreen?: () => Promise<void>;
      webkitEnterFullscreen?: () => void;
    }) | null;
    if (!iframe) return;
    if (iframe.requestFullscreen) {
      await iframe.requestFullscreen().catch(() => undefined);
    } else if (iframe.webkitRequestFullscreen) {
      await iframe.webkitRequestFullscreen();
    } else if (iframe.webkitEnterFullscreen) {
      iframe.webkitEnterFullscreen();
    }
  };

  return (
    <div className="player-overlay" role="dialog" aria-modal="true" aria-label={`${item.title} player`} ref={trapRef}>
      <div className="player-backdrop" onClick={onClose} />
      <div className="player-shell">
        <button
          type="button"
          className="player-close-btn"
          onClick={onClose}
          aria-label="Close player"
          title="Close"
        >
          ✕
        </button>

        <div className="player-header">
          <div>
            <h2>{item.title}</h2>
            <p className="muted">{item.year ? `${item.year} · ` : ''}Streaming via {activeSource.label}{isTv ? ` · S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}` : ''}</p>
          </div>
          <button type="button" className="btn btn-primary btn-md player-header-fs" onClick={toggleFullscreen} aria-label="Fullscreen">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 9V5a1 1 0 0 1 1-1h4" />
              <path d="M20 9V5a1 1 0 0 0-1-1h-4" />
              <path d="M4 15v4a1 1 0 0 0 1 1h4" />
              <path d="M20 15v4a1 1 0 0 1-1 1h-4" />
            </svg>
            Fullscreen
          </button>
        </div>

        <div className="player-stage">
          <div className="player-video-wrap">
            <iframe
              ref={iframeRef}
              key={`${activeServer}-${season}-${episode}`}
              src={activeSource.url}
              className="player-video"
              title={`${item.title} stream`}
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write; web-share"
              allowFullScreen
              referrerPolicy="origin"
              onLoad={() => setServerStates((prev) => ({ ...prev, [activeServer]: 'ready' }))}
            />
            <button
              type="button"
              className="player-fs-btn"
              onClick={toggleFullscreen}
              aria-label="Maximize player"
              title="Fullscreen"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 9V5a1 1 0 0 1 1-1h4" />
                <path d="M20 9V5a1 1 0 0 0-1-1h-4" />
                <path d="M4 15v4a1 1 0 0 0 1 1h4" />
                <path d="M20 15v4a1 1 0 0 1-1 1h-4" />
              </svg>
            </button>
          </div>
          <div className="player-controls">
            {isTv ? (
              <div className="player-episode-row">
                <label className="select-field">
                  <span>Season</span>
                  <select
                    value={season}
                    onChange={(e) => {
                      const next = Number(e.target.value) || 1;
                      setSeason(next);
                      setEpisode(1);
                    }}
                    aria-label="Season"
                  >
                    {(seasons.length ? seasons : [{ season_number: season, name: `Season ${season}`, episode_count: 0 }]).map((s) => (
                      <option key={s.season_number} value={s.season_number}>
                        {s.name}{s.episode_count ? ` · ${s.episode_count} ep` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="select-field">
                  <span>Episode</span>
                  <select
                    value={episode}
                    onChange={(e) => setEpisode(Number(e.target.value) || 1)}
                    aria-label="Episode"
                    disabled={episodesLoading}
                  >
                    {(episodes.length
                      ? episodes
                      : [{ episode_number: episode, name: `Episode ${episode}`, overview: '', still_path: null, runtime: null, air_date: null }]
                    ).map((ep) => (
                      <option key={ep.episode_number} value={ep.episode_number}>
                        Ep {ep.episode_number}{ep.name ? ` · ${ep.name}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
            <ServerSelector options={serverOptions} activeId={activeServer} states={serverStates} onSelect={setActiveServer} />
            <div className="player-actions-row">
              <a
                className="player-action-link"
                href={activeSource.url}
                target="_blank"
                rel="noreferrer"
                title="Open this stream directly in a new tab"
              >
                ↗ Open in new tab
              </a>
            </div>
          </div>
        </div>

        <div className="download-note">
          If the player stays blank or shows ads only, pick another server above. Many embed providers also block local-dev origins — videos work more reliably once deployed.
        </div>
      </div>
    </div>
  );
}
