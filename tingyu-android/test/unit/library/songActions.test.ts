// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addTargetToPlaylist, captureSongAction, createTargetPlaylist, toggleFavoriteSong } from '@/services/library/songActions';
import { useOnlineProviderAccountStore } from '@/stores/useOnlineProviderAccountStore';
import { omni } from '@/services/onlineMusic/omni';
import { navidromeApi } from '@/services/navidromeService';
import { addLocalSongIdsToPlaylist, createLocalPlaylistWithSongIds, getFavoriteLocalPlaylist, setLocalSongIdFavorite } from '@/services/localPlaylistService';
import { recordDiscoveryFeedback } from '@/services/discovery/preferences';
import type { SongResult } from '@/types';

// test/unit/library/songActions.test.ts
vi.mock('@/services/onlineMusic/omni', () => ({ omni: { getPlaylistsForSong: vi.fn(), addSongToPlaylist: vi.fn(), canLikeSong: () => true, toggleSongLike: vi.fn() } }));
vi.mock('@/services/db', () => ({ getLocalSongs: async () => [] }));
vi.mock('@/services/localMusicService', () => ({ LOCAL_MUSIC_UPDATED_EVENT: 'local-updated' }));
vi.mock('@/services/localPlaylistService', () => ({
    getFavoriteLocalPlaylist: vi.fn(), setLocalSongIdFavorite: vi.fn(), addLocalSongIdsToPlaylist: vi.fn(), createLocalPlaylistWithSongIds: vi.fn(),
    resolveCanonicalLocalSongId: (id: string) => id === 'alias' ? 'canonical' : id,
}));
vi.mock('@/services/discovery/preferences', () => ({ recordDiscoveryFeedback: vi.fn() }));
vi.mock('@/services/navidromeService', () => ({
    getNavidromeConfig: () => ({ serverUrl: 'https://music.example', username: 'owner' }),
    navidromeApi: { getPlaylist: vi.fn(), updatePlaylist: vi.fn(), createPlaylist: vi.fn() },
}));
const song = (kind: 'online' | 'local' | 'navidrome', id = 'selected') => ({ id, name: id, artists: [], album: { id: '', name: '' }, durationMs: 1000,
    sourceRef: kind === 'online' ? { kind, providerId: 'qq', mediaId: id } : { kind, mediaId: id } }) as SongResult;
const playlist = { providerId: 'qq', id: 'list', name: 'List', type: 'playlist' as const };
beforeEach(() => {
    vi.resetAllMocks();
    useOnlineProviderAccountStore.setState({ accounts: {} });
    useOnlineProviderAccountStore.getState().updateAccount('qq', { status: 'authenticated', hydration: 'ready', user: { id: 'owner', nickname: 'Owner' } });
    vi.mocked(omni.getPlaylistsForSong).mockReturnValue([playlist]);
});
describe('shared song actions', () => {
    it('uses the selected carrier and its provider playlist, independently of active playback/source', async () => {
        useOnlineProviderAccountStore.getState().setActiveProviderId('netease');
        const selected = song('online');
        await addTargetToPlaylist(captureSongAction(selected), 'list');
        expect(omni.addSongToPlaylist).toHaveBeenCalledExactlyOnceWith(selected, playlist);
        expect(recordDiscoveryFeedback).toHaveBeenCalledExactlyOnceWith(selected, 'playlist');
    });
    it('rejects another provider or an unavailable/read-only playlist', async () => {
        vi.mocked(omni.getPlaylistsForSong).mockReturnValue([{ ...playlist, providerId: 'netease' }]);
        await expect(addTargetToPlaylist(captureSongAction(song('online')), 'list')).rejects.toThrow('unavailable');
        expect(omni.addSongToPlaylist).not.toHaveBeenCalled();
    });
    it('rejects confirmation after logout/login even with the same account id', async () => {
        const target = captureSongAction(song('online'));
        useOnlineProviderAccountStore.getState().clearAccount('qq');
        useOnlineProviderAccountStore.getState().updateAccount('qq', { status: 'authenticated', hydration: 'ready', user: { id: 'owner', nickname: 'Owner' } });
        await expect(addTargetToPlaylist(target, 'list')).rejects.toMatchObject({ name: 'AbortError' });
        expect(omni.addSongToPlaylist).not.toHaveBeenCalled();
    });
    it('does not record feedback when the account changes during a request', async () => {
        vi.mocked(omni.addSongToPlaylist).mockImplementation(async () => { useOnlineProviderAccountStore.getState().clearAccount('qq'); });
        await expect(addTargetToPlaylist(captureSongAction(song('online')), 'list')).rejects.toThrow();
        expect(recordDiscoveryFeedback).not.toHaveBeenCalled();
    });
    it('does not report missing local playlists as success', async () => {
        vi.mocked(addLocalSongIdsToPlaylist).mockResolvedValue(null);
        await expect(addTargetToPlaylist(captureSongAction(song('local')), 'deleted')).rejects.toThrow('not saved');
        expect(recordDiscoveryFeedback).not.toHaveBeenCalled();
    });
    it('normalizes legacy local ids and removes an existing favorite', async () => {
        vi.mocked(getFavoriteLocalPlaylist).mockResolvedValue({ songIds: ['canonical'] } as any);
        vi.mocked(setLocalSongIdFavorite).mockResolvedValue({ songIds: [] } as any);
        await expect(toggleFavoriteSong(song('local', 'alias'))).resolves.toBe(false);
        expect(setLocalSongIdFavorite).toHaveBeenCalledExactlyOnceWith('canonical', false);
    });
    it('coalesces repeated favorite clicks and counts feedback once', async () => {
        let resolve!: (value: boolean) => void;
        vi.mocked(omni.toggleSongLike).mockImplementation(() => new Promise(done => { resolve = done; }));
        const selected = song('online');
        const first = toggleFavoriteSong(selected), second = toggleFavoriteSong(selected);
        resolve(true);
        expect(await Promise.all([first, second])).toEqual([true, true]);
        expect(omni.toggleSongLike).toHaveBeenCalledTimes(1);
        expect(recordDiscoveryFeedback).toHaveBeenCalledTimes(1);
    });
    it('retains a local selected song through the separate create flow', async () => {
        vi.mocked(createLocalPlaylistWithSongIds).mockResolvedValue({ name: 'Saved' } as any);
        const target = captureSongAction(song('local', 'alias'));
        await expect(createTargetPlaylist(target, 'Saved')).resolves.toBe('Saved');
        expect(createLocalPlaylistWithSongIds).toHaveBeenCalledExactlyOnceWith('Saved', ['canonical']);
    });
    it('rejects a Navidrome false result and readonly playlist without false feedback', async () => {
        const target = captureSongAction(song('navidrome'));
        vi.mocked(navidromeApi.getPlaylist).mockResolvedValue({ owner: 'someone' } as any);
        await expect(addTargetToPlaylist(target, 'list')).rejects.toThrow('not editable');
        expect(navidromeApi.updatePlaylist).not.toHaveBeenCalled();
        vi.mocked(navidromeApi.getPlaylist).mockResolvedValue({ owner: 'owner' } as any);
        vi.mocked(navidromeApi.updatePlaylist).mockResolvedValue(false);
        await expect(addTargetToPlaylist(target, 'list')).rejects.toThrow('failed');
        expect(recordDiscoveryFeedback).not.toHaveBeenCalled();
    });
});
