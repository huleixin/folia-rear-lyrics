import { beforeEach, expect, it, vi } from 'vitest';
import { useAddToPlaylistStore } from '@/stores/useAddToPlaylistStore';
import type { SongResult } from '@/types';

// test/unit/library/addToPlaylistTarget.test.ts
const state = vi.hoisted(() => ({ currentSong: null as SongResult | null }));
vi.mock('@/stores/usePlaybackStore', () => ({ usePlaybackStore: { getState: () => state }, selectDisplaySong: (value: typeof state) => value.currentSong }));
vi.mock('@/services/library/songActions', () => ({ captureSongAction: (song: SongResult) => ({ song, scope: 'account-at-open', assertAccount: () => {} }) }));
const song = (id: string) => ({ id, name: id } as SongResult);
beforeEach(() => { state.currentSong = song('playing'); useAddToPlaylistStore.getState().close(); });
it('freezes the player song when opening instead of following subsequent queue changes', () => {
    useAddToPlaylistStore.getState().open();
    state.currentSong = song('next');
    expect(useAddToPlaylistStore.getState().actionTarget?.song.id).toBe('playing');
});
it('retains a selected song for creation after closing the picker', () => {
    useAddToPlaylistStore.getState().open(song('selected'));
    const createTarget = useAddToPlaylistStore.getState().actionTarget;
    useAddToPlaylistStore.getState().close();
    state.currentSong = song('next');
    expect(createTarget?.song.id).toBe('selected');
    expect(useAddToPlaylistStore.getState().targetSong).toBeNull();
});
