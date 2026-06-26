import { EmbedPlayer } from './EmbedPlayer';
import { StreamPlayer } from './StreamPlayer';
import type { CatalogItem } from './types';

export function PlayerModal({ item, onClose }: { item: CatalogItem; onClose: () => void }) {
  if (item.tmdbId && item.mediaType) {
    return <EmbedPlayer item={item} onClose={onClose} />;
  }
  return <StreamPlayer item={item} onClose={onClose} />;
}
