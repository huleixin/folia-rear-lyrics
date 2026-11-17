import type { UnifiedSong } from '../../../types';
import type { PageActions, PageItem } from '../../../types/nativePages';
import type { SongIdentityGroup } from '../../../services/musicIdentity';
import { getPlaybackSongKey, getPlaybackSongSource } from '../../../utils/appPlaybackGuards';
import { getProviderSongMetadata } from '../../../services/onlineMusic/songMetadata';
import { isSongUnavailable } from '../../../services/onlineMusic/songAvailability';
import { absolutePageImage } from '../../../services/nativePages';
import { catalogBadgePageFields } from '../../../utils/catalogAudioLabels';

// src/components/app/search/nativeSearchSongs.ts
type Copy = (key: string, options?: any) => string;
type Callbacks = { play(song: UnifiedSong): void; menu(song: UnifiedSong): void; label(source: string): string };
export const primarySearchSong = (group: SongIdentityGroup<UnifiedSong>) => group.sources.find(song => !isSongUnavailable(song)) ?? group.sources[0];

/** Actions always carry original songs; a grouped row never becomes a fabricated playback identity. */
export function nativeSearchSongItem(song: UnifiedSong, actions: PageActions, callbacks: Callbacks, t: Copy): PageItem {
    const key = getPlaybackSongKey(song), data = getProviderSongMetadata(song);
    actions[`play:${key}`] = () => { if (!isSongUnavailable(song)) callbacks.play(song); };
    actions[`menu:${key}`] = () => callbacks.menu(song);
    return { id: key, title: song.name, ...catalogBadgePageFields(song, t, song.isLocal === true),
        subtitle: [data.artists.map(a => a.name).join(', '), callbacks.label(getPlaybackSongSource(song))].filter(Boolean).join(' · '),
        image: absolutePageImage(data.coverUrl), action: `play:${key}`, secondary: `menu:${key}`, secondaryLabel: '•••',
        disabled: isSongUnavailable(song) };
}
export function nativeSearchGroupItem(group: SongIdentityGroup<UnifiedSong>, actions: PageActions, callbacks: Callbacks,
    chooseSources: (key: string) => void, t: Copy): PageItem {
    const item = nativeSearchSongItem(primarySearchSong(group), actions, callbacks, t);
    if (group.sources.length > 1) {
        actions[`sources:${group.key}`] = () => chooseSources(group.key);
        item.secondary = `sources:${group.key}`;
        item.secondaryLabel = t('search.availableSources', { count: group.sources.length });
        item.disabled = false;
    }
    return { ...item, id: group.key };
}
export function searchDisplayPlaybackKey(groups: SongIdentityGroup<UnifiedSong>[], key: string): string {
    return groups.find(group => group.sources.some(song => getPlaybackSongKey(song) === key))?.key ?? key;
}
