import React from 'react';
import type { CatalogItem, QualityOption, ServerOption } from './types';

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <button
      className={cn('btn', `btn-${variant}`, `btn-${size}`, className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' }) {
  return <span className={cn('badge', `badge-${tone}`)}>{children}</span>;
}

export function Card({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card', className)} {...props}>
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

export function PosterImage({ item, className }: { item: CatalogItem; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  const fallback = React.useMemo(() => makePosterFallback(item.title, item.tags[0] ?? 'Video'), [item.tags, item.title]);
  return (
    <img
      src={failed ? fallback : item.poster}
      alt={item.title}
      className={cn('poster', className)}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function makePosterFallback(title: string, subtitle: string): string {
  const safeTitle = escapeXml(title);
  const safeSubtitle = escapeXml(subtitle);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#1f2b4d"/>
          <stop offset="48%" stop-color="#101a33"/>
          <stop offset="100%" stop-color="#050816"/>
        </linearGradient>
        <radialGradient id="r" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#7c89ff" stop-opacity="0.9"/>
          <stop offset="55%" stop-color="#7c89ff" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#7c89ff" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="800" height="1200" fill="url(#g)"/>
      <circle cx="570" cy="220" r="280" fill="url(#r)"/>
      <rect x="50" y="940" width="700" height="150" rx="28" fill="rgba(255,255,255,0.06)"/>
      <text x="60" y="102" fill="#c7d2fe" font-family="Inter, Arial, sans-serif" font-size="28" letter-spacing="4">LUMEN</text>
      <text x="60" y="860" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="60" font-weight="700">${safeTitle}</text>
      <text x="60" y="910" fill="#9ca3af" font-family="Inter, Arial, sans-serif" font-size="28">${safeSubtitle}</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function SectionHeader({
  title,
  action,
  subtitle,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <Card className="empty-state">
      <div className="empty-icon">✦</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="empty-actions">{action}</div> : null}
    </Card>
  );
}

export function ErrorState({ title, description, onRetry }: { title: string; description: string; onRetry?: () => void }) {
  return (
    <Card className="empty-state error-state">
      <div className="empty-icon">!</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {onRetry ? (
        <div className="empty-actions">
          <Button onClick={onRetry}>Try again</Button>
        </div>
      ) : null}
    </Card>
  );
}

export function CardSkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid card-grid">
      {Array.from({ length: count }).map((_, index) => (
        <Card className="media-card skeleton-card" key={index}>
          <Skeleton className="poster skeleton-poster" />
          <div className="card-body">
            <Skeleton className="line" />
            <Skeleton className="line short" />
            <Skeleton className="line tiny" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function MediaCard({ item, onOpen, onPlay, onToggleWatchlist, inWatchlist, progress }: { item: CatalogItem; onOpen: () => void; onPlay: () => void; onToggleWatchlist?: () => void; inWatchlist?: boolean; progress?: number | null }) {
  return (
    <Card className="media-card" tabIndex={0} role="button" aria-label={`Open ${item.title}`} onClick={onOpen} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}>
      <div className="media-card-poster-wrap">
        <PosterImage item={item} />
        {item.mediaType ? <span className="media-card-kind" aria-hidden="true">{item.mediaType === 'tv' ? 'TV' : 'Movie'}</span> : null}
        {onToggleWatchlist ? (
          <button
            type="button"
            className={cn('media-card-watchlist', inWatchlist && 'media-card-watchlist-active')}
            aria-label={inWatchlist ? `Remove ${item.title} from watchlist` : `Add ${item.title} to watchlist`}
            onClick={(e) => { e.stopPropagation(); onToggleWatchlist(); }}
          >
            {inWatchlist ? '✓' : '+'}
          </button>
        ) : null}
        <button
          type="button"
          className="media-card-play"
          aria-label={`Play ${item.title}`}
          onClick={(e) => { e.stopPropagation(); onPlay(); }}
        >
          ▶
        </button>
        {progress != null && progress > 0 && progress < 100 ? (
          <div className="media-card-progress" aria-hidden="true">
            <span style={{ width: `${Math.min(100, Math.max(2, progress))}%` }} />
          </div>
        ) : null}
      </div>
      <div className="card-body">
        <h3 title={item.title}>{item.title}</h3>
        <p>
          {item.year ? <span>{item.year}</span> : null}
          {item.year && item.tags[0] ? <span aria-hidden="true"> · </span> : null}
          {item.tags[0] ? <span>{item.tags[0]}</span> : null}
        </p>
      </div>
    </Card>
  );
}

export function SearchInput({ value, onChange, placeholder, variant = 'panel', onClear }: { value: string; onChange: (next: string) => void; placeholder?: string; variant?: 'panel' | 'topbar'; onClear?: () => void }) {
  return (
    <label className={cn('search-input', variant === 'topbar' && 'search-input-topbar')}>
      <span aria-hidden="true">⌕</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? 'Search titles, creators, tags'} aria-label="Search titles, creators, or tags" />
      {value && onClear ? (
        <button type="button" className="search-clear" onClick={onClear} aria-label="Clear search">
          ✕
        </button>
      ) : null}
    </label>
  );
}

export function Select({ value, onChange, options, label }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; label: string }) {
  return (
    <label className="select-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TabBar({ value, onChange, tabs }: { value: string; onChange: (value: string) => void; tabs: string[] }) {
  return (
    <div className="tab-bar" role="tablist" aria-label="Content categories">
      {tabs.map((tab) => (
        <button key={tab} role="tab" aria-selected={value === tab} className={cn('tab-pill', value === tab && 'tab-pill-active')} onClick={() => onChange(tab)}>
          {tab}
        </button>
      ))}
    </div>
  );
}

export function ServerBadge({ status }: { status: 'idle' | 'loading' | 'ready' | 'failed' }) {
  const label = status === 'idle' ? 'Idle' : status === 'loading' ? 'Loading' : status === 'ready' ? 'Ready' : 'Failed';
  return <span className={cn('server-status', `server-${status}`)}>{label}</span>;
}

export function ServerSelector({
  options,
  activeId,
  states,
  onSelect,
}: {
  options: ServerOption[];
  activeId: string;
  states: Record<string, 'idle' | 'loading' | 'ready' | 'failed'>;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="server-selector" role="tablist" aria-label="Playback servers">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={cn('server-option', activeId === option.id && 'server-option-active', !option.supported && 'server-option-disabled')}
          onClick={() => option.supported && onSelect(option.id)}
          disabled={!option.supported}
          role="tab"
          aria-selected={activeId === option.id}
          aria-disabled={!option.supported}
          title={!option.supported ? 'Loading IMDb id…' : undefined}
        >
          <span className="server-option-top">
            <strong>{option.label}</strong>
            <ServerBadge status={states[option.id] ?? 'idle'} />
          </span>
          <span className="server-option-url">{option.mimeType}</span>
        </button>
      ))}
    </div>
  );
}

export function QualitySelector({ value, options, onChange }: { value: string; options: QualityOption[]; onChange: (value: string) => void }) {
  if (options.length === 0) return null;
  return (
    <label className="select-field quality-select">
      <span>Quality</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Playback quality">
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
