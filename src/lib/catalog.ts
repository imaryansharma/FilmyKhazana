import { DEMO_CATALOG } from '../data/demoCatalog';
import type { CatalogItem, CatalogResponse, MediaType } from '../types';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w780';
const TMDB_BACKDROP = 'https://image.tmdb.org/t/p/original';
const env = (import.meta as any).env ?? {};

const DEFAULT_KEY = 'cc62b52e2d5f4ea112a698f20c090b13';
const TMDB_KEY = (env.VITE_TMDB_API_KEY as string | undefined) ?? DEFAULT_KEY;
const TMDB_TOKEN = env.VITE_TMDB_TOKEN as string | undefined;
const TMDB_PAGES = Math.max(1, Math.min(5, Number(env.VITE_TMDB_PAGES ?? 3)));

export function formatRuntime(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hrs}h ${mins.toString().padStart(2, '0')}m`;
}

export async function tmdbFetch(path: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<any> {
  const url = new URL(TMDB_BASE + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const headers: Record<string, string> = { accept: 'application/json' };
  if (TMDB_TOKEN) {
    headers.Authorization = `Bearer ${TMDB_TOKEN}`;
  } else {
    url.searchParams.set('api_key', TMDB_KEY);
  }
  const response = await fetch(url.toString(), { headers, signal });
  if (!response.ok) throw new Error(`TMDB ${path} failed (${response.status})`);
  return response.json();
}

export async function fetchExternalIds(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  signal?: AbortSignal,
): Promise<{ imdb_id?: string | null }> {
  return tmdbFetch(`/${mediaType}/${tmdbId}/external_ids`, {}, signal);
}

export interface SeasonSummary {
  season_number: number;
  name: string;
  episode_count: number;
}

export interface EpisodeSummary {
  episode_number: number;
  name: string;
  overview?: string;
  still_path?: string | null;
  runtime?: number | null;
  air_date?: string | null;
}

export async function fetchTvSeasons(tmdbId: number, signal?: AbortSignal): Promise<SeasonSummary[]> {
  const detail = await tmdbFetch(`/tv/${tmdbId}`, { language: 'en-US' }, signal);
  const seasons: any[] = Array.isArray(detail?.seasons) ? detail.seasons : [];
  return seasons
    .filter((s) => Number.isFinite(Number(s?.season_number)) && Number(s.season_number) >= 1)
    .map((s) => ({
      season_number: Number(s.season_number),
      name: String(s.name || `Season ${s.season_number}`),
      episode_count: Number(s.episode_count || 0),
    }));
}

export async function fetchTvSeasonEpisodes(tmdbId: number, season: number, signal?: AbortSignal): Promise<EpisodeSummary[]> {
  const data = await tmdbFetch(`/tv/${tmdbId}/season/${season}`, { language: 'en-US' }, signal);
  const episodes: any[] = Array.isArray(data?.episodes) ? data.episodes : [];
  return episodes
    .filter((e) => Number.isFinite(Number(e?.episode_number)))
    .map((e) => ({
      episode_number: Number(e.episode_number),
      name: String(e.name || `Episode ${e.episode_number}`),
      overview: e.overview || '',
      still_path: e.still_path || null,
      runtime: typeof e.runtime === 'number' ? e.runtime : null,
      air_date: e.air_date || null,
    }));
}

export async function fetchSimilar(
  tmdbId: number,
  mediaType: MediaType,
  signal?: AbortSignal,
): Promise<CatalogItem[]> {
  try {
    const [genres, similar, recs] = await Promise.all([
      getGenres(signal),
      tmdbFetch(`/${mediaType}/${tmdbId}/similar`, { language: 'en-US', page: '1' }, signal).catch(() => ({ results: [] })),
      tmdbFetch(`/${mediaType}/${tmdbId}/recommendations`, { language: 'en-US', page: '1' }, signal).catch(() => ({ results: [] })),
    ]);
    const seen = new Set<string>();
    const out: CatalogItem[] = [];
    const ingest = (results: any[]) => {
      results.forEach((raw) => {
        const enriched = { ...raw, media_type: mediaType };
        const item = tmdbToItem(enriched, genres);
        if (!item || seen.has(item.id)) return;
        seen.add(item.id);
        out.push(item);
      });
    };
    ingest(recs?.results ?? []);
    ingest(similar?.results ?? []);
    return out.slice(0, 12);
  } catch {
    return [];
  }
}

let genresCache: Map<number, string> | null = null;
let genresPromise: Promise<Map<number, string>> | null = null;

async function getGenres(signal?: AbortSignal): Promise<Map<number, string>> {
  if (genresCache) return genresCache;
  if (genresPromise) return genresPromise;
  genresPromise = (async () => {
    const [movie, tv] = await Promise.all([
      tmdbFetch('/genre/movie/list', { language: 'en-US' }, signal),
      tmdbFetch('/genre/tv/list', { language: 'en-US' }, signal),
    ]);
    const map = new Map<number, string>();
    [...(movie.genres ?? []), ...(tv.genres ?? [])].forEach((g: any) => map.set(g.id, g.name));
    genresCache = map;
    return map;
  })();
  try {
    return await genresPromise;
  } finally {
    genresPromise = null;
  }
}

function tmdbDetailToItem(raw: any, mediaType: MediaType, genres: Map<number, string>): CatalogItem | null {
  if (!raw || !raw.id) return null;
  const title = raw.title || raw.name;
  if (!title) return null;

  const genreNames: string[] = Array.isArray(raw.genres)
    ? raw.genres.map((g: any) => g?.name).filter(Boolean)
    : (raw.genre_ids ?? []).map((id: number) => genres.get(id)).filter(Boolean);
  const lengthTag = (raw.vote_average ?? 0) >= 8 ? 'Top Rated' : mediaType === 'tv' ? 'Series' : 'Movie';
  const tags = Array.from(new Set([lengthTag, ...genreNames]));

  const releaseDate = raw.release_date || raw.first_air_date;
  const year = releaseDate ? Number(String(releaseDate).slice(0, 4)) : undefined;

  const runtimeMin = Number(raw.runtime) || (Array.isArray(raw.episode_run_time) ? Number(raw.episode_run_time[0]) : 0);
  const duration = runtimeMin > 0 ? runtimeMin * 60 : Math.round(((raw.vote_average ?? 6) * 6 + 80) * 60);

  const credits: Array<{ role: string; name: string }> = [];
  const crew: any[] = raw.credits?.crew ?? [];
  crew.filter((c) => c.job === 'Director').slice(0, 2).forEach((d) => credits.push({ role: 'Director', name: d.name }));
  const cast: any[] = raw.credits?.cast ?? [];
  cast.slice(0, 8).forEach((c) => credits.push({ role: 'Cast', name: c.name }));

  return {
    id: `tmdb-${mediaType}-${raw.id}`,
    title: String(title),
    author: raw.original_language
      ? `${mediaType === 'tv' ? 'Series' : 'Movie'} · ${String(raw.original_language).toUpperCase()}`
      : (mediaType === 'tv' ? 'Series' : 'Movie'),
    description: raw.overview || 'No description provided by TMDB.',
    poster: raw.poster_path ? `${TMDB_IMG}${raw.poster_path}` : '',
    backdrop: raw.backdrop_path ? `${TMDB_BACKDROP}${raw.backdrop_path}` : undefined,
    duration,
    tmdbId: Number(raw.id),
    mediaType,
    tags: tags.length ? tags : [mediaType === 'tv' ? 'Series' : 'Movie'],
    credits: credits.length ? credits : [{ role: 'Source', name: 'The Movie Database (TMDB)' }],
    year: Number.isFinite(year) ? year : undefined,
    popularity: Math.round(Number(raw.popularity ?? 0)) || Math.round((raw.vote_average ?? 0) * 10),
  };
}

export async function fetchTmdbItem(itemId: string, signal?: AbortSignal): Promise<CatalogItem | null> {
  const match = itemId.match(/^tmdb-(movie|tv)-(\d+)$/);
  if (!match) return null;
  const mediaType = match[1] as MediaType;
  const tmdbId = match[2];
  const [detail, genres] = await Promise.all([
    tmdbFetch(`/${mediaType}/${tmdbId}`, { language: 'en-US', append_to_response: 'credits' }, signal),
    getGenres(signal),
  ]);
  return tmdbDetailToItem(detail, mediaType, genres);
}

export async function searchTmdb(query: string, signal?: AbortSignal): Promise<CatalogItem[]> {
  const q = query.trim();
  if (!q) return [];
  const genres = await getGenres(signal);
  const pages = await Promise.all([
    tmdbFetch('/search/multi', { language: 'en-US', query: q, page: '1', include_adult: 'false' }, signal),
    tmdbFetch('/search/multi', { language: 'en-US', query: q, page: '2', include_adult: 'false' }, signal),
  ]);
  const seen = new Set<string>();
  const items: CatalogItem[] = [];
  pages.forEach((page) => {
    (page.results ?? []).forEach((raw: any) => {
      if (raw?.media_type === 'person') return;
      const item = tmdbToItem(raw, genres);
      if (!item || seen.has(item.id)) return;
      seen.add(item.id);
      items.push(item);
    });
  });
  return items;
}

function listPath(list: string, page: number): { path: string; params: Record<string, string> } {
  switch (list) {
    case 'trending_week':
      return { path: '/trending/all/week', params: { language: 'en-US', page: String(page) } };
    case 'trending_movie_day':
      return { path: '/trending/movie/day', params: { language: 'en-US', page: String(page) } };
    case 'top_rated':
      return { path: '/movie/top_rated', params: { language: 'en-US', page: String(page) } };
    case 'popular':
      return { path: '/movie/popular', params: { language: 'en-US', page: String(page) } };
    case 'now_playing':
      return { path: '/movie/now_playing', params: { language: 'en-US', page: String(page) } };
    case 'discover':
      return {
        path: '/discover/movie',
        params: {
          language: 'en-US',
          sort_by: 'popularity.desc',
          include_adult: 'false',
          include_video: 'false',
          page: String(page),
        },
      };
    case 'trending_day':
    default:
      return { path: '/trending/all/day', params: { language: 'en-US', page: String(page) } };
  }
}

function tmdbToItem(raw: any, genres: Map<number, string>): CatalogItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const mediaType: MediaType = raw.media_type === 'tv' ? 'tv' : 'movie';
  const title = raw.title || raw.name;
  if (!title || !raw.poster_path || !raw.id) return null;

  const genreTags: string[] = (raw.genre_ids ?? [])
    .map((id: number) => genres.get(id))
    .filter((name: string | undefined): name is string => Boolean(name));
  const lengthTag = (raw.vote_average ?? 0) >= 8 ? 'Top Rated' : mediaType === 'tv' ? 'Series' : 'Movie';
  const tags = Array.from(new Set([lengthTag, ...genreTags]));

  const releaseDate = raw.release_date || raw.first_air_date;
  const year = releaseDate ? Number(String(releaseDate).slice(0, 4)) : undefined;
  const synthesizedRuntime = Math.round(((raw.vote_average ?? 6) * 6 + 80) * 60);

  return {
    id: `tmdb-${mediaType}-${raw.id}`,
    title: String(title),
    author: raw.original_language ? `${mediaType === 'tv' ? 'Series' : 'Movie'} · ${String(raw.original_language).toUpperCase()}` : mediaType === 'tv' ? 'Series' : 'Movie',
    description: raw.overview || 'No description provided by TMDB.',
    poster: `${TMDB_IMG}${raw.poster_path}`,
    backdrop: raw.backdrop_path ? `${TMDB_BACKDROP}${raw.backdrop_path}` : undefined,
    duration: synthesizedRuntime,
    tmdbId: Number(raw.id),
    mediaType,
    tags: tags.length ? tags : [mediaType === 'tv' ? 'Series' : 'Movie'],
    credits: [{ role: 'Source', name: 'The Movie Database (TMDB)' }],
    year: Number.isFinite(year) ? year : undefined,
    popularity: Math.round(Number(raw.popularity ?? 0)) || Math.round((raw.vote_average ?? 0) * 10),
  };
}

export async function loadCatalog(signal?: AbortSignal): Promise<CatalogResponse> {
  try {
    const genres = await getGenres(signal);
    const lists: Array<{ path: string; params: Record<string, string> }> = [];
    for (let i = 1; i <= TMDB_PAGES; i += 1) {
      lists.push(listPath('trending_day', i));
    }
    for (let i = 1; i <= 2; i += 1) {
      lists.push(listPath('trending_week', i));
      lists.push({ path: '/tv/popular', params: { language: 'en-US', page: String(i) } });
      lists.push({ path: '/tv/top_rated', params: { language: 'en-US', page: String(i) } });
      lists.push({ path: '/movie/top_rated', params: { language: 'en-US', page: String(i) } });
      lists.push({ path: '/movie/popular', params: { language: 'en-US', page: String(i) } });
    }
    const pages = await Promise.all(
      lists.map(({ path, params }) =>
        tmdbFetch(path, params, signal).catch(() => ({ results: [] })),
      ),
    );
    const seen = new Set<string>();
    const items: CatalogItem[] = [];
    pages.forEach((page, index) => {
      const sourcePath = lists[index].path;
      const forcedTv = sourcePath.startsWith('/tv/');
      const forcedMovie = sourcePath.startsWith('/movie/');
      (page.results ?? []).forEach((raw: any) => {
        const enriched = forcedTv
          ? { ...raw, media_type: 'tv' }
          : forcedMovie
            ? { ...raw, media_type: 'movie' }
            : raw;
        const item = tmdbToItem(enriched, genres);
        if (!item || seen.has(item.id)) return;
        seen.add(item.id);
        items.push(item);
      });
    });
    if (items.length === 0) return { items: DEMO_CATALOG, source: 'fallback' };
    return { items, source: 'remote' };
  } catch {
    return { items: DEMO_CATALOG, source: 'fallback' };
  }
}

export function getCatalogBuckets(items: CatalogItem[]): string[] {
  const buckets = new Set<string>(['All']);
  items.forEach((item) => item.tags.forEach((tag) => buckets.add(tag)));
  return Array.from(buckets);
}

export function matchCatalogSearch(item: CatalogItem, query: string): boolean {
  if (!query.trim()) return true;
  const needle = query.trim().toLowerCase();
  const haystack = [item.title, item.author, item.description, ...item.tags].join(' ').toLowerCase();
  return haystack.includes(needle);
}

export function scoreItem(item: CatalogItem): number {
  const tagScore = item.tags.includes('Top Rated') ? 30 : 15;
  const runtimeScore = item.duration > 500 ? 25 : item.duration > 120 ? 18 : 10;
  return item.popularity + tagScore + runtimeScore;
}

export function sortCatalog(items: CatalogItem[], sortKey: string): CatalogItem[] {
  const copy = [...items];
  switch (sortKey) {
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case 'runtime-asc':
      return copy.sort((a, b) => a.duration - b.duration);
    case 'runtime-desc':
      return copy.sort((a, b) => b.duration - a.duration);
    case 'recent':
      return copy.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    case 'trending':
    default:
      return copy.sort((a, b) => scoreItem(b) - scoreItem(a));
  }
}

export function filterByCategory(items: CatalogItem[], category: string): CatalogItem[] {
  if (!category || category === 'All') return items;
  return items.filter((item) => item.tags.includes(category));
}

export function relatedItems(all: CatalogItem[], current: CatalogItem, max = 6): CatalogItem[] {
  const currentTokens = new Set(current.tags.map((tag) => tag.toLowerCase()));
  return all
    .filter((item) => item.id !== current.id)
    .map((item) => {
      let score = 0;
      item.tags.forEach((tag) => {
        if (currentTokens.has(tag.toLowerCase())) score += 3;
      });
      if (item.author === current.author) score += 6;
      score += Math.max(0, 4 - Math.abs(item.duration - current.duration) / 120);
      return { item, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ item }) => item);
}
