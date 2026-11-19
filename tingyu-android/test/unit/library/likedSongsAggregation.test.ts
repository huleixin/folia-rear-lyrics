import { describe, expect, it, vi } from 'vitest';
import { omni } from '../../../src/services/onlineMusic/omni';
import { registerOnlineMusicProvider, unregisterOnlineMusicProvider } from '../../../src/services/onlineMusic/providerRegistry';
import type { OnlineMusicProvider } from '../../../src/types/onlineMusic';

type LikedSong = Awaited<ReturnType<typeof omni.getProviderLikedSongs>>[number];

function song(providerId: 'qq' | 'netease', id: string, name: string): LikedSong {
    return {
        id: `${providerId}:${id}`,
        name,
        artists: [{ id: `${providerId}:a`, name: '歌手' }],
        album: { id: `${providerId}:alb`, name: '专辑' },
        durationMs: 200000,
        sourceRef: { kind: 'online', providerId, mediaId: id },
    };
}

describe('omni likedSongs capability and aggregation', () => {
    it('reports likedSongs capability when getUserPlaylists and getPlaylistTracks exist', () => {
        expect(omni.getLibraryCapabilities('qq').likedSongs).toBe(true);
        expect(omni.getLibraryCapabilities('netease').likedSongs).toBe(true);
        expect(omni.getLibraryCapabilities('kugou').likedSongs).toBe(true);
    });

    it('paginates isLiked playlist without trusting playlist name and deduplicates within provider', async () => {
        const fakeId = 'qq' as const;
        const getPlaylistTracks = vi.fn(async (_id: string | number, _limit: number, offset: number) => {
            if (offset === 0) {
                return {
                    items: Array.from({ length: 100 }, (_, i) => song('qq', `s${i}`, `歌${i}`)),
                    hasMore: true,
                    nextOffset: 100,
                };
            }
            return {
                items: [
                    ...Array.from({ length: 14 }, (_, i) => song('qq', `s${100 + i}`, `歌${100 + i}`)),
                    song('qq', 's0', '歌0'), // duplicate within same provider
                ],
                hasMore: false,
                nextOffset: 115,
            };
        });
        const provider = {
            id: fakeId,
            displayName: 'QQ',
            capabilities: { search: true, playback: true },
            auth: {
                restoreSession: async () => ({ authenticated: true, user: { id: '1', name: 'u' } }),
                login: async () => ({ authenticated: true }),
                logout: async () => {},
            },
            search: {
                searchSongs: async () => ({ items: [], hasMore: false }),
            },
            library: {
                getUserPlaylists: async () => ({
                    items: [
                        { id: 'fake-name', providerId: fakeId, name: '我喜欢', type: 'playlist', trackCount: 50 },
                        { id: 'real-liked', providerId: fakeId, name: '收藏列表', type: 'playlist', isLiked: true, trackCount: 114 },
                    ],
                    hasMore: false,
                    nextOffset: 2,
                }),
            },
            catalog: { getPlaylistTracks },
        } as unknown as OnlineMusicProvider;

        registerOnlineMusicProvider(provider);
        try {
            expect(omni.getLibraryCapabilities(fakeId).likedSongs).toBe(true);
            const liked = await omni.getProviderLikedSongs(fakeId, '1');
            expect(liked).toHaveLength(114);
            expect(getPlaylistTracks).toHaveBeenCalledTimes(2);
            expect(getPlaylistTracks.mock.calls[0][0]).toBe('real-liked');
        } finally {
            unregisterOnlineMusicProvider(fakeId);
        }
    });
});
