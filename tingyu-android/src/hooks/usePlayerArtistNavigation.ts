import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Artist, SongResult, UnifiedSong } from '../types';
import type { GridViewCollectionDescriptor } from '../library/core/contracts/collection';
import { createSearchArtistCollection } from '../components/app/search/searchCollectionAdapters';
import { useAppViewStore } from '../stores/useAppViewStore';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { setStatusMessage } from '../stores/useStatusMessageStore';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';

// src/hooks/usePlayerArtistNavigation.ts
// Catalog lookup is a user action, isolated from the existing queue/panel artist navigation.
export function usePlayerArtistNavigation(open: (collection: GridViewCollectionDescriptor, origin: 'player') => void) {
    const { t } = useTranslation();
    const request = useRef(0);
    return useCallback(async (song: SongResult, artist: Artist) => {
        const ticket = ++request.current;
        const history = window.history.state;
        const valid = () => {
            const current = usePlaybackStore.getState().currentSong;
            return ticket === request.current && useAppViewStore.getState().view === 'player'
                && window.history.state === history && current !== null && getPlaybackSongKey(current) === getPlaybackSongKey(song);
        };
        try {
            const collection = await createSearchArtistCollection(song as UnifiedSong, artist.name || '', artist.id, artist.entityId);
            if (!valid()) return;
            if (collection) { open(collection, 'player'); return; }
        } catch (error) {
            if (!valid()) return;
            console.warn('[CatalogNavigation] Player artist lookup failed', error);
        }
        setStatusMessage({type:'error',text:t('search.catalogUnavailable')});
    }, [open, t]);
}
