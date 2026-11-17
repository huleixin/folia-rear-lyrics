import type { SongResult } from '../../types';
import { getPlaybackSourceRef, getPlaybackSongKey } from '../../utils/appPlaybackGuards';
import { omni } from '../onlineMusic/omni';
import { providerSearchScopeKey } from '../onlineMusic/providerResourceScope';
import { useOnlineProviderAccountStore } from '../../stores/useOnlineProviderAccountStore';
import { getNavidromeConfig, navidromeApi } from '../navidromeService';
import { getFavoriteLocalPlaylist, setLocalSongIdFavorite, addLocalSongIdsToPlaylist, createLocalPlaylistWithSongIds, resolveCanonicalLocalSongId } from '../localPlaylistService';
import { LOCAL_MUSIC_UPDATED_EVENT } from '../localMusicService';
import { getLocalSongs } from '../db';
import { accountActionEpoch, captureAccountAction } from '../onlineMusic/accountActionScope';
import { recordDiscoveryFeedback } from '../discovery/preferences';
import { notifyCollectionChanged } from './collectionChanges';

// src/services/library/songActions.ts
export type SongActionTarget = { song: SongResult; scope: string; assertAccount: () => void };
const sourceId = (song: SongResult) => {
    const source = getPlaybackSourceRef(song);
    return source.kind === 'online' ? source.providerId : source.kind;
};
export const captureSongAction = (song: SongResult): SongActionTarget => ({ song, scope: providerSearchScopeKey([sourceId(song)]), assertAccount: captureAccountAction(sourceId(song)) });
export function assertSongAction(target: SongActionTarget): void {
    target.assertAccount();
    if (target.scope !== providerSearchScopeKey([sourceId(target.song)])) throw new Error('Song account changed; reopen the action');
    const source = getPlaybackSourceRef(target.song);
    if (source.kind === 'online') {
        const account = useOnlineProviderAccountStore.getState().accounts[source.providerId];
        if (account?.status !== 'authenticated' || account.hydration !== 'ready') throw new Error('Song account is not ready');
    }
}
const notifyLocal = () => window.dispatchEvent(new Event(LOCAL_MUSIC_UPDATED_EVENT));
export const canFavoriteSong = (song: SongResult) => getPlaybackSourceRef(song).kind === 'local' || omni.canLikeSong(song);
const pendingFavorites = new Map<string, Promise<boolean>>();
export function toggleFavoriteSong(song: SongResult): Promise<boolean> {
    const key = providerSearchScopeKey([sourceId(song)]) + ':' + accountActionEpoch(sourceId(song)) + ':' + getPlaybackSongKey(song);
    const pending = pendingFavorites.get(key);
    if (pending) return pending;
    const task = performToggleFavorite(song).finally(() => { if (pendingFavorites.get(key) === task) pendingFavorites.delete(key); });
    pendingFavorites.set(key, task);
    return task;
}
async function performToggleFavorite(song: SongResult): Promise<boolean> {
    const target = captureSongAction(song);
    assertSongAction(target);
    const source = getPlaybackSourceRef(song);
    let liked: boolean;
    if (source.kind === 'local') {
        const favorites = await getFavoriteLocalPlaylist();
        const id = resolveCanonicalLocalSongId(String(source.mediaId), await getLocalSongs());
        liked = !favorites.songIds.includes(id);
        if (!await setLocalSongIdFavorite(id, liked)) throw new Error('Local favorite was not saved');
        notifyLocal();
    } else {
        liked = await omni.toggleSongLike(song);
        assertSongAction(target);
    }
    recordDiscoveryFeedback(song, liked ? 'like' : 'unlike');
    return liked;
}
export function targetPlaylists(target: SongActionTarget) {
    assertSongAction(target);
    const source = getPlaybackSourceRef(target.song);
    return source.kind === 'online' ? omni.getPlaylistsForSong(target.song).filter(item => item.providerId === source.providerId) : [];
}
/** Selection is resolved again against the current account and permissions immediately before writing. */
export async function addTargetToPlaylist(target: SongActionTarget, playlistId: string): Promise<void> {
    assertSongAction(target);
    const source = getPlaybackSourceRef(target.song);
    if (source.kind === 'local') {
        const id = resolveCanonicalLocalSongId(String(source.mediaId), await getLocalSongs());
        if (!await addLocalSongIdsToPlaylist(playlistId, [id])) throw new Error('Local playlist was not saved');
        notifyLocal();
    } else if (source.kind === 'online') {
        const playlist = targetPlaylists(target).find(item => String(item.id) === playlistId);
        if (!playlist) throw new Error('Selected playlist is unavailable');
        await omni.addSongToPlaylist(target.song, playlist);
        assertSongAction(target);
    } else if (source.kind === 'navidrome') {
        const config = getNavidromeConfig();
        if (!config) throw new Error('Music server is unavailable');
        const playlist = await navidromeApi.getPlaylist(config, playlistId);
        assertSongAction(target);
        if (!playlist || playlist.owner !== config.username) throw new Error('Selected playlist is not editable');
        if (!await navidromeApi.updatePlaylist(config, playlistId, { songIdsToAdd: [String(source.mediaId)] })) throw new Error('Playlist update failed');
        assertSongAction(target);
        notifyCollectionChanged({ providerId: 'navidrome', collectionId: playlistId });
    } else throw new Error('This song does not support playlist actions');
    recordDiscoveryFeedback(target.song, 'playlist');
}
export async function createTargetPlaylist(target: SongActionTarget, name: string): Promise<string> {
    assertSongAction(target);
    const source = getPlaybackSourceRef(target.song);
    if (source.kind === 'local') {
        const id = resolveCanonicalLocalSongId(String(source.mediaId), await getLocalSongs());
        const created = await createLocalPlaylistWithSongIds(name, [id]);
        notifyLocal(); recordDiscoveryFeedback(target.song, 'playlist');
        return created.name;
    }
    if (source.kind === 'navidrome') {
        const config = getNavidromeConfig();
        if (!config) throw new Error('Music server is unavailable');
        const created = await navidromeApi.createPlaylist(config, name, [String(source.mediaId)]);
        assertSongAction(target);
        if (!created) throw new Error('Playlist creation failed');
        notifyCollectionChanged({ providerId: 'navidrome' });
        recordDiscoveryFeedback(target.song, 'playlist');
        return created.name;
    }
    throw new Error('This source does not support creating playlists here');
}
