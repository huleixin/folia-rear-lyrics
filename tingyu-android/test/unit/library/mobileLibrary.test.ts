import { describe, it, expect, beforeEach } from 'vitest';
import { librarySuitePreference } from '../../../src/library/core/model/librarySuitePreference';
import {
    MOBILE_HISTORY_LIMIT,
    mobileHistoryTrack,
    prependMobileHistory,
    useMobileLibraryStore,
} from '../../../src/stores/useMobileLibraryStore';
import type { SongResult } from '../../../src/types';

// test/unit/library/mobileLibrary.test.ts
const song = (id: string, providerId = 'netease'): SongResult => ({
    id,
    name: `Song ${id}`,
    artists: [{ id: 1, name: 'Artist' }],
    album: { id: 1, name: 'Album', coverUrl: 'https://cover.test/image.jpg' },
    durationMs: 100000,
    sourceRef: { kind: 'online', providerId, mediaId: id },
});
describe('mobile library preferences and listening history', () => {
    beforeEach(() => useMobileLibraryStore.setState({ page: 'home', recentTracks: [], pendingCollectionPlay: null }));
    it('consumes a hero play request only once and cancels only its own collection', () => {
        const state = useMobileLibraryStore.getState();
        state.requestCollectionPlay('playlist-a');
        const token = useMobileLibraryStore.getState().pendingCollectionPlay!.token;
        state.cancelCollectionPlay('playlist-b');
        expect(useMobileLibraryStore.getState().pendingCollectionPlay?.token).toBe(token);
        expect(state.consumeCollectionPlay(token)).toBe(true);
        expect(state.consumeCollectionPlay(token)).toBe(false);
        state.requestCollectionPlay('playlist-a');
        state.cancelCollectionPlay('playlist-a');
        expect(useMobileLibraryStore.getState().pendingCollectionPlay).toBeNull();
    });
    it('defaults Android to mobile without replacing the desktop preference', () => {
        expect(librarySuitePreference(true)).toEqual({ storageKey: 'library_mobile_suite', initial: 'mobile' });
        expect(librarySuitePreference(false)).toEqual({ storageKey: 'library_suite', initial: null });
    });
    it('deduplicates by source identity, not numeric song ID alone', () => {
        const history = prependMobileHistory([song('1', 'qq'), song('1')], song('1'));
        expect(history).toHaveLength(2);
        expect(history[0].sourceRef).toMatchObject({ providerId: 'netease' });
        expect(history[1].sourceRef).toMatchObject({ providerId: 'qq' });
    });
    it('bounds persisted history and moves a played song to the front', () => {
        const history = Array.from({ length: MOBILE_HISTORY_LIMIT }, (_, index) => song(String(index)));
        const next = prependMobileHistory(history, song('new'));
        expect(next).toHaveLength(MOBILE_HISTORY_LIMIT);
        expect(next[0].id).toBe('new');
        expect(prependMobileHistory(next, song('3')).filter((item) => item.id === '3')).toHaveLength(1);
    });
    it('does not persist lyrics or temporary embedded artwork', () => {
        const track = {
            ...song('1'),
            album: { id: 1, name: 'Album', coverUrl: 'data:image/png;base64,large' },
            onlineLyricsState: { lyricsSource: 'imported' as const, importedLyricsName: 'private.lrc' },
        };
        expect(mobileHistoryTrack(track).album.coverUrl).toBeUndefined();
        expect(mobileHistoryTrack(track).onlineLyricsState).toBeUndefined();
        expect(mobileHistoryTrack(track).sourceRef).toEqual(track.sourceRef);
    });
    it('keeps availability metadata, so history cannot turn unavailable music into playable music', () => {
        const track = { ...song('1'), fee: 1, resourceState: false, privilege: { st: -1 } };
        expect(mobileHistoryTrack(track)).toMatchObject({ fee: 1, resourceState: false, privilege: { st: -1 } });
    });
    it('avoids storage/state writes for repeated notifications of the same playing track', () => {
        useMobileLibraryStore.getState().remember(song('1'));
        const previous = useMobileLibraryStore.getState().recentTracks;
        useMobileLibraryStore.getState().remember(song('1'));
        expect(useMobileLibraryStore.getState().recentTracks).toBe(previous);
    });
});
