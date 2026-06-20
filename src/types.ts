export type StreamKind = 'hls' | 'hls_ts' | 'dash' | 'progressive';
export type MediaType = 'movie' | 'tv';

export interface StreamSet {
  dash: string;
  hls: string;
  hls_ts: string;
  prog: string;
}

export interface Credit {
  role: string;
  name: string;
}

export interface CatalogItem {
  id: string;
  title: string;
  author: string;
  description: string;
  poster: string;
  backdrop?: string;
  duration: number;
  stream?: StreamSet;
  tmdbId?: number;
  mediaType?: MediaType;
  tags: string[];
  credits?: Credit[];
  year?: number;
  popularity: number;
}

export interface ServerOption {
  id: string;
  label: string;
  url: string;
  supported: boolean;
  mimeType: string;
  fallbackPriority: number;
  kind?: 'stream' | 'embed';
}

export interface QualityOption {
  id: string;
  label: string;
  width?: number;
  height?: number;
  bitrate?: number;
}

export interface CatalogResponse {
  items: CatalogItem[];
  source: 'remote' | 'fallback';
}
