import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Badge,
  Button,
  CardSkeletonGrid,
  EmptyState,
  ErrorState,
  MediaCard,
  SearchInput,
  SectionHeader,
  Select,
  TabBar,
  ThemeToggle,
} from './components';
import { useCatalog, useWatchlistState } from './CatalogContext';
import { DetailLoading, DetailNotFound, DetailOverlay } from './Detail';
import { DiscoveryShelf } from './DiscoveryShelf';
import { HeroCarousel } from './HeroCarousel';
import { SiteFooter } from './StaticPages';
import {
  fetchTmdbItem,
  filterByCategory,
  getCatalogBuckets,
  matchCatalogSearch,
  searchTmdb,
  sortCatalog,
} from './lib/catalog';
import { useDebouncedValue } from './lib/hooks';
import {
  continueProgress,
  isInWatchlist,
  removeFromContinue,
  toggleWatchlist,
} from './lib/watchlist';
import type { CatalogItem } from './types';

export function RedirectExploreToHome() {
  const { id } = useParams();
  const location = useLocation();
  return <Navigate to={`/home/${id ?? ''}${location.search}`} replace />;
}

export function ExploreRoute({ detail = false }: { detail?: boolean }) {
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
