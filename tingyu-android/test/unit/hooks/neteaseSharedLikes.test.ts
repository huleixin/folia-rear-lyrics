// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useNeteaseLibrary } from '@/hooks/useNeteaseLibrary';
import { useOnlineProviderAccountStore } from '@/stores/useOnlineProviderAccountStore';
import { omni } from '@/services/onlineMusic/omni';
import { loadProviderAccountSnapshot } from '@/services/onlineMusic/providerAccountCache';

// test/unit/hooks/neteaseSharedLikes.test.ts
vi.mock('@/services/onlineMusic/providerAccountCache', () => ({
    loadProviderAccountSnapshot: vi.fn(() => new Promise(() => {})), saveProviderAccountSnapshot: vi.fn(async () => ({ savedAt: Date.now() })), clearProviderAccountSnapshot: vi.fn(), getProviderAccountSnapshotCacheKey: () => 'test',
}));
it('observes external likes and retains the player functional setter without a mirror loop', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(document.createElement('div'));
    let library!: ReturnType<typeof useNeteaseLibrary>;
    const t = (key: string) => key;
    function Probe() { library = useNeteaseLibrary({ t }); return null; }
    try {
        await act(() => root.render(React.createElement(Probe)));
        await act(() => useOnlineProviderAccountStore.getState().updateAccount('netease', { likedSongIds: ['search-song'] }));
        expect([...library.likedSongIds]).toEqual(['search-song']);
        await act(() => library.setLikedSongIds(before => new Set([...before, 'player-song'])));
        expect(useOnlineProviderAccountStore.getState().accounts.netease.likedSongIds).toEqual(['search-song', 'player-song']);
        await act(() => useOnlineProviderAccountStore.getState().updateAccount('netease', { likedSongIds: ['player-song'] }));
        expect([...library.likedSongIds]).toEqual(['player-song']);
    } finally { await act(() => root.unmount()); }
});

it('keeps a newer favorite when background likes return late', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    let resolveLikes!: (ids: string[]) => void;
    const pending = new Promise<string[]>(resolve => { resolveLikes = resolve; });
    const login = vi.spyOn(omni, 'getLoginStatus').mockResolvedValue({ id: 'u', name: 'Listener' } as any);
    const playlists = vi.spyOn(omni, 'getProviderUserPlaylists').mockResolvedValue({ items: [], hasMore: false, nextOffset: 0 });
    const cloud = vi.spyOn(omni, 'getProviderCloudCollection').mockResolvedValue(null);
    const likes = vi.spyOn(omni, 'getProviderLikedSongIds').mockReturnValue(pending);
    const root = createRoot(document.createElement('div'));
    let library!: ReturnType<typeof useNeteaseLibrary>;
    const t = (key: string) => key;
    function Probe() { library = useNeteaseLibrary({ t }); return null; }
    try {
        await act(() => root.render(React.createElement(Probe)));
        let refresh!: Promise<boolean>;
        await act(async () => { refresh = library.refreshUserData('u'); await Promise.resolve(); await Promise.resolve(); });
        expect(likes).toHaveBeenCalled();
        await act(() => library.setLikedSongIds(new Set(['new-favorite'])));
        await act(async () => { resolveLikes(['stale-favorite']); await refresh; });
        expect([...library.likedSongIds]).toEqual(['new-favorite']);
    } finally { await act(() => root.unmount()); login.mockRestore(); playlists.mockRestore(); cloud.mockRestore(); likes.mockRestore(); }
});

it('ignores an old disk snapshot after a newer account refresh', async () => {
    let resolveSnapshot!: (snapshot: any) => void;
    vi.mocked(loadProviderAccountSnapshot).mockImplementationOnce(() => new Promise(resolve => { resolveSnapshot = resolve; }));
    const login = vi.spyOn(omni, 'getLoginStatus').mockResolvedValue({ id: 'new-user', name: 'New listener' } as any);
    const playlists = vi.spyOn(omni, 'getProviderUserPlaylists').mockResolvedValue({ items: [], hasMore: false, nextOffset: 0 });
    const cloud = vi.spyOn(omni, 'getProviderCloudCollection').mockResolvedValue(null);
    const likes = vi.spyOn(omni, 'getProviderLikedSongIds').mockResolvedValue(['new-song']);
    const root = createRoot(document.createElement('div'));
    let library!: ReturnType<typeof useNeteaseLibrary>;
    const t = (key: string) => key;
    function Probe() { library = useNeteaseLibrary({ t }); return null; }
    try {
        await act(() => root.render(React.createElement(Probe)));
        await act(async () => { await library.refreshUserData('new-user'); });
        await act(async () => { resolveSnapshot({ user: { id: 'old-user' }, collections: [{ type: 'cloud' }], likedSongIds: ['old-song'], savedAt: 1 }); });
        expect(library.user?.id).toBe('new-user');
        expect([...library.likedSongIds]).toEqual(['new-song']);
    } finally { await act(() => root.unmount()); login.mockRestore(); playlists.mockRestore(); cloud.mockRestore(); likes.mockRestore(); }
});
