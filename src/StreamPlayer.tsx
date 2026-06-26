import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, QualitySelector, ServerSelector, cn } from './components';
import { useBodyScrollLock, useFocusTrap } from './lib/hooks';
import {
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
import { recordProgress } from './lib/watchlist';
import type { CatalogItem, QualityOption, ServerOption, StreamKind } from './types';

export function StreamPlayer({ item, onClose }: { item: CatalogItem; onClose: () => void }) {
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
