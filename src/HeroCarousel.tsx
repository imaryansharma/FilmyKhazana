import { useEffect, useRef, useState } from 'react';
import { Button, cn } from './components';
import { formatRuntime } from './lib/catalog';
import { isInWatchlist, toggleWatchlist } from './lib/watchlist';
import type { CatalogItem } from './types';

export function HeroCarousel({ items, onOpen, onPlay }: { items: CatalogItem[]; onOpen: (id: string) => void; onPlay: (id: string) => void }) {
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
