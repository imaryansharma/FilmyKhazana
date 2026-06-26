import { useRef } from 'react';
import { MediaCard, SectionHeader } from './components';
import type { CatalogItem } from './types';

export function DiscoveryShelf({ title, subtitle, items, onOpen, onPlay, buildCardProps, onRemove }: {
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
