import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFromCache, removeFromCache, saveToCache } from '@/services/db';
import {
    clearProviderAccountSnapshot,
    getProviderAccountSnapshotCacheKey,
    loadProviderAccountSnapshot,
    saveProviderAccountSnapshot,
} from '@/services/onlineMusic/providerAccountCache';

// test/unit/onlineMusic/providerAccountCache.test.ts

vi.mock('@/services/db', () => ({
    getFromCache: vi.fn(),
    removeFromCache: vi.fn(),
    saveToCache: vi.fn(),
}));

describe('provider account snapshot cache', () => {
    beforeEach(() => vi.clearAllMocks());

    it('stores one atomic provider-scoped home snapshot', async () => {
        vi.mocked(saveToCache).mockResolvedValue(undefined);
        const snapshot = await saveProviderAccountSnapshot('kugou', {
            user: { id: 'user', nickname: 'Listener' },
            collections: [{ providerId: 'kugou', id: 'list', name: 'Playlist', type: 'playlist' }],
            likedSongIds: ['song'],
        });

        expect(snapshot).toMatchObject({ version: 1, user: { id: 'user' } });
        expect(saveToCache).toHaveBeenCalledWith(
            getProviderAccountSnapshotCacheKey('kugou'),
            snapshot,
        );
    });

    it('drops playlist-local file ids stored by an older build', async () => {
        vi.mocked(getFromCache).mockResolvedValue({
            version: 1,
            savedAt: 1,
            user: { id: 'user', nickname: 'Listener' },
            collections: [],
            likedSongIds: ['song'],
            likedSongFileIds: { song: 987 },
        });

        const snapshot = await loadProviderAccountSnapshot('kugou');

        expect(snapshot).not.toBeNull();
        expect(snapshot).not.toHaveProperty('likedSongFileIds');
    });

    it('drops unusable liked ids without throwing away the rest of the snapshot', async () => {
        vi.mocked(getFromCache).mockResolvedValue({
            version: 1,
            savedAt: 1,
            user: { id: 'user', nickname: 'Listener' },
            collections: [{ providerId: 'kugou', id: 'list', name: 'Playlist', type: 'playlist' }],
            likedSongIds: ['song', '', { id: 'broken' }, 12],
        });

        const snapshot = await loadProviderAccountSnapshot('kugou');

        expect(snapshot?.likedSongIds).toEqual(['song', 12]);
        expect(snapshot?.collections).toHaveLength(1);
    });

    it('rejects incomplete snapshots instead of hydrating a partial home page', async () => {
        vi.mocked(getFromCache).mockResolvedValue({ version: 1, user: { id: 'user' } });
        await expect(loadProviderAccountSnapshot('kugou')).resolves.toBeNull();
    });

    it('clears only the requested provider snapshot', async () => {
        vi.mocked(removeFromCache).mockResolvedValue(undefined);
        await clearProviderAccountSnapshot('netease');
        expect(removeFromCache).toHaveBeenCalledWith(getProviderAccountSnapshotCacheKey('netease'));
    });

    it('finishes an older disk write before logout removes the snapshot', async () => {
        let finish!: () => void;
        vi.mocked(saveToCache).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
        const write = saveProviderAccountSnapshot('qq', { user: { id: 'old', nickname: '' }, collections: [], likedSongIds: [] });
        await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
        const clear = clearProviderAccountSnapshot('qq');
        await Promise.resolve();
        expect(removeFromCache).not.toHaveBeenCalled();
        finish();
        await Promise.all([write, clear]);
        expect(removeFromCache).toHaveBeenCalledWith(getProviderAccountSnapshotCacheKey('qq'));
    });

    it('checks queued snapshot ownership immediately before writing', async () => {
        const guard = () => { throw new DOMException('Account changed', 'AbortError'); };
        await expect(saveProviderAccountSnapshot('qq', { user: { id: 'old', nickname: '' }, collections: [], likedSongIds: [] }, guard)).rejects.toMatchObject({ name: 'AbortError' });
        expect(saveToCache).not.toHaveBeenCalled();
    });
});
