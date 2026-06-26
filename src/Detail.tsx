import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, CardSkeletonGrid, ErrorState, PosterImage, SectionHeader, cn } from './components';
import { fetchSimilar, formatRuntime } from './lib/catalog';
import { useBodyScrollLock, useFocusTrap } from './lib/hooks';
import { isInWatchlist, subscribeWatchlist, toggleWatchlist } from './lib/watchlist';
import { PlayerModal } from './PlayerModal';
import type { CatalogItem } from './types';

export function DetailOverlay({ item, onClose, onPlay }: { item: CatalogItem; onClose: () => void; onPlay: () => void }) {
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

export function DetailNotFound({ onClose }: { onClose: () => void }) {
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

export function DetailLoading({ onClose }: { onClose: () => void }) {
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
