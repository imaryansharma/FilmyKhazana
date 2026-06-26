import { useEffect, useMemo, useRef, useState } from 'react';
import { ScanningOverlay, ServerSelector } from './components';
import {
  fetchExternalIds,
  fetchTvSeasonEpisodes,
  fetchTvSeasons,
  type EpisodeSummary,
  type SeasonSummary,
} from './lib/catalog';
import { useBodyScrollLock, useFocusTrap } from './lib/hooks';
import { buildEmbedServerOptions, loadResumeState, saveResumeState } from './lib/playback';
import { recordProgress } from './lib/watchlist';
import type { CatalogItem } from './types';

export function EmbedPlayer({ item, onClose }: { item: CatalogItem; onClose: () => void }) {
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
            {serverStates[activeServer] !== 'ready' ? (
              <ScanningOverlay
                title={item.title}
                servers={serverOptions.map((o) => ({ id: o.id, label: o.label }))}
              />
            ) : null}
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

        <div className="player-info-panel">
          <strong>Subtitles, audio &amp; quality</strong>
          <ul>
            <li>Open the gear / CC icon <em>inside</em> the video frame — every provider controls its own subtitles, audio tracks and video quality.</li>
            <li>Not all providers expose every option. If you can&apos;t find subtitles, try another server above.</li>
            <li>Blank player or only ads? Pick a different server — providers go up and down all the time.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
