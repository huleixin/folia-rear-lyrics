import { create } from 'zustand';
import type { SongResult } from '../types';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';

// src/stores/useMobileLibraryStore.ts
const HISTORY_KEY = 'folia_mobile_recent_tracks_v1';
let nextCollectionPlayToken = 0;
export const MOBILE_HISTORY_LIMIT = 24;

/** Persist metadata only: never duplicate lyrics, signed audio URLs, or embedded binary covers. */
export const mobileHistoryTrack = (song: SongResult): SongResult => ({
    id: song.id,
    name: song.name,
    artists: song.artists,
    album: {
        ...song.album,
        coverUrl:
            song.album?.coverUrl?.startsWith('data:') || song.album?.coverUrl?.startsWith('blob:')
                ? undefined
                : song.album?.coverUrl,
    },
    durationMs: song.durationMs,
    sourceRef: song.sourceRef,
    sourceType: song.sourceType,
    qqMid: song.qqMid,
    kgHash: song.kgHash,
    t: song.t,
    fee: song.fee,
    resourceState: song.resourceState,
    privilege: song.privilege,
    noCopyrightRcmd: song.noCopyrightRcmd,
});
export const prependMobileHistory = (history: SongResult[], song: SongResult) =>
    [
        mobileHistoryTrack(song),
        ...history.filter((item) => getPlaybackSongKey(item) !== getPlaybackSongKey(song)),
    ].slice(0, MOBILE_HISTORY_LIMIT);

const readHistory = (): SongResult[] => {
    try {
        const saved: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
        return Array.isArray(saved)
            ? saved
                  .filter(
                      (item) =>
                          item &&
                          typeof item.name === 'string' &&
                          item.id != null &&
                          Array.isArray(item.artists) &&
                          item.album &&
                          typeof item.durationMs === 'number'
                  )
                  .slice(0, MOBILE_HISTORY_LIMIT)
            : [];
    } catch {
        return [];
    }
};
type MobileLibraryState = {
    pendingCollectionPlay: { key: string; token: number } | null;
    requestCollectionPlay: (key: string) => void;
    consumeCollectionPlay: (token: number) => boolean;
    cancelCollectionPlay: (key: string) => void;
    page: 'home' | 'library';
    setPage: (page: 'home' | 'library') => void;
    recentTracks: SongResult[];
    remember: (song: SongResult) => void;
};
export const useMobileLibraryStore = create<MobileLibraryState>((set, get) => ({
    pendingCollectionPlay: null,
    requestCollectionPlay: (key) => set({ pendingCollectionPlay: { key, token: ++nextCollectionPlayToken } }),
    consumeCollectionPlay: (token) => {
        if (get().pendingCollectionPlay?.token !== token) return false;
        set({ pendingCollectionPlay: null });
        return true;
    },
    cancelCollectionPlay: (key) => {
        if (get().pendingCollectionPlay?.key === key) set({ pendingCollectionPlay: null });
    },
    page: 'home',
    setPage: (page) => set({ page }),
    recentTracks: readHistory(),
    remember: (song) => {
        const previous = get().recentTracks;
        if (previous[0] && getPlaybackSongKey(previous[0]) === getPlaybackSongKey(song)) return;
        // Local tracks need their live catalog object, not a stale metadata-only reconstruction.
        if (song.sourceRef && song.sourceRef.kind !== 'online') return;
        const recentTracks = prependMobileHistory(previous, song);
        set({ recentTracks });
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(recentTracks));
        } catch {
            /* Session history still works. */
        }
    },
}));
