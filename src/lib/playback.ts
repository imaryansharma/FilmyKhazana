import type { CatalogItem, MediaType, QualityOption, ServerOption, StreamKind } from '../types';

type HlsModule = typeof import('hls.js');
type DashModule = typeof import('dashjs');

let hlsPromise: Promise<HlsModule> | null = null;
let dashPromise: Promise<DashModule> | null = null;

export function loadHls(): Promise<HlsModule> {
  if (!hlsPromise) {
    hlsPromise = import('hls.js').then((mod) => mod);
  }
  return hlsPromise;
}

export function loadDash(): Promise<DashModule> {
  if (!dashPromise) {
    dashPromise = import('dashjs').then((mod) => mod);
  }
  return dashPromise;
}

type EmbedProvider = {
  label: string;
  host: string;
  idType: 'tmdb' | 'imdb';
  buildMovie: (id: string) => string;
  buildTv: ((id: string, season: number, episode: number) => string) | null;
};

const EMBED_PROVIDERS: EmbedProvider[] = [
  {
    label: 'Aurora',
    host: 'player2.vidplus.pro',
    idType: 'tmdb',
    buildMovie: (id) => `https://player2.vidplus.pro/embed/movie/${id}?autoplay=true`,
    buildTv: (id, s, e) => `https://player2.vidplus.pro/embed/tv/${id}/${s}/${e}?autoplay=true`,
  },
  {
    label: 'Echo',
    host: 'player.videasy.net',
    idType: 'tmdb',
    buildMovie: (id) => `https://player.videasy.net/movie/${id}`,
    buildTv: (id, s, e) => `https://player.videasy.net/tv/${id}/${s}/${e}`,
  },
  {
    label: 'Pulse',
    host: 'ythd.org',
    idType: 'tmdb',
    buildMovie: (id) => `https://ythd.org/embed/${id}`,
    buildTv: null,
  },
  {
    label: 'Nova',
    host: 'vidfast.pro',
    idType: 'tmdb',
    buildMovie: (id) => `https://vidfast.pro/movie/${id}?autoplay=true`,
    buildTv: (id, s, e) => `https://vidfast.pro/tv/${id}/${s}/${e}?autoplay=true`,
  },
  {
    label: 'Orion',
    host: 'vidsrc.cc',
    idType: 'imdb',
    buildMovie: (id) => `https://vidsrc.cc/v2/embed/movie/${id}`,
    buildTv: (id, s, e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}`,
  },
  {
    label: 'Vega',
    host: '2embed.stream',
    idType: 'imdb',
    buildMovie: (id) => `https://2embed.stream/embed/movie/${id}`,
    buildTv: (id, s, e) => `https://2embed.stream/embed/tv/${id}/${s}/${e}`,
  },
  {
    label: 'Lyra',
    host: 'cinemaos.tech',
    idType: 'tmdb',
    buildMovie: (id) => `https://cinemaos.tech/player/${id}`,
    buildTv: (id, s, e) => `https://cinemaos.tech/player/${id}/${s}/${e}`,
  },
  {
    label: 'Polaris',
    host: 'vidsrc.to',
    idType: 'tmdb',
    buildMovie: (id) => `https://vidsrc.to/embed/movie/${id}`,
    buildTv: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}`,
  },
  {
    label: 'Sirius',
    host: 'vidsrc.me',
    idType: 'tmdb',
    buildMovie: (id) => `https://vidsrc.me/embed/movie?tmdb=${id}`,
    buildTv: (id, s, e) => `https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  },
  {
    label: 'Cygnus',
    host: 'embed.smashystream.com',
    idType: 'tmdb',
    buildMovie: (id) => `https://embed.smashystream.com/playere.php?tmdb=${id}`,
    buildTv: (id, s, e) => `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${s}&episode=${e}`,
  },
  {
    label: 'Atlas',
    host: 'multiembed.mov',
    idType: 'tmdb',
    buildMovie: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1`,
    buildTv: (id, s, e) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`,
  },
  {
    label: 'Helios',
    host: 'nontongo.win',
    idType: 'tmdb',
    buildMovie: (id) => `https://nontongo.win/embed/movie/${id}`,
    buildTv: (id, s, e) => `https://nontongo.win/embed/tv/${id}/${s}/${e}`,
  },
  {
    label: 'Phoenix',
    host: 'vidlink.pro',
    idType: 'tmdb',
    buildMovie: (id) => `https://vidlink.pro/movie/${id}`,
    buildTv: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}`,
  },
];

export function buildEmbedServerOptions(
  tmdbId: number,
  mediaType: MediaType,
  options: { imdbId?: string | null; season?: number; episode?: number } = {},
): ServerOption[] {
  const { imdbId = null, season = 1, episode = 1 } = options;
  return EMBED_PROVIDERS
    .filter((p) => mediaType === 'movie' || p.buildTv !== null)
    .map((p, index) => {
      const id = p.idType === 'imdb' ? imdbId : String(tmdbId);
      const supported = Boolean(id);
      const url = !supported
        ? ''
        : mediaType === 'tv'
          ? p.buildTv!(String(id), season, episode)
          : p.buildMovie(String(id));
      return {
        id: `embed-${index}`,
        label: p.label,
        url,
        supported,
        mimeType: p.host,
        fallbackPriority: index,
        kind: 'embed' as const,
      };
    });
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hrs > 0 ? `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatBytesPerSecond(bps?: number): string {
  if (!bps || !Number.isFinite(bps)) return 'Auto';
  if (bps > 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps > 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
  return `${bps} bps`;
}

export function buildServerOptions(item: CatalogItem): ServerOption[] {
  if (!item.stream) return [];
  return [
    {
      id: 'hls',
      label: 'Adaptive HLS',
      url: item.stream.hls,
      supported: true,
      mimeType: 'application/vnd.apple.mpegurl',
      fallbackPriority: 0,
      kind: 'stream',
    },
    {
      id: 'hls_ts',
      label: 'HLS Transport Stream',
      url: item.stream.hls_ts,
      supported: true,
      mimeType: 'application/vnd.apple.mpegurl',
      fallbackPriority: 1,
      kind: 'stream',
    },
    {
      id: 'dash',
      label: 'DASH',
      url: item.stream.dash,
      supported: true,
      mimeType: 'application/dash+xml',
      fallbackPriority: 2,
      kind: 'stream',
    },
    {
      id: 'progressive',
      label: 'Direct MP4',
      url: item.stream.prog,
      supported: true,
      mimeType: 'video/mp4',
      fallbackPriority: 3,
      kind: 'stream',
    },
  ];
}

export function defaultServerId(item: CatalogItem): StreamKind {
  return (buildServerOptions(item)[0]?.id as StreamKind) ?? 'hls';
}

export function serverStorageKey(itemId: string): string {
  return `lumen.player.${itemId}`;
}

export interface ResumeState {
  time: number;
  serverId?: string;
  qualityId?: string;
  volume?: number;
  muted?: boolean;
  season?: number;
  episode?: number;
}

export function loadResumeState(itemId: string): ResumeState | null {
  try {
    const raw = localStorage.getItem(serverStorageKey(itemId));
    return raw ? (JSON.parse(raw) as ResumeState) : null;
  } catch {
    return null;
  }
}

export function saveResumeState(itemId: string, state: ResumeState): void {
  try {
    localStorage.setItem(serverStorageKey(itemId), JSON.stringify(state));
  } catch {
    // Storage may be unavailable; ignore.
  }
}

export function safeDownloadUrl(server: ServerOption): { url: string; fileName: string; note: string } {
  const fileName = server.url.split('/').pop()?.split('?')[0] ?? 'video.mp4';
  if (server.id === 'progressive') {
    return { url: server.url, fileName, note: 'Direct download is available for this MP4 source.' };
  }
  return {
    url: server.url,
    fileName,
    note: 'This stream is manifest-based. For browser-native download, wire a backend packager or use the progressive MP4 server.',
  };
}

export function buildQualityListFromLevels(levels: Array<{ height?: number; width?: number; bitrate?: number }> | undefined): QualityOption[] {
  if (!levels || levels.length === 0) return [];
  return [
    { id: 'auto', label: 'Auto' },
    ...levels.map((level, index) => ({
      id: String(index),
      label: level.height ? `${level.height}p` : level.width ? `${level.width}w` : formatBytesPerSecond(level.bitrate),
      width: level.width,
      height: level.height,
      bitrate: level.bitrate,
    })),
  ];
}

export function buildQualityListFromBitrates(levels: Array<{ height?: number; width?: number; bitrate?: number }> | undefined): QualityOption[] {
  if (!levels || levels.length === 0) return [];
  return [
    { id: 'auto', label: 'Auto' },
    ...levels.map((level, index) => ({
      id: String(index),
      label: level.height ? `${level.height}p` : level.width ? `${level.width}w` : formatBytesPerSecond(level.bitrate),
      width: level.width,
      height: level.height,
      bitrate: level.bitrate,
    })),
  ];
}

export function downloadFilename(item: CatalogItem, serverId: StreamKind): string {
  const suffix = serverId === 'progressive' ? 'mp4' : 'stream';
  return `${item.title.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}_${suffix}`;
}

export function isServerKind(value: string): value is StreamKind {
  return value === 'hls' || value === 'hls_ts' || value === 'dash' || value === 'progressive';
}
