# Lumen

A movie & TV discovery app built with React + TypeScript + Vite.

## What works

- Debounced search with loading, empty, no-results, and error states
- Discovery shelves and browsable categories
- Detail overlays with metadata, credits, and related titles
- Multi-server playback via embedded iframe players (48 named servers across 3 backends)
- TV: per-episode picker (season + episode inputs)
- Resume last-selected server via local storage
- Responsive, accessible UI with keyboard focus states
- Fallback: if TMDB is unreachable, the app loads a bundled HLS/DASH/MP4 demo catalog and the original HTML5 player kicks in (with quality selection, scrubber, volume, and direct MP4 download).

## Architecture

```
Catalog metadata     →  api.themoviedb.org/3        (TMDB)
Posters              →  image.tmdb.org/t/p/w780
Stream playback      →  iframe embed players        (player2.vidplus.pro · cinemaos.tech · web.nxsha.app)
Fallback catalog     →  bundled HLS/DASH/MP4 sample streams (Blender Foundation)
```

There is no proprietary backend — everything runs from the static SPA.

## Configuration

A public TMDB v3 key is baked in as the default so the app works out of the box. Override per environment if you want a private key or a Bearer token:

```bash
# v3 API key (default works without setting this)
VITE_TMDB_API_KEY=your_v3_key

# v4 Bearer token (takes precedence over the v3 key)
VITE_TMDB_TOKEN=eyJhbGciOi...

# Which list feeds the catalog:
# trending_day (default) · trending_week · trending_movie_day
# popular · top_rated · now_playing · discover
VITE_TMDB_LIST=trending_day

# Number of result pages to load (1–5, 20 items per page). Default 3.
VITE_TMDB_PAGES=3
```

If every TMDB request fails, the app silently falls back to `src/data/demoCatalog.ts` and the topbar badge reads "Offline fallback".

## Embed servers

Seven third-party iframe providers. Per-provider URL builders live in `EMBED_PROVIDERS` in `src/lib/playback.ts`.

| UI label | ID type | TV support |
|---|---|---|
| Aurora | TMDB | yes |
| Echo | TMDB | yes |
| Pulse | TMDB | no (movies only) |
| Nova | TMDB | yes |
| Orion | IMDb | yes |
| Vega | IMDb | yes |
| Lyra | TMDB | yes |
| Polaris | TMDB | yes |
| Sirius | TMDB | yes |
| Cygnus | TMDB | yes |
| Atlas | TMDB | yes |
| Helios | TMDB | yes |
| Phoenix | TMDB | yes |

The actual hosts live in `EMBED_PROVIDERS` in `src/lib/playback.ts` and are not exposed in the UI. Orion and Vega need IMDb IDs — when a player opens, `EmbedPlayer` calls `/{movie\|tv}/{tmdb_id}/external_ids` once to resolve it; those two stay disabled in the selector until it arrives. TV titles automatically hide Pulse.

These are **third-party scraper services**. They go up and down without warning, and they serve copyrighted material without license. If a server is blank or errors, pick another. To replace them with legal providers, edit `EMBED_PROVIDERS` — the rest of the player flows from that array.

## Run locally

```bash
npm install
npm run dev
```

## Production notes

- Runtime is not returned by TMDB's list endpoints, so card duration is synthesized from `vote_average` (≈80–140 min). For accurate runtime, fetch `/movie/{id}` on detail view and patch the item.
- TMDB API supports CORS for browser-direct calls — no proxy needed.
- Iframes can't expose `currentTime` / `duration` to the parent, so scrubber, play/pause, volume, and resume-position are only available on the fallback (HLS/DASH/MP4) player. The embed player only persists the last selected server.
