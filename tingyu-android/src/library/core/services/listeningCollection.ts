import type { UnifiedSong } from '../../../types';
import type { ListeningEntitySummary } from '../../../services/listeningStatistics';
import { resolveSongCatalogRef } from '../../../services/onlineMusic/catalogRefs';
import { getSongCoverUrl } from '../../../services/onlineMusic/songMetadata';
import { getPlaybackSourceRef, resolveNavidromePlaybackCarrier } from '../../../utils/appPlaybackGuards';
import { resolveLocalCatalogLink } from '../model/localCatalogLinks';
import type { LibraryHomeData } from '../contracts/home';
import type { LibraryCollectionDescriptor } from '../contracts/collection';

// src/library/core/services/listeningCollection.ts
/** Reuses canonical catalog resolvers; statistics never invent remote or local entity IDs. */
export async function listeningEntityCollection(
    entry: ListeningEntitySummary, kind: 'artist' | 'album',
    local: Pick<LibraryHomeData, 'localSongs' | 'localLibraryCatalog'>,
): Promise<LibraryCollectionDescriptor | null> {
    const { song, entity } = entry;
    const source = getPlaybackSourceRef(song);
    const coverUrl = getSongCoverUrl(song);
    if (source.kind === 'local') {
        // A name-only match can conflate same-named local entities. Require the retained entity ID.
        if (!entity.entityId) return null;
        const link = resolveLocalCatalogLink(local.localLibraryCatalog, local.localSongs, { kind, entityId: entity.entityId });
        if (!link) return null;
        return { source: 'local', type: kind, id: link.entity.id, entityId: link.entity.id,
            name: link.entity.displayName, songIds: link.songs.map(item => item.id), trackCount: link.songs.length, coverUrl };
    }
    const carrier = resolveNavidromePlaybackCarrier(song);
    if (carrier) {
        const id = kind === 'artist' ? carrier.navidromeData.artistId : carrier.navidromeData.albumId;
        return id ? { source: 'navidrome', type: kind, id, name: entry.name, coverUrl } : null;
    }
    if (source.kind !== 'online') return null;
    const ref = await resolveSongCatalogRef(song as UnifiedSong, kind, entity);
    return ref ? { source: 'online', providerId: ref.providerId, type: kind, id: ref.id, name: entry.name, coverUrl } : null;
}
